// @ts-check
/**
 * Modal dialogs built on the native <dialog> element, which provides focus
 * trapping, Escape-to-close and an inert background for free.
 */
import { h, uid } from '../dom.js';

/** @typedef {import('../dom.js').Child} Child */
/**
 * @typedef {object} DialogAction
 * @property {string} label
 * @property {string} value   returned when chosen ('' / 'cancel' count as dismiss)
 * @property {'primary'|'danger'|'plain'} [variant]
 * @property {boolean} [dismiss] skip form validation (cancel buttons)
 */

/**
 * @param {{ title: string, body?: Child[], actions: DialogAction[] }} options
 * @returns {Promise<{ value: string|null, form: HTMLFormElement }>}
 *   value is null when dismissed (Escape or a dismiss action).
 */
export function openDialog({ title, body = [], actions }) {
  const titleId = uid('dialog-title');
  const form = h(
    'form',
    { method: 'dialog' },
    h('h2', { id: titleId }, title),
    h('div', { class: 'dialog__body' }, body),
    h(
      'div',
      { class: 'dialog__actions' },
      actions.map((a) =>
        h(
          'button',
          {
            class: `btn ${a.variant === 'primary' ? 'btn--primary' : a.variant === 'danger' ? 'btn--danger-solid' : ''}`,
            value: a.value,
            formnovalidate: a.dismiss,
          },
          a.label,
        ),
      ),
    ),
  );
  const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': titleId }, form);
  document.body.append(dialog);
  dialog.showModal();

  const dismissValues = new Set(actions.filter((a) => a.dismiss).map((a) => a.value));
  return new Promise((resolve) => {
    dialog.addEventListener(
      'close',
      () => {
        const v = dialog.returnValue;
        resolve({ value: v === '' || dismissValues.has(v) ? null : v, form });
        dialog.remove();
      },
      { once: true },
    );
  });
}

/**
 * @param {{ title: string, message: string, confirmLabel?: string, danger?: boolean }} options
 * @returns {Promise<boolean>}
 */
export async function confirmDialog({ title, message, confirmLabel = 'OK', danger = false }) {
  const { value } = await openDialog({
    title,
    body: [h('p', null, message)],
    actions: [
      { label: 'Cancel', value: 'cancel', dismiss: true },
      { label: confirmLabel, value: 'confirm', variant: danger ? 'danger' : 'primary' },
    ],
  });
  return value === 'confirm';
}
