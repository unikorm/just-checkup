// @ts-check
import { AppointmentStatus } from './constants.js';
import { datePart, isValidLocalDateTime, todayLocal } from './dates.js';
import { newMeta, touch } from './entity.js';

/** @typedef {import('./types.js').Appointment} Appointment */
/** @typedef {import('./types.js').AppointmentStatus} Status */
/** @typedef {import('./types.js').CreateContext} CreateContext */
/** @typedef {import('./types.js').LocalDateTime} LocalDateTime */
/** @typedef {import('./validation.js').AppointmentInput} AppointmentInput */
/**
 * @template T
 * @typedef {import('./types.js').Result<T>} Result
 */

/**
 * Allowed status transitions. Rescheduling is SCHEDULED -> SCHEDULED with a
 * new dateTime; CANCELLED -> SCHEDULED reactivates; DONE -> SCHEDULED undoes
 * a mistaken "mark done".
 * @type {Readonly<Record<Status, readonly Status[]>>}
 */
export const TRANSITIONS = Object.freeze({
  SCHEDULED: ['SCHEDULED', 'DONE', 'CANCELLED'],
  CANCELLED: ['SCHEDULED'],
  DONE: ['SCHEDULED'],
});

/**
 * @param {Status} from
 * @param {Status} to
 */
export function canTransition(from, to) {
  return TRANSITIONS[from].includes(to);
}

/**
 * @param {AppointmentInput} input already validated
 * @param {CreateContext} ctx
 * @param {Status} [status] DONE is used when logging a past visit
 * @returns {Appointment}
 */
export function createAppointment(input, ctx, status = AppointmentStatus.SCHEDULED) {
  return { ...newMeta(ctx), ...input, reminderOffsets: [...input.reminderOffsets], status };
}

/**
 * Apply edited fields. Status is not changed here; use the transitions.
 * @param {Appointment} appointment
 * @param {AppointmentInput} input already validated
 * @param {Date} now
 * @returns {Appointment}
 */
export function updateAppointment(appointment, input, now) {
  return touch(appointment, { ...input, reminderOffsets: [...input.reminderOffsets] }, now);
}

/**
 * @param {Appointment} appointment
 * @param {Status} to
 * @param {Date} now
 * @param {Partial<Appointment>} [changes]
 * @returns {Result<Appointment>}
 */
function transition(appointment, to, now, changes = {}) {
  if (appointment.deletedAt !== null) {
    return { ok: false, errors: { status: 'This appointment was deleted.' } };
  }
  if (!canTransition(appointment.status, to)) {
    return { ok: false, errors: { status: `Cannot change ${appointment.status} to ${to}.` } };
  }
  return { ok: true, value: touch(appointment, { ...changes, status: to }, now) };
}

/**
 * Only appointments on or before today can be marked done.
 * @param {Appointment} appointment
 * @param {Date} now
 */
export function markDone(appointment, now) {
  if (datePart(appointment.dateTime) > todayLocal(now)) {
    return /** @type {Result<Appointment>} */ ({
      ok: false,
      errors: { status: 'You can only mark an appointment done on or after its day.' },
    });
  }
  return transition(appointment, AppointmentStatus.DONE, now);
}

/** @param {Appointment} appointment @param {Date} now */
export function cancel(appointment, now) {
  return transition(appointment, AppointmentStatus.CANCELLED, now);
}

/**
 * Move to a new time. Also reactivates a cancelled appointment.
 * @param {Appointment} appointment
 * @param {LocalDateTime} dateTime
 * @param {Date} now
 * @returns {Result<Appointment>}
 */
export function reschedule(appointment, dateTime, now) {
  if (!isValidLocalDateTime(dateTime)) {
    return { ok: false, errors: { dateTime: 'Enter a valid date and time.' } };
  }
  return transition(appointment, AppointmentStatus.SCHEDULED, now, { dateTime });
}

/** Undo "done" or "cancelled". @param {Appointment} appointment @param {Date} now */
export function reopen(appointment, now) {
  return transition(appointment, AppointmentStatus.SCHEDULED, now);
}

/** @param {Appointment} a @param {Appointment} b */
export function byDateTime(a, b) {
  return a.dateTime < b.dateTime ? -1 : a.dateTime > b.dateTime ? 1 : 0;
}
