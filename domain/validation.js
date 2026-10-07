// @ts-check
/**
 * Input validation. Takes loosely-typed input (e.g. straight from a form,
 * where numbers arrive as strings) and returns either clean, typed values or
 * per-field error messages. Error keys match form field names.
 */

import {
  INTERVAL_MAX,
  INTERVAL_UNITS,
  OFFSET_UNITS,
  MAX_OFFSET_MINUTES,
  MAX_REMINDERS_PER_APPOINTMENT,
  DEFAULT_DURATION_MINUTES,
  LIMITS,
} from './constants.js';
import { isValidLocalDate, isValidLocalDateTime, offsetToMinutes } from './dates.js';

/** @typedef {import('./types.js').PlanFields} PlanInput */
/** @typedef {import('./types.js').ReminderOffset} ReminderOffset */
/** @typedef {import('./types.js').OffsetUnit} OffsetUnit */
/** @typedef {import('./types.js').IntervalUnit} IntervalUnit */
/** @typedef {import('./types.js').LocalDate} LocalDate */
/**
 * @template T
 * @typedef {import('./types.js').Result<T>} Result
 */

/**
 * @typedef {Omit<import('./types.js').AppointmentFields, 'status'>} AppointmentInput
 */

/**
 * @typedef {object} RawPlanInput
 * @property {unknown} [name]
 * @property {unknown} [notes]
 * @property {{ amount?: unknown, unit?: unknown }} [interval]
 * @property {unknown} [lastVisitDate]
 * @property {unknown} [remindBeforeDays]
 */

/**
 * @typedef {object} RawAppointmentInput
 * @property {unknown} [planId]
 * @property {unknown} [title]
 * @property {unknown} [dateTime]
 * @property {unknown} [durationMinutes]
 * @property {unknown} [timeZone]
 * @property {unknown} [location]
 * @property {unknown} [notes]
 * @property {Array<{ amount?: unknown, unit?: unknown }>} [reminderOffsets]
 */

/** @param {unknown} value */
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {unknown} value */
function isBlank(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

/**
 * Parse an integer from a number or a numeric string. NaN when not an integer.
 * @param {unknown} value
 */
function toInt(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : NaN;
  if (typeof value === 'string' && /^\s*-?\d+\s*$/.test(value)) return Number(value);
  return NaN;
}

/**
 * @param {Record<string, string>} errors
 * @param {string} field
 * @param {unknown} value
 * @param {number} max
 * @param {string} label
 * @param {boolean} required
 */
function checkText(errors, field, value, max, label, required) {
  const v = text(value);
  if (required && v === '') errors[field] = `${label} is required.`;
  else if (v.length > max) errors[field] = `${label} must be at most ${max} characters.`;
  return v;
}

/**
 * @param {RawPlanInput} raw
 * @param {LocalDate} today used to reject a last visit in the future
 * @returns {Result<PlanInput>}
 */
export function validatePlanInput(raw, today) {
  /** @type {Record<string, string>} */
  const errors = {};

  const name = checkText(errors, 'name', raw.name, LIMITS.nameMax, 'Name', true);
  const notes = checkText(errors, 'notes', raw.notes, LIMITS.notesMax, 'Notes', false);

  const unit = /** @type {IntervalUnit} */ (raw.interval?.unit);
  const amount = toInt(raw.interval?.amount);
  if (!INTERVAL_UNITS.includes(unit)) {
    errors.interval = 'Choose days, weeks, months or years.';
  } else if (!(amount >= 1 && amount <= INTERVAL_MAX[unit])) {
    errors.interval = `Repeat every 1 to ${INTERVAL_MAX[unit]} ${unit}.`;
  }

  /** @type {LocalDate|null} */
  let lastVisitDate = null;
  if (!isBlank(raw.lastVisitDate)) {
    const v = text(raw.lastVisitDate);
    if (!isValidLocalDate(v)) errors.lastVisitDate = 'Enter a valid date.';
    else if (v > today) errors.lastVisitDate = 'Last visit cannot be in the future.';
    else lastVisitDate = v;
  }

  /** @type {number|null} */
  let remindBeforeDays = null;
  if (!isBlank(raw.remindBeforeDays)) {
    const n = toInt(raw.remindBeforeDays);
    if (!(n >= 0 && n <= LIMITS.remindBeforeDaysMax)) {
      errors.remindBeforeDays = `Enter a whole number from 0 to ${LIMITS.remindBeforeDaysMax}.`;
    } else remindBeforeDays = n;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, notes, interval: { amount, unit }, lastVisitDate, remindBeforeDays } };
}

/**
 * Validate reminder offsets. Duplicates (same total minutes) are removed and
 * the result is sorted from earliest reminder to latest.
 * @param {unknown} raw
 * @returns {Result<ReminderOffset[]>}
 */
export function validateReminderOffsets(raw) {
  if (raw === null || raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, errors: { reminderOffsets: 'Invalid reminders.' } };

  /** @type {Map<number, ReminderOffset>} */
  const byMinutes = new Map();
  for (const item of raw) {
    const unit = /** @type {OffsetUnit} */ (item?.unit);
    const amount = toInt(item?.amount);
    if (!OFFSET_UNITS.includes(unit) || !(amount >= 1)) {
      return { ok: false, errors: { reminderOffsets: 'Each reminder needs a positive whole number and a unit.' } };
    }
    const offset = { amount, unit };
    const minutes = offsetToMinutes(offset);
    if (minutes > MAX_OFFSET_MINUTES) {
      return { ok: false, errors: { reminderOffsets: 'Reminders can be at most 4 weeks before.' } };
    }
    if (!byMinutes.has(minutes)) byMinutes.set(minutes, offset);
  }
  if (byMinutes.size > MAX_REMINDERS_PER_APPOINTMENT) {
    return { ok: false, errors: { reminderOffsets: `At most ${MAX_REMINDERS_PER_APPOINTMENT} reminders.` } };
  }
  const value = [...byMinutes.entries()].sort((a, b) => b[0] - a[0]).map(([, o]) => o);
  return { ok: true, value };
}

/**
 * @param {RawAppointmentInput} raw
 * @returns {Result<AppointmentInput>}
 */
export function validateAppointmentInput(raw) {
  /** @type {Record<string, string>} */
  const errors = {};

  const title = checkText(errors, 'title', raw.title, LIMITS.titleMax, 'Title', true);
  const location = checkText(errors, 'location', raw.location, LIMITS.locationMax, 'Location', false);
  const notes = checkText(errors, 'notes', raw.notes, LIMITS.notesMax, 'Notes', false);

  const dateTime = text(raw.dateTime);
  if (dateTime === '') errors.dateTime = 'Date and time are required.';
  else if (!isValidLocalDateTime(dateTime)) errors.dateTime = 'Enter a valid date and time.';

  let durationMinutes = DEFAULT_DURATION_MINUTES;
  if (!isBlank(raw.durationMinutes)) {
    durationMinutes = toInt(raw.durationMinutes);
    if (!(durationMinutes >= LIMITS.durationMin && durationMinutes <= LIMITS.durationMax)) {
      errors.durationMinutes = `Duration must be ${LIMITS.durationMin} to ${LIMITS.durationMax} minutes.`;
    }
  }

  const planId = isBlank(raw.planId) ? null : text(raw.planId);
  const timeZone = isBlank(raw.timeZone) ? null : text(raw.timeZone);

  const offsets = validateReminderOffsets(raw.reminderOffsets);
  if (!offsets.ok) Object.assign(errors, offsets.errors);

  if (Object.keys(errors).length > 0 || !offsets.ok) return { ok: false, errors };
  return {
    ok: true,
    value: {
      planId,
      title,
      dateTime,
      durationMinutes,
      timeZone,
      location,
      notes,
      reminderOffsets: offsets.value,
    },
  };
}
