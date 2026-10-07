// @ts-check
/**
 * Minimal element builder. User text is always inserted as text nodes, never
 * as HTML, so stored data cannot inject markup.
 *
 *   h('button', { class: 'btn', onclick: save, disabled: busy }, 'Save')
 */

/** @typedef {Node | string | number | null | undefined | false | Array<any>} Child  arrays may nest */
/** @typedef {Record<string, unknown>} Props */

/** Properties set as DOM properties rather than attributes. */
const PROPS = new Set(['value', 'checked', 'selected', 'indeterminate']);

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Props|null} [props]
 * @param {...Child} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), /** @type {EventListener} */ (value));
    } else if (PROPS.has(key)) /** @type {any} */ (el)[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

/**
 * @param {Element|DocumentFragment} parent
 * @param {Child[]} children
 */
export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/**
 * Parse trusted, constant SVG markup (icons only, never user data).
 * @param {string} markup
 * @returns {Element}
 */
export function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return /** @type {Element} */ (t.content.firstElementChild);
}

let idCounter = 0;
/** @param {string} prefix */
export const uid = (prefix) => `${prefix}-${++idCounter}`;
