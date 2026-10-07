// @ts-check
/**
 * Pick reminder offsets: preset toggle chips plus a custom "N units before".
 */
import { h, uid } from '../dom.js';
import { formatOffset } from '../format.js';
import { offsetToMinutes } from '../../domain/dates.js';
import { OFFSET_UNITS } from '../../domain/constants.js';

/** @typedef {import('../../domain/types.js').ReminderOffset} ReminderOffset */
/** @typedef {import('../../domain/types.js').OffsetUnit} OffsetUnit */

/** @type {ReminderOffset[]} */
export const PRESET_OFFSETS = [
  { amount: 15, unit: 'minutes' },
  { amount: 1, unit: 'hours' },
  { amount: 2, unit: 'hours' },
  { amount: 1, unit: 'days' },
  { amount: 2, unit: 'days' },
  { amount: 1, unit: 'weeks' },
];

/**
 * @param {{ id: string, value: ReminderOffset[] }} options
 */
export function reminderPicker({ id, value }) {
  const presetMinutes = new Set(PRESET_OFFSETS.map(offsetToMinutes));
  /** @type {ReminderOffset[]} custom offsets not covered by presets */
  let custom = value.filter((o) => !presetMinutes.has(offsetToMinutes(o)));
  const selected = new Set(value.map(offsetToMinutes));

  const presetChips = PRESET_OFFSETS.map((o, i) =>
    h(
      'label',
      { class: 'chip' },
      h('input', {
        type: 'checkbox',
        id: i === 0 ? id : undefined,
        checked: selected.has(offsetToMinutes(o)),
        dataset: { amount: String(o.amount), unit: o.unit },
      }),
      formatOffset(o).replace(' before', ''),
    ),
  );
  const customList = h('div', { class: 'chips', 'aria-live': 'polite' });

  function renderCustom() {
    customList.replaceChildren(
      ...custom.map((o, i) =>
        h(
          'span',
          { class: 'chip chip--on' },
          formatOffset(o),
          h(
            'button',
            {
              type: 'button',
              class: 'chip__remove',
              'aria-label': `Remove reminder ${formatOffset(o)}`,
              onclick: () => {
                custom = custom.filter((_, j) => j !== i);
                renderCustom();
                amountInput.focus();
              },
            },
            '×',
          ),
        ),
      ),
    );
  }

  const amountId = uid('reminder-amount');
  const amountInput = h('input', { class: 'input', type: 'number', id: amountId, min: '1', max: '99', inputmode: 'numeric', 'aria-label': 'Custom reminder amount' });
  const unitSelect = h(
    'select',
    { class: 'select', 'aria-label': 'Custom reminder unit' },
    OFFSET_UNITS.map((u) => h('option', { value: u, selected: u === 'days' }, u)),
  );
  const addButton = h(
    'button',
    {
      type: 'button',
      class: 'btn btn--small',
      onclick: () => {
        const amount = Number(amountInput.value);
        if (!Number.isInteger(amount) || amount < 1) {
          amountInput.focus();
          return;
        }
        const offset = { amount, unit: /** @type {OffsetUnit} */ (unitSelect.value) };
        const minutes = offsetToMinutes(offset);
        const preset = presetChips.find((c) => offsetToMinutes(readChip(c)) === minutes);
        if (preset) /** @type {HTMLInputElement} */ (preset.querySelector('input')).checked = true;
        else if (!custom.some((o) => offsetToMinutes(o) === minutes)) custom.push(offset);
        amountInput.value = '';
        renderCustom();
      },
    },
    'Add',
  );

  renderCustom();

  const el = h(
    'div',
    { class: 'field__group' },
    h('div', { class: 'chips' }, presetChips),
    customList,
    h('div', { class: 'custom-reminder' }, h('span', { class: 'field__hint' }, 'Custom:'), amountInput, unitSelect, h('span', { class: 'field__hint' }, 'before'), addButton),
  );

  /** @param {HTMLElement} chip */
  function readChip(chip) {
    const input = /** @type {HTMLInputElement} */ (chip.querySelector('input'));
    return { amount: Number(input.dataset.amount), unit: /** @type {OffsetUnit} */ (input.dataset.unit) };
  }

  return {
    el,
    /** All inputs that should be described by the field's hint/error. */
    controls: [/** @type {HTMLInputElement} */ (presetChips[0].querySelector('input'))],
    /** @returns {ReminderOffset[]} */
    getValue() {
      const presets = presetChips
        .filter((c) => /** @type {HTMLInputElement} */ (c.querySelector('input')).checked)
        .map(readChip);
      return [...presets, ...custom];
    },
  };
}
