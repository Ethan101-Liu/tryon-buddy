(() => {
  const valueFields = [
    'q', 'reply', 'status', 'context', 'searchQuery', 'searchKind', 'needsSearch',
    'replacementIndex', 'chosenSide', 'exclude', 'choices', 'jobId', 'progress',
    'startedAt', 'changeSummary', 'clarificationKind', 'replyingTo', 'outfitReason',
    'missingKind', 'missingGarment', 'filledKind', 'reviewToken', 'outputReviewPending',
  ];
  const referenceFields = ['baseTurn', 'compareWith', 'choiceTarget'];
  const mediaFields = ['photo', 'basePhoto'];

  function isBlob(value) {
    return typeof Blob !== 'undefined' && value instanceof Blob;
  }

  function transientUrl(value) {
    return typeof value === 'string' && /^(?:blob:|data:)/i.test(value);
  }

  function isTurn(value) {
    return value && typeof value === 'object' && typeof value.id === 'string' &&
      (Array.isArray(value.pieces) || Object.hasOwn(value, 'q') || Object.hasOwn(value, 'status'));
  }

  async function pack({turns = [], selectedId = null, draft = '', pendingPiece = null, preferences = null, clarification = null} = {}) {
    if (!Array.isArray(turns)) throw new TypeError('Conversation turns must be an array.');
    const nodes = [];
    const turnObjects = new WeakMap();
    const nodeIds = new Set();
    const pieceObjects = new WeakMap();
    const pieceIds = new Map();
    const assetIndices = new Map();
    const assetInputs = [];

    function asset(value, fallback) {
      const input = typeof value === 'string' && value.startsWith('blob:') && isBlob(fallback) ? fallback : value;
      const existing = assetIndices.get(input) ?? assetIndices.get(value);
      if (existing !== undefined) return {assetIndex: existing};
      const index = assetInputs.length;
      assetInputs.push(input);
      assetIndices.set(input, index);
      assetIndices.set(value, index);
      return {assetIndex: index};
    }

    function media(value, fallback) {
      if (isBlob(value) || transientUrl(value)) return asset(value, fallback);
      return value ?? null;
    }

    function piece(value) {
      if (!value) return null;
      if (pieceObjects.has(value)) return pieceObjects.get(value);
      const copy = structuredClone(value);
      pieceObjects.set(value, copy);
      if (isBlob(value.file)) copy.file = value.file;
      if (typeof value.id === 'string' && value.id.startsWith('blob:')) {
        const suffix = value.id.slice(value.id.lastIndexOf('/') + 1);
        const stableId = 'piece-' + suffix;
        pieceIds.set(value.id, stableId);
        copy.id = stableId;
      }
      for (const [key, item] of Object.entries(value)) {
        if (/(?:url|src|href|photo|image|preview)$/i.test(key) && (isBlob(item) || transientUrl(item))) {
          copy[key] = media(item, key === 'url' ? value.file : null);
        }
      }
      return copy;
    }

    function collect(turn) {
      if (!turn) return null;
      if (typeof turn === 'string') return turn;
      if (turnObjects.has(turn)) return turnObjects.get(turn);
      const id = typeof turn.id === 'string' && turn.id ? turn.id : 'restored-turn-' + nodes.length;
      turnObjects.set(turn, id);
      if (nodeIds.has(id)) return id;
      nodeIds.add(id);
      const node = {id};
      nodes.push(node);
      for (const field of valueFields) {
        if (Object.hasOwn(turn, field)) node[field] = structuredClone(turn[field]);
      }
      node.pieces = (turn.pieces || []).map(piece);
      if (turn.changedPieces) node.changedPieces = turn.changedPieces.map(piece);
      if (turn.attachment) node.attachment = piece(turn.attachment);
      if (turn.portraitFile) node.portraitFile = turn.portraitFile;
      for (const field of mediaFields) {
        if (Object.hasOwn(turn, field)) node[field] = media(turn[field]);
      }
      for (const field of referenceFields) {
        if (Object.hasOwn(turn, field)) node[field] = collect(turn[field]);
      }
      return id;
    }

    function rewritePieceIds(value) {
      if (typeof value === 'string') return pieceIds.get(value) || value;
      if (!value || typeof value !== 'object' || isBlob(value)) return value;
      if (Array.isArray(value)) return value.map(rewritePieceIds);
      for (const [key, item] of Object.entries(value)) value[key] = rewritePieceIds(item);
      return value;
    }

    const displayIds = turns.map(collect);
    const capturedPending = piece(pendingPiece);
    const capturedPreferences = structuredClone(preferences);
    const capturedClarification = isTurn(clarification)
      ? {turnRef: collect(clarification)} : structuredClone(clarification);
    const capturedDraft = draft;
    const capturedSelectedId = selectedId;
    for (const node of nodes) {
      if (node.changeSummary) rewritePieceIds(node.changeSummary);
    }

    // All mutable fields above are captured before fetching the first image.
    const assets = await Promise.all(assetInputs.map(async input => {
      if (isBlob(input)) return input;
      const response = await fetch(input);
      if (!response.ok) throw new Error('Could not preserve a conversation image.');
      return response.blob();
    }));
    return {
      version: 1,
      displayIds,
      nodes,
      assets,
      selectedId: capturedSelectedId,
      draft: capturedDraft,
      pendingPiece: capturedPending,
      preferences: capturedPreferences,
      clarification: capturedClarification,
    };
  }

  function unpack(snapshot) {
    const createdUrls = [];
    if (!snapshot) {
      return {turns: [], selectedId: null, draft: '', pendingPiece: null, preferences: null, clarification: null, createdUrls};
    }
    if (snapshot.version !== 1 || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.assets)) {
      throw new TypeError('Unsupported conversation snapshot.');
    }
    const assetUrls = new Map();
    const turnMap = new Map();
    const pieceObjects = new WeakMap();

    function media(value) {
      if (!value || typeof value !== 'object' || !Object.hasOwn(value, 'assetIndex')) return value;
      const index = value.assetIndex;
      if (!Number.isInteger(index) || !isBlob(snapshot.assets[index])) {
        throw new TypeError('Conversation image data is missing.');
      }
      if (!assetUrls.has(index)) {
        const url = URL.createObjectURL(snapshot.assets[index]);
        assetUrls.set(index, url);
        createdUrls.push(url);
      }
      return assetUrls.get(index);
    }

    function piece(value) {
      if (!value) return null;
      if (pieceObjects.has(value)) return pieceObjects.get(value);
      const copy = structuredClone(value);
      pieceObjects.set(value, copy);
      for (const [key, item] of Object.entries(value)) copy[key] = media(item);
      return copy;
    }

    try {
      for (const node of snapshot.nodes) {
        if (!node || typeof node.id !== 'string' || turnMap.has(node.id)) {
          throw new TypeError('Conversation turn identifiers are invalid.');
        }
        const turn = {id: node.id, running: false};
        for (const field of valueFields) {
          if (Object.hasOwn(node, field)) turn[field] = structuredClone(node[field]);
        }
        turn.pieces = (node.pieces || []).map(piece);
        if (node.changedPieces) turn.changedPieces = node.changedPieces.map(piece);
        if (node.attachment) turn.attachment = piece(node.attachment);
        if (node.portraitFile) turn.portraitFile = node.portraitFile;
        for (const field of mediaFields) {
          if (Object.hasOwn(node, field)) turn[field] = media(node[field]);
        }
        turnMap.set(node.id, turn);
      }
      for (const node of snapshot.nodes) {
        const turn = turnMap.get(node.id);
        for (const field of referenceFields) {
          if (Object.hasOwn(node, field)) turn[field] = turnMap.get(node[field]) || null;
        }
      }
      const clarification = snapshot.clarification?.turnRef
        ? turnMap.get(snapshot.clarification.turnRef) || null : structuredClone(snapshot.clarification);
      const turns = (snapshot.displayIds || []).map(id => {
        if (!turnMap.has(id)) throw new TypeError('A displayed conversation turn is missing.');
        return turnMap.get(id);
      });
      return {
        turns,
        selectedId: snapshot.selectedId ?? null,
        draft: snapshot.draft ?? '',
        pendingPiece: piece(snapshot.pendingPiece),
        preferences: structuredClone(snapshot.preferences),
        clarification,
        createdUrls,
      };
    } catch (error) {
      createdUrls.forEach(url => URL.revokeObjectURL(url));
      throw error;
    }
  }

  window.tryonChatCodec = Object.freeze({pack, unpack});
})();
