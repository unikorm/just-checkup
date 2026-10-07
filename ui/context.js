// @ts-check
/**
 * Shapes shared by all screens.
 */

/** @typedef {import('../app/state.js').AppData} AppData */

/**
 * @typedef {object} Screen
 * @property {HTMLElement} el
 * @property {string} title           document title
 * @property {boolean} [wide]         use the wide layout on large screens
 * @property {(data: AppData) => void} [update]  called when data changes
 * @property {() => void} [destroy]
 */

/**
 * @typedef {object} AppContext
 * @property {import('../app/services.js').Services} services
 * @property {import('../app/state.js').AppState} state
 * @property {import('../storage/store.js').Store} store
 * @property {() => Date} now
 * @property {() => Promise<void>} refresh   reload data and re-render the current route
 * @property {(message: string) => void} toast
 */

export {};
