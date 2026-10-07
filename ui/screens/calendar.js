// @ts-check
/**
 * Calendar / Home screen.
 *
 * Week strip (or month grid) on top, then the selected day, "To confirm",
 * "Upcoming" and "Due to book". Arrow keys move between days, swipes and
 * the arrow buttons move between weeks/months.
 */
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { href } from '../router.js';
import { appointmentCard, duePlanCard } from '../components/cards.js';
import {
  formatDateLong,
  formatDateShort,
  formatMonthYear,
  formatWeekdayShort,
  plural,
} from '../format.js';
import {
  addDays,
  addMonths,
  isSameMonth,
  monthGridDates,
  nowLocalDateTime,
  parseLocalDate,
  startOfMonth,
  startOfWeek,
  todayLocal,
  weekDates,
} from '../../domain/dates.js';
import { summarizePlans } from '../../domain/plan.js';
import { appointmentsOn, dueToBook, markersByDate, unconfirmedAppointments, upcomingAppointments } from '../../domain/calendar.js';
import { bannerItems } from '../../reminders/compute.js';
import { reminderBanner } from '../components/reminder-banner.js';

/** @typedef {import('../context.js').AppContext} AppContext */
/** @typedef {import('../context.js').Screen} Screen */
/** @typedef {import('../../domain/types.js').LocalDate} LocalDate */
/** @typedef {import('../../domain/types.js').DayMarkers} DayMarkers */
/** @typedef {import('../../domain/types.js').PlanSummary} PlanSummary */
/** @typedef {'week'|'month'} ViewMode */

const VIEW_KEY = 'just-checkup:calendar-view';
const UPCOMING_LIMIT = 8;

/** View state survives re-renders and navigation within the session. */
const view = {
  /** @type {ViewMode} */
  mode: readViewMode(),
  /** @type {LocalDate|null} */
  selected: null,
  /** Hidden until the app is opened again. */
  bannerDismissed: false,
};

/** @returns {ViewMode} */
function readViewMode() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'month' ? 'month' : 'week';
  } catch {
    return 'week';
  }
}

/** @param {ViewMode} mode */
function saveViewMode(mode) {
  try {
    localStorage.setItem(VIEW_KEY, mode);
  } catch {
    /* storage blocked: the default is fine */
  }
}

/**
 * @param {AppContext} ctx
 * @returns {Screen}
 */
export function calendarScreen(ctx) {
  const el = h('div', { class: 'screen screen--calendar' });

  /** @param {{ focusSelected?: boolean }} [options] */
  function render({ focusSelected = false } = {}) {
    const now = ctx.now();
    const today = todayLocal(now);
    const nowLocal = nowLocalDateTime(now);
    const { plans, appointments } = ctx.state.get();
    const selected = (view.selected ??= today);

    const summaries = summarizePlans(plans, appointments, today);
    const planNames = new Map(plans.map((p) => [p.id, p.name]));
    const dates = view.mode === 'week' ? weekDates(selected) : monthGridDates(selected);
    const markers = markersByDate(dates, appointments, summaries);

    /** @param {LocalDate} date @param {{ focus?: boolean }} [o] */
    const select = (date, { focus = false } = {}) => {
      view.selected = date;
      render({ focusSelected: focus });
    };
    /** @param {number} direction -1 or 1 */
    const shift = (direction) => {
      select(view.mode === 'week' ? addDays(selected, 7 * direction) : addMonths(selected, direction));
    };

    const header = h(
      'header',
      { class: 'cal-header' },
      h(
        'div',
        null,
        h('p', { class: 'eyebrow' }, `Today · ${formatDateShort(today)}`),
        h('h1', { tabindex: '-1' }, 'Your checkups'),
      ),
      modeToggle((mode) => {
        view.mode = mode;
        saveViewMode(mode);
        render();
      }),
    );

    const periodLabel = view.mode === 'week' ? weekLabel(dates) : formatMonthYear(selected);
    const isCurrentPeriod = view.mode === 'week' ? dates.includes(today) : isSameMonth(selected, today);
    const nav = h(
      'div',
      { class: 'cal-nav' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': view.mode === 'week' ? 'Previous week' : 'Previous month', onclick: () => shift(-1) }, icon('left')),
      h('p', { class: 'cal-nav__label', 'aria-live': 'polite' }, periodLabel),
      isCurrentPeriod && selected === today ? null : h('button', { type: 'button', class: 'btn btn--small', onclick: () => select(today) }, 'Today'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': view.mode === 'week' ? 'Next week' : 'Next month', onclick: () => shift(1) }, icon('right')),
    );

    const days = view.mode === 'week'
      ? weekStrip(dates, { today, selected, markers, planNames, onSelect: select, onShift: shift })
      : monthGrid(dates, { today, selected, markers, planNames, onSelect: select, onShift: shift });

    const calendarPanel = h('section', { class: 'cal-panel', 'aria-label': 'Calendar' }, nav, days);

    const selectedDay = dayPanel(selected, today, appointmentsOn(appointments, selected), markers.get(selected)?.duePlans ?? [], planNames);
    const lists = h(
      'div',
      { class: 'cal-lists' },
      toConfirmSection(ctx, unconfirmedAppointments(appointments, nowLocal), planNames),
      upcomingSection(upcomingAppointments(appointments, nowLocal), planNames),
      dueSection(dueToBook(summaries), today),
    );

    const banner = view.bannerDismissed
      ? null
      : reminderBanner(ctx, bannerItems({ appointments, summaries, now }), {
          hasReminders: appointments.some((a) => a.reminderOffsets.length > 0) || plans.some((p) => p.remindBeforeDays !== null),
          onDismiss: () => {
            view.bannerDismissed = true;
            render();
            /** @type {HTMLElement|null} */ (el.querySelector('h1'))?.focus();
          },
        });

    const isEmpty = plans.length === 0 && appointments.length === 0;
    el.replaceChildren(
      header,
      ...(banner ? [banner] : []),
      ...(isEmpty ? [welcomeCard()] : []),
      h('div', { class: 'cal-layout' }, h('div', { class: 'cal-layout__main' }, calendarPanel, selectedDay), h('div', { class: 'cal-layout__side' }, lists)),
    );

    if (focusSelected) /** @type {HTMLElement|null} */ (el.querySelector('.day[aria-pressed="true"]'))?.focus();
  }

  render();

  return {
    el,
    title: 'Calendar',
    wide: true,
    update() {
      // Keep keyboard focus on the same day button if it had it.
      const hadDayFocus = document.activeElement?.classList.contains('day') ?? false;
      render({ focusSelected: hadDayFocus });
    },
  };
}

// ---------------------------------------------------------------------------
// Calendar pieces

/** @param {(mode: ViewMode) => void} onChange */
function modeToggle(onChange) {
  /** @param {ViewMode} mode @param {string} label */
  const option = (mode, label) =>
    h('label', null, h('input', { type: 'radio', name: 'cal-view', value: mode, checked: view.mode === mode, onchange: () => onChange(mode) }), label);
  return h('div', { class: 'segmented segmented--small', role: 'radiogroup', 'aria-label': 'Calendar view' }, option('week', 'Week'), option('month', 'Month'));
}

/** @param {LocalDate[]} dates */
function weekLabel(dates) {
  const first = dates[0];
  const last = dates[6];
  if (isSameMonth(first, last)) return `${parseLocalDate(first)?.day}–${parseLocalDate(last)?.day} ${formatMonthYear(first)}`;
  return `${formatDateShort(first)} – ${formatDateShort(last)}`;
}

/**
 * @typedef {object} DayGridOptions
 * @property {LocalDate} today
 * @property {LocalDate} selected
 * @property {Map<LocalDate, DayMarkers>} markers
 * @property {Map<string, string>} planNames
 * @property {(date: LocalDate, o?: { focus?: boolean }) => void} onSelect
 * @property {(direction: number) => void} onShift
 */

/**
 * Accessible name for a day button, e.g.
 * "Wednesday, 7 October 2026, today, 2 appointments, Dentist due".
 * @param {LocalDate} date
 * @param {DayGridOptions} o
 */
function dayLabel(date, o) {
  const m = o.markers.get(date);
  const parts = [formatDateLong(date)];
  if (date === o.today) parts.push('today');
  if (m?.appointments.length) parts.push(plural(m.appointments.length, 'appointment'));
  if (m?.duePlans.length) parts.push(`${m.duePlans.map((p) => p.name).join(', ')} due`);
  return parts.join(', ');
}

/** @param {DayMarkers|undefined} m */
function dayMarks(m) {
  const dots = Math.min(m?.appointments.length ?? 0, 3);
  return h(
    'span',
    { class: 'day__marks', 'aria-hidden': 'true' },
    Array.from({ length: dots }, () => h('span', { class: 'mark mark--appt' })),
    m?.duePlans.length ? h('span', { class: 'mark mark--due' }) : null,
  );
}

/**
 * @param {LocalDate} date
 * @param {DayGridOptions} o
 * @param {{ outside?: boolean, showWeekday?: boolean }} [extra]
 */
function dayButton(date, o, { outside = false, showWeekday = false } = {}) {
  const isSelected = date === o.selected;
  const classes = ['day', date === o.today ? 'is-today' : '', outside ? 'is-outside' : ''].filter(Boolean).join(' ');
  return h(
    'button',
    {
      type: 'button',
      class: classes,
      dataset: { date },
      tabindex: isSelected ? '0' : '-1',
      'aria-pressed': String(isSelected),
      'aria-current': date === o.today ? 'date' : undefined,
      'aria-label': dayLabel(date, o),
      onclick: () => o.onSelect(date),
    },
    showWeekday ? h('span', { class: 'day__dow' }, formatWeekdayShort(date)) : null,
    h('span', { class: 'day__num' }, String(parseLocalDate(date)?.day)),
    dayMarks(o.markers.get(date)),
  );
}

/**
 * Arrow keys move the selection (roving tabindex), PageUp/PageDown change
 * the period, and horizontal swipes change the period too.
 * @param {HTMLElement} container
 * @param {DayGridOptions} o
 * @param {number} rowStep days per Up/Down press (0 = disabled)
 */
function addDayNavigation(container, o, rowStep) {
  container.addEventListener('keydown', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const date = target.dataset?.date;
    if (!date) return;
    /** @type {Record<string, () => LocalDate>} */
    const moves = {
      ArrowLeft: () => addDays(date, -1),
      ArrowRight: () => addDays(date, 1),
      Home: () => startOfWeek(date),
      End: () => addDays(startOfWeek(date), 6),
      PageUp: () => (rowStep ? addMonths(date, -1) : addDays(date, -7)),
      PageDown: () => (rowStep ? addMonths(date, 1) : addDays(date, 7)),
    };
    if (rowStep) {
      moves.ArrowUp = () => addDays(date, -rowStep);
      moves.ArrowDown = () => addDays(date, rowStep);
    }
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    o.onSelect(move(), { focus: true });
  });

  let startX = 0;
  let startY = 0;
  container.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
  });
  container.addEventListener('pointerup', (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) o.onShift(dx < 0 ? 1 : -1);
  });
}

/** @param {LocalDate[]} dates @param {DayGridOptions} o */
function weekStrip(dates, o) {
  const strip = h('div', { class: 'week-strip', role: 'group', 'aria-label': `Week of ${formatDateLong(dates[0])}` }, dates.map((d) => dayButton(d, o, { showWeekday: true })));
  addDayNavigation(strip, o, 0);
  return strip;
}

/** @param {LocalDate[]} dates @param {DayGridOptions} o */
function monthGrid(dates, o) {
  const month = startOfMonth(o.selected);
  // Drop a trailing week that lies entirely in the next month.
  const visible = dates.slice(35, 42).every((d) => !isSameMonth(d, month)) ? dates.slice(0, 35) : dates;
  const grid = h(
    'div',
    { class: 'month-grid', role: 'group', 'aria-label': formatMonthYear(month) },
    h('div', { class: 'month-grid__dow', 'aria-hidden': 'true' }, weekDates(month).map((d) => h('span', null, formatWeekdayShort(d)))),
    h('div', { class: 'month-grid__days' }, visible.map((d) => dayButton(d, o, { outside: !isSameMonth(d, month) }))),
  );
  addDayNavigation(grid, o, 7);
  return grid;
}

// ---------------------------------------------------------------------------
// Lists

/**
 * @param {LocalDate} date
 * @param {LocalDate} today
 * @param {import('../../domain/types.js').Appointment[]} dayAppointments
 * @param {import('../../domain/types.js').CheckupPlan[]} duePlans
 * @param {Map<string, string>} planNames
 */
function dayPanel(date, today, dayAppointments, duePlans, planNames) {
  const title = date === today ? 'Today' : formatDateShort(date);
  const empty = dayAppointments.length === 0 && duePlans.length === 0;
  return h(
    'section',
    { class: 'section day-panel', 'aria-labelledby': 'day-panel-title' },
    h(
      'div',
      { class: 'section__header' },
      h('h2', { id: 'day-panel-title' }, title),
      h('a', { class: 'btn btn--small', href: href('/new', { date }), 'aria-label': `Add appointment on ${formatDateLong(date)}` }, '+ Add'),
    ),
    empty ? h('p', { class: 'empty' }, 'Nothing on this day.') : null,
    duePlans.length
      ? h(
          'ul',
          { class: 'card-list', style: 'margin-bottom: var(--space-3)' },
          duePlans.map((p) =>
            h(
              'li',
              { class: 'due-hint' },
              h('span', { class: 'mark mark--due', 'aria-hidden': 'true' }),
              h('span', null, h('strong', null, p.name), ' is due around here. '),
              h('a', { href: href('/new', { type: 'appointment', planId: p.id, date: date < today ? today : date }) }, 'Book it'),
            ),
          ),
        )
      : null,
    dayAppointments.length
      ? h('ul', { class: 'card-list' }, dayAppointments.map((a) => appointmentCard(a, { planName: a.planId ? planNames.get(a.planId) : null })))
      : null,
  );
}

/**
 * Past appointments still marked SCHEDULED: ask whether they happened, since
 * DONE visits drive the plans' next due dates.
 * @param {AppContext} ctx
 * @param {import('../../domain/types.js').Appointment[]} list
 * @param {Map<string, string>} planNames
 */
function toConfirmSection(ctx, list, planNames) {
  if (list.length === 0) return null;
  return h(
    'section',
    { class: 'section', 'aria-labelledby': 'confirm-title' },
    h('div', { class: 'section__header' }, h('h2', { id: 'confirm-title' }, 'Did these happen?'), h('span', { class: 'section__count' }, String(list.length))),
    h(
      'ul',
      { class: 'card-list' },
      list.map((a) =>
        appointmentCard(a, {
          planName: a.planId ? planNames.get(a.planId) : null,
          actions: [
            h('button', {
              type: 'button',
              class: 'btn btn--small btn--primary',
              'aria-label': `Mark ${a.title} done`,
              onclick: async () => {
                const r = await ctx.services.markDone(a.id);
                ctx.toast(r.ok ? 'Marked as done' : Object.values(r.errors)[0]);
              },
            }, icon('check', 16), 'Done'),
            h('button', {
              type: 'button',
              class: 'btn btn--small',
              'aria-label': `Mark ${a.title} as cancelled`,
              onclick: async () => {
                const r = await ctx.services.cancel(a.id);
                ctx.toast(r.ok ? 'Marked as cancelled' : Object.values(r.errors)[0]);
              },
            }, 'Didn’t happen'),
          ],
        }),
      ),
    ),
  );
}

/**
 * @param {import('../../domain/types.js').Appointment[]} list
 * @param {Map<string, string>} planNames
 */
function upcomingSection(list, planNames) {
  const shown = list.slice(0, UPCOMING_LIMIT);
  return h(
    'section',
    { class: 'section', 'aria-labelledby': 'upcoming-title' },
    h('div', { class: 'section__header' }, h('h2', { id: 'upcoming-title' }, 'Upcoming'), list.length ? h('span', { class: 'section__count' }, String(list.length)) : null),
    shown.length
      ? h('ul', { class: 'card-list' }, shown.map((a) => appointmentCard(a, { planName: a.planId ? planNames.get(a.planId) : null })))
      : h('p', { class: 'empty' }, 'No upcoming appointments.'),
    list.length > shown.length ? h('p', { class: 'field__hint', style: 'margin-top: var(--space-2)' }, `+ ${list.length - shown.length} more — use the calendar above to browse.`) : null,
  );
}

/** @param {PlanSummary[]} list @param {LocalDate} today */
function dueSection(list, today) {
  return h(
    'section',
    { class: 'section', 'aria-labelledby': 'due-title' },
    h('div', { class: 'section__header' }, h('h2', { id: 'due-title' }, 'Due to book'), list.length ? h('span', { class: 'section__count' }, String(list.length)) : null),
    list.length
      ? h('ul', { class: 'card-list' }, list.map((s) => duePlanCard(s, today)))
      : h('p', { class: 'empty' }, 'All your checkups are booked or on track.'),
  );
}

function welcomeCard() {
  return h(
    'section',
    { class: 'card card--mint welcome', 'aria-labelledby': 'welcome-title' },
    h('h2', { id: 'welcome-title', class: 'card__title' }, 'Welcome to Just Checkup'),
    h('p', { class: 'card__meta', style: 'margin: var(--space-2) 0 var(--space-4)' },
      'Add a checkup plan (like “Dentist every 6 months”) and the app tells you when to book. Or just add an appointment. Everything stays on this device.'),
    h(
      'div',
      { class: 'button-row' },
      h('a', { class: 'btn btn--primary', href: href('/new', { type: 'plan' }) }, 'Add a checkup plan'),
      h('a', { class: 'btn', href: href('/new', { type: 'appointment' }) }, 'Add an appointment'),
    ),
  );
}

