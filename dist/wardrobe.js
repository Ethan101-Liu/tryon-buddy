// New uploads have an explicit partition. The older, unowned garments store stays untouched.
const personalWardrobe = (() => {
  let database;
  let active;
  const removalSignal = 'tryon-wardrobe-removed';

  function openDatabase() {
    if (!database) {
      database = new Promise((resolve, reject) => {
        const request = indexedDB.open('tryon-account-wardrobes', 1);
        request.onupgradeneeded = () => {
          const clothes = request.result.createObjectStore('garments', {keyPath: 'key', autoIncrement: true});
          clothes.createIndex('scope', 'scope');
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); database = undefined; };
          resolve(db);
        };
        request.onerror = () => reject(request.error);
      }).catch(error => { database = undefined; throw error; });
    }
    return database;
  }

  function asPiece(row) {
    return {...row, id: 'wardrobe-upload-' + row.key, url: URL.createObjectURL(row.file)};
  }

  function load(owner) {
    if (active?.owner === owner && active.ready) return active.ready;
    if (active) active.pieces.forEach(item => URL.revokeObjectURL(item.url));
    const partition = {owner, scope: owner === null ? 'guest' : 'account:' + owner, pieces: []};
    active = partition;
    partition.ready = openDatabase().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction('garments', 'readonly');
      const rows = tx.objectStore('garments').index('scope').getAll(partition.scope);
      tx.oncomplete = () => {
        if (active === partition) partition.pieces = rows.result.map(asPiece);
        resolve();
      };
      tx.onabort = () => reject(tx.error);
    })).catch(error => { partition.ready = null; throw error; });
    return partition.ready;
  }

  function items() {
    return active?.owner === personalPhoto.account() ? sampleWardrobe.concat(active.pieces) : sampleWardrobe;
  }

  function canRemove(item) {
    return !!active && active.owner === personalPhoto.account() && active.pieces.includes(item);
  }

  function discardPreview(partition, key) {
    if (active !== partition || partition.owner !== personalPhoto.account()) return;
    const at = partition.pieces.findIndex(piece => piece.key === key);
    if (at < 0) return;
    const [piece] = partition.pieces.splice(at, 1);
    URL.revokeObjectURL(piece.url);
    window.dispatchEvent(new CustomEvent(removalSignal, {detail: {id: piece.id}}));
  }

  async function remove(item) {
    if (!canRemove(item)) return false;
    const partition = active;
    const db = await openDatabase();
    if (active !== partition || !canRemove(item)) return false;
    const removed = await new Promise((resolve, reject) => {
      const tx = db.transaction('garments', 'readwrite');
      const store = tx.objectStore('garments');
      const request = store.get(item.key);
      let matched = false;
      request.onsuccess = () => {
        if (active !== partition || partition.owner !== personalPhoto.account()) return;
        const row = request.result;
        if (row && row.scope !== partition.scope) return;
        // A second tab may already have removed this key.
        matched = true;
        if (row) store.delete(item.key);
      };
      tx.oncomplete = () => resolve(matched);
      tx.onabort = () => reject(tx.error);
    });
    if (!removed) return false;
    discardPreview(partition, item.key);
    try { localStorage.setItem(removalSignal, JSON.stringify({scope: partition.scope, key: item.key})); } catch {}
    return true;
  }

  window.addEventListener('storage', event => {
    if (event.key !== removalSignal || !event.newValue) return;
    let removed;
    try { removed = JSON.parse(event.newValue); } catch { return; }
    const partition = active;
    if (!partition || removed?.scope !== partition.scope || !Number.isInteger(removed.key)) return;
    // If loading overlapped the other tab's deletion, reconcile after its read finishes.
    partition.ready?.then(() => discardPreview(partition, removed.key)).catch(() => {});
  });

  // A page restored from the back/forward cache may have missed a notification.
  window.addEventListener('pageshow', async event => {
    const partition = active;
    if (!event.persisted || !partition?.pieces.length || partition.owner !== personalPhoto.account()) return;
    const cachedKeys = partition.pieces.map(piece => piece.key);
    try {
      const db = await openDatabase();
      const tx = db.transaction('garments', 'readonly');
      const read = tx.objectStore('garments').index('scope').getAllKeys(partition.scope);
      tx.oncomplete = () => {
        const present = new Set(read.result);
        for (const key of cachedKeys) if (!present.has(key)) discardPreview(partition, key);
      };
    } catch { /* The next page load rereads the partition. */ }
  });
  async function add(files, kind, owner) {
    if (personalPhoto.account() !== owner) return false;
    const ready = load(owner);
    const partition = active;
    await ready;
    const db = await openDatabase();
    if (active !== partition || personalPhoto.account() !== owner) return false;
    const rows = files.map(file => ({
      scope: partition.scope, name: file.name.replace(/\.[^.]+$/, '') || file.name,
      kind, needsFullPhoto: kind === 'bottom', file,
    }));
    await new Promise((resolve, reject) => {
      const tx = db.transaction('garments', 'readwrite');
      const store = tx.objectStore('garments');
      for (const row of rows) {
        const request = store.add(row);
        request.onsuccess = () => { row.key = request.result; };
      }
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
    if (active === partition) partition.pieces.push(...rows.map(asPiece));
    return true;
  }

  return Object.freeze({load, items, add, canRemove, remove});
})();
