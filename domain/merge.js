// @ts-check
/**
 * Last-write-wins merge by id, compared on `updatedAt`. Used by JSON import
 * now, and meant to be reused by server sync later. Tombstones (deletedAt)
 * are ordinary records here, so deletions propagate like any other change.
 */

/** @typedef {import('./types.js').EntityMeta} EntityMeta */

/**
 * @template {EntityMeta} T
 * @typedef {object} MergeResult
 * @property {T[]} toWrite   incoming records that should be stored
 * @property {number} added
 * @property {number} updated
 * @property {number} unchanged
 */

/**
 * @template {EntityMeta} T
 * @param {readonly T[]} local
 * @param {readonly T[]} incoming
 * @returns {MergeResult<T>}
 */
export function mergeEntities(local, incoming) {
  const byId = new Map(local.map((e) => [e.id, e]));
  /** @type {T[]} */
  const toWrite = [];
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const remote of incoming) {
    const mine = byId.get(remote.id);
    if (mine && Date.parse(remote.updatedAt) <= Date.parse(mine.updatedAt)) {
      unchanged++;
      continue;
    }
    if (mine) updated++;
    else added++;
    toWrite.push(remote);
    byId.set(remote.id, remote);
  }
  return { toWrite, added, updated, unchanged };
}
