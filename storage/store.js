// @ts-check
/**
 * The Store interface. The rest of the app depends only on this shape, so
 * IndexedDbStore, MemoryStore and a future RemoteStore / SyncingStore are
 * interchangeable (like coding to a Java interface).
 *
 * Rules every implementation follows:
 * - All methods are async, even in memory, so a network-backed store fits.
 * - Values going in and out are copies; callers cannot mutate stored state.
 * - There is no hard delete. Deleting is a domain change (deletedAt), stored
 *   with `put` like any other update, so it can be synced.
 */

/** @typedef {import('../domain/types.js').Id} Id */
/** @typedef {import('../domain/types.js').Instant} Instant */
/** @typedef {import('../domain/types.js').EntityMeta} EntityMeta */
/** @typedef {import('../domain/types.js').CheckupPlan} CheckupPlan */
/** @typedef {import('../domain/types.js').Appointment} Appointment */

/**
 * @template {EntityMeta} T
 * @typedef {object} Collection
 * @property {(id: Id) => Promise<T|undefined>} get
 * @property {(options?: { includeDeleted?: boolean }) => Promise<T[]>} list
 * @property {(entity: T) => Promise<void>} put
 * @property {(entities: readonly T[]) => Promise<void>} putMany
 * @property {(since: Instant) => Promise<T[]>} changedSince
 *   Records (including tombstones) with updatedAt strictly after `since`.
 *   This is the hook a future sync uses to push local changes.
 */

/**
 * Small key/value area for device-local settings and bookkeeping
 * (notification log, last backup date, ...).
 * @typedef {object} MetaArea
 * @property {(key: string) => Promise<unknown>} get
 * @property {(key: string, value: unknown) => Promise<void>} set
 */

/** @typedef {'plans'|'appointments'|'meta'|'all'} ChangeScope */
/** @typedef {{ scope: ChangeScope, ids: Id[], external: boolean }} StoreChange  external = from another tab */
/** @typedef {(change: StoreChange) => void} ChangeListener */

/**
 * @typedef {object} Store
 * @property {string} kind  'indexeddb' | 'memory' | ...
 * @property {Collection<CheckupPlan>} plans
 * @property {Collection<Appointment>} appointments
 * @property {MetaArea} meta
 * @property {(data: { plans: readonly CheckupPlan[], appointments: readonly Appointment[] }) => Promise<void>} replaceAll
 *   Atomically replace all plans and appointments (used by "replace" import).
 * @property {(listener: ChangeListener) => () => void} subscribe
 * @property {() => void} close
 */

/** Meta keys used across the app, in one place. */
export const META_KEYS = Object.freeze({
  persistRequested: 'persistRequested',
  notifiedReminders: 'notifiedReminders',
  lastBackupAt: 'lastBackupAt',
  notificationsExplained: 'notificationsExplained',
  calendarView: 'calendarView',
});

export {};
