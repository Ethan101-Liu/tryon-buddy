(() => {
  const TOP = /上衣|上装|外套|外搭|衬衫|毛衣|针织|卫衣|夹克|西装(?!裤|裙|长裤|短裤|直筒裤|阔腿裤|九分裤)|T恤|t恤/;
  const BOTTOM = /裤|下装|下半身|裙/;
  const KEEP = /保留|留着|别动|不要动|不用换|不要换|别换|不换|不用改|不要改|保持原样|保持不变/;
  const CHANGE = /换|改|试|(?:再|另)(?:找|来|挑|看)|太|有点|一点|不喜欢|不满意|不合适|不想|更|浅些|深些|宽松些|休闲些/;
  const PANT_CUT = /直筒|阔腿|锥形|喇叭/;

  function kindIn(text) {
    const top = TOP.test(text);
    const bottom = BOTTOM.test(text);
    if (top && bottom) return 'both';
    if (top) return 'top';
    if (bottom) return 'bottom';
    return null;
  }

  function requestClauses(text) {
    function splitRetained(part) {
      const kept = part.match(KEEP);
      if (!kept || /(?:不要|别|不想|不)保留/.test(part)) return [part];
      // Natural requests often omit punctuation between a kept item and a change.
      const trailing = part.match(new RegExp('(?:' + TOP.source + '|裤子?|下装|下半身|裙子?)(?:先)?(?:' + KEEP.source + ')'));
      if (trailing?.index > 0 && CHANGE.test(part.slice(0, trailing.index)) && !KEEP.test(part.slice(0, trailing.index))) {
        return [part.slice(0, trailing.index), ...splitRetained(part.slice(trailing.index))];
      }
      const end = kept.index + kept[0].length;
      const boundaries = [];
      for (const match of part.matchAll(/换|改|试|调整/g)) {
        if (match.index >= end && !/(?:不|别|不用|不要)$/.test(part.slice(0, match.index))) boundaries.push(match.index);
      }
      for (const match of part.matchAll(new RegExp(TOP.source + '|' + BOTTOM.source, 'g'))) {
        const prefix = part.slice(0, match.index);
        if (match.index >= end && kindIn(prefix) && CHANGE.test(part.slice(match.index)) &&
            !/(?:不|别|不用|不要)(?:换|改)?$/.test(prefix.slice(end))) boundaries.push(match.index);
      }
      if (!boundaries.length) return [part];
      const index = Math.min(...boundaries);
      return [part.slice(0, index), ...splitRetained(part.slice(index))];
    }
    return text.replace(/但是|不过|然后|同时|而且/g, '，').split(/[，,。；;！？!?]/)
      .flatMap(splitRetained).map(part => part.trim()).filter(Boolean);
  }

  function earlierOutfits(base, conversation) {
    if (!base) return [];
    const index = conversation.findIndex(turn => turn === base || (base.id && turn.id === base.id));
    const visited = new Set([base.id]);
    const candidates = [];
    let current = base;
    while (current) {
      const parent = current.baseTurn || current.baseTurnId || current.compareWith;
      current = typeof parent === 'string' ? conversation.find(turn => turn.id === parent) : parent;
      if (!current || visited.has(current.id)) break;
      visited.add(current.id);
      if (current.photo || current.status === 'waiting-photo') candidates.push(current);
    }
    // An archive supplies its own lineage. Never fill gaps with a different record.
    if (index < 0 || [...visited].some(id => id?.startsWith('resume-'))) return candidates;
    for (let at = index - 1; at >= 0; at--) {
      const older = conversation[at];
      if (older.photo && !visited.has(older.id)) candidates.push(older);
      if (older.id?.startsWith('resume-')) break;
    }
    return candidates;
  }

  function previousOutfit(base, conversation, kind) {
    const current = base?.pieces?.findLast(piece => piece.kind === kind);
    return earlierOutfits(base, conversation).find(turn => {
      if (!turn.id) return false;
      if (!kind) return true;
      const piece = turn.pieces?.findLast(item => item.kind === kind);
      return piece && piece.id !== current?.id;
    });
  }

  const COLOR = '(?:浅色|深色|(?:浅|深|淡|雾)?(?:米白|乳白|奶白|象牙白|卡其|藏蓝|海军蓝|蓝黑|蓝|灰|黑|白|棕|驼|米|红|粉|绿|紫|黄|橙)(?:色)?)';

  function replacementDetails(base, kind, index) {
    const current = base?.pieces?.[index] || base?.pieces?.findLast(piece => piece.kind === kind);
    const names = [current?.displayName, current?.name].filter(value => typeof value === 'string');
    // Request context can contain the kept garment too; only use clauses about this kind.
    const mentions = [base?.searchQuery, base?.q].filter(value => typeof value === 'string')
      .flatMap(value => value.split(/[，,。；;]|搭配|配上?|和|以及/))
      .filter(part => kindIn(part) === kind && !KEEP.test(part));
    const evidence = [...names, ...mentions];
    const color = evidence.map(value => value.match(new RegExp(COLOR))?.[0]).find(Boolean) || '';
    const categoryPattern = kind === 'bottom'
      ? /(?:直筒|阔腿|喇叭)牛仔裤|牛仔(?:直筒|阔腿|喇叭|九分|短|长)?裤|(?:高腰)?(?:直筒|阔腿|喇叭|休闲|西装|工装|运动|九分|短|长)裤|半身裙|半裙|连衣裙/
      : /牛仔外套|西装外套|针织开衫|针织衫|开衫|衬衫|毛衣|卫衣|夹克|风衣|外套|T恤|t恤/;
    const category = evidence.map(value => value.match(categoryPattern)?.[0]).find(Boolean);
    return {color, name: category || (kind === 'bottom' ? '下装' : '上衣'), constraints: current?.constraints};
  }

  function lighterColor(color) {
    if (/浅蓝|浅灰|淡蓝|淡灰|雾蓝/.test(color)) return '米白色';
    if (/灰|黑/.test(color)) return '浅灰色';
    if (/蓝/.test(color)) return '浅蓝色';
    if (/棕|卡其|驼/.test(color)) return '米色';
    return '浅色';
  }

  function replacementQuery(text, kind, base, index) {
    const details = replacementDetails(base, kind, index);
    const name = details.name;
    let query = text;
    const repeat = /^(?:请|帮我)?(?:再|另)(?:找|来|挑|看|换|试)(?:一)?[条件个](?:裤子?|下装|上衣|上装|裙子?)?[吧呀啊]?$/.test(text);
    const cutChange = kind === 'bottom' && (PANT_CUT.test(text) || /太宽|太窄/.test(text));
    if (base && (repeat || cutChange)) {
      // Reuse the filter that produced this item, not a different garment's
      // color or a fit mentioned elsewhere in the merchant's full title.
      const saved = details.constraints || {};
      const color = new RegExp(COLOR + '|色').test(text) ? '' : saved.color || details.color;
      let category = saved.garment || name;
      if (cutChange) category = category.replace(/直筒|阔腿|喇叭|锥形|宽松|紧身/g, '');
      const differentCategory = /裙/.test(text) && /裤/.test(category) || /裤/.test(text) && /裙/.test(category);
      if (differentCategory || !repeat && kindIn(text) === kind) category = '';
      const features = repeat && !differentCategory && Array.isArray(saved.requiredFeatures) ? saved.requiredFeatures : [];
      const filters = [color, ...features, category].filter(Boolean);
      if (filters.length) query += '，' + filters.join('');
      if (/太宽|过宽|太阔/.test(text)) {
        if (!/阔腿/.test(text)) query += '，不要阔腿';
        if (!/宽松/.test(text)) query += '，不要宽松';
      }
    }
    if (/浅一点|浅点|浅些|淡一点|淡点|淡些|太深|颜色偏深/.test(text)) {
      const explicit = text.match(new RegExp('(?:换成?|改成?|试试?|想要|找|来条|来件)[^，,。；;]{0,6}?(' + COLOR + ')'))?.[1];
      const color = explicit || lighterColor(details.color);
      query = query.replace(/浅一点|浅点|浅些|淡一点|淡点|淡些|太深|颜色偏深/g, color);
      query += '，' + name + '换成' + color;
    } else if (/深一点|深点|深些|太浅|颜色偏浅/.test(text)) {
      query = query.replace(/深一点|深点|深些|太浅|颜色偏浅/g, '深色');
      query += '，' + name + '换成深色';
    }
    if (/太正式|过于正式|不想.{0,4}正式|别太正式|休闲一点|休闲些/.test(text)) {
      query = query.replace(/太正式|过于正式|不想.{0,4}正式|别太正式|休闲一点|休闲些/g, '休闲款');
      query += '，' + name + '换成休闲款';
    }
    return query;
  }

  function analyze(text, context = {}) {
    const query = typeof text === 'string' ? text.trim() : '';
    const conversation = Array.isArray(context?.conversation) ? context.conversation : [];
    const base = context?.base || context?.selectedOutfitTurn || conversation.findLast(turn => turn.photo);
    const result = {action: 'new', kind: null, query};
    if (!query) return {...result, action: 'clarify', clarification: '你想调整哪件衣服，或试一套什么风格的搭配？'};
    const negatedRestore = /(?:不要|不用|别|不想|无需).{0,2}(?:切回|回到|恢复|还原|换回|还是)/.test(query);

    // Comparison selection stays with chooseComparedOutfit in the conversation UI.
    // Only explicit restoration language restores earlier outfits here.
    if (!negatedRestore && (/^(?:请|帮我|给我)?(?:撤销|撤回)(?:刚才|上次|这次|上一轮|最近)?(?:的)?(?:修改|操作|调整)?[吧呀啊。！!]*$/.test(query) ||
        /(?:切回|回到|恢复|还原|换回|还是)(?:刚才|之前|原来|上一|上次)(?:的|那)?(?:一)?套/.test(query))) {
      const target = previousOutfit(base, conversation, null);
      return target ? {...result, action: 'undo', targetTurnId: target.id} :
        {...result, action: 'clarify', clarification: '这次对话里还没有可恢复的上一套。你想改哪件单品？'};
    }

    if (!negatedRestore && (/(?:还是|恢复|还原|切回|换回|用回).{0,6}(?:刚才|之前|原来|上一|上次)/.test(query) ||
        /(?:还是|换回|用回).{0,3}(?:那件|那条)/.test(query))) {
      let kind = kindIn(query);
      if (!kind && /那条|上一条|刚才那条/.test(query)) kind = 'bottom';
      if (!kind && /那件|上一件|刚才那件/.test(query)) kind = 'top';
      if (kind === 'both') return {...result, action: 'clarify', clarification: '你想恢复整套，还是只换回其中一件？'};
      const target = previousOutfit(base, conversation, kind);
      return target ? {...result, action: 'restore', kind, targetTurnId: target.id} :
        {...result, action: 'clarify', kind, clarification: '暂时没找到这件单品的上一版。你可以点想用的原图，或再发一张衣服图。'};
    }

    // The first outfit can specify both slots in one request. Slot-change
    // clarification applies only once there is an outfit to change.
    if (!base) return result;
    const clauses = requestClauses(query);
    const kept = clauses.filter(part => KEEP.test(part) && !/(?:不要|别|不想|不)保留/.test(part));
    const active = clauses.filter(part => !kept.includes(part));
    const again = active.some(part => /再来一套|再看一套|换一套|另一套|重新搭|重新来一套|整套重搭/.test(part) &&
      !/(?:不要|不用|别|不是).{0,3}(?:再来|再看|换一套|重新搭|整套)/.test(part));
    if (again) {
      return kept.length ? {...result, action: 'clarify', clarification: '你想保留指定单品继续搭配，还是整套重新搭一套？'} :
        {...result, action: 'again'};
    }

    const changing = active.filter(part => CHANGE.test(part) || (base && PANT_CUT.test(part)));
    const top = changing.some(part => TOP.test(part));
    const bottom = changing.some(part => BOTTOM.test(part));
    if (top && bottom) return {...result, action: 'clarify', clarification: '这次先调整上衣还是下装？我会保留其他单品。'};
    let kind = top ? 'top' : bottom ? 'bottom' : null;
    if (!kind && changing.length && context.pieceIndex !== undefined) kind = base?.pieces?.[context.pieceIndex]?.kind;
    if (!kind && base?.pieces?.some(piece => piece.kind === 'bottom') && changing.some(part => PANT_CUT.test(part) || /(?:这|那|换|来|找|挑|试)(?:一)?条/.test(part))) {
      kind = 'bottom';
    }
    if (!kind && /这件不要|这条不要|那件不要|那条不要|这件不喜欢|这条不喜欢/.test(query)) {
      return {...result, action: 'clarify', clarification: '你想换掉上衣还是下装？也可以直接点单品旁的“更换”。'};
    }
    if (kind && /不要了|去掉|移除/.test(active.join('，'))) {
      return {...result, action: 'clarify', kind, clarification: kind === 'bottom' ? '你想换成另一件下装，还是恢复上一版？' : '你想换成另一件上衣，还是去掉这件外搭？'};
    }
    if (!kind && changing.length && /浅一点|淡一点|深一点|太正式|太深|太浅|休闲一点/.test(query)) {
      const recent = base?.changedPieces;
      const candidates = recent?.length === 1 ? recent : base?.pieces;
      if (candidates?.length === 1) kind = candidates[0].kind;
      if (!kind) return {...result, action: 'clarify', clarification: '你想调整上衣还是下装？'};
    }
    if (kind && changing.length) {
      // A qualifier can be a separate clause without a verb, e.g. “不要阔腿”.
      const requestParts = active.filter(part => !kindIn(part) || kindIn(part) === kind);
      const request = replacementQuery(requestParts.join('，'), kind, base, context.pieceIndex);
      return {...result, action: base ? 'replace' : 'new', kind, query: request};
    }
    if (kept.length) return {...result, action: 'clarify', clarification: '好，保留这些单品。接下来想调整哪一件？'};
    if (negatedRestore) return {...result, action: 'clarify', clarification: '好，继续沿用当前这套。你想调整哪里？'};
    return result;
  }

  window.tryonIntent = Object.freeze({analyze});
})();
