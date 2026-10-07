// @ts-check
/**
 * Notification permission. Only request after a user action, and only after
 * explaining why (see ui/components/notification-prompt.js).
 */

/** @typedef {'unsupported'|'default'|'granted'|'denied'} PermissionState */

/** @returns {PermissionState} */
export function notificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/** @returns {Promise<PermissionState>} */
export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}
