// @ts-check
/**
 * Hash routes:
 *   #/            calendar
 *   #/new         add form   (?type=appointment|plan&date=YYYY-MM-DD&planId=...)
 *   #/edit/:id    edit form  (plan or appointment)
 *   #/settings    settings, export/import
 */

/**
 * @typedef {{ name: 'calendar' }
 *   | { name: 'new', query: URLSearchParams }
 *   | { name: 'edit', id: string }
 *   | { name: 'settings' }
 *   | { name: 'not-found' }} Route
 */

/**
 * @param {string} hash e.g. location.hash
 * @returns {Route}
 */
export function parseHash(hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, search = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'calendar' };
  if (parts[0] === 'new' && parts.length === 1) return { name: 'new', query: new URLSearchParams(search) };
  if (parts[0] === 'edit' && parts.length === 2) return { name: 'edit', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'settings' && parts.length === 1) return { name: 'settings' };
  return { name: 'not-found' };
}

/**
 * @param {string} path e.g. '/edit/123'
 * @param {Record<string, string|null|undefined>} [query]
 */
export function href(path, query = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) params.set(k, v);
  const qs = params.toString();
  return `#${path}${qs ? `?${qs}` : ''}`;
}

/** @param {string} hash */
export function navigate(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}
