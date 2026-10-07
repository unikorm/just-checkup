// @ts-check
/**
 * Form field wrapper: label, control, optional hint, and an error slot wired
 * up with aria-describedby / aria-invalid.
 */
import { h } from '../dom.js';

/** @typedef {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} Control */

/**
 * @param {{ id: string, label: string, control: Control | HTMLElement, hint?: string, optional?: boolean, describes?: Control[], group?: boolean }} options
 *   `control` must carry the given id. For composite controls pass the
 *   real inputs in `describes` so they get the hint/error descriptions.
 *   `group` renders a fieldset + legend (for sets of checkboxes).
 */
export function field({ id, label, control, hint, optional, describes, group }) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const targets = describes ?? [/** @type {Control} */ (control)];
  for (const t of targets) {
    t.setAttribute('aria-describedby', [hint ? hintId : '', errorId].filter(Boolean).join(' '));
  }
  const optionalNote = optional ? h('span', { class: 'field__optional' }, ' (optional)') : null;
  return h(
    group ? 'fieldset' : 'div',
    { class: 'field', dataset: { field: id } },
    group
      ? h('legend', { class: 'field__label' }, label, optionalNote)
      : h('label', { class: 'field__label', for: targets[0].id }, label, optionalNote),
    control,
    hint ? h('p', { class: 'field__hint', id: hintId }, hint) : null,
    h('p', { class: 'field__error', id: errorId }),
  );
}

/**
 * Show validation errors. `fieldIds` maps an error key to the field id used
 * when the field was built.
 * @param {HTMLElement} root
 * @param {Record<string, string>} errors
 * @param {Record<string, string>} fieldIds
 * @returns {HTMLElement|null} the first invalid control, for focusing
 */
export function showErrors(root, errors, fieldIds) {
  /** @type {HTMLElement|null} */
  let first = null;
  for (const [key, id] of Object.entries(fieldIds)) {
    const message = errors[key] ?? '';
    const slot = root.querySelector(`#${CSS.escape(id)}-error`);
    if (slot) slot.textContent = message;
    for (const control of root.querySelectorAll(`[aria-describedby~="${CSS.escape(id)}-error"]`)) {
      if (message) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
      if (message && !first) first = /** @type {HTMLElement} */ (control);
    }
  }
  return first;
}
