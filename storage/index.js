// @ts-check
import { createIndexedDbStore } from './indexeddb-store.js';
import { createMemoryStore } from './memory-store.js';

/** @typedef {import('./store.js').Store} Store */

/**
 * Open the best available store. Falls back to memory (and says so via
 * `store.kind`) when IndexedDB is missing or blocked, e.g. in some private
 * browsing modes.
 * @returns {Promise<Store>}
 */
export async function openStore() {
  if (typeof indexedDB !== 'undefined') {
    try {
      return await createIndexedDbStore();
    } catch (err) {
      console.warn('IndexedDB unavailable, using in-memory storage.', err);
    }
  }
  return createMemoryStore();
}
