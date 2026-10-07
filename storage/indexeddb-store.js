// @ts-check
/**
 * IndexedDB-backed Store.
 *
 * Schema (version 1):
 *   plans         keyPath 'id', index 'updatedAt'
 *   appointments  keyPath 'id', indexes 'updatedAt', 'planId', 'dateTime'
 *   meta          out-of-line keys, arbitrary values
 *
 * Other open tabs are told about writes through a BroadcastChannel, so every
 * tab shows the same data.
 */

/** @typedef {import('./store.js').Store} Store */
/** @typedef {import('./store.js').ChangeListener} ChangeListener */
/** @typedef {import('./store.js').ChangeScope} ChangeScope */
/** @typedef {import('./store.js').StoreChange} StoreChange */
/** @typedef {import('../domain/types.js').EntityMeta} EntityMeta */
/**
 * @template {EntityMeta} T
 * @typedef {import('./store.js').Collection<T>} Collection
 */

export const DB_NAME = 'just-checkup';
export const DB_VERSION = 1;
const CHANNEL_NAME = 'just-checkup:store';

/**
 * Upgrade steps, one per version. Each runs inside the versionchange
 * transaction, from oldVersion + 1 up to DB_VERSION.
 * @type {Record<number, (db: IDBDatabase, tx: IDBTransaction) => void>}
 */
const UPGRADES = {
  1(db) {
    const plans = db.createObjectStore('plans', { keyPath: 'id' });
    plans.createIndex('updatedAt', 'updatedAt');
    const appts = db.createObjectStore('appointments', { keyPath: 'id' });
    appts.createIndex('updatedAt', 'updatedAt');
    appts.createIndex('planId', 'planId');
    appts.createIndex('dateTime', 'dateTime');
    db.createObjectStore('meta');
  },
};

/**
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T>}
 */
function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** @param {IDBTransaction} tx @returns {Promise<void>} */
function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });
}

/**
 * @param {{ name?: string, factory?: IDBFactory }} [options]
 * @returns {Promise<IDBDatabase>}
 */
export function openDatabase({ name = DB_NAME, factory = indexedDB } = {}) {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = /** @type {IDBTransaction} */ (request.transaction);
      for (let v = event.oldVersion + 1; v <= DB_VERSION; v++) UPGRADES[v]?.(db, tx);
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab is upgrading the schema: let it, and reload this one.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other tabs of this app to finish the update.'));
  });
}

/**
 * @template {EntityMeta} T
 * @param {IDBDatabase} db
 * @param {'plans'|'appointments'} name
 * @param {(ids: string[]) => void} notify
 * @returns {Collection<T>}
 */
function idbCollection(db, name, notify) {
  return {
    async get(id) {
      return promisify(db.transaction(name).objectStore(name).get(id));
    },
    async list({ includeDeleted = false } = {}) {
      /** @type {T[]} */
      const all = await promisify(db.transaction(name).objectStore(name).getAll());
      return includeDeleted ? all : all.filter((e) => e.deletedAt === null);
    },
    async put(entity) {
      const tx = db.transaction(name, 'readwrite');
      tx.objectStore(name).put(entity);
      await done(tx);
      notify([entity.id]);
    },
    async putMany(entities) {
      if (entities.length === 0) return;
      const tx = db.transaction(name, 'readwrite');
      const store = tx.objectStore(name);
      for (const e of entities) store.put(e);
      await done(tx);
      notify(entities.map((e) => e.id));
    },
    async changedSince(since) {
      const index = db.transaction(name).objectStore(name).index('updatedAt');
      return promisify(index.getAll(IDBKeyRange.lowerBound(since, true)));
    },
  };
}

/**
 * @param {{ name?: string, factory?: IDBFactory }} [options] name is overridable for tests
 * @returns {Promise<Store>}
 */
export async function createIndexedDbStore(options = {}) {
  const db = await openDatabase(options);

  /** @type {Set<ChangeListener>} */
  const listeners = new Set();
  const channel =
    typeof BroadcastChannel === 'function' ? new BroadcastChannel(`${CHANNEL_NAME}:${db.name}`) : null;

  /** @param {StoreChange} change */
  const dispatch = (change) => {
    for (const l of listeners) l(change);
  };
  /** @param {ChangeScope} scope @param {string[]} ids */
  const emit = (scope, ids) => {
    dispatch({ scope, ids, external: false });
    channel?.postMessage({ scope, ids });
  };
  if (channel) {
    channel.onmessage = (event) => dispatch({ ...event.data, external: true });
  }

  return {
    kind: 'indexeddb',
    plans: idbCollection(db, 'plans', (ids) => emit('plans', ids)),
    appointments: idbCollection(db, 'appointments', (ids) => emit('appointments', ids)),
    meta: {
      async get(key) {
        return promisify(db.transaction('meta').objectStore('meta').get(key));
      },
      async set(key, value) {
        const tx = db.transaction('meta', 'readwrite');
        tx.objectStore('meta').put(value, key);
        await done(tx);
        emit('meta', [key]);
      },
    },
    async replaceAll(data) {
      const tx = db.transaction(['plans', 'appointments'], 'readwrite');
      const plans = tx.objectStore('plans');
      const appts = tx.objectStore('appointments');
      plans.clear();
      appts.clear();
      for (const p of data.plans) plans.put(p);
      for (const a of data.appointments) appts.put(a);
      await done(tx);
      emit('all', []);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      listeners.clear();
      channel?.close();
      db.close();
    },
  };
}
