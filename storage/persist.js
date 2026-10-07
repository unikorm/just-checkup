// @ts-check
/**
 * Ask the browser to keep our data even under storage pressure. Called once
 * on first run; the answer is remembered so we do not ask on every launch.
 */
import { META_KEYS } from './store.js';

/** @typedef {import('./store.js').Store} Store */
/** @typedef {'persisted'|'best-effort'|'unsupported'} PersistenceState */

/** @returns {Promise<PersistenceState>} */
export async function getPersistenceState() {
  if (!navigator.storage?.persisted) return 'unsupported';
  return (await navigator.storage.persisted()) ? 'persisted' : 'best-effort';
}

/**
 * @param {Store} store
 * @returns {Promise<PersistenceState>}
 */
export async function requestPersistenceOnFirstRun(store) {
  const state = await getPersistenceState();
  if (state !== 'best-effort') return state;
  if (await store.meta.get(META_KEYS.persistRequested)) return state;

  await store.meta.set(META_KEYS.persistRequested, true);
  try {
    return (await navigator.storage.persist()) ? 'persisted' : 'best-effort';
  } catch {
    return 'best-effort';
  }
}

/**
 * Rough storage usage for the settings screen.
 * @returns {Promise<{ usage: number, quota: number } | null>}
 */
export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}
