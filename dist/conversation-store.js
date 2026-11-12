(() => {
  let databasePromise;
  let writeQueue = Promise.resolve();

  function ownerKey(owner) {
    if (owner == null) return 'guest';
    if (typeof owner !== 'string') throw new TypeError('Conversation owner must be a string or null.');
    return 'account:' + owner;
  }

  function checkMediaUrls(snapshot) {
    const seen = new WeakSet();
    function visit(value, field) {
      if (typeof value === 'string') {
        const mediaField = /(?:urls?|src|href|photo|basephoto|portrait|image|preview)$/i.test(field);
        if (mediaField && value.startsWith('blob:')) {
          throw new TypeError('Persist image Blob or File data instead of a temporary blob URL.');
        }
        return;
      }
      if (!value || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        value.forEach(item => visit(item, field));
      } else {
        for (const [key, item] of Object.entries(value)) visit(item, key);
      }
    }
    visit(snapshot, '');
  }

  function openDatabase() {
    if (databasePromise) return databasePromise;
    const opening = new Promise((resolve, reject) => {
      const request = indexedDB.open('tryon-chat-sessions', 1);
      let blocked = false;
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('sessions')) {
          request.result.createObjectStore('sessions', {keyPath: 'owner'});
        }
      };
      request.onerror = () => reject(request.error || new Error('Could not open conversation storage.'));
      request.onblocked = () => {
        blocked = true;
        reject(new Error('Conversation storage is blocked by another open page.'));
      };
      request.onsuccess = () => {
        const database = request.result;
        if (blocked) {
          database.close();
          return;
        }
        const invalidate = () => {
          if (databasePromise === opening) databasePromise = undefined;
        };
        database.onversionchange = () => {
          database.close();
          invalidate();
        };
        database.onclose = invalidate;
        resolve(database);
      };
    });
    databasePromise = opening;
    opening.catch(() => {
      if (databasePromise === opening) databasePromise = undefined;
    });
    return opening;
  }

  async function operate(mode, action, value) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('sessions', mode);
      const request = transaction.objectStore('sessions')[action](value);
      transaction.oncomplete = () => resolve(request.result);
      const fail = () => reject(transaction.error || request.error || new Error('Conversation storage did not complete.'));
      transaction.onabort = fail;
      transaction.onerror = fail;
    });
  }

  function enqueueWrite(operation) {
    const pending = writeQueue.then(operation);
    // A failed write still rejects its caller and allows later operations to proceed.
    writeQueue = pending.catch(() => undefined);
    return pending;
  }

  // Checking the revision and writing in one transaction prevents an older tab
  // (or a slow image pack) from bringing a reset conversation back.
  async function writeSession(key, expectedRevision, snapshot, reset, guestPortrait) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('sessions', 'readwrite');
      const store = tx.objectStore('sessions');
      const current = store.get(key);
      let written = null;
      current.onsuccess = () => {
        const revision = current.result?.revision ?? 0;
        if (expectedRevision !== undefined && revision !== expectedRevision) return;
        written = reset ? revision + 1 : revision;
        const row={owner: key, revision: written, snapshot, updatedAt: Date.now()};
        const portrait=guestPortrait===undefined?current.result?.guestPortrait:guestPortrait;
        if(key==='guest'&&portrait)row.guestPortrait=portrait;
        store.put(row);
      };
      tx.oncomplete = () => resolve(written);
      tx.onabort = () => reject(tx.error || new Error('Conversation could not be saved.'));
    });
  }

  async function save(owner, snapshot, expectedRevision, guestPortrait) {
    const copy = structuredClone(snapshot);
    checkMediaUrls(copy);
    return (await enqueueWrite(() => writeSession(ownerKey(owner), expectedRevision, copy, false, guestPortrait))) !== null;
  }

  async function readSession(owner) {
    const key = ownerKey(owner);
    await writeQueue;
    const record = await operate('readonly', 'get', key);
    return {snapshot: record?.snapshot ?? null, revision: record?.revision ?? 0, guestPortrait: record?.guestPortrait};
  }

  async function load(owner) {
    return (await readSession(owner)).snapshot;
  }

  function reset(owner, expectedRevision, guestPortrait) {
    return enqueueWrite(() => writeSession(ownerKey(owner), expectedRevision, null, true, guestPortrait));
  }

  async function remove(owner) {
    const key = ownerKey(owner);
    return enqueueWrite(() => operate('readwrite', 'delete', key));
  }

  window.tryonChatStore = Object.freeze({save, load, readSession, reset, remove});
})();
