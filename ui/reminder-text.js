// @ts-check
/** Turns a computed reminder into notification text. */
import { formatDate, formatWhen } from './format.js';
import { href } from './router.js';
import { todayLocal } from '../domain/dates.js';

/** @typedef {import('../reminders/compute.js').Reminder} Reminder */
/** @typedef {import('../reminders/notifier.js').NotificationMessage} NotificationMessage */

/**
 * @param {Reminder} reminder
 * @param {Date} now
 * @returns {NotificationMessage}
 */
export function reminderMessage(reminder, now) {
  const url = href(`/edit/${reminder.entityId}`);
  if (reminder.kind === 'appointment') {
    const when = formatWhen(reminder.dateTime, todayLocal(now));
    return {
      tag: reminder.key,
      title: reminder.title,
      body: reminder.location ? `${when} · ${reminder.location}` : when,
      url,
    };
  }
  return {
    tag: reminder.key,
    title: `Time to book: ${reminder.title}`,
    body: `Due around ${formatDate(reminder.dueDate)}. Tap to book an appointment.`,
    url,
  };
}
