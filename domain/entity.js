// @ts-check
/** @typedef {import('./types.js').EntityMeta} EntityMeta */
/** @typedef {import('./types.js').CreateContext} CreateContext */

/**
 * @param {CreateContext} ctx
 * @returns {EntityMeta}
 */
export function newMeta({ now, id }) {
  const stamp = now.toISOString();
  return { id, createdAt: stamp, updatedAt: stamp, deletedAt: null };
}

/**
 * Return a copy with `changes` applied and `updatedAt` bumped.
 * @template {EntityMeta} T
 * @param {T} entity
 * @param {Partial<T>} changes
 * @param {Date} now
 * @returns {T}
 */
export function touch(entity, changes, now) {
  return { ...entity, ...changes, updatedAt: now.toISOString() };
}

/**
 * Soft delete: the record stays (as a tombstone) so a future sync can
 * propagate the deletion.
 * @template {EntityMeta} T
 * @param {T} entity
 * @param {Date} now
 * @returns {T}
 */
export function softDelete(entity, now) {
  const stamp = now.toISOString();
  return { ...entity, deletedAt: stamp, updatedAt: stamp };
}

/**
 * @template {EntityMeta} T
 * @param {T} entity
 * @param {Date} now
 * @returns {T}
 */
export function restore(entity, now) {
  return { ...entity, deletedAt: null, updatedAt: now.toISOString() };
}

/** @param {EntityMeta} entity */
export function isLive(entity) {
  return entity.deletedAt === null;
}
