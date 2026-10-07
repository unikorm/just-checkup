// @ts-check
/**
 * Use cases: each one loads what it needs from the Store, applies a pure
 * domain function, and writes the result back. UI code calls these and
 * never touches the domain + store combination directly.
 */
import { createPlan, updatePlan } from '../domain/plan.js';
import * as appt from '../domain/appointment.js';
import { softDelete } from '../domain/entity.js';
import { validateAppointmentInput, validatePlanInput } from '../domain/validation.js';
import { combineDateTime, isValidLocalDate, nowLocalDateTime, todayLocal } from '../domain/dates.js';
import { AppointmentStatus, DEFAULT_DURATION_MINUTES } from '../domain/constants.js';
import { systemClock, randomId, deviceTimeZone } from './clock.js';

/** @typedef {import('../storage/store.js').Store} Store */
/** @typedef {import('./clock.js').Clock} Clock */
/** @typedef {import('../domain/types.js').CheckupPlan} CheckupPlan */
/** @typedef {import('../domain/types.js').Appointment} Appointment */
/** @typedef {import('../domain/types.js').LocalDate} LocalDate */
/** @typedef {import('../domain/types.js').LocalDateTime} LocalDateTime */
/** @typedef {import('../domain/validation.js').RawPlanInput} RawPlanInput */
/** @typedef {import('../domain/validation.js').RawAppointmentInput} RawAppointmentInput */
/**
 * @template T
 * @typedef {import('../domain/types.js').Result<T>} Result
 */
/** @typedef {{ kind: 'plan', entity: CheckupPlan } | { kind: 'appointment', entity: Appointment }} FoundEntity */

/**
 * @param {string} message
 * @returns {{ ok: false, errors: Record<string, string> }}
 */
const notFound = (message = 'Not found.') => ({ ok: false, errors: { id: message } });

/**
 * @param {{
 *   store: Store,
 *   clock?: Clock,
 *   newId?: () => string,
 *   timeZone?: () => string|null,
 * }} deps
 */
export function createServices({ store, clock = systemClock, newId = randomId, timeZone = deviceTimeZone }) {
  /**
   * @param {string} id
   * @param {(a: Appointment, now: Date) => Result<Appointment>} change
   * @returns {Promise<Result<Appointment>>}
   */
  async function changeAppointment(id, change) {
    const current = await store.appointments.get(id);
    if (!current || current.deletedAt) return notFound('Appointment not found.');
    const result = change(current, clock.now());
    if (result.ok) await store.appointments.put(result.value);
    return result;
  }

  return {
    /** Live (non-deleted) records for rendering. */
    async loadAll() {
      const [plans, appointments] = await Promise.all([store.plans.list(), store.appointments.list()]);
      return { plans, appointments };
    },

    /**
     * Look an id up in both collections (ids are UUIDs, so they never clash).
     * @param {string} id
     * @returns {Promise<FoundEntity|null>}
     */
    async find(id) {
      const plan = await store.plans.get(id);
      if (plan && !plan.deletedAt) return { kind: 'plan', entity: plan };
      const appointment = await store.appointments.get(id);
      if (appointment && !appointment.deletedAt) return { kind: 'appointment', entity: appointment };
      return null;
    },

    /**
     * Create (id null) or update a plan.
     * @param {RawPlanInput} raw
     * @param {string|null} id
     * @returns {Promise<Result<CheckupPlan>>}
     */
    async savePlan(raw, id = null) {
      const now = clock.now();
      const input = validatePlanInput(raw, todayLocal(now));
      if (!input.ok) return input;
      /** @type {CheckupPlan} */
      let plan;
      if (id) {
        const current = await store.plans.get(id);
        if (!current || current.deletedAt) return notFound('Plan not found.');
        plan = updatePlan(current, input.value, now);
      } else {
        plan = createPlan(input.value, { now, id: newId() });
      }
      await store.plans.put(plan);
      return { ok: true, value: plan };
    },

    /**
     * Create (id null) or update an appointment. Status is not changed here.
     * @param {RawAppointmentInput} raw
     * @param {string|null} id
     * @returns {Promise<Result<Appointment>>}
     */
    async saveAppointment(raw, id = null) {
      const input = validateAppointmentInput({ ...raw, timeZone: raw.timeZone ?? timeZone() });
      if (!input.ok) return input;
      if (input.value.planId) {
        const plan = await store.plans.get(input.value.planId);
        if (!plan || plan.deletedAt) return { ok: false, errors: { planId: 'That plan no longer exists.' } };
      }
      const now = clock.now();
      /** @type {Appointment} */
      let saved;
      if (id) {
        const current = await store.appointments.get(id);
        if (!current || current.deletedAt) return notFound('Appointment not found.');
        saved = appt.updateAppointment(current, input.value, now);
      } else {
        saved = appt.createAppointment(input.value, { now, id: newId() });
      }
      await store.appointments.put(saved);
      return { ok: true, value: saved };
    },

    /** @param {string} id */
    markDone: (id) => changeAppointment(id, appt.markDone),
    /** @param {string} id */
    cancel: (id) => changeAppointment(id, appt.cancel),
    /** @param {string} id */
    reopen: (id) => changeAppointment(id, appt.reopen),
    /** @param {string} id @param {LocalDateTime} dateTime */
    reschedule: (id, dateTime) => changeAppointment(id, (a, now) => appt.reschedule(a, dateTime, now)),

    /** @param {string} id */
    async deleteAppointment(id) {
      const current = await store.appointments.get(id);
      if (current && !current.deletedAt) await store.appointments.put(softDelete(current, clock.now()));
    },

    /**
     * Delete a plan. Its appointments are kept as history; they simply no
     * longer link to a live plan.
     * @param {string} id
     */
    async deletePlan(id) {
      const current = await store.plans.get(id);
      if (current && !current.deletedAt) await store.plans.put(softDelete(current, clock.now()));
    },

    /**
     * Record a visit that already happened, as a DONE appointment. This keeps
     * all visit history in one place.
     * @param {string} planId
     * @param {LocalDate} date
     * @returns {Promise<Result<Appointment>>}
     */
    async logVisit(planId, date) {
      const now = clock.now();
      const plan = await store.plans.get(planId);
      if (!plan || plan.deletedAt) return notFound('Plan not found.');
      const today = todayLocal(now);
      if (!isValidLocalDate(date) || date > today) {
        return { ok: false, errors: { date: 'Choose a date that is today or earlier.' } };
      }
      const dateTime = date === today ? nowLocalDateTime(now) : combineDateTime(date, '12:00');
      const visit = appt.createAppointment(
        {
          planId,
          title: plan.name,
          dateTime,
          durationMinutes: DEFAULT_DURATION_MINUTES,
          timeZone: timeZone(),
          location: '',
          notes: '',
          reminderOffsets: [],
        },
        { now, id: newId() },
        AppointmentStatus.DONE,
      );
      await store.appointments.put(visit);
      return { ok: true, value: visit };
    },
  };
}

/** @typedef {ReturnType<typeof createServices>} Services */
