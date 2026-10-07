// @ts-check
/** @typedef {import('./types.js').AppointmentStatus} AppointmentStatus */
/** @typedef {import('./types.js').IntervalUnit} IntervalUnit */
/** @typedef {import('./types.js').OffsetUnit} OffsetUnit */

/** @type {Readonly<{ SCHEDULED: 'SCHEDULED', DONE: 'DONE', CANCELLED: 'CANCELLED' }>} */
export const AppointmentStatus = Object.freeze({
  SCHEDULED: 'SCHEDULED',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
});

/** @type {readonly AppointmentStatus[]} */
export const APPOINTMENT_STATUSES = Object.freeze(['SCHEDULED', 'DONE', 'CANCELLED']);

/** @type {readonly IntervalUnit[]} */
export const INTERVAL_UNITS = Object.freeze(['days', 'weeks', 'months', 'years']);

/** Upper bound per interval unit (roughly ten years). */
/** @type {Readonly<Record<IntervalUnit, number>>} */
export const INTERVAL_MAX = Object.freeze({ days: 3650, weeks: 520, months: 120, years: 10 });

/** @type {readonly OffsetUnit[]} */
export const OFFSET_UNITS = Object.freeze(['minutes', 'hours', 'days', 'weeks']);

/** @type {Readonly<Record<OffsetUnit, number>>} */
export const OFFSET_UNIT_MINUTES = Object.freeze({ minutes: 1, hours: 60, days: 1440, weeks: 10080 });

/** Longest allowed reminder offset: 4 weeks. */
export const MAX_OFFSET_MINUTES = 4 * 10080;
export const MAX_REMINDERS_PER_APPOINTMENT = 5;

/** When a plan has no remindBeforeDays, it counts as "due soon" this many days ahead. */
export const DEFAULT_DUE_SOON_DAYS = 30;
export const DEFAULT_DURATION_MINUTES = 60;

/** Time of day used for date-only reminders (plan due dates). */
export const PLAN_REMINDER_TIME = '09:00';

export const LIMITS = Object.freeze({
  nameMax: 80,
  titleMax: 80,
  locationMax: 200,
  notesMax: 2000,
  remindBeforeDaysMax: 365,
  durationMin: 5,
  durationMax: 24 * 60,
});
