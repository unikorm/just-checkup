// @ts-check
/**
 * The app's connection to the outside world's time, ids and time zone.
 * Domain code never calls these directly; it receives their values.
 */

/** @typedef {{ now: () => Date }} Clock */

/** @type {Clock} */
export const systemClock = { now: () => new Date() };

/** @returns {string} */
export const randomId = () => crypto.randomUUID();

/** @returns {string|null} IANA zone of this device, e.g. 'Europe/Bratislava' */
export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}
