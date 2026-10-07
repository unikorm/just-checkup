// @ts-check
/**
 * Tiny in-browser runner for the shared store contract, against the real
 * IndexedDbStore. Open /tests/browser/ on the dev server.
 */
import { createIndexedDbStore } from '../../storage/indexeddb-store.js';
import { defineStoreContract } from '../store-contract.js';

/** @type {{ name: string, fn: () => Promise<void> }[]} */
const tests = [];

/** @param {unknown} a @param {unknown} b */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const assert = {
  /** @param {unknown} a @param {unknown} b @param {string} [msg] */
  equal(a, b, msg) {
    if (a !== b) throw new Error(`${msg ?? 'equal'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
  },
  /** @param {unknown} a @param {unknown} b @param {string} [msg] */
  deepEqual(a, b, msg) {
    if (!same(a, b)) throw new Error(`${msg ?? 'deepEqual'}:\n${JSON.stringify(a)}\n!==\n${JSON.stringify(b)}`);
  },
  /** @param {unknown} v @param {string} [msg] */
  ok(v, msg) {
    if (!v) throw new Error(msg ?? 'expected truthy');
  },
};

let n = 0;
const makeStore = async () => {
  const name = `just-checkup-test-${Date.now()}-${n++}`;
  await new Promise((res) => {
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = r.onerror = r.onblocked = () => res(undefined);
  });
  return createIndexedDbStore({ name });
};

defineStoreContract({ makeStore, test: (name, fn) => tests.push({ name, fn }), assert });

const list = /** @type {HTMLElement} */ (document.getElementById('results'));
let failed = 0;
for (const t of tests) {
  const li = document.createElement('li');
  try {
    await t.fn();
    li.className = 'pass';
    li.textContent = `✓ ${t.name}`;
  } catch (err) {
    failed++;
    li.className = 'fail';
    li.textContent = `✗ ${t.name}\n${err instanceof Error ? err.message : String(err)}`;
  }
  list.append(li);
}
const summary = /** @type {HTMLElement} */ (document.getElementById('summary'));
summary.textContent = `${tests.length - failed}/${tests.length} passed`;
summary.dataset.failed = String(failed);
