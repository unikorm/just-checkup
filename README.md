# Just Checkup

Track doctor appointments and recurring checkups ("Dentist every 6 months").
A local-first PWA: no sign-up, no server, works offline, and your data stays in
the browser. It's built so that sign-up and server sync can be added later.

Plain HTML, CSS and JavaScript (ES modules), with no framework, no build step
and no dependencies. Every JS file uses `// @ts-check` with JSDoc types.

## Run it locally

ES modules and service workers do not work from `file://`, so serve the folder
over HTTP:

```sh
node scripts/serve.mjs          # http://localhost:8080  (or: npm start)
node scripts/serve.mjs 3000     # another port
# or any static server, e.g.  python3 -m http.server 8080
```

To test on a phone, the page must be served over **HTTPS** (or `localhost`) for
the service worker, notifications and install to work. For example, deploy the
folder to any static host (GitHub Pages, Netlify, Cloudflare Pages), or use a
tunnel.

## Tests and type checking

```sh
node --test                     # or: npm test   (Node 20+, no dependencies)
npm run typecheck               # optional: runs tsc via npx (downloads TypeScript once)
```

`node --test` covers the domain rules, date math (in a fixed DST time zone),
validation, reminders, `.ics` output, export/import, the services layer, the
store contract (against `MemoryStore`), WCAG contrast of the design tokens, and
that the service worker precaches every file the app loads.

The same store contract runs against the real **IndexedDB** store in a browser:
start the server and open <http://localhost:8080/tests/browser/>.

## Architecture

```
domain/      pure model + rules: no DOM, no storage, fully unit-tested
  types.js        JSDoc types (CheckupPlan, Appointment, ...)
  dates.js        ALL date math (LocalDate / LocalDateTime / Instant)
  plan.js         next due date, plan status
  appointment.js  status transitions (state machine)
  calendar.js     read models: upcoming, to confirm, due to book, day markers
  validation.js   form input -> typed values or per-field errors
  merge.js        last-write-wins merge (import now, sync later)
  snapshot.js     versioned export format + migrations
storage/     Store interface, IndexedDbStore, MemoryStore, persist()
reminders/   compute (pure), scheduler, notifier, permission, .ics
app/         use cases (services), observable state, clock/ids
ui/          router, screens (calendar, edit, settings), components
styles/      tokens.css (all colors/radii/spacing, light+dark), base, components
sw.js        service worker: offline shell, notification click, push (future)
```

The layers depend in one direction only: `ui → app → domain` and `app → storage`.
The domain never imports from storage or the DOM. The clock, ids and time zone
are passed in, so tests are deterministic.

### Domain rules

- **Next due date** = the later of (last DONE appointment of the plan,
  `lastVisitDate`) + interval. With no history the plan shows "No visits yet"
  under *Due to book*.
- A plan is **booked** when it has a SCHEDULED appointment today or later. Until
  then it is *overdue*, *due soon* (within `remindBeforeDays`, default 30 days),
  or *on track*.
- **Appointment status**: SCHEDULED → DONE (only on or after its day),
  SCHEDULED → CANCELLED, rescheduling keeps it SCHEDULED, and CANCELLED/DONE can
  be reopened.
- "Log a visit" on a plan creates a DONE appointment, so all visit history
  lives in one place.
- Past appointments that are still SCHEDULED show up under **"Did these
  happen?"**, because only DONE visits move a plan's due date.
- Deleting is always a soft delete (`deletedAt`). Deleting a plan keeps its
  appointments.

### Dates

`LocalDate` (`YYYY-MM-DD`), `LocalDateTime` (`YYYY-MM-DDTHH:mm`, wall-clock
time) and `Instant` (ISO UTC) work like their `java.time` namesakes.
Calendar math uses UTC purely as a calculator, so DST never shifts a date.
Month ends clamp like `LocalDate.plusMonths` (Jan 31 + 1 month = Feb 28/29;
Feb 29 + 1 year = Feb 28). Date-only strings are never passed to `new Date()`.
Day/week reminder offsets keep the wall-clock time across DST ("1 day before
09:00" is 09:00 the day before). Minute/hour offsets are exact durations.

### Reminders

Without a server, a browser cannot wake a closed web app at a set time. v1
therefore:

1. Shows a **"Heads up" banner** on the home screen for appointments in the
   next 24 hours or with a due reminder, and for overdue or reminded plans.
2. Fires **browser notifications** for due reminders when the app opens, when
   it becomes visible again, whenever data changes, and by timer while it stays
   open. Each reminder is shown once (a log is kept in the store's meta area).
   Permission is requested only from a click, after a short explanation.
3. Offers **"Add to my calendar"**: an `.ics` file with `VALARM`s, so the
   phone's calendar delivers the reminders reliably.

**Adding Web Push later:** `reminders/compute.js#allReminders()` already
produces every reminder with its `fireAt` instant. A `PushScheduler` would send
that list (plus a push subscription) to the backend, and `sw.js` already has a
`push` handler that shows `{ title, body, tag, url }`. Appointments store their
IANA `timeZone` so a server can compute the same instants.

### Sync later

Everything sync needs is already in place:
- ids are client-generated UUIDs, so there is no id mapping;
- every record has `createdAt`, `updatedAt` and `deletedAt` (tombstones);
- `Collection.changedSince(instant)` returns local changes to push;
- `domain/merge.js` does the last-write-wins merge that JSON import already uses;
- the UI depends only on the async `Store` interface, so a `SyncingStore` can
  wrap `IndexedDbStore` and a `RemoteStore` without UI changes.

### Data safety

- `navigator.storage.persist()` is requested once on first run.
- **Settings → Export data** downloads a JSON snapshot (`schemaVersion`, all
  records including tombstones). **Import data** validates the file, shows a
  preview, and either merges (newest change wins) or replaces everything.
- `snapshot.js` has a `MIGRATIONS` table for future schema versions.

## Deploying a new version

The service worker serves the app cache-first in production. When you change
any file:

1. Bump `CACHE_VERSION` in `sw.js`.
2. If you added or removed a file, update `APP_SHELL` in `sw.js`.
   `node --test` fails until the list matches.

Open tabs then show "A new version is ready – Reload". On `localhost` the
service worker is network-first, so you see edits right away.

## Design

The warm, playful card style comes from `styles/tokens.css`: a cream
background, pastel cards (mustard, coral, mint, lavender) with thin dark
outlines and large radii, a dark pill for the selected day, and a floating
pill bottom bar. Colors adapt to `prefers-color-scheme`. Fonts are a system
rounded stack (`ui-rounded`/SF Pro Rounded where available), with no font
downloads.

Accessibility: semantic landmarks and headings, labelled controls with linked
error messages, focus moves to the heading on navigation, one visible focus
ring everywhere, roving-tabindex arrow-key navigation in the calendar, shape
(not just color) for calendar markers, reduced-motion support, and tested
contrast for every text/background token pair.
