// @ts-check
/**
 * Read-model queries for the calendar screen.
 */
import { AppointmentStatus } from './constants.js';
import { datePart } from './dates.js';
import { byDateTime } from './appointment.js';

/** @typedef {import('./types.js').Appointment} Appointment */
/** @typedef {import('./types.js').CheckupPlan} CheckupPlan */
/** @typedef {import('./types.js').PlanSummary} PlanSummary */
/** @typedef {import('./types.js').LocalDate} LocalDate */
/** @typedef {import('./types.js').LocalDateTime} LocalDateTime */
/** @typedef {import('./types.js').DayMarkers} DayMarkers */

/** @param {Appointment} a */
const isScheduled = (a) => a.deletedAt === null && a.status === AppointmentStatus.SCHEDULED;

/**
 * Scheduled appointments from `nowLocal` on, soonest first.
 * @param {readonly Appointment[]} appointments
 * @param {LocalDateTime} nowLocal
 */
export function upcomingAppointments(appointments, nowLocal) {
  return appointments.filter((a) => isScheduled(a) && a.dateTime >= nowLocal).sort(byDateTime);
}

/**
 * Scheduled appointments whose time has passed but that were never marked
 * done or cancelled. Most recent first.
 * @param {readonly Appointment[]} appointments
 * @param {LocalDateTime} nowLocal
 */
export function unconfirmedAppointments(appointments, nowLocal) {
  return appointments
    .filter((a) => isScheduled(a) && a.dateTime < nowLocal)
    .sort(byDateTime)
    .reverse();
}

/** @type {Record<string, number>} */
const DUE_ORDER = { overdue: 0, 'due-soon': 1, 'no-history': 2 };

/**
 * Plans that need booking: overdue, due soon, or never visited. Overdue
 * first, then by due date.
 * @param {readonly PlanSummary[]} summaries
 */
export function dueToBook(summaries) {
  return summaries
    .filter((s) => s.status in DUE_ORDER)
    .sort(
      (a, b) =>
        DUE_ORDER[a.status] - DUE_ORDER[b.status] ||
        (a.nextDue ?? '').localeCompare(b.nextDue ?? '') ||
        a.plan.name.localeCompare(b.plan.name),
    );
}

/**
 * Markers for each date in `dates`: live, non-cancelled appointments, and
 * plans (not yet booked) whose due date falls on that day.
 * @param {readonly LocalDate[]} dates
 * @param {readonly Appointment[]} appointments
 * @param {readonly PlanSummary[]} summaries
 * @returns {Map<LocalDate, DayMarkers>}
 */
export function markersByDate(dates, appointments, summaries) {
  /** @type {Map<LocalDate, DayMarkers>} */
  const map = new Map(dates.map((d) => [d, { appointments: [], duePlans: [] }]));
  for (const a of [...appointments].sort(byDateTime)) {
    if (a.deletedAt !== null || a.status === AppointmentStatus.CANCELLED) continue;
    map.get(datePart(a.dateTime))?.appointments.push(a);
  }
  for (const s of summaries) {
    if (s.nextDue === null || s.status === 'booked') continue;
    map.get(s.nextDue)?.duePlans.push(s.plan);
  }
  return map;
}

/**
 * Live appointments on a single day, any status, in time order.
 * @param {readonly Appointment[]} appointments
 * @param {LocalDate} date
 */
export function appointmentsOn(appointments, date) {
  return appointments.filter((a) => a.deletedAt === null && datePart(a.dateTime) === date).sort(byDateTime);
}
