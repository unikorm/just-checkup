// @ts-check
/**
 * In-memory Store. Used by tests and as a fallback when IndexedDB is not
 * available (data then lives only until the tab closes).
 */

/** @typedef {import('./store.js').Store} Store */
/** @typedef {import('./store.js').ChangeListener} ChangeListener */
/** @typedef {import('./store.js').ChangeScope} ChangeScope */
/** @typedef {import('../domain/types.js').EntityMeta} EntityMeta */
/**
 * @template {EntityMeta} T
 * @typedef {import('./store.js').Collection<T>} Collection
 */

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
const clone = (value) => structuredClone(value);

/**
 * @template {EntityMeta} T
 * @param {Map<string, T>} map
 * @param {(ids: string[]) => void} notify
 * @returns {Collection<T>}
 */
function memoryCollection(map, notify) {
  return {
    async get(id) {
      const v = map.get(id);
      return v === undefined ? undefined : clone(v);
    },
    async list({ includeDeleted = false } = {}) {
      return [...map.values()].filter((e) => includeDeleted || e.deletedAt === null).map(clone);
    },
    async put(entity) {
      map.set(entity.id, clone(entity));
      notify([entity.id]);
    },
    async putMany(entities) {
      for (const e of entities) map.set(e.id, clone(e));
      if (entities.length > 0) notify(entities.map((e) => e.id));
    },
    async changedSince(since) {
      return [...map.values()].filter((e) => e.updatedAt > since).map(clone);
    },
  };
}

/** @returns {Store} */
export function createMemoryStore() {
  /** @type {Set<ChangeListener>} */
  const listeners = new Set();
  /** @param {ChangeScope} scope @param {string[]} ids */
  const emit = (scope, ids) => {
    for (const l of listeners) l({ scope, ids, external: false });
  };

  /** @type {Map<string, import('../domain/types.js').CheckupPlan>} */
  const plans = new Map();
  /** @type {Map<string, import('../domain/types.js').Appointment>} */
  const appointments = new Map();
  /** @type {Map<string, unknown>} */
  const meta = new Map();

  return {
    kind: 'memory',
    plans: memoryCollection(plans, (ids) => emit('plans', ids)),
    appointments: memoryCollection(appointments, (ids) => emit('appointments', ids)),
    meta: {
      async get(key) {
        return clone(meta.get(key));
      },
      async set(key, value) {
        meta.set(key, clone(value));
        emit('meta', [key]);
      },
    },
    async replaceAll(data) {
      plans.clear();
      appointments.clear();
      for (const p of data.plans) plans.set(p.id, clone(p));
      for (const a of data.appointments) appointments.set(a.id, clone(a));
      emit('all', []);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      listeners.clear();
    },
  };
}
