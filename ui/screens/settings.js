// @ts-check
// Placeholder until milestone 6.
import { h } from '../dom.js';

/** @param {import('../context.js').AppContext} _ctx @returns {import('../context.js').Screen} */
export function settingsScreen(_ctx) {
  return { title: 'Settings', el: h('div', { class: 'screen' }, h('h1', { tabindex: '-1' }, 'Settings')) };
}
