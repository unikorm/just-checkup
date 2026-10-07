// @ts-check
import { createPlan } from '../../domain/plan.js';
import { createAppointment } from '../../domain/appointment.js';

/** @typedef {import('../../domain/types.js').CheckupPlan} CheckupPlan */
/** @typedef {import('../../domain/types.js').Appointment} Appointment */
/** @typedef {import('../../domain/types.js').AppointmentStatus} AppointmentStatus */

let counter = 0;
export const nextId = () => `id-${++counter}`;
export const NOW = new Date('2026-10-07T10:00:00.000Z'); // 12:00 in Bratislava

/** @param {Partial<import('../../domain/types.js').PlanFields>} [over] @returns {CheckupPlan} */
export function plan(over = {}) {
  return createPlan(
    { name: 'Dentist', notes: '', interval: { amount: 6, unit: 'months' }, lastVisitDate: null, remindBeforeDays: null, ...over },
    { now: NOW, id: nextId() },
  );
}

/**
 * @param {Partial<import('../../domain/validation.js').AppointmentInput>} [over]
 * @param {AppointmentStatus} [status]
 * @returns {Appointment}
 */
export function appt(over = {}, status = 'SCHEDULED') {
  return createAppointment(
    {
      planId: null,
      title: 'Checkup',
      dateTime: '2026-10-20T09:30',
      durationMinutes: 60,
      timeZone: 'Europe/Bratislava',
      location: '',
      notes: '',
      reminderOffsets: [],
      ...over,
    },
    { now: NOW, id: nextId() },
    status,
  );
}
