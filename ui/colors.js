// @ts-check
/** Card colors, chosen deterministically so a plan always has the same one. */
export const CARD_COLORS = /** @type {const} */ (['mustard', 'coral', 'mint', 'lavender']);

/** @typedef {typeof CARD_COLORS[number]} CardColor */

/**
 * @param {string} key a plan id (or appointment id when it has no plan)
 * @returns {CardColor}
 */
export function cardColor(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return CARD_COLORS[hash % CARD_COLORS.length];
}
