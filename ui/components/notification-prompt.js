// @ts-check
/**
 * Explain first, then ask. Must be called from a user action (click) so the
 * browser shows the permission prompt.
 */
import { h } from '../dom.js';
import { openDialog } from './dialog.js';
import { notificationPermission, requestNotificationPermission } from '../../reminders/permission.js';

/** @typedef {import('../../reminders/permission.js').PermissionState} PermissionState */

/**
 * @param {{ toast: (message: string) => void, onGranted?: () => void }} options
 * @returns {Promise<PermissionState>}
 */
export async function enableNotificationsFlow({ toast, onGranted }) {
  const current = notificationPermission();
  if (current === 'granted' || current === 'unsupported' || current === 'denied') return current;

  const { value } = await openDialog({
    title: 'Get reminder notifications?',
    body: [
      h('p', null, 'Just Checkup can show a notification when an appointment is coming up or a checkup is due.'),
      h('p', null, 'There is no server, so notifications appear when the app is open or when you next open it. For reminders that always arrive on time, use “Add to my calendar” on an appointment.'),
    ],
    actions: [
      { label: 'Not now', value: 'cancel', dismiss: true },
      { label: 'Allow notifications', value: 'allow', variant: 'primary' },
    ],
  });
  if (value !== 'allow') return current;

  const result = await requestNotificationPermission();
  if (result === 'granted') {
    toast('Notifications are on');
    onGranted?.();
  } else if (result === 'denied') {
    toast('Notifications are blocked. You can allow them in your browser settings.');
  }
  return result;
}
