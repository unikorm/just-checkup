// @ts-check
// Placeholder until milestone 4.
import { h } from '../dom.js';
import { href } from '../router.js';
import { formatDateTime } from '../format.js';

/** @param {import('../context.js').AppContext} ctx @returns {import('../context.js').Screen} */
export function calendarScreen(ctx) {
  const { plans, appointments } = ctx.state.get();
  return {
    title: 'Calendar',
    el: h('div', { class: 'screen' },
      h('h1', { tabindex: '-1' }, 'Calendar'),
      h('ul', null, plans.map((p) => h('li', null, h('a', { href: href(`/edit/${p.id}`) }, p.name)))),
      h('ul', null, appointments.map((a) => h('li', null, h('a', { href: href(`/edit/${a.id}`) }, `${a.title} · ${formatDateTime(a.dateTime)} · ${a.status}`)))),
    ),
  };
}
