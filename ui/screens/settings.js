// @ts-check
/**
 * Settings: backup (export/import), notifications, storage, about.
 */
import { append, h, uid } from '../dom.js';
import { downloadFile } from '../download.js';
import { openDialog } from '../components/dialog.js';
import { enableNotificationsFlow } from '../components/notification-prompt.js';
import { formatDate, plural } from '../format.js';
import { todayLocal, diffDays } from '../../domain/dates.js';
import { SCHEMA_VERSION } from '../../domain/snapshot.js';
import { META_KEYS } from '../../storage/store.js';
import { getPersistenceState, getStorageEstimate } from '../../storage/persist.js';
import { notificationPermission } from '../../reminders/permission.js';

/** @typedef {import('../context.js').AppContext} AppContext */
/** @typedef {import('../context.js').Screen} Screen */

const BACKUP_NUDGE_DAYS = 30;

/**
 * @param {AppContext} ctx
 * @returns {Screen}
 */
export function settingsScreen(ctx) {
  const backupStatus = h('p', { class: 'field__hint' }, '…');
  const storageStatus = h('p', { class: 'field__hint' }, '…');
  const notificationsSlot = h('div');

  const fileId = uid('import-file');
  const fileInput = h('input', {
    type: 'file',
    id: fileId,
    tabindex: '-1',
    'aria-hidden': 'true',
    accept: '.json,application/json',
    class: 'visually-hidden',
    onchange: () => importFlow(ctx, fileInput),
  });

  const el = h(
    'div',
    { class: 'screen screen--settings' },
    h('header', { class: 'screen-header' }, h('h1', { tabindex: '-1' }, 'Settings')),

    section(
      'Backup',
      h('p', null, 'Your data lives only in this browser. Export a backup now and then, and keep it somewhere safe (e.g. cloud storage). You can import it on any device.'),
      backupStatus,
      h(
        'div',
        { class: 'button-row' },
        h('button', { type: 'button', class: 'btn btn--primary', onclick: () => exportFlow(ctx).then(() => refreshStatus()) }, 'Export data'),
        h('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, 'Import data'),
        fileInput,
      ),
    ),

    section('Notifications', notificationsSlot),

    section(
      'Storage',
      storageStatus,
    ),

    section(
      'About',
      h('p', null, 'Just Checkup keeps track of appointments and recurring checkups. No account, no server: everything stays on this device.'),
      h('p', { class: 'field__hint' }, `Data format version ${SCHEMA_VERSION}.`),
    ),
  );

  function renderNotifications() {
    const permission = notificationPermission();
    /** @type {Record<string, string>} */
    const text = {
      granted: 'On. You’ll get a notification for due reminders while the app is open or when you open it.',
      default: 'Off. Turn them on to get a notification when a reminder is due.',
      denied: 'Blocked in your browser settings. Allow notifications for this site to turn them on.',
      unsupported: 'This browser does not support notifications here. On iPhone, add the app to your Home Screen first.',
    };
    notificationsSlot.replaceChildren();
    append(notificationsSlot, [
      h('p', null, text[permission]),
      permission === 'default'
        ? h('div', { class: 'button-row', style: 'margin-top: var(--space-3)' },
            h('button', { type: 'button', class: 'btn', onclick: async () => {
              await enableNotificationsFlow({ toast: ctx.toast, onGranted: () => ctx.reminders.check() });
              renderNotifications();
            } }, 'Turn on notifications'))
        : null,
      h('p', { class: 'field__hint', style: 'margin-top: var(--space-3)' },
        'Tip: for reminders that arrive even when this app is closed, open an appointment and use “Add to my calendar”.'),
    ]);
  }

  async function refreshStatus() {
    const now = ctx.now();
    const last = await ctx.store.meta.get(META_KEYS.lastBackupAt);
    const { plans, appointments } = ctx.state.get();
    const hasData = plans.length + appointments.length > 0;
    if (typeof last === 'string') {
      const lastDate = todayLocal(new Date(last));
      const age = diffDays(lastDate, todayLocal(now));
      backupStatus.textContent = `Last export: ${formatDate(lastDate)}${age >= BACKUP_NUDGE_DAYS && hasData ? ' — time for a fresh one.' : '.'}`;
    } else {
      backupStatus.textContent = hasData ? 'You haven’t exported a backup yet.' : 'Nothing to back up yet.';
    }

    const [persistence, estimate] = await Promise.all([getPersistenceState(), getStorageEstimate()]);
    /** @type {string[]} */
    const lines = [];
    if (ctx.store.kind === 'memory') {
      lines.push('Storage is unavailable in this browser mode, so changes are lost when you close the tab.');
    } else if (persistence === 'persisted') {
      lines.push('Your data is protected from automatic cleanup by the browser.');
    } else {
      lines.push('The browser may clear data when the device runs low on space. Installing the app and exporting backups keeps it safe.');
    }
    if (estimate && estimate.usage > 0) lines.push(`Using about ${Math.max(1, Math.round(estimate.usage / 1024))} KB.`);
    lines.push(`${plural(plans.length, 'plan')}, ${plural(appointments.length, 'appointment')}.`);
    storageStatus.textContent = lines.join(' ');
  }

  renderNotifications();
  refreshStatus();

  return {
    el,
    title: 'Settings',
    update: () => {
      refreshStatus();
    },
  };
}

/**
 * @param {string} title
 * @param {...import('../dom.js').Child} children
 */
function section(title, ...children) {
  const id = uid('settings');
  return h(
    'section',
    { class: 'card card--plain settings-section', 'aria-labelledby': id },
    h('h2', { id, style: 'margin-bottom: var(--space-3)' }, title),
    h('div', { class: 'settings-section__body' }, children),
  );
}

/** @param {AppContext} ctx */
async function exportFlow(ctx) {
  const snapshot = await ctx.services.exportSnapshot();
  const date = todayLocal(ctx.now());
  downloadFile(`just-checkup-backup-${date}.json`, JSON.stringify(snapshot, null, 2), 'application/json');
  ctx.toast('Backup exported');
}

/**
 * @param {AppContext} ctx
 * @param {HTMLInputElement} input
 */
async function importFlow(ctx, input) {
  const file = input.files?.[0];
  input.value = ''; // allow choosing the same file again
  if (!file) return;

  /** @type {unknown} */
  let json;
  try {
    json = JSON.parse(await file.text());
  } catch {
    await info('Can’t read this file', 'It is not a valid JSON backup.');
    return;
  }
  const parsed = ctx.services.readSnapshot(json);
  if (!parsed.ok) {
    await info('Can’t import this file', Object.values(parsed.errors)[0]);
    return;
  }

  const snap = parsed.value;
  const live = (/** @type {{ deletedAt: string|null }[]} */ list) => list.filter((e) => e.deletedAt === null).length;
  const { value } = await openDialog({
    title: 'Import backup?',
    body: [
      h('p', null, `Backup from ${formatDate(todayLocal(new Date(snap.exportedAt)))}: ${plural(live(snap.plans), 'plan')} and ${plural(live(snap.appointments), 'appointment')}.`),
      h('p', null, h('strong', null, 'Merge'), ' keeps whichever version of each item was changed most recently. ', h('strong', null, 'Replace'), ' deletes everything on this device first.'),
    ],
    actions: [
      { label: 'Cancel', value: 'cancel', dismiss: true },
      { label: 'Replace all', value: 'replace', variant: 'danger' },
      { label: 'Merge', value: 'merge', variant: 'primary' },
    ],
  });
  if (value !== 'merge' && value !== 'replace') return;

  if (value === 'replace') {
    const sure = await openDialog({
      title: 'Replace all data?',
      body: [h('p', null, 'Everything currently on this device will be deleted and replaced by the backup. Consider exporting first.')],
      actions: [
        { label: 'Cancel', value: 'cancel', dismiss: true },
        { label: 'Replace all', value: 'yes', variant: 'danger' },
      ],
    });
    if (sure.value !== 'yes') return;
  }

  const summary = await ctx.services.importSnapshot(snap, value);
  ctx.toast(
    summary.mode === 'replace'
      ? 'Backup restored'
      : `Imported: ${summary.added} new, ${summary.updated} updated, ${summary.unchanged} unchanged`,
  );
  await ctx.refresh();
}

/** @param {string} title @param {string} message */
function info(title, message) {
  return openDialog({ title, body: [h('p', null, message)], actions: [{ label: 'OK', value: 'ok', variant: 'primary' }] });
}
