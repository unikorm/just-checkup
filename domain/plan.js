// @ts-check
import { AppointmentStatus, DEFAULT_DUE_SOON_DAYS } from './constants.js';
import { addInterval, datePart, diffDays, maxOf } from './dates.js';
import { newMeta, touch } from './entity.js';
import { byDateTime } from './appointment.js';

/** @typedef {import('./types.js').CheckupPlan} CheckupPlan */
/** @typedef {import('./types.js').PlanFields} PlanFields */
/** @typedef {import('./types.js').Appointment} Appointment */
/** @typedef {import('./types.js').LocalDate} LocalDate */
/** @typedef {import('./types.js').PlanSummary} PlanSummary */
/** @typedef {import('./types.js').PlanStatus} PlanStatus */
/** @typedef {import('./types.js').CreateContext} CreateContext */

/**
 * @param {PlanFields} input already validated
 * @param {CreateContext} ctx
 * @returns {CheckupPlan}
 */
export function createPlan(input, ctx) {
  return { ...newMeta(ctx), ...input, interval: { ...input.interval } };
}

/**
 * @param {CheckupPlan} plan
 * @param {PlanFields} input already validated
 * @param {Date} now
 * @returns {CheckupPlan}
 */
export function updatePlan(plan, input, now) {
  return touch(plan, { ...input, interval: { ...input.interval } }, now);
}

/**
 * Live appointments that belong to `plan`.
 * @param {CheckupPlan} plan
 * @param {readonly Appointment[]} appointments
 */
function appointmentsOf(plan, appointments) {
  return appointments.filter((a) => a.planId === plan.id && a.deletedAt === null);
}

/**
 * Date of the most recent visit: the latest DONE appointment, or the manual
 * lastVisitDate, whichever is later.
 * @param {CheckupPlan} plan
 * @param {readonly Appointment[]} appointments
 * @returns {LocalDate|null}
 */
export function lastVisitOf(plan, appointments) {
  /** @type {LocalDate|null} */
  let last = plan.lastVisitDate;
  for (const a of appointmentsOf(plan, appointments)) {
    if (a.status !== AppointmentStatus.DONE) continue;
    const d = datePart(a.dateTime);
    last = last === null ? d : maxOf(last, d);
  }
  return last;
}

/**
 * Next due date = last visit + interval. Null when there is no visit history.
 * @param {CheckupPlan} plan
 * @param {readonly Appointment[]} appointments
 * @returns {LocalDate|null}
 */
export function nextDueDate(plan, appointments) {
  const last = lastVisitOf(plan, appointments);
  return last === null ? null : addInterval(last, plan.interval);
}

/**
 * The earliest SCHEDULED appointment of this plan from today on.
 * @param {CheckupPlan} plan
 * @param {readonly Appointment[]} appointments
 * @param {LocalDate} today
 * @returns {Appointment|null}
 */
export function nextAppointmentOf(plan, appointments, today) {
  const upcoming = appointmentsOf(plan, appointments)
    .filter((a) => a.status === AppointmentStatus.SCHEDULED && datePart(a.dateTime) >= today)
    .sort(byDateTime);
  return upcoming[0] ?? null;
}

/**
 * @param {CheckupPlan} plan
 * @param {readonly Appointment[]} appointments
 * @param {LocalDate} today
 * @returns {PlanSummary}
 */
export function summarizePlan(plan, appointments, today) {
  const lastVisit = lastVisitOf(plan, appointments);
  const nextDue = lastVisit === null ? null : addInterval(lastVisit, plan.interval);
  const nextAppointment = nextAppointmentOf(plan, appointments, today);
  const daysUntilDue = nextDue === null ? null : diffDays(today, nextDue);
  const window = plan.remindBeforeDays ?? DEFAULT_DUE_SOON_DAYS;

  /** @type {PlanStatus} */
  let status;
  if (nextAppointment) status = 'booked';
  else if (daysUntilDue === null) status = 'no-history';
  else if (daysUntilDue < 0) status = 'overdue';
  else if (daysUntilDue <= window) status = 'due-soon';
  else status = 'later';

  return { plan, lastVisit, nextDue, status, nextAppointment, daysUntilDue };
}

/**
 * Summaries of all live plans.
 * @param {readonly CheckupPlan[]} plans
 * @param {readonly Appointment[]} appointments
 * @param {LocalDate} today
 */
export function summarizePlans(plans, appointments, today) {
  return plans.filter((p) => p.deletedAt === null).map((p) => summarizePlan(p, appointments, today));
}
