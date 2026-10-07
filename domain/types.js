// @ts-check
/**
 * Domain type definitions (JSDoc only, no runtime code).
 *
 * Date vocabulary mirrors java.time:
 *   LocalDate      'YYYY-MM-DD'         a calendar date, no time zone
 *   LocalDateTime  'YYYY-MM-DDTHH:mm'   a wall-clock time, no time zone
 *   Instant        ISO-8601 UTC         a point on the global timeline
 *
 * Optional values are always `null` (never `undefined`) so that JSON export,
 * IndexedDB and a future server all agree on what "no value" looks like.
 */

/** @typedef {string} Id             crypto.randomUUID() */
/** @typedef {string} LocalDate      'YYYY-MM-DD' */
/** @typedef {string} LocalDateTime  'YYYY-MM-DDTHH:mm' */
/** @typedef {string} Instant        ISO-8601 UTC, e.g. '2026-10-07T07:30:00.000Z' */

/** @typedef {'days'|'weeks'|'months'|'years'} IntervalUnit */
/** @typedef {{ amount: number, unit: IntervalUnit }} Interval */

/** @typedef {'minutes'|'hours'|'days'|'weeks'} OffsetUnit */
/** @typedef {{ amount: number, unit: OffsetUnit }} ReminderOffset */

/** @typedef {'SCHEDULED'|'DONE'|'CANCELLED'} AppointmentStatus */

/**
 * Fields shared by every persisted entity. These make sync possible later:
 * client-side ids, UTC timestamps for last-write-wins, and tombstones.
 * @typedef {object} EntityMeta
 * @property {Id} id
 * @property {Instant} createdAt
 * @property {Instant} updatedAt
 * @property {Instant|null} deletedAt
 */

/**
 * @typedef {object} PlanFields
 * @property {string} name
 * @property {string} notes
 * @property {Interval} interval
 * @property {LocalDate|null} lastVisitDate   seed value, set manually
 * @property {number|null} remindBeforeDays
 */

/** @typedef {EntityMeta & PlanFields} CheckupPlan */

/**
 * @typedef {object} AppointmentFields
 * @property {Id|null} planId
 * @property {string} title
 * @property {LocalDateTime} dateTime
 * @property {number} durationMinutes
 * @property {string|null} timeZone          IANA zone captured when saved (for server push later)
 * @property {string} location
 * @property {string} notes
 * @property {AppointmentStatus} status
 * @property {ReminderOffset[]} reminderOffsets
 */

/** @typedef {EntityMeta & AppointmentFields} Appointment */

/** @typedef {'booked'|'overdue'|'due-soon'|'later'|'no-history'} PlanStatus */

/**
 * Derived view of a plan. Computed, never stored.
 * @typedef {object} PlanSummary
 * @property {CheckupPlan} plan
 * @property {LocalDate|null} lastVisit
 * @property {LocalDate|null} nextDue
 * @property {PlanStatus} status
 * @property {Appointment|null} nextAppointment
 * @property {number|null} daysUntilDue   negative when overdue
 */

/**
 * @typedef {object} DayMarkers
 * @property {Appointment[]} appointments
 * @property {CheckupPlan[]} duePlans
 */

/**
 * @typedef {object} Snapshot
 * @property {'just-checkup'} app
 * @property {number} schemaVersion
 * @property {Instant} exportedAt
 * @property {CheckupPlan[]} plans
 * @property {Appointment[]} appointments
 */

/**
 * @template T
 * @typedef {{ ok: true, value: T } | { ok: false, errors: Record<string, string> }} Result
 */

/**
 * What every "create" function needs from the outside world. Passing these in
 * keeps the domain pure and the tests deterministic.
 * @typedef {object} CreateContext
 * @property {Date} now
 * @property {Id} id
 */

export {};
