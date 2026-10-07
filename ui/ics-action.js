// @ts-check
/**
 * "Add to my calendar" on the appointment screen: downloads an .ics file
 * with VALARMs, so the phone's calendar delivers the reminders.
 */
import { h } from './dom.js';
import { icon } from './icons.js';
import { downloadFile } from './download.js';
import { appointmentActionHooks } from './screens/edit.js';
import { appointmentToIcs, icsFileName } from '../reminders/ics.js';

let registered = false;

export function registerIcsAction() {
  if (registered) return;
  registered = true;
  appointmentActionHooks.push((ctx, appointment) => {
    if (appointment.status !== 'SCHEDULED') return null;
    return h(
      'button',
      {
        type: 'button',
        class: 'btn',
        onclick: () => {
          downloadFile(icsFileName(appointment), appointmentToIcs(appointment, { now: ctx.now() }), 'text/calendar;charset=utf-8');
          ctx.toast(appointment.reminderOffsets.length ? 'Calendar file ready, with your reminders' : 'Calendar file ready');
        },
      },
      icon('calendarPlus'),
      'Add to my calendar',
    );
  });
}
