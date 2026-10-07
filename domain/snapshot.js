// @ts-check
/**
 * Export/import format. A snapshot is plain JSON with a schemaVersion so
 * older backups can be migrated forward.
 */
import { APPOINTMENT_STATUSES } from './constants.js';
import { validateAppointmentInput, validatePlanInput } from './validation.js';

/** @typedef {import('./types.js').Snapshot} Snapshot */
/** @typedef {import('./types.js').CheckupPlan} CheckupPlan */
/** @typedef {import('./types.js').Appointment} Appointment */
/** @typedef {import('./types.js').EntityMeta} EntityMeta */
/** @typedef {import('./types.js').AppointmentStatus} AppointmentStatus */
/**
 * @template T
 * @typedef {import('./types.js').Result<T>} Result
 */

export const SCHEMA_VERSION = 1;
export const APP_ID = 'just-checkup';

/**
 * Migrations keyed by the version they upgrade FROM. Each takes the raw
 * snapshot object of that version and returns one of version + 1.
 * Example for the future:
 *   1: (s) => ({ ...s, schemaVersion: 2, appointments: s.appointments.map(...) })
 * @type {Record<number, (s: any) => any>}
 */
export const MIGRATIONS = {};

/**
 * @param {{ plans: CheckupPlan[], appointments: Appointment[] }} data
 * @param {Date} now
 * @returns {Snapshot}
 */
export function createSnapshot({ plans, appointments }, now) {
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    plans,
    appointments,
  };
}

const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** @param {unknown} v */
const isInstant = (v) => typeof v === 'string' && INSTANT_RE.test(v) && !Number.isNaN(Date.parse(v));

/**
 * @param {any} raw
 * @returns {EntityMeta|null}
 */
function readMeta(raw) {
  if (typeof raw?.id !== 'string' || raw.id.length === 0 || raw.id.length > 100) return null;
  if (!isInstant(raw.createdAt) || !isInstant(raw.updatedAt)) return null;
  if (raw.deletedAt !== null && !isInstant(raw.deletedAt)) return null;
  return { id: raw.id, createdAt: raw.createdAt, updatedAt: raw.updatedAt, deletedAt: raw.deletedAt };
}

/**
 * @param {any} raw
 * @returns {CheckupPlan|null}
 */
function readPlan(raw) {
  const meta = readMeta(raw);
  // A backup may legitimately contain a last visit "today" in another zone,
  // so the future-date check is not applied on import.
  const fields = validatePlanInput(raw ?? {}, '9999-12-31');
  return meta && fields.ok ? { ...meta, ...fields.value } : null;
}

/**
 * @param {any} raw
 * @returns {Appointment|null}
 */
function readAppointment(raw) {
  const meta = readMeta(raw);
  const fields = validateAppointmentInput(raw ?? {});
  const status = /** @type {AppointmentStatus} */ (raw?.status);
  if (!meta || !fields.ok || !APPOINTMENT_STATUSES.includes(status)) return null;
  return { ...meta, ...fields.value, status };
}

/**
 * Validate (and migrate) parsed JSON into a Snapshot. Unknown fields are
 * dropped. Any invalid record rejects the whole file, so a backup is never
 * half-imported.
 * @param {unknown} json
 * @returns {Result<Snapshot>}
 */
export function parseSnapshot(json) {
  /** @param {string} msg @returns {Result<Snapshot>} */
  const fail = (msg) => ({ ok: false, errors: { file: msg } });

  /** @type {any} */
  let data = json;
  if (typeof data !== 'object' || data === null || data.app !== APP_ID) {
    return fail('This is not a Just Checkup backup file.');
  }
  if (!Number.isInteger(data.schemaVersion) || data.schemaVersion < 1) {
    return fail('The backup has no valid schemaVersion.');
  }
  if (data.schemaVersion > SCHEMA_VERSION) {
    return fail('This backup was made by a newer version of the app. Please update first.');
  }
  while (data.schemaVersion < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[data.schemaVersion];
    if (!migrate) return fail(`No migration from schema version ${data.schemaVersion}.`);
    data = migrate(data);
  }
  if (!Array.isArray(data.plans) || !Array.isArray(data.appointments)) {
    return fail('The backup is missing plans or appointments.');
  }

  /** @type {CheckupPlan[]} */
  const plans = [];
  for (const [i, raw] of data.plans.entries()) {
    const plan = readPlan(raw);
    if (!plan) return fail(`Plan #${i + 1} is invalid.`);
    plans.push(plan);
  }
  /** @type {Appointment[]} */
  const appointments = [];
  for (const [i, raw] of data.appointments.entries()) {
    const appt = readAppointment(raw);
    if (!appt) return fail(`Appointment #${i + 1} is invalid.`);
    appointments.push(appt);
  }

  return {
    ok: true,
    value: {
      app: APP_ID,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: isInstant(data.exportedAt) ? data.exportedAt : new Date(0).toISOString(),
      plans,
      appointments,
    },
  };
}
