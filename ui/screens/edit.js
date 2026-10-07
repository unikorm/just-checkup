// @ts-check
/**
 * Add/Edit screen for both appointments and checkup plans.
 *   #/new?type=appointment|plan&date=YYYY-MM-DD&planId=...
 *   #/edit/:id
 */
import { h, uid } from '../dom.js';
import { icon } from '../icons.js';
import { href, navigate } from '../router.js';
import { field, showErrors } from '../components/field.js';
import { reminderPicker } from '../components/reminder-picker.js';
import { confirmDialog, openDialog } from '../components/dialog.js';
import { cardColor } from '../colors.js';
import {
  formatDate,
  formatDateTime,
  formatDueRelative,
  formatInterval,
  PLAN_STATUS_LABEL,
  STATUS_LABEL,
} from '../format.js';
import { combineDateTime, datePart, isValidLocalDate, timePart, todayLocal } from '../../domain/dates.js';
import { summarizePlan } from '../../domain/plan.js';
import { byDateTime } from '../../domain/appointment.js';
import { DEFAULT_DURATION_MINUTES, INTERVAL_UNITS, LIMITS } from '../../domain/constants.js';

/** @typedef {import('../context.js').AppContext} AppContext */
/** @typedef {import('../context.js').Screen} Screen */
/** @typedef {import('../router.js').Route} Route */
/** @typedef {import('../../domain/types.js').Appointment} Appointment */
/** @typedef {import('../../domain/types.js').CheckupPlan} CheckupPlan */
/** @typedef {import('../../domain/types.js').LocalDate} LocalDate */
/** @typedef {import('../../domain/types.js').ReminderOffset} ReminderOffset */
/** @typedef {import('../../domain/types.js').IntervalUnit} IntervalUnit */

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];
const DEFAULT_TIME = '09:00';
/** @type {ReminderOffset[]} */
const DEFAULT_REMINDERS = [{ amount: 1, unit: 'days' }];

/**
 * Optional hook so later milestones (reminders/.ics) can add actions to an
 * appointment without this screen knowing about them.
 * @type {Array<(ctx: AppContext, appointment: Appointment) => HTMLElement|null>}
 */
export const appointmentActionHooks = [];

/**
 * @param {AppContext} ctx
 * @param {Extract<Route, { name: 'new' } | { name: 'edit' }>} route
 * @returns {Screen}
 */
export function editScreen(ctx, route) {
  const { plans, appointments } = ctx.state.get();

  if (route.name === 'edit') {
    const plan = plans.find((p) => p.id === route.id);
    if (plan) return planEditScreen(ctx, plan);
    const appointment = appointments.find((a) => a.id === route.id);
    if (appointment) return appointmentEditScreen(ctx, appointment);
    return notFoundScreen();
  }

  const type = route.query.get('type') === 'plan' ? 'plan' : 'appointment';
  const date = route.query.get('date');
  const planId = route.query.get('planId');
  return newScreen(ctx, type, {
    date: date && isValidLocalDate(date) ? date : null,
    planId: planId && plans.some((p) => p.id === planId) ? planId : null,
  });
}

// ---------------------------------------------------------------------------
// Screens

/**
 * @param {AppContext} ctx
 * @param {'appointment'|'plan'} initialType
 * @param {{ date: LocalDate|null, planId: string|null }} prefill
 * @returns {Screen}
 */
function newScreen(ctx, initialType, prefill) {
  const heading = h('h1', { tabindex: '-1' });
  const apptForm = appointmentForm(ctx, null, prefill);
  const planForm = planFormView(ctx, null);

  /** @param {'appointment'|'plan'} type */
  const show = (type) => {
    apptForm.el.hidden = type !== 'appointment';
    planForm.el.hidden = type !== 'plan';
    heading.textContent = type === 'plan' ? 'New checkup plan' : 'New appointment';
    document.title = `${heading.textContent} · Just Checkup`;
  };

  const name = uid('type');
  /** @param {'appointment'|'plan'} value @param {string} label */
  const option = (value, label) =>
    h(
      'label',
      null,
      h('input', { type: 'radio', name, value, checked: value === initialType, onchange: () => show(value) }),
      label,
    );

  show(initialType);
  return {
    title: initialType === 'plan' ? 'New checkup plan' : 'New appointment',
    el: h(
      'div',
      { class: 'screen screen--edit' },
      header(heading),
      h(
        'div',
        { class: 'segmented', role: 'radiogroup', 'aria-label': 'What are you adding?', style: 'margin-bottom: var(--space-6)' },
        option('appointment', 'Appointment'),
        option('plan', 'Checkup plan'),
      ),
      apptForm.el,
      planForm.el,
    ),
  };
}

/**
 * @param {AppContext} ctx
 * @param {Appointment} appointment
 * @returns {Screen}
 */
function appointmentEditScreen(ctx, appointment) {
  const { plans } = ctx.state.get();
  const plan = plans.find((p) => p.id === appointment.planId) ?? null;
  const today = todayLocal(ctx.now());
  const form = appointmentForm(ctx, appointment, { date: null, planId: null });

  /** @param {string} message @param {Promise<{ ok: boolean, errors?: Record<string, string> }>} action */
  const run = async (message, action) => {
    const result = await action;
    if (result.ok) {
      ctx.toast(message);
      await ctx.refresh();
    } else {
      ctx.toast(Object.values(result.errors ?? {})[0] ?? 'Something went wrong.');
    }
  };

  const s = appointment.status;
  const actions = h(
    'div',
    { class: 'button-row' },
    s === 'SCHEDULED' && datePart(appointment.dateTime) <= today
      ? h('button', { type: 'button', class: 'btn btn--primary', onclick: () => run('Marked as done', ctx.services.markDone(appointment.id)) }, icon('check'), 'Mark done')
      : null,
    s !== 'DONE'
      ? h('button', { type: 'button', class: 'btn', onclick: () => rescheduleFlow(ctx, appointment, run) }, icon('clock'), 'Reschedule')
      : null,
    s === 'SCHEDULED'
      ? h(
          'button',
          {
            type: 'button',
            class: 'btn',
            onclick: async () => {
              const ok = await confirmDialog({
                title: 'Cancel this appointment?',
                message: 'It stays in your history as cancelled. You can reschedule it later.',
                confirmLabel: 'Cancel appointment',
                danger: true,
              });
              if (ok) await run('Appointment cancelled', ctx.services.cancel(appointment.id));
            },
          },
          'Cancel appointment',
        )
      : null,
    s === 'DONE' ? h('button', { type: 'button', class: 'btn', onclick: () => run('Marked as not done', ctx.services.reopen(appointment.id)) }, 'Undo done') : null,
    s === 'CANCELLED' ? h('button', { type: 'button', class: 'btn', onclick: () => run('Appointment restored', ctx.services.reopen(appointment.id)) }, 'Restore') : null,
    appointmentActionHooks.map((hook) => hook(ctx, appointment)),
  );

  return {
    title: appointment.title,
    el: h(
      'div',
      { class: 'screen screen--edit' },
      header(h('h1', { tabindex: '-1' }, appointment.title), 'Appointment'),
      h(
        'div',
        { class: 'status-line' },
        h('span', { class: 'badge' }, STATUS_LABEL[s]),
        h('span', null, formatDateTime(appointment.dateTime)),
        plan ? h('a', { href: href(`/edit/${plan.id}`) }, `Plan: ${plan.name}`) : null,
      ),
      actions,
      h('h2', { class: 'section', style: 'margin-bottom: var(--space-4)' }, 'Details'),
      form.el,
      dangerZone('Delete appointment', async () => {
        const ok = await confirmDialog({
          title: 'Delete this appointment?',
          message: plan && s === 'DONE' ? `This visit counts toward “${plan.name}”. Deleting it changes the next due date.` : 'This cannot be undone from the app.',
          confirmLabel: 'Delete',
          danger: true,
        });
        if (!ok) return;
        await ctx.services.deleteAppointment(appointment.id);
        ctx.toast('Appointment deleted');
        navigate('#/');
      }),
    ),
  };
}

/**
 * @param {AppContext} ctx
 * @param {CheckupPlan} plan
 * @returns {Screen}
 */
function planEditScreen(ctx, plan) {
  const { appointments } = ctx.state.get();
  const today = todayLocal(ctx.now());
  const summary = summarizePlan(plan, appointments, today);
  const history = appointments.filter((a) => a.planId === plan.id).sort(byDateTime).reverse();
  const form = planFormView(ctx, plan);
  const bookDate = summary.nextDue && summary.nextDue > today ? summary.nextDue : today;

  const summaryCard = h(
    'section',
    { class: `card card--${cardColor(plan.id)}`, 'aria-label': 'Plan status' },
    h('div', { class: 'status-line', style: 'margin-bottom: 0' }, h('span', { class: 'badge badge--solid' }, PLAN_STATUS_LABEL[summary.status]), h('span', { class: 'card__meta' }, formatInterval(plan.interval))),
    h(
      'dl',
      { class: 'summary-grid' },
      h('div', null, h('dt', null, 'Last visit'), h('dd', null, summary.lastVisit ? formatDate(summary.lastVisit) : '—')),
      h('div', null, h('dt', null, 'Next due'), h('dd', null, summary.nextDue ? formatDate(summary.nextDue) : '—')),
    ),
    h('p', { class: 'card__meta', style: 'margin-bottom: var(--space-4)' },
      summary.nextAppointment ? `Booked for ${formatDateTime(summary.nextAppointment.dateTime)}` : formatDueRelative(summary.daysUntilDue)),
    h(
      'div',
      { class: 'button-row' },
      summary.nextAppointment
        ? h('a', { class: 'btn btn--primary', href: href(`/edit/${summary.nextAppointment.id}`) }, 'Open booking')
        : h('a', { class: 'btn btn--primary', href: href('/new', { type: 'appointment', planId: plan.id, date: bookDate }) }, icon('calendarPlus'), 'Book appointment'),
      h('button', { type: 'button', class: 'btn', onclick: () => logVisitFlow(ctx, plan) }, icon('check'), 'Log a visit'),
    ),
  );

  return {
    title: plan.name,
    el: h(
      'div',
      { class: 'screen screen--edit' },
      header(h('h1', { tabindex: '-1' }, plan.name), 'Checkup plan'),
      summaryCard,
      history.length
        ? h(
            'section',
            { class: 'section' },
            h('h2', { style: 'margin-bottom: var(--space-3)' }, 'History'),
            h(
              'ul',
              { class: 'history' },
              history.map((a) =>
                h('li', null, h('a', { href: href(`/edit/${a.id}`) }, formatDateTime(a.dateTime)), h('span', { class: 'badge' }, STATUS_LABEL[a.status])),
              ),
            ),
          )
        : null,
      h('h2', { class: 'section', style: 'margin-bottom: var(--space-4)' }, 'Details'),
      form.el,
      dangerZone('Delete plan', async () => {
        const ok = await confirmDialog({
          title: `Delete “${plan.name}”?`,
          message: 'Its appointments stay in your calendar, but they will no longer be linked to a plan.',
          confirmLabel: 'Delete plan',
          danger: true,
        });
        if (!ok) return;
        await ctx.services.deletePlan(plan.id);
        ctx.toast('Plan deleted');
        navigate('#/');
      }),
    ),
  };
}

/** @returns {Screen} */
function notFoundScreen() {
  return {
    title: 'Not found',
    el: h(
      'div',
      { class: 'screen' },
      header(h('h1', { tabindex: '-1' }, 'Not found')),
      h('p', { class: 'empty' }, 'This item does not exist or was deleted.'),
    ),
  };
}

// ---------------------------------------------------------------------------
// Forms

/**
 * @param {AppContext} ctx
 * @param {Appointment|null} existing
 * @param {{ date: LocalDate|null, planId: string|null }} prefill
 */
function appointmentForm(ctx, existing, prefill) {
  const { plans } = ctx.state.get();
  const livePlans = [...plans].sort((a, b) => a.name.localeCompare(b.name));
  const today = todayLocal(ctx.now());
  const prefillPlan = livePlans.find((p) => p.id === prefill.planId) ?? null;

  const ids = {
    title: uid('a-title'),
    planId: uid('a-plan'),
    dateTime: uid('a-date'),
    durationMinutes: uid('a-duration'),
    location: uid('a-location'),
    reminderOffsets: uid('a-reminders'),
    notes: uid('a-notes'),
  };

  const title = h('input', {
    class: 'input', id: ids.title, name: 'title', required: true, maxlength: String(LIMITS.titleMax), autocomplete: 'off',
    value: existing?.title ?? prefillPlan?.name ?? '',
  });
  const planSelect = h(
    'select',
    { class: 'select', id: ids.planId, name: 'planId' },
    h('option', { value: '' }, 'No plan'),
    livePlans.map((p) => h('option', { value: p.id, selected: p.id === (existing?.planId ?? prefill.planId) }, p.name)),
  );
  let lastPlanName = livePlans.find((p) => p.id === planSelect.value)?.name ?? '';
  planSelect.addEventListener('change', () => {
    const name = livePlans.find((p) => p.id === planSelect.value)?.name ?? '';
    if (title.value.trim() === '' || title.value === lastPlanName) title.value = name;
    lastPlanName = name;
  });

  const dateInput = h('input', {
    class: 'input', type: 'date', id: ids.dateTime, name: 'date', required: true, 'aria-label': 'Date',
    value: existing ? datePart(existing.dateTime) : (prefill.date ?? today),
  });
  const timeInput = h('input', {
    class: 'input', type: 'time', name: 'time', required: true, step: '60', 'aria-label': 'Time',
    value: existing ? timePart(existing.dateTime) : DEFAULT_TIME,
  });

  const currentDuration = existing?.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  const durations = DURATIONS.includes(currentDuration) ? DURATIONS : [...DURATIONS, currentDuration].sort((a, b) => a - b);
  const duration = h(
    'select',
    { class: 'select', id: ids.durationMinutes, name: 'durationMinutes' },
    durations.map((m) => h('option', { value: String(m), selected: m === currentDuration }, m < 60 ? `${m} min` : `${m / 60} h`.replace('.5 h', '½ h'))),
  );
  const location = h('input', {
    class: 'input', id: ids.location, name: 'location', maxlength: String(LIMITS.locationMax), autocomplete: 'street-address',
    value: existing?.location ?? '',
  });
  const reminders = reminderPicker({ id: ids.reminderOffsets, value: existing ? existing.reminderOffsets : DEFAULT_REMINDERS });
  const notes = h('textarea', { class: 'textarea', id: ids.notes, name: 'notes', maxlength: String(LIMITS.notesMax) }, existing?.notes ?? '');

  const raw = () => ({
    title: title.value,
    planId: planSelect.value || null,
    dateTime: dateInput.value && timeInput.value ? combineDateTime(dateInput.value, timeInput.value.slice(0, 5)) : '',
    durationMinutes: duration.value,
    location: location.value,
    notes: notes.value,
    reminderOffsets: reminders.getValue(),
    timeZone: existing?.timeZone ?? null,
  });

  const el = formShell({
    ids,
    fields: [
      field({ id: ids.title, label: 'Title', control: title }),
      livePlans.length ? field({ id: ids.planId, label: 'Checkup plan', control: planSelect, optional: true, hint: 'Linking it moves the plan’s next due date once marked done.' }) : null,
      field({ id: ids.dateTime, label: 'Date & time', control: h('div', { class: 'inline-inputs' }, dateInput, timeInput), describes: [dateInput, timeInput] }),
      field({ id: ids.durationMinutes, label: 'Duration', control: duration, hint: 'Used for the calendar export.' }),
      field({ id: ids.location, label: 'Location', control: location, optional: true }),
      field({ id: ids.reminderOffsets, label: 'Reminders', control: reminders.el, describes: reminders.controls, optional: true, group: true }),
      field({ id: ids.notes, label: 'Notes', control: notes, optional: true }),
    ],
    submitLabel: existing ? 'Save changes' : 'Add appointment',
    onSubmit: () => ctx.services.saveAppointment(raw(), existing?.id ?? null),
    onSaved: () => {
      ctx.toast(existing ? 'Appointment saved' : 'Appointment added');
      navigate('#/');
    },
  });
  return { el };
}

/**
 * @param {AppContext} ctx
 * @param {CheckupPlan|null} existing
 */
function planFormView(ctx, existing) {
  const today = todayLocal(ctx.now());
  const ids = {
    name: uid('p-name'),
    interval: uid('p-interval'),
    lastVisitDate: uid('p-last'),
    remindBeforeDays: uid('p-remind'),
    notes: uid('p-notes'),
  };

  const name = h('input', {
    class: 'input', id: ids.name, name: 'name', required: true, maxlength: String(LIMITS.nameMax), autocomplete: 'off',
    placeholder: 'e.g. Dentist', value: existing?.name ?? '',
  });
  const amount = h('input', {
    class: 'input', type: 'number', id: ids.interval, name: 'intervalAmount', required: true, min: '1', max: '3650', inputmode: 'numeric',
    'aria-label': 'Repeat every (number)', value: String(existing?.interval.amount ?? 6),
  });
  const unit = h(
    'select',
    { class: 'select', name: 'intervalUnit', 'aria-label': 'Repeat every (unit)' },
    INTERVAL_UNITS.map((u) => h('option', { value: u, selected: u === (existing?.interval.unit ?? 'months') }, u)),
  );
  const lastVisit = h('input', {
    class: 'input', type: 'date', id: ids.lastVisitDate, name: 'lastVisitDate', max: today, value: existing?.lastVisitDate ?? '',
  });
  const remindBefore = h('input', {
    class: 'input', type: 'number', id: ids.remindBeforeDays, name: 'remindBeforeDays', min: '0', max: String(LIMITS.remindBeforeDaysMax),
    inputmode: 'numeric', placeholder: '30', value: existing?.remindBeforeDays === null || !existing ? '' : String(existing.remindBeforeDays),
  });
  const notes = h('textarea', { class: 'textarea', id: ids.notes, name: 'notes', maxlength: String(LIMITS.notesMax) }, existing?.notes ?? '');

  const raw = () => ({
    name: name.value,
    notes: notes.value,
    interval: { amount: amount.value, unit: unit.value },
    lastVisitDate: lastVisit.value,
    remindBeforeDays: remindBefore.value,
  });

  const el = formShell({
    ids,
    fields: [
      field({ id: ids.name, label: 'Name', control: name }),
      field({
        id: ids.interval,
        label: 'Repeat every',
        control: h('div', { class: 'inline-inputs' }, amount, unit),
        describes: [amount, unit],
      }),
      field({
        id: ids.lastVisitDate,
        label: 'Last visit',
        control: lastVisit,
        optional: true,
        hint: 'Your most recent visit before using the app. Later visits are tracked from appointments.',
      }),
      field({
        id: ids.remindBeforeDays,
        label: 'Remind me this many days before it’s due',
        control: remindBefore,
        optional: true,
        hint: 'The plan appears under “Due to book” from then on. Default is 30 days.',
      }),
      field({ id: ids.notes, label: 'Notes', control: notes, optional: true }),
    ],
    submitLabel: existing ? 'Save changes' : 'Add plan',
    onSubmit: () => ctx.services.savePlan(raw(), existing?.id ?? null),
    onSaved: () => {
      ctx.toast(existing ? 'Plan saved' : 'Plan added');
      navigate('#/');
    },
  });
  return { el };
}

/**
 * Shared form behaviour: validation display, error summary, busy state.
 * @param {{
 *   ids: Record<string, string>,
 *   fields: (HTMLElement|null)[],
 *   submitLabel: string,
 *   onSubmit: () => Promise<{ ok: boolean, errors?: Record<string, string> }>,
 *   onSaved: () => void,
 * }} options
 */
function formShell({ ids, fields, submitLabel, onSubmit, onSaved }) {
  const summary = h('div', { class: 'error-summary', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn--primary btn--block' }, submitLabel);
  let attempted = false;

  const form = h(
    'form',
    { class: 'form', novalidate: true },
    summary,
    fields,
    h('div', { class: 'form__footer' }, submit, h('a', { class: 'btn btn--ghost btn--block', href: '#/' }, 'Cancel')),
  );

  /** @param {Record<string, string>} errors */
  const display = (errors) => {
    const first = showErrors(form, errors, ids);
    const count = Object.keys(errors).filter((k) => k in ids).length;
    const other = Object.entries(errors).filter(([k]) => !(k in ids)).map(([, v]) => v);
    summary.textContent = count ? `Please fix ${count === 1 ? 'the highlighted field' : `${count} highlighted fields`}.` : other.join(' ');
    return first;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    attempted = true;
    submit.disabled = true;
    try {
      const result = await onSubmit();
      if (result.ok) {
        onSaved();
      } else {
        display(result.errors ?? {})?.focus();
      }
    } finally {
      submit.disabled = false;
    }
  });

  // After a failed attempt, clear errors as soon as the user fixes things.
  form.addEventListener('input', async () => {
    if (!attempted) return;
    const errors = /** @type {HTMLElement[]} */ ([...form.querySelectorAll('[aria-invalid="true"]')]);
    if (errors.length === 0) return;
    for (const el of errors) {
      if (el === document.activeElement || el.contains(document.activeElement)) {
        el.removeAttribute('aria-invalid');
        const describedBy = el.getAttribute('aria-describedby') ?? '';
        const errorId = describedBy.split(' ').find((id) => id.endsWith('-error'));
        if (errorId) /** @type {HTMLElement} */ (form.querySelector(`#${CSS.escape(errorId)}`)).textContent = '';
      }
    }
    if (!form.querySelector('[aria-invalid="true"]')) summary.textContent = '';
  });

  return form;
}

// ---------------------------------------------------------------------------
// Pieces & flows

/** @param {HTMLElement} heading @param {string} [eyebrow] */
function header(heading, eyebrow) {
  return h(
    'header',
    { class: 'screen-header' },
    h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'Back to calendar' }, icon('back')),
    h('div', { style: 'flex: 1; min-width: 0' }, eyebrow ? h('p', { class: 'eyebrow' }, eyebrow) : null, heading),
  );
}

/** @param {string} label @param {() => void} onClick */
function dangerZone(label, onClick) {
  return h('div', { class: 'danger-zone' }, h('button', { type: 'button', class: 'btn btn--danger btn--block', onclick: onClick }, label));
}

/**
 * @param {AppContext} ctx
 * @param {Appointment} appointment
 * @param {(message: string, action: Promise<{ ok: boolean, errors?: Record<string, string> }>) => Promise<void>} run
 */
async function rescheduleFlow(ctx, appointment, run) {
  const date = h('input', { class: 'input', type: 'date', name: 'date', required: true, value: datePart(appointment.dateTime) });
  const time = h('input', { class: 'input', type: 'time', name: 'time', required: true, step: '60', value: timePart(appointment.dateTime) });
  const dateId = uid('r-date');
  const timeId = uid('r-time');
  date.id = dateId;
  time.id = timeId;
  const { value } = await openDialog({
    title: 'Reschedule',
    body: [
      h('div', { class: 'field-row' },
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: dateId }, 'New date'), date),
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: timeId }, 'Time'), time)),
    ],
    actions: [
      { label: 'Cancel', value: 'cancel', dismiss: true },
      { label: 'Reschedule', value: 'ok', variant: 'primary' },
    ],
  });
  if (value !== 'ok') return;
  await run('Appointment rescheduled', ctx.services.reschedule(appointment.id, combineDateTime(date.value, time.value.slice(0, 5))));
}

/**
 * @param {AppContext} ctx
 * @param {CheckupPlan} plan
 */
async function logVisitFlow(ctx, plan) {
  const today = todayLocal(ctx.now());
  const dateId = uid('v-date');
  const date = h('input', { class: 'input', type: 'date', id: dateId, name: 'date', required: true, max: today, value: today });
  const { value } = await openDialog({
    title: `Log a visit: ${plan.name}`,
    body: [
      h('p', null, 'Record a visit that already happened. The next due date is calculated from it.'),
      h('div', { class: 'field' }, h('label', { class: 'field__label', for: dateId }, 'Visit date'), date),
    ],
    actions: [
      { label: 'Cancel', value: 'cancel', dismiss: true },
      { label: 'Log visit', value: 'ok', variant: 'primary' },
    ],
  });
  if (value !== 'ok') return;
  const result = await ctx.services.logVisit(plan.id, date.value);
  if (!result.ok) {
    ctx.toast(Object.values(result.errors)[0]);
    return;
  }
  ctx.toast('Visit logged');
  await ctx.refresh();
}
