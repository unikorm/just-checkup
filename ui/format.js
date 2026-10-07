// @ts-check
/**
 * Display formatting. Uses the browser locale via Intl; Date objects are
 * only created through domain/dates.js so no UTC parsing slips in.
 */
import { localDateTimeToDate, localDateToDate } from '../domain/dates.js';

/** @typedef {import('../domain/types.js').LocalDate} LocalDate */
/** @typedef {import('../domain/types.js').LocalDateTime} LocalDateTime */
/** @typedef {import('../domain/types.js').Interval} Interval */
/** @typedef {import('../domain/types.js').ReminderOffset} ReminderOffset */
/** @typedef {import('../domain/types.js').AppointmentStatus} AppointmentStatus */
/** @typedef {import('../domain/types.js').PlanStatus} PlanStatus */

/** The browser locale, or the runtime default if the browser reports an invalid tag. */
const locale = (() => {
  try {
    const tag = typeof navigator !== 'undefined' ? navigator.language : undefined;
    return tag ? Intl.DateTimeFormat.supportedLocalesOf(tag)[0] : undefined;
  } catch {
    return undefined;
  }
})();

/** @type {Map<string, Intl.DateTimeFormat>} */
const cache = new Map();
/** @param {Intl.DateTimeFormatOptions} options */
function fmt(options) {
  const key = JSON.stringify(options);
  let f = cache.get(key);
  if (!f) cache.set(key, (f = new Intl.DateTimeFormat(locale, options)));
  return f;
}

/** "Wed, 7 Oct" @param {LocalDate} date */
export const formatDateShort = (date) => fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(localDateToDate(date));

/** "Wednesday, 7 October 2026" @param {LocalDate} date */
export const formatDateLong = (date) =>
  fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(localDateToDate(date));

/** "7 Oct 2026" @param {LocalDate} date */
export const formatDate = (date) => fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(localDateToDate(date));

/** "October 2026" @param {LocalDate} date */
export const formatMonthYear = (date) => fmt({ month: 'long', year: 'numeric' }).format(localDateToDate(date));

/** "Oct" @param {LocalDate} date */
export const formatMonthShort = (date) => fmt({ month: 'short' }).format(localDateToDate(date));

/** "Mon" @param {LocalDate} date */
export const formatWeekdayShort = (date) => fmt({ weekday: 'short' }).format(localDateToDate(date));

/** "9:30" / "9:30 AM" @param {LocalDateTime} dateTime */
export const formatTime = (dateTime) => fmt({ hour: 'numeric', minute: '2-digit' }).format(localDateTimeToDate(dateTime));

/** @param {LocalDateTime} dateTime */
export const formatDateTime = (dateTime) =>
  fmt({ weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(localDateTimeToDate(dateTime));

/**
 * @param {number} n
 * @param {string} singular
 * @param {string} [plural]
 */
export function plural(n, singular, plural = `${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** @param {Interval} interval */
export function formatInterval({ amount, unit }) {
  const single = unit.slice(0, -1);
  return amount === 1 ? `Every ${single}` : `Every ${plural(amount, single)}`;
}

/** @param {ReminderOffset} offset */
export function formatOffset({ amount, unit }) {
  return `${plural(amount, unit.slice(0, -1))} before`;
}

/** @param {number|null} days days until due, negative when overdue */
export function formatDueRelative(days) {
  if (days === null) return 'No visits yet';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 0) return `Due in ${plural(days, 'day')}`;
  return `Overdue by ${plural(-days, 'day')}`;
}

/** @type {Record<AppointmentStatus, string>} */
export const STATUS_LABEL = { SCHEDULED: 'Scheduled', DONE: 'Done', CANCELLED: 'Cancelled' };

/** @type {Record<PlanStatus, string>} */
export const PLAN_STATUS_LABEL = {
  booked: 'Booked',
  overdue: 'Overdue',
  'due-soon': 'Due soon',
  later: 'On track',
  'no-history': 'Not started',
};
