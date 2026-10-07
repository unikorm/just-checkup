// @ts-check
/**
 * ALL date math lives here.
 *
 * Calendar arithmetic (add days/months, weekday, diff) is done on plain
 * {year, month, day} numbers using UTC purely as a calculator, so daylight
 * saving transitions can never shift a date. Converting a wall-clock time to a
 * real moment (for reminders and .ics) uses the device's local time zone and
 * happens only in the functions marked "zone-aware".
 *
 * Never use `new Date('YYYY-MM-DD')`: it is parsed as UTC midnight and shows
 * up as the previous day west of Greenwich.
 */

import { OFFSET_UNIT_MINUTES } from './constants.js';

/** @typedef {import('./types.js').LocalDate} LocalDate */
/** @typedef {import('./types.js').LocalDateTime} LocalDateTime */
/** @typedef {import('./types.js').Instant} Instant */
/** @typedef {import('./types.js').Interval} Interval */
/** @typedef {import('./types.js').ReminderOffset} ReminderOffset */

/** @typedef {{ year: number, month: number, day: number }} DateParts  month is 1-12 */
/** @typedef {DateParts & { hour: number, minute: number }} DateTimeParts */

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;
const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Basics

/** @param {number} year */
export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * @param {number} year
 * @param {number} month 1-12
 */
export function daysInMonth(year, month) {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/** @param {number} n @param {number} [width] */
function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}

/** @param {number} year @param {number} month @param {number} day */
function isRealDate(year, month, day) {
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

// ---------------------------------------------------------------------------
// Parsing and formatting

/**
 * Strictly parse 'YYYY-MM-DD'. Returns null for malformed or impossible dates
 * such as '2026-02-30'.
 * @param {unknown} value
 * @returns {DateParts|null}
 */
export function parseLocalDate(value) {
  if (typeof value !== 'string') return null;
  const m = LOCAL_DATE_RE.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return isRealDate(year, month, day) ? { year, month, day } : null;
}

/** @param {unknown} value @returns {value is LocalDate} */
export function isValidLocalDate(value) {
  return parseLocalDate(value) !== null;
}

/**
 * @param {DateParts} parts
 * @returns {LocalDate}
 */
export function formatLocalDate({ year, month, day }) {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/**
 * Strictly parse 'YYYY-MM-DDTHH:mm'.
 * @param {unknown} value
 * @returns {DateTimeParts|null}
 */
export function parseLocalDateTime(value) {
  if (typeof value !== 'string') return null;
  const m = LOCAL_DATE_TIME_RE.exec(value);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  if (!isRealDate(year, month, day) || hour > 23 || minute > 59) return null;
  return { year, month, day, hour, minute };
}

/** @param {unknown} value @returns {value is LocalDateTime} */
export function isValidLocalDateTime(value) {
  return parseLocalDateTime(value) !== null;
}

/**
 * @param {DateTimeParts} parts
 * @returns {LocalDateTime}
 */
export function formatLocalDateTime(parts) {
  return `${formatLocalDate(parts)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** @param {unknown} value @returns {value is string} 'HH:mm' */
export function isValidTime(value) {
  if (typeof value !== 'string') return false;
  const m = TIME_RE.exec(value);
  return !!m && Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

/** @param {LocalDateTime} dateTime @returns {LocalDate} */
export function datePart(dateTime) {
  return dateTime.slice(0, 10);
}

/** @param {LocalDateTime} dateTime @returns {string} 'HH:mm' */
export function timePart(dateTime) {
  return dateTime.slice(11, 16);
}

/**
 * @param {LocalDate} date
 * @param {string} time 'HH:mm'
 * @returns {LocalDateTime}
 */
export function combineDateTime(date, time) {
  return `${date}T${time}`;
}

/** @param {LocalDate} date */
function mustParse(date) {
  const parts = parseLocalDate(date);
  if (!parts) throw new RangeError(`Invalid LocalDate: ${JSON.stringify(date)}`);
  return parts;
}

/** @param {LocalDateTime} dateTime */
function mustParseDateTime(dateTime) {
  const parts = parseLocalDateTime(dateTime);
  if (!parts) throw new RangeError(`Invalid LocalDateTime: ${JSON.stringify(dateTime)}`);
  return parts;
}

// ---------------------------------------------------------------------------
// Calendar arithmetic (zone-free)

/** Days since 1970-01-01 for a calendar date. @param {DateParts} p */
function toEpochDay({ year, month, day }) {
  const d = new Date(0);
  // setUTCFullYear avoids the "years 0-99 mean 1900-1999" quirk of Date.UTC.
  d.setUTCFullYear(year, month - 1, day);
  return Math.round(d.getTime() / MS_PER_DAY);
}

/** @param {number} epochDay @returns {DateParts} */
function fromEpochDay(epochDay) {
  const d = new Date(epochDay * MS_PER_DAY);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * @param {LocalDate} date
 * @param {number} days may be negative
 * @returns {LocalDate}
 */
export function addDays(date, days) {
  return formatLocalDate(fromEpochDay(toEpochDay(mustParse(date)) + days));
}

/**
 * Add calendar months, clamping to the last day of the target month, like
 * java.time's LocalDate.plusMonths: Jan 31 + 1 month = Feb 28 (or 29).
 * @param {LocalDate} date
 * @param {number} months may be negative
 * @returns {LocalDate}
 */
export function addMonths(date, months) {
  const { year, month, day } = mustParse(date);
  const zeroBased = year * 12 + (month - 1) + months;
  const y = Math.floor(zeroBased / 12);
  const m = zeroBased - y * 12 + 1;
  return formatLocalDate({ year: y, month: m, day: Math.min(day, daysInMonth(y, m)) });
}

/**
 * Feb 29 + 1 year = Feb 28.
 * @param {LocalDate} date
 * @param {number} years
 */
export function addYears(date, years) {
  return addMonths(date, years * 12);
}

/**
 * @param {LocalDate} date
 * @param {Interval} interval
 * @returns {LocalDate}
 */
export function addInterval(date, interval) {
  switch (interval.unit) {
    case 'days':
      return addDays(date, interval.amount);
    case 'weeks':
      return addDays(date, interval.amount * 7);
    case 'months':
      return addMonths(date, interval.amount);
    case 'years':
      return addYears(date, interval.amount);
    default:
      throw new RangeError(`Unknown interval unit: ${/** @type {any} */ (interval).unit}`);
  }
}

/**
 * Number of days from `a` to `b` (positive when b is later).
 * @param {LocalDate} a
 * @param {LocalDate} b
 */
export function diffDays(a, b) {
  return toEpochDay(mustParse(b)) - toEpochDay(mustParse(a));
}

/**
 * Lexicographic order equals chronological order for well-formed values, so
 * this works for both LocalDate and LocalDateTime.
 * @param {string} a
 * @param {string} b
 * @returns {-1|0|1}
 */
export function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * @template {string} T
 * @param {T} a
 * @param {T} b
 * @returns {T}
 */
export function maxOf(a, b) {
  return a >= b ? a : b;
}

/**
 * ISO day of week: 1 = Monday ... 7 = Sunday.
 * @param {LocalDate} date
 */
export function isoWeekday(date) {
  // 1970-01-01 was a Thursday (ISO 4).
  const epochDay = toEpochDay(mustParse(date));
  return ((((epochDay + 3) % 7) + 7) % 7) + 1;
}

/** Monday of the week containing `date`. @param {LocalDate} date */
export function startOfWeek(date) {
  return addDays(date, 1 - isoWeekday(date));
}

/**
 * The seven dates Mon..Sun of the week containing `date`.
 * @param {LocalDate} date
 * @returns {LocalDate[]}
 */
export function weekDates(date) {
  const monday = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** @param {LocalDate} date @returns {LocalDate} */
export function startOfMonth(date) {
  return `${date.slice(0, 7)}-01`;
}

/** @param {LocalDate} date @returns {LocalDate} */
export function endOfMonth(date) {
  const { year, month } = mustParse(date);
  return formatLocalDate({ year, month, day: daysInMonth(year, month) });
}

/**
 * 42 dates (6 full Monday-first weeks) covering the month of `date`, for a
 * month grid. Leading/trailing days belong to neighbouring months.
 * @param {LocalDate} date
 * @returns {LocalDate[]}
 */
export function monthGridDates(date) {
  const first = startOfWeek(startOfMonth(date));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

/** @param {LocalDate} a @param {LocalDate} b */
export function isSameMonth(a, b) {
  return a.slice(0, 7) === b.slice(0, 7);
}

/**
 * @param {LocalDate} date
 * @param {LocalDate} from inclusive
 * @param {LocalDate} to inclusive
 */
export function isWithin(date, from, to) {
  return date >= from && date <= to;
}

// ---------------------------------------------------------------------------
// Zone-aware conversions (use the device's local time zone)

/**
 * Today's calendar date on this device.
 * @param {Date} now
 * @returns {LocalDate}
 */
export function todayLocal(now) {
  return formatLocalDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}

/**
 * The current wall-clock time on this device, to the minute.
 * @param {Date} now
 * @returns {LocalDateTime}
 */
export function nowLocalDateTime(now) {
  return formatLocalDateTime({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
  });
}

/**
 * Wall-clock time -> real moment in the device's zone. A time that does not
 * exist (inside a spring-forward gap) is moved forward by the engine, e.g.
 * 02:30 becomes 03:30.
 * @param {LocalDateTime} dateTime
 * @returns {Date}
 */
export function localDateTimeToDate(dateTime) {
  const { year, month, day, hour, minute } = mustParseDateTime(dateTime);
  const d = new Date(2000, 0, 1, 0, 0, 0, 0);
  d.setFullYear(year, month - 1, day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * A Date at local noon on `date`, for handing to Intl formatters. Noon is
 * safely away from any DST transition.
 * @param {LocalDate} date
 * @returns {Date}
 */
export function localDateToDate(date) {
  return localDateTimeToDate(combineDateTime(date, '12:00'));
}

/** @param {Date} date @returns {Instant} */
export function toInstant(date) {
  return date.toISOString();
}

/** @param {ReminderOffset} offset */
export function offsetToMinutes(offset) {
  return offset.amount * OFFSET_UNIT_MINUTES[offset.unit];
}

/**
 * When a reminder should fire. Day and week offsets are calendar offsets
 * ("1 day before 09:00" is 09:00 the previous day even across a DST change);
 * minute and hour offsets are exact durations.
 * @param {LocalDateTime} dateTime
 * @param {ReminderOffset} offset
 * @returns {Date}
 */
export function reminderFireDate(dateTime, offset) {
  if (offset.unit === 'days' || offset.unit === 'weeks') {
    const days = offset.unit === 'weeks' ? offset.amount * 7 : offset.amount;
    const shifted = combineDateTime(addDays(datePart(dateTime), -days), timePart(dateTime));
    return localDateTimeToDate(shifted);
  }
  const start = localDateTimeToDate(dateTime);
  return new Date(start.getTime() - offsetToMinutes(offset) * 60_000);
}
