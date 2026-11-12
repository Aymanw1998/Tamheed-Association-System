# Independent Codex review request: wall display screens (2026-11-12)

Actual Claude Code is the sole implementer. You are the independent Codex
reviewer. Review only the uncommitted working-tree changes (`git diff` plus the
untracked new files) in this repository. Do not edit files, run
seed/migration/admin/data-clearing commands, touch `.env`, or start another
reviewer. The repository is public. This request contains no credentials or
real records.

## Owner request

A TV on the wall shows the association's weekly lesson program (برنامج
الأسبوع), with no computer and no way for passers-by to move it elsewhere. Three
ready layouts; a manager picks one per screen; each lesson shows its guide.
Spec: `docs/superpowers/specs/2026-11-11-display-screen-design.md`.
Plan: `docs/superpowers/plans/2026-11-12-display-screen.md`.

## What was built

- **Permission:** `displays.manage` («شاشات العرض» / «إدارة شاشات العرض») in
  `shared/permissions.json`, synced to System and IT. No role has it by
  default; it is granted in IT. Client route `/lessons/displays` needs it.
- **Store and feed:** `server/Entities/Display/DisplayScreen.model.js`
  (collection `DisplayScreens`, unique index on `tokenHash`, created at
  startup) and `server/services/displayScreens.js`.
  - A screen is `{ name, layout: week|today|rotate, tokenHash, createdAt, updatedAt }`.
  - The link secret is `crypto.randomBytes(32).toString("base64url")`; only its
    SHA-256 is stored. No expiry, not one-use; a new link or a delete ends it.
  - `feed(secret)` returns exactly `{ name, layout, serverTime, lessons:[{ name, day, startMin, endMin, room, guide, kind }] }`.
    The guide is the lesson teacher's full name, only for an active, non-hidden
    user (`findActive`, now exported from `utils/lessonParticipants.js`).
    Sport lessons are room "9" with no guide. Lessons without a valid day/time
    are left out; room "0" or empty is `null`.
  - A malformed, unknown or revoked secret is 410 `LINK_CLOSED`.
  - Create, edit, new link and delete are audited without the secret.
- **API:** `server/Entities/Display/Display.route.js` at `/api/displays`.
  - `POST /feed` is public: secret in the body (the page keeps it in the URL
    fragment), `rateLimit` 30/min per address, `Cache-Control: no-store`.
    Listed in `PUBLIC_ROUTES` in `route-guards.test.js`.
  - `GET /`, `POST /`, `PUT /:id`, `POST /:id/rotate`, `DELETE /:id`: sign-in,
    `requirePermission("displays.manage")`, `objectIdParam`. Create and rotate
    return the token once, `no-store`.
- **TV page (System app):** `index.js` mounts only the display board for
  `/display` (no App shell, toasts, report button, tours or live channel).
  `Components/Display/`: `DisplayPage.jsx`, `WeekLayout.jsx`,
  `TodayLayout.jsx`, `RotateLayout.jsx`, `displayBoard.js` (Israel day/minute,
  now/next marks, day lists, stored copy), `displayParts.jsx`.
  - Refresh every 60 s; clock tick every 15 s; offset from `serverTime`.
  - Stored copy `tamheed_display_feed_v1` with its save time and a link
    fingerprint; ignored after 7 days or for another link; wiped on 410.
  - «آخر تحديث HH:MM» after 5 minutes without a successful fetch.
  - Only a 410 closes the screen; 500/429/network keep the last program.
  - A crash shows the loading text and reloads after a minute.
  - Times are in `<bdi dir="ltr">`. A crowded board shrinks its text
    (`fitBoard`, `--fit`, floor 0.4) until no `[data-fit]` box overflows; a
    week day with more than 10 lessons lists them in two columns.
- **Management page:** `DisplayScreensPage.jsx`, tab «شاشات العرض» in
  `LessonsHub` (only with `displays.manage`), route above `/lessons/:id`.
  List, add (name + layout), change layout (saves at once), rename, «رابط
  جديد» and «حذف» behind a confirm. The link is shown once in a dialog with a
  copy button and «احفظ الرابط الآن — لن يظهر مرة أخرى.»
- `pwa/shouldCache.js` never caches `/api/displays`.
- Docs: Hebrew section «מסך תצוגה בטלוויזיה» in `deploy/DEPLOY.md`; a row in
  `docs/FEATURE_PERMISSIONS.md`.

## Verification done

- `npm run verify`: server 1,666 tests and System 1,275 tests pass; the build
  passes.
- IT: 116 tests pass. `syncShared --check` and `git diff --check` pass.
- Browser check, synthetic data only (in-memory stores, the real router and
  service, the production build; no database): all three layouts at
  1920×1080; a layout change reached the TV within a minute; 20 lessons in one
  day fit with no overflowing box in every layout; a reload while the API
  answered 503 showed the stored program; a 410 showed the closed message and
  wiped the stored copy.
- Final whole-change review by a fresh Claude reviewer: ready with fixes, no
  critical. Fixed with failing-first tests: the today layout's side column has
  its own text scale; a stored copy that crashes the page is dropped; edits are
  audited as `update` (IT labels added); the program menu opens
  `/lessons/displays` for a user with only `displays.manage`; revoke tests;
  minimum browser (Chromium 85) in `DEPLOY.md`. Then, at the owner's request:
  the stored copy keeps its save time and clock correction across a restart
  and the stale note shows date and time; «+N» for lessons that still do not
  fit; parallel guide lookup; the stored copy is tied to its screen link by a
  fingerprint (`displayBoard.js` `linkPrint`).

## Not verified

- An offline reload through the service worker: the browser pane used could
  not register service workers. `/display` is covered by the existing
  `NavigationRoute`, by reading the code only.
- A real Android TV / Fully Kiosk device.

## Please check especially

1. The secret never reaches a path, query string, access log or audit row.
2. The feed carries nothing beyond the fields above (no ids, students, helper).
3. Every management endpoint needs `displays.manage`; `/feed` is the only
   public route.
4. Only a 410 closes the TV; any other failure keeps the last program.
5. "Today" and "now" follow Israel time from the server even with a wrong TV
   clock, and across midnight.
6. The display page avoids browser APIs newer than an Android TV WebView.
