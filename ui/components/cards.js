// @ts-check
/**
 * Appointment and plan cards used on the calendar screen.
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { href } from '../router.js';
import { cardColor } from '../colors.js';
import { formatDueRelative, formatInterval, formatMonthShort, formatTime, formatWeekdayShort, plural, STATUS_LABEL } from '../format.js';
import { datePart, parseLocalDate } from '../../domain/dates.js';

/** @typedef {import('../../domain/types.js').Appointment} Appointment */
/** @typedef {import('../../domain/types.js').CheckupPlan} CheckupPlan */
/** @typedef {import('../../domain/types.js').PlanSummary} PlanSummary */
/** @typedef {import('../../domain/types.js').LocalDate} LocalDate */
/** @typedef {import('../dom.js').Child} Child */

/** Big day number + month, like a tear-off calendar page. @param {LocalDate} date */
function dateBlock(date) {
  const parts = parseLocalDate(date);
  return h(
    'div',
    { class: 'date-block', 'aria-hidden': 'true' },
    h('span', { class: 'date-block__day' }, String(parts?.day ?? '')),
    h('span', { class: 'date-block__month' }, formatMonthShort(date)),
  );
}

/**
 * @param {Appointment} appointment
 * @param {{ planName?: string|null, actions?: Child[] }} [options]
 */
export function appointmentCard(appointment, { planName = null, actions = [] } = {}) {
  const date = datePart(appointment.dateTime);
  const color = cardColor(appointment.planId ?? appointment.id);
  return h(
    'li',
    { class: `card card--${color} appt-card${appointment.status === 'CANCELLED' ? ' is-cancelled' : ''}` },
    dateBlock(date),
    h(
      'div',
      { class: 'appt-card__body' },
      h('a', { class: 'card__link card__title', href: href(`/edit/${appointment.id}`) }, appointment.title),
      h(
        'p',
        { class: 'card__meta appt-card__meta' },
        h('span', { class: 'meta-item' }, icon('clock', 16), `${formatWeekdayShort(date)} ${formatTime(appointment.dateTime)}`),
        appointment.location ? h('span', { class: 'meta-item' }, icon('pin', 16), appointment.location) : null,
        appointment.reminderOffsets.length
          ? h('span', { class: 'meta-item' }, icon('bell', 16), h('span', { class: 'visually-hidden' }, plural(appointment.reminderOffsets.length, 'reminder')))
          : null,
      ),
      planName ? h('p', { class: 'card__meta' }, icon('repeat', 14), ' ', planName) : null,
      actions.length ? h('div', { class: 'button-row card__raise', style: 'margin-top: var(--space-3)' }, actions) : null,
    ),
    appointment.status !== 'SCHEDULED' ? h('span', { class: 'badge appt-card__status' }, STATUS_LABEL[appointment.status]) : null,
  );
}

/**
 * A plan that needs booking.
 * @param {PlanSummary} summary
 * @param {LocalDate} today
 */
export function duePlanCard(summary, today) {
  const { plan } = summary;
  const bookDate = summary.nextDue && summary.nextDue > today ? summary.nextDue : today;
  const urgency = summary.status === 'overdue' ? 'is-overdue' : '';
  return h(
    'li',
    { class: `card card--${cardColor(plan.id)} plan-card ${urgency}` },
    h(
      'div',
      { class: 'plan-card__body' },
      h('a', { class: 'card__link card__title', href: href(`/edit/${plan.id}`) }, plan.name),
      h(
        'p',
        { class: 'card__meta' },
        summary.status === 'no-history' ? 'No visits yet — book your first' : formatDueRelative(summary.daysUntilDue),
        ' · ',
        formatInterval(plan.interval),
      ),
    ),
    h(
      'a',
      {
        class: 'btn btn--small btn--primary',
        href: href('/new', { type: 'appointment', planId: plan.id, date: bookDate }),
        'aria-label': `Book ${plan.name}`,
      },
      'Book',
    ),
  );
}
