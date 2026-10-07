// @ts-check
/**
 * Pure reminder calculation. No DOM, no storage, no timers.
 *
 * This is the seam for Web Push later: today the in-app scheduler checks
 * these reminders while the app is open; with a backend, the same list is
 * sent to the server, which delivers each one at `fireAt`.
 */
import { AppointmentStatus, PLAN_REMINDER_TIME } from '../domain/constants.js';
import {
  addDays,
  combineDateTime,
  localDateTimeToDate,
  offsetToMinutes,
  reminderFireDate,
} from '../domain/dates.js';

/** @typedef {import('../domain/types.js').Appointment} Appointment */
/** @typedef {import('../domain/types.js').PlanSummary} PlanSummary */
/** @typedef {import('../domain/types.js').LocalDate} LocalDate */
/** @typedef {import('../domain/types.js').Instant} Instant */

/**
 * @typedef {object} AppointmentReminder
 * @property {'appointment'} kind
 * @property {string} key       stable id; changes when the appointment moves
 * @property {string} entityId
 * @property {string} title
 * @property {Instant} fireAt
 * @property {Instant} startsAt
 * @property {import('../domain/types.js').LocalDateTime} dateTime
 * @property {string} location
 */

/**
 * @typedef {object} PlanReminder
 * @property {'plan'} kind
 * @property {string} key
 * @property {string} entityId
 * @property {string} title
 * @property {Instant} fireAt
 * @property {LocalDate} dueDate
 */

/** @typedef {AppointmentReminder | PlanReminder} Reminder */

/**
 * One reminder per offset of a live, scheduled appointment.
 * @param {Appointment} appointment
 * @returns {AppointmentReminder[]}
 */
export function appointmentReminders(appointment) {
  if (appointment.deletedAt !== null || appointment.status !== AppointmentStatus.SCHEDULED) return [];
  const startsAt = localDateTimeToDate(appointment.dateTime).toISOString();
  return appointment.reminderOffsets.map((offset) => ({
    kind: 'appointment',
    key: `appt:${appointment.id}:${appointment.dateTime}:${offsetToMinutes(offset)}`,
    entityId: appointment.id,
    title: appointment.title,
    fireAt: reminderFireDate(appointment.dateTime, offset).toISOString(),
    startsAt,
    dateTime: appointment.dateTime,
    location: appointment.location,
  }));
}

/**
 * A plan with remindBeforeDays gets one reminder that many days before its
 * due date, at 09:00 local time. None once an appointment is booked.
 * @param {PlanSummary} summary
 * @returns {PlanReminder[]}
 */
export function planReminders(summary) {
  const { plan, nextDue, status } = summary;
  if (plan.deletedAt !== null || plan.remindBeforeDays === null || nextDue === null || status === 'booked') return [];
  const day = addDays(nextDue, -plan.remindBeforeDays);
  return [
    {
      kind: 'plan',
      key: `plan:${plan.id}:${nextDue}`,
      entityId: plan.id,
      title: plan.name,
      fireAt: localDateTimeToDate(combineDateTime(day, PLAN_REMINDER_TIME)).toISOString(),
      dueDate: nextDue,
    },
  ];
}

/**
 * Every reminder implied by the data, sorted by fire time.
 * @param {readonly Appointment[]} appointments
 * @param {readonly PlanSummary[]} summaries
 * @returns {Reminder[]}
 */
export function allReminders(appointments, summaries) {
  /** @type {Reminder[]} */
  const list = [...appointments.flatMap(appointmentReminders), ...summaries.flatMap(planReminders)];
  return list.sort((a, b) => (a.fireAt < b.fireAt ? -1 : a.fireAt > b.fireAt ? 1 : 0));
}

/**
 * Reminders that should be showing now: their time has come and, for
 * appointments, the appointment has not started yet. (Plan reminders stay
 * active until the plan is booked, which removes them.)
 * @param {readonly Reminder[]} reminders
 * @param {Date} now
 */
export function activeReminders(reminders, now) {
  const t = now.toISOString();
  return reminders.filter((r) => r.fireAt <= t && (r.kind === 'plan' || r.startsAt > t));
}

/**
 * The next moment a reminder becomes due, or null.
 * @param {readonly Reminder[]} reminders
 * @param {Date} now
 * @returns {Date|null}
 */
export function nextFireTime(reminders, now) {
  const t = now.toISOString();
  const next = reminders.find((r) => r.fireAt > t);
  return next ? new Date(next.fireAt) : null;
}

/**
 * Active reminders not yet shown as a notification.
 * @param {readonly Reminder[]} active
 * @param {ReadonlySet<string>} notifiedKeys
 */
export function toNotify(active, notifiedKeys) {
  return active.filter((r) => !notifiedKeys.has(r.key));
}

/**
 * Drop log entries for reminders that no longer exist, so the log does not
 * grow forever.
 * @param {Iterable<string>} log
 * @param {readonly Reminder[]} reminders
 * @returns {string[]}
 */
export function pruneNotifiedLog(log, reminders) {
  const live = new Set(reminders.map((r) => r.key));
  return [...log].filter((k) => live.has(k));
}

// ---------------------------------------------------------------------------
// In-app banner

/**
 * @typedef {object} BannerItem
 * @property {string} key
 * @property {'appointment'|'plan'} kind
 * @property {string} entityId
 * @property {string} title
 * @property {'soon'|'overdue'|'due'} tone
 * @property {Instant} [startsAt]            appointments
 * @property {LocalDate} [dueDate]           plans
 * @property {number|null} [daysUntilDue]    plans
 */

const DAY_MS = 86_400_000;

/**
 * What the banner shows on app open: appointments starting within the next
 * 24 hours or with an active reminder, and plans that are overdue or whose
 * reminder has fired.
 * @param {{ appointments: readonly Appointment[], summaries: readonly PlanSummary[], now: Date }} input
 * @returns {BannerItem[]}
 */
export function bannerItems({ appointments, summaries, now }) {
  const reminders = allReminders(appointments, summaries);
  const active = activeReminders(reminders, now);
  const activeIds = new Set(active.map((r) => r.entityId));
  const t = now.getTime();

  /** @type {BannerItem[]} */
  const items = [];
  for (const a of appointments) {
    if (a.deletedAt !== null || a.status !== AppointmentStatus.SCHEDULED) continue;
    const start = localDateTimeToDate(a.dateTime).getTime();
    if (start <= t) continue;
    if (start - t <= DAY_MS || activeIds.has(a.id)) {
      items.push({ key: `appt:${a.id}`, kind: 'appointment', entityId: a.id, title: a.title, tone: 'soon', startsAt: new Date(start).toISOString() });
    }
  }
  items.sort((x, y) => ((x.startsAt ?? '') < (y.startsAt ?? '') ? -1 : 1));

  /** @type {BannerItem[]} */
  const planItems = [];
  for (const s of summaries) {
    if (s.status === 'booked' || s.nextDue === null) continue;
    const overdue = s.status === 'overdue';
    if (!overdue && !activeIds.has(s.plan.id)) continue;
    planItems.push({
      key: `plan:${s.plan.id}`,
      kind: 'plan',
      entityId: s.plan.id,
      title: s.plan.name,
      tone: overdue ? 'overdue' : 'due',
      dueDate: s.nextDue,
      daysUntilDue: s.daysUntilDue,
    });
  }
  planItems.sort((x, y) => (x.dueDate ?? '').localeCompare(y.dueDate ?? ''));
  return [...items, ...planItems];
}
