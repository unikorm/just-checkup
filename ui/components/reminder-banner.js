// @ts-check
/**
 * In-app banner shown on the home screen: what is coming up or due.
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { href } from '../router.js';
import { formatDueRelative, formatWhen } from '../format.js';
import { nowLocalDateTime, todayLocal } from '../../domain/dates.js';
import { enableNotificationsFlow } from './notification-prompt.js';
import { notificationPermission } from '../../reminders/permission.js';

/** @typedef {import('../../reminders/compute.js').BannerItem} BannerItem */
/** @typedef {import('../context.js').AppContext} AppContext */

/**
 * @param {AppContext} ctx
 * @param {BannerItem[]} items
 * @param {{ hasReminders: boolean, onDismiss: () => void }} options
 */
export function reminderBanner(ctx, items, { hasReminders, onDismiss }) {
  const permission = notificationPermission();
  const offerNotifications = hasReminders && permission === 'default';
  if (items.length === 0 && !offerNotifications) return null;

  const now = ctx.now();
  const today = todayLocal(now);

  const list = items.map((item) =>
    h(
      'li',
      { class: `banner__item banner__item--${item.tone}` },
      h('span', { class: 'banner__icon', 'aria-hidden': 'true' }, item.kind === 'appointment' ? icon('clock', 18) : icon('repeat', 18)),
      h(
        'span',
        { class: 'banner__text' },
        h('a', { href: href(`/edit/${item.entityId}`) }, item.title),
        ' ',
        h('span', { class: 'banner__when' },
          item.kind === 'appointment' && item.startsAt
            ? formatWhen(localFromInstant(item.startsAt), today)
            : item.daysUntilDue !== undefined ? formatDueRelative(item.daysUntilDue) : ''),
      ),
      item.kind === 'plan'
        ? h('a', { class: 'btn btn--small btn--primary', href: href('/new', { type: 'appointment', planId: item.entityId, date: item.dueDate && item.dueDate > today ? item.dueDate : today }), 'aria-label': `Book ${item.title}` }, 'Book')
        : null,
    ),
  );

  return h(
    'section',
    { class: 'card card--mustard banner', 'aria-labelledby': 'banner-title' },
    h(
      'div',
      { class: 'banner__head' },
      h('h2', { id: 'banner-title', class: 'card__title' }, icon('bell', 20), items.length ? 'Heads up' : 'Reminders'),
      h('button', { type: 'button', class: 'icon-btn banner__close', 'aria-label': 'Hide reminders for now', onclick: onDismiss }, icon('close', 18)),
    ),
    items.length ? h('ul', { class: 'banner__list' }, list) : null,
    offerNotifications
      ? h(
          'div',
          { class: 'banner__cta' },
          h('p', { class: 'card__meta' }, 'Want a notification when a reminder is due?'),
          h('button', { type: 'button', class: 'btn btn--small', onclick: () => enableNotificationsFlow({ toast: ctx.toast, onGranted: () => ctx.reminders.check() }).then(() => ctx.refresh()) }, 'Turn on notifications'),
        )
      : null,
  );
}

/**
 * Banner items carry instants; convert back to local wall-clock for display.
 * @param {string} instant
 */
function localFromInstant(instant) {
  return nowLocalDateTime(new Date(instant));
}

