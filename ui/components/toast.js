// @ts-check
/** Short status message announced politely to screen readers. */

/** @type {ReturnType<typeof setTimeout>|undefined} */
let timer;

/** @param {string} message */
export function showToast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('is-visible'), 2600);
}
