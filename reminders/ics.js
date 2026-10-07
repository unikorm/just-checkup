// @ts-check
/**
 * iCalendar (.ics, RFC 5545) export for one appointment, with VALARM
 * reminders so the phone's calendar app handles notifications even when
 * this app is closed. Pure: returns a string.
 *
 * Times are written in UTC (…Z), converted from the appointment's
 * wall-clock time using this device's time zone. That avoids shipping
 * VTIMEZONE definitions and imports correctly everywhere.
 */
import { localDateTimeToDate } from '../domain/dates.js';

/** @typedef {import('../domain/types.js').Appointment} Appointment */
/** @typedef {import('../domain/types.js').ReminderOffset} ReminderOffset */

const CRLF = '\r\n';
export const PRODID = '-//Just Checkup//Just Checkup 1.0//EN';

/**
 * Escape a TEXT value: backslash, semicolon, comma and newlines.
 * @param {string} value
 */
export function escapeText(value) {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Fold a content line to at most 75 octets per line (RFC 5545 §3.1),
 * never splitting a multi-byte UTF-8 character.
 * @param {string} line
 */
export function foldLine(line) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
      limit = 74; // continuation lines start with a space
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

/** @param {Date} date e.g. 20261007T073000Z */
export function formatUtc(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * RFC 5545 duration before the event, e.g. -P1D, -PT2H, -PT15M, -P1W.
 * @param {ReminderOffset} offset
 */
export function triggerFor({ amount, unit }) {
  switch (unit) {
    case 'minutes':
      return `-PT${amount}M`;
    case 'hours':
      return `-PT${amount}H`;
    case 'days':
      return `-P${amount}D`;
    case 'weeks':
      return `-P${amount}W`;
  }
}

/**
 * @param {Appointment} appointment
 * @param {{ now: Date }} options
 * @returns {string}
 */
export function appointmentToIcs(appointment, { now }) {
  const start = localDateTimeToDate(appointment.dateTime);
  const end = new Date(start.getTime() + appointment.durationMinutes * 60_000);
  // SEQUENCE must grow with every edit so calendar apps accept re-imports
  // as updates. Seconds since creation does that without extra state.
  const sequence = Math.max(0, Math.floor((Date.parse(appointment.updatedAt) - Date.parse(appointment.createdAt)) / 1000));

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${appointment.id}@just-checkup`,
    `DTSTAMP:${formatUtc(now)}`,
    `DTSTART:${formatUtc(start)}`,
    `DTEND:${formatUtc(end)}`,
    `SEQUENCE:${sequence}`,
    `SUMMARY:${escapeText(appointment.title)}`,
    appointment.location ? `LOCATION:${escapeText(appointment.location)}` : null,
    appointment.notes ? `DESCRIPTION:${escapeText(appointment.notes)}` : null,
    `STATUS:${appointment.status === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED'}`,
    ...appointment.reminderOffsets.flatMap((offset) => [
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(appointment.title)}`,
      `TRIGGER:${triggerFor(offset)}`,
      'END:VALARM',
    ]),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.filter((l) => l !== null).map((l) => foldLine(/** @type {string} */ (l))).join(CRLF) + CRLF;
}

/**
 * A safe, readable file name, e.g. "dentist-2026-10-20.ics".
 * @param {Appointment} appointment
 */
export function icsFileName(appointment) {
  const slug = appointment.title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${slug || 'appointment'}-${appointment.dateTime.slice(0, 10)}.ics`;
}
