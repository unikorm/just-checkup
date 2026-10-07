// @ts-check
/**
 * Tiny observable holding everything the screens render from. The store is
 * the source of truth; this is a cached, read-only copy of its live records.
 */

/** @typedef {import('../domain/types.js').CheckupPlan} CheckupPlan */
/** @typedef {import('../domain/types.js').Appointment} Appointment */
/** @typedef {{ ready: boolean, plans: CheckupPlan[], appointments: Appointment[] }} AppData */
/** @typedef {(data: AppData) => void} StateListener */

export function createAppState() {
  /** @type {AppData} */
  let data = { ready: false, plans: [], appointments: [] };
  /** @type {Set<StateListener>} */
  const listeners = new Set();

  return {
    /** @returns {AppData} */
    get: () => data,
    /** @param {Omit<AppData, 'ready'>} next */
    set(next) {
      data = { ready: true, ...next };
      for (const l of listeners) l(data);
    },
    /** @param {StateListener} listener */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** @typedef {ReturnType<typeof createAppState>} AppState */
