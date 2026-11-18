# Codex review request: owner feedback round (2026-11-14)

Implementer: Claude Code. Reviewer: Codex. Not committed. Read the working
tree diff (`git diff`, plus the new `apps/system/src/utils/passkey.test.js`).

## What the owner asked

1. Menu group «الأعضاء والطاقم» becomes «الطلاب والطاقم».
2. The passkey offer («الدخول بالبصمة أو بالوجه») keeps coming back after staff
   already saved a passkey.
3. Weekly tasks: «إرسال بركة» becomes «إرسال تهنئة».
4. Wall display screens: only two layouts, «كل الأسبوع» and «اليوم حسب الغرف».
5. The words «المستخدمون / المستخدمين» shown in the System become «الطاقم».

## Changes

**Passkey offer (item 2).** Cause: sign-out runs `localStorage.clear()`
(`fuctionsAuth.jsx`, `logoutScheduler.js`, `accessScheduler.js`), which also
removes the device's "already saved" marker, so the next password sign-in
offers again.
- `server/Entities/User/User.controller.js` `getme`: adds
  `hasPasskey` (`systemPasskeys.length > 0`). The passkeys themselves are still
  stripped by `sanitize`.
- `fuctionsAuth.jsx` `getMe`: passes `hasPasskey` through when it is a boolean.
- `utils/passkey.js`: new `syncSavedPasskey(account, hasPasskey)`; true sets the
  marker, false removes it (passkeys wiped by an admin or a password reset are
  offered again), anything else changes nothing.
- `RequireAuth.jsx`: calls it right after `getMe`, before the layout (and
  `PasskeyOffer`) mounts.
- Trade-off: an account with a passkey on one device is no longer offered one
  on a second device at sign-in; the profile page still offers it (`always`).

**Display layouts (item 4).**
- `server/services/displayScreens.js`: `LAYOUTS = ["week", "rooms"]`; create
  and update refuse `today`/`rotate`. `shownLayout()` lists and serves screens
  saved with `today`/`rotate` as `rooms`; other unknown values stay `week`.
  Stored documents are not rewritten.
- `TodayLayout.jsx`, `RotateLayout.jsx` deleted; `DisplayPage.jsx` and
  `LayoutCards.jsx` keep two layouts. Their CSS (`rot*`, the coming-days panel)
  is left in `Display.module.css`, unused.

**Wording (items 1, 3, 5).** `shared/permissions.json` (`greet` label) and the
two generated copies via `scripts/syncPermissions.js`; Header, GreetingDialog,
ManageWeeklyTasks, the server's greeting validation message, Dashboard,
ViewAllUser, UserStatusFilter, journey chapter, guide content, assistant
strings, problem log, Files and EditReport messages. The IT site keeps
«المستخدمون» (accounts), on purpose.

## Tests

- New `apps/system/src/utils/passkey.test.js` (3 tests).
- `login-security.test.js`: `hasPasskey` false/true, passkeys never sent.
- `display-screens.test.js`: two layouts; removed ones refused on create and
  update; saved ones listed and served as `rooms`.
- Display client tests, Header and journey tests updated to the new wording.

## Verification

- Server: everything passes except the 19 `deploy-update.test.js` cases, which
  fail identically on the unchanged tree on this Windows machine
  (`bash -n deploy/update.sh`).
- System client: 1,315 tests; 2 display tests fixed afterwards and rerun;
  `JourneyProvider.test.js` failed once in the full run and passed alone.
- `npm run build --prefix apps/system`: compiled successfully.
- Not checked in a browser or on a real TV.

## Questions for the reviewer

- Is mapping old `today`/`rotate` screens to `rooms` (rather than `week`) right?
- Any path where `/auth/me` runs after `PasskeyOffer` has already mounted?

## Addendum (same day): notifications off the dashboard

The owner chose to remove the «الإشعارات» list from the main page.
`Dashboard.jsx` no longer renders `SystemAlerts`; the header bell (latest
three) and the notices board (`NoticesBoard.jsx`, `notices.view`) keep it.
Known effect: a user without `notices.view` now sees only the bell's three.
New test in `Dashboard.test.js`. Dashboard and Notice tests pass (23); System
build compiled.

## Addendum 2 (same day): the notices archive is removed

Owner: «למחוק את ההודעות והדברים שיש בארכיון של כולם» (delete what is in
everyone's archive). The archive overlapped with the trash, the end date and
the 30-days-after-read rule.

- Server: `POST /notices/:id/archive`, `controller.archive`,
  `service.archiveNotice` and the `archived` list status are gone;
  `notices.archive` is removed from `shared/permissions.json` (unknown stored
  keys are already dropped by `expandKeys`). `trashPatch()` is shared by the
  trash action and the new `trashArchivedNotices()`.
- Existing archived notices: `server.js` runs `trashArchivedNotices()` at start.
  Each archived, not-deleted notice gets the trash patch (`deletedBy:
  "system"`, purge in 30 days or at its own earlier end date). Moved, not
  deleted at once: least destructive, and a restore still works (restore
  clears `archivedAt`). A second run finds nothing.
- System: the «المؤرشف» tab, the «أرشفة» button, `archiveNotice()`, the
  strings, the journey's two archive steps and the demo route are removed;
  restore shows only for trashed rows. The guide line now speaks of
  «حذف للجميع».
- Tests: new migration test in `notice-controller.test.js`; route-guard and
  capability tests now use `delete`/`purge`; a board test checks two tabs and
  no archive button.

Question: should the move also be a script under `server/scripts/` instead of
a start-up step?

## Addendum 3 (2026-11-15): the vehicles archive and earlier signatures

Owner: «ומחיקת כל ארכיון שיש במערכת». Asked which archives: chose the
vehicles archive and the kept earlier parent signatures (not the IT audit
archive). For what they already hold, chose «למחוק לצמיתות» for both, after
being told it cannot be undone.

**Vehicles.**
- Server: `POST /vehicle/:id/archive` and `/restore`, their handlers,
  `requireNotArchived` (8 call sites), the `archive` vehicle permission
  (`vehicleRules.PERMISSIONS`, `shared/permissions.json`, the lock's edit list)
  and the `archived` status (`VEHICLE_STATUSES`) are removed. An update or
  create with `status: "archived"` is now a 400 from validation.
- `remove` is split: `deleteForGood(vehicle)` (Drive files first, then folder,
  vehicle log, vehicle, alerts) is shared by the delete route and the new
  `purgeArchivedVehicles()`, which `server.js` runs at start. Each deleted
  vehicle gets a `vehicles/delete` audit row by the system. A vehicle whose
  Drive files fail stays and is tried next start.
- Kept on purpose: `buildAlerts` and the expiry job still skip `archived`
  (a vehicle left by a Drive failure gets no alerts until it goes), and the
  vehicle log labels for old `archive`/`restore` entries.
- System: archive/restore buttons, `archiveVehicle`/`restoreVehicle`, the
  archived status option and filter, the read-only-when-archived checks,
  the strings, the tour's two archive steps and the demo routes are removed.
  The guide's archive line now describes the admin's permanent delete
  (unchanged: typed plate, `vehicles.delete`).

**Earlier signatures.**
- `saveConsentEvidence` no longer writes a snapshot before replacing a
  signature; `ConsentHistoryModelDef` is gone. `purgeConsentHistory()`
  (`Rules.model.js`) deletes everything in `StudentConsentHistory`; `server.js`
  runs it at start. The student delete no longer cleans that collection.
- Effect: only the current signature is kept per student.

**Tests.** New: `purgeArchivedVehicles` (deletes archived with Drive files,
keeps active, keeps one whose Drive delete fails and takes it next run,
audit and alert forget), `consent-history-purge.test.js`. Updated: vehicle
controller, vehicle rules, permissions, permission migration, photo storage,
parent registration (the "failure to retain prior evidence" test is removed
with the feature), and on the client vehicle display, permission keys and
tree, demo routes.

Questions: is a start-up purge with Drive deletes acceptable, or should it be
a one-off script? Any legal reason to keep earlier signatures that the owner
should hear before this ships?

## Addendum 4 (2026-11-16): the app off root

The server runs the app in root's pm2 (checked by the owner: `ps` shows
`root`; mongod runs as `mongodb`). Owner asked that `update.sh` check the
user and run as `tamheed`.

- `deploy/update.sh`, before `git pull`: `APP_USER` (default `tamheed`). If
  the caller is not that user, the user exists and owns the project folder
  (`stat -c %U .`): root re-execs `sudo -H -u tamheed env REACT_APP_*=... bash
  deploy/update.sh`; anyone else fails through the existing failure report
  with the command to use. Root before the move: a note, then as before.
- `deploy/DEPLOY.md`: new section with the manual move (user, `chown`, pm2
  start and startup for `tamheed`, `pm2-logrotate` for it, cron with
  `PM2_HOME=/home/tamheed/.pm2` so backups stay root's), and a way back.
- Tests: four new cases in `deploy-update.test.js` (stubs for `id`, `stat`,
  `sudo`); 22 pass under Git Bash on Windows.

Questions: is `sudo -H` (secure_path, no `-i`) right for finding node/pm2 on
the server? Should `mongo-backup.sh` find `/home/tamheed/.pm2` by itself
instead of the cron `PM2_HOME`?

## Addendum 5 (2026-11-16): safety and backups, first batch

From the owner's answers to 50 questions (`docs/OWNER_DECISIONS_2026-11-16.md`,
group A). Not deployed; the server steps are manual (`deploy/DEPLOY.md`).

- **Lockout at 5** (was 10): `utils/loginLockout.js` `LOCK_THRESHOLD`.
- **Updates only at night**: `deploy/update.sh` refuses 08:00-20:00 Israel
  time before touching anything; `ALLOW_DAY_UPDATE=yes` overrides and is
  carried through the root-to-tamheed handover; checked once (not on the
  post-pull re-exec).
- **Audit rows kept 3 years**: a second TTL index `{ at: 1 }` beside the
  list's `{ at: -1 }` (`Audit.model.js`). Rows whose `at` is not a Date never
  expire.
- **Passwords**: first made one-way, then reversed the same day by the owner;
  see Addendum 6.
- **Backups**: `mongo-backup.sh` keeps the month's first archive in
  `monthly/` for a year, reports ok/failed (`scripts/opsReport.js`), finds
  `/home/tamheed/.pm2` when run by root, and calls
  `scripts/backupOffsite.js upload` (AES-256-GCM with `BACKUP_ENC_KEY_HEX`,
  private Drive folder, keeps 7 daily + 12 monthly; `decrypt` mode for
  recovery). `scripts/restoreCheck.js` (weekly cron) restores the newest
  archive into `tamheed_restore_check` via `--nsFrom/--nsTo`, needs `Users`
  back, drops the collections. `services/diskCheckJob.js` hourly, fails under
  15% free.
- **IT site**: `utils/opsStatus.js` (one row per check; stale after 36h /
  8 days / 3h), `GET /api/it/ops-status` (any IT user), a red banner on every
  IT screen when a check is not ok, a «حالة الخادم» card in Settings.
- **Docs**: fail2ban and unattended-upgrades steps; restore grant and cron;
  `.env.example` `BACKUP_ENC_KEY_HEX`.

Tests: new `mongo-backup.test.js`, `ops-status.test.js`, IT
`OpsStatus.test.js`; lockout, password, deploy-update, audit, it-api,
route-guard tests updated. Server 1,697 pass; IT 118 pass and builds.
Not run against a real MongoDB, Drive or server.

Questions: Does `readWrite` on the check DB suffice for `mongorestore --drop`? Is the
GCM framing in `encryptFile` sound for multi-GB archives?

## Addendum 6 (2026-11-16): the IT site shows the password itself

The owner reversed the one-way passwords: they stay encrypted
(`PASSWORD_ENC_KEY_HEX`, AES-GCM, as before this batch), and the IT
«عرض كلمة المرور» button shows the password itself.

- Reverted to HEAD: `passwordCrypto.js` (no `hashPassword`),
  `User.model.js`, `It.auth.js`, `scripts/systemRecover.js`; in
  `User.controller.js` the sign-in check (bcrypt upgraded to `enc.`) and the
  reset/change/recover writes. `hashStoredPasswords` and its start-up call
  are gone.
- `users.passwords` is back (tree, itKeys, label; generated copies synced).
- `GET /it/users/:tz/password` (`users.passwords`, `canManageTarget`)
  answers `{ ok, hasPassword, password }`: the decrypted value, or `null`
  for an old bcrypt hash (readable after the next sign-in or a reset) or none.
  Each view that returns a password writes an audit row
  (`users`/`password_view`, no value; label «عرض كلمة المرور» on the IT log).
- IT `UserPage.jsx`: the button shows the value (`.shown-password`), a hide
  button, and a note that every view is logged.
- Tests: `login-security` (value returned + audit row; bcrypt/none give
  `null` and no row), `login-lockout` (bcrypt becomes `enc.` at sign-in),
  `it-api`, `route-guards`, `permissions`, IT `UserPage.test.js`; the
  others restored to HEAD. Server 1,696 pass, IT 119 pass and builds, System
  user/permission tests 45 pass.

Questions: should `password_view` also reach the sensitive-views log planned
in item 13? Anything the audit row should carry besides actor and target?

## Addendum 7 (2026-11-16): group A, the rest (items 11, 13, 14, 15, 16)

**Recycle bin (item 11).** `services/recycleBin.js` + `Entities/Trash/`
(collection `RecycleBin`). A delete of a student (`deleteS`), vehicle
(`Vehicle.remove`) or staff member (`deleteU`) first `put`s the whole record
(plus extras: the student's consents, the vehicle's own log, the user's room),
then deletes it from its collection; if the delete loses the version race the
bin row is dropped. Answers carry `trashId`. Files stay until the purge: the
student's photo, the vehicle's Drive documents and plate folder (the folder is
kept if another vehicle now has the plate; nothing is purged if the record is
back). Restore puts the record back with the same `_id` (409 if the tz/plate
is taken meanwhile; a user is restored to its room with every `refresh*`
field removed). Per-kind steps live in each controller's `trashHooks`.
`/api/trash` (GET, POST /:id/restore, DELETE /:id): any of the three delete
keys opens it, the controller acts only on kinds whose key the actor holds;
users hidden by `hiddenFrom`/`canManageTarget` never show. Restore and purge
write `restore`/`purge` audit rows. A daily job purges rows older than 30
days; a row whose files fail stays for the next day. Vehicle delete no longer
needs the typed plate.

System site: no confirm dialog before delete; the toast offers «تراجع» for 8
s (`utils/undoDelete.js`), restoring through the bin. New page `/trash`
«سلة المحذوفات» (menu, `routeAccess` any delete key): restore, and «حذف
نهائي» with a confirm. The guided tour no longer clicks the student delete
button (it would now really delete); the vehicle guide text is updated.

**Sensitive views (item 13).** `utils/sensitiveViews.js`, collection
`SensitiveViews`, TTL 365 days on `at`. `getOneS` records a look when the
student carries a filled `health_status`, `father_phone` or
`mother_phone`; `getConsent` records `signature` when one exists. One row per
person+student+fields per 10 minutes (in memory); no values stored; never
throws. IT: `GET /it/sensitive-views` (`audit.view`), screen «سجل الاطلاع».
Not covered: list endpoints (`getAllS`) that may also carry phones (item 26
narrows who gets them).

**Error collection (item 14).** Existing: errors kept 2 minutes in memory for
the report button. Added `utils/errorLog.js` (collection `ErrorLog`, TTL 90
days): `recentErrors` hands every 5xx to it (no actor, no query; ids in the
path become `:id`), at most 300 rows an hour. `GET /it/error-summary`
(`permissions.manage`) groups the last 7 days; shown as «ملخص الأخطاء» above
the reports on the IT site.

**npm audit (item 15) and emergency document (item 16).** `docs/EMERGENCY.md`
(Hebrew): where everything is, what to do when the site is down, sign-in
fails, an alert shows, the server is lost or something was deleted; a monthly
check including `npm audit --omit=dev`; and the list of what the offline
«דף הסודות» must hold. No secrets.

Tests: server 1,712 pass (new: recycle-bin, sensitive-views, error-log;
updated: photo-storage, vehicle-controller, user-delete and the stubs of the
controllers' vm loaders), System 1,322 pass, IT 123 pass; both sites build.
Not run against a real MongoDB, Drive or browser.

Questions: is a snapshot-and-delete bin (rather than a `deletedAt` flag) safe
for references to the deleted `_id` (lessons, attendance, guides) during the
30 days? Should restoring a student re-check scope? Is the 10-minute in-memory
de-duplication of views acceptable with one server process?

## Addendum 8 (2026-11-17): the confirm dialog stays, with the undo after it

Owner: «אני רוצה עניין שאלה לפני מחיקה וגם עניין הביטול». Deleting a
student, a staff member or a vehicle asks first again, then moves the record
to «سلة المحذوفات» and offers «تراجع» for 8 seconds.

- `confirmBus.js`: new `trash` preset (says the record goes to the bin for 30
  days and can be restored; the old `delete` preset says it cannot be undone).
- `deleteS` / `deleteU`: `confirm` defaults to `true` again and use `trash`;
  a rejected `ask` counts as cancel.
- `EditVehicle.jsx`: `removeVehicle` asks `trash` first (still no typed plate).
- Guided tour (`journey/chapters/students.js`): the click on «حذف» and the
  `confirm-cancel` step are back, so the tour opens the question and cancels.
- `guide/guideContent.js`: vehicle text says "after confirming".
- New `WebServer/services/deleteAsks.test.js`.

Tests: System 1,326 pass; build compiled. Not checked in a browser.

## Addendum 9 (2026-11-17): group B, first batch (items 17, 18, 20, 21, 24, 32)

- **17, «إرسال بواتساب».** `utils/whatsApp.js` builds `https://wa.me/?text=`
  with the message and the link, no phone number; opened with
  `noopener,noreferrer`. Button next to «نسخ» in `ParentLinkPanel.jsx`
  (registration link) and next to «نسخ الرابط» in `ConsentView.jsx` (one
  student's signing link).
- **18, notices trash 14 days.** `TRASH_KEEP_MS` in `Notice.service.js` and
  the three texts in `NoticesBoard.jsx`. Notices already in the trash keep the
  purge date they got (up to 30 days).
- **20, «لا برامج اليوم».** `RoomsLayout.jsx`: a day with no lessons at all
  shows it, with «البرنامج القادم: غدًا / يوم X» when there is one;
  `DisplayPage.jsx` keeps today's title and date then. After today's last
  lesson the board still moves to the next day. The week layout is unchanged.
- **21, my tasks first.** `WeeklyTasksCard.jsx` (already first on the
  dashboard) lists the open tasks by name, at most five, «و N أخرى».
- **24, graduates.** New grade «خريج» after «ثاني عشر» (server and client
  lists). The July 1st promotion moves «ثاني عشر» to «خريج» with
  `graduationYear`; choosing «خريج» by hand sets this year (Israel time),
  another class clears it (`graduationPatch`, used in `postS` and `updateS`).
  The student page shows «خريج · 2027». Owner, 2026-11-17: graduates are
  listed like everyone else (no hiding, no extra checkbox; the grade filter
  already offers «خريج»), and they stay in every program and sport list until
  someone removes them by hand.
- **32, stay signed in.** Already the code default since 2026-11-01 (refresh
  token a year, renewed on every visit). `.env.example` had an outdated note
  and `JWT_REFRESH_TTL_SEC=2592000`; the line is now commented out. The
  server's own `.env` must not set it (owner step). The IT site keeps 12 hours.

Tests: server 1,713 pass, System 1,333 pass; System build compiled. Not
checked in a browser, on a TV or on the server.

Question: is a
parent able to pick «خريج» on the public registration form a problem?

## Addendum 10 (2026-11-17): group B second batch

Owner decisions, from `docs/OWNER_DECISIONS_2026-11-16.md` group B.

- **19, weekly tasks left at the week's end.** The guide already got
  `weekly_tasks_overdue`. New `weekly_tasks_overdue_staff` (with the guide's
  name) goes, from the same `closeLastWeek` step, to `tasks.viewAll` holders
  and to `tasks.manage` holders with `tasks.create` or `tasks.edit`, never to
  the guide himself (`alertEvents.weeklyTasksOverdueStaff`, `alertAccess`,
  `alertTemplates`). Dedup per guide and week.
- **23, phone push.** `PUSHED_TYPES` (`alertEngine.js`) now also has
  `parent_registration`, `user_waiting`, `weekly_tasks_overdue`,
  `weekly_tasks_overdue_staff` and the new `lesson_attendance_reminder`:
  `alertJob.remindAttendanceDuringLessons` reminds a lesson's teacher and
  helper in the first 15-minute slot after it starts, when it has
  participants and no attendance yet, once a day. Removed with the lesson
  (`alertRetention.recordPrefixes`). Push only reaches who turned it on.
- **25, PDF copy of the signature.** After a parent signs (the consent link
  page and the registration form), «تنزيل نسخة PDF» builds the copy in the
  browser from what was just sent: rules text, signer, date, rules version,
  signature (`exportConsentPdf`, `ConsentCopyButton`, PDF code loaded on the
  click only). Nothing new is fetched from the server.
- **28, A4 print.** «طباعة البرنامج» on the week's program (as filtered) and
  «طباعة قائمة الطلاب» on a program page, through a new `exportTablePdf`
  (24 rows a page, header on each page). Rows come from `utils/printLists.js`;
  the student list has #, name, class, school only (no phones, no ID).
- **29, Excel for managers with audit.** New `/api/exports`
  (`Export.route.js` + `Export.controller.js`): `POST /log` writes an
  `export_excel` audit row before the browser makes a students
  (`students.viewAll`) or staff (`users.view`) file; `GET /programs?month=`
  (`lessons.viewAll` and `attendance.view`) returns a per-lesson month summary
  and logs it. The students «تصدير Excel» now shows only to
  `students.viewAll`; staff list and «ملخص الشهر Excel» are new. IT label
  `export_excel` added. The lesson attendance and sport players exports are
  unchanged (not in the decision).
- **31, smaller pictures in «الملفات».** `utils/imageShrink.js`: a JPEG, PNG
  or WebP over 1 MB is redrawn as a JPEG (2400 → 1280 px steps) until about
  1 MB; GIFs, other files, unreadable pictures and results that are not
  smaller go as they are. «الصور بالجودة الأصلية» next to the upload button
  turns it off.
- **27 and 30** already existed (queued attendance offline; «ما الجديد» at
  startup after a release). **26:** the owner chose to keep it as it is
  (whoever sees the student sees the parents' phones and address).

Tests: server 1,719 pass, System 1,340 pass, IT 123 pass; System build
compiled. Not checked in a browser, on a phone or on the server.

Please check: the overdue staff recipients rule, the reminder window and
its dedup across processes, `POST /log` being callable without making a
file (it only adds a row), and the month summary's dateKey range (day 31 for
every month).

**Same day, owner's follow-up:** every alert type now pushes ("and everything": vehicles to `vehicles.view` holders as before, missing report, access changed, tasks, IT alerts). `PUSHED_TYPES` is gone from `alertEngine.js`; `alert-push.test.js` checks the other types push. The 15-minute reminder window is confirmed. Server 1,719 pass. Please also check: whether any type now pushes to someone who should not get it on the phone.

## Addendum 11 (2026-11-17): group B end and group C

- **22.** Nothing to build: `absence_streak` already reaches `students.viewAll` holders (managers) through the `scopeOfStudent` rule, besides the responsible guide and the lessons' teacher/helper; now pushed too (addendum 10 follow-up).
- **17 fix.** The «إرسال بواتساب» button of addendum 9 was put in `ParentLinkPanel.jsx`, which nothing renders. It is now in `CopyParentLink.jsx` (dashboard and students list), next to the copy button; test added.
- **33.** `docs/DEAD_CODE_2026-11-17.md`: files no other file loads, for the owner to approve. Nothing deleted.
- **34.** Dark mode stays (owner).
- **35.** «حجم الخط» on the profile (`TextSizeChoice.jsx`, `utils/textSize.js`): normal / large (x1.125) / extra large (x1.25), per device in `localStorage` `ui.textSize`. It scales the `--fs-*` tokens and the root font size on `<html>`; applied at start in `index.js`, not on the wall display. CSS `zoom` was tried first and overflowed on a phone, so it is not used. Hard-coded pixel font sizes in some modules do not grow.
- **36.** Not changed: the System already uses the association teal/orange and the logo in the header. Waiting for the owner.
- **37.** `eslint-plugin-jsx-a11y` (recommended) over `apps/system/src`: form labels tied to their fields (`htmlFor`/`id`) in the student, user, profile and report forms and the week view selects; the attendance note input gets `aria-label`; `utils/keyActivate.js` gives Enter/Space to clickable non-buttons (week lesson blocks, the upload label, the report tag options). New public `/accessibility` statement (`AccessibilityPage.jsx`, `utils/accessibilityContent.js`), linked from the sign-in page; the coordinator's name and phone are empty until the owner gives them (e-mail = the privacy contact). Remaining lint findings are dialog backdrops (click outside to close, Esc works), dialog `autoFocus`, and labels over buttons/pickers.
- **38.** Synthetic local preview at 375 px: dashboard, students, staff, lessons, reports, profile, files, notices, weekly tasks, vehicles, a student page and the statement; only the profile scrolled sideways (password field `min-width`), fixed. With «كبير جدًا» none of them scrolls sideways.
- `RequiredMark.test.js` reads the user form source; it now allows `htmlFor`. `FilesPage.test.js` waits for the async upload (item 31) instead of one tick.

Tests: System 1,348 pass; server unchanged since addendum 10 (1,719). System build compiled. Not checked on a real phone or with a screen reader.

Please check: the label/id pairs are unique on each page, `asButton` on the lesson block next to its drag and tooltip, the text-size token override against `shared/tokens.css`, and the statement wording.

### Addendum 11 follow-up (2026-11-17)

- **33.** Owner approved: deleted `ParentLinkPanel.jsx` + `.module.css`, `Calendar/Calendar.jsx` + `.module.css`, `Provides/ConfirmBridge.jsx`, `Provides/pricing.js`, `server/Entities/Storage/Storage.service.js`, `server/middleware/globalFunc.js`, `server/middleware/onlyofficeJwt.js`, `server/utils/tokenResponse.js`. A repo search found no other file naming them. The four manual scripts (`seedSportDemo`, `seedTestData`, `checkReportPdf`, `reorganizeDrive`) stay.
- **36.** Owner: no change.

Tests: System 1,348 pass, build compiled; server 1,719 pass.

Please check: nothing loads the deleted files by a dynamic path.

- **37 (2026-11-18).** The owner gave the accessibility coordinator name and phone; `accessibilityContent.js` holds them, the phone link dials digits only and shows left-to-right; test added.

## Addendum 12 (2026-11-18): fixes for the Codex review of addenda 1-11

Owner: fix all twelve findings, with separate keys for permanent delete and Excel export.

- **P1 export kind.** `Export.controller.js`: only own keys of `KINDS` (`Object.hasOwn`); `log` is wrapped in try/catch. Test: `constructor`, `__proto__`, `toString`, `hasOwnProperty`, `programs` all answer 400.
- **P1 trash scope.** `Trash.controller.js` awaits an async `visible` hook. `Student.controller.js` `trashHooks.visible`: `students.viewAll`, or the copy's `main_teacher` is the actor, or the id is in `visibleStudentIds` (lessons still list a deleted student); memoized on `req` for one list. Tests in `recycle-bin.test.js` and `photo-storage.test.js`.
- **P2 consent.** Delete: a failed consent read answers 503 `CONSENT_COPY_FAILED` before anything is put in the bin or deleted. Restore: every consent is created or the created ones and the student are removed again and the hook answers 503 `CONSENT_RESTORE_FAILED` (the bin row stays). Tests in `photo-storage.test.js`; `student-scope-routes.test.js` now stubs `Rules.model`.
- **P2 separate keys.** `shared/permissions.json`: `students.purge`, `vehicles.purge`, `users.purge`, `students.exportExcel`, `users.exportExcel`, `lessons.exportExcel` (labels added; generated copies synced). The admin role default gets them (module keys for students/vehicles/lessons; `users.purge`/`users.exportExcel` added to the list). Trash purge needs the kind's purge key (route needs any purge key; controller 403 otherwise); the list sends `canPurge` per row and `TrashPage` shows «حذف نهائي» only then. Exports need the kind's `exportExcel` key; the three buttons are gated the same. **A role whose defaults IT replaced on the IT site does not get the new keys until IT adds them.**
- **P2 audit gate.** `utils/audit.js` `record` now answers whether the row was written; new `recordRequired`. Export (`log`, `programs`) and `viewPassword` answer 503 `AUDIT_FAILED` without the file/password when it is false. Tests in `export-route.test.js`, `login-security.test.js`; `auditStub` has `recordRequired`.
- **P2 push.** `alertEngine.raise` pushes only to created recipients who pass `canSeeAlertType` now (actor built like `loadActor`). Tests in `alert-push.test.js` (revoked `tasks.view`, inactive user); the existing push tests now list their users.
- **P2 late reminder.** `alertJob`: 21:00-22:00 runs `lesson_attendance_reminder` only (no other check, no cleanup). Test at 21:15.
- **P2 PDFs.** `rulesParts` cuts a line longer than 1,400 characters at a space (or at 1,400). `exportTablePdf` measures each row and the room under the header on the first and later pages, and packs rows by height (`packRows`, 24 per page only when nothing measures). New `pagination.test.js`.
- **P2 registration PDF wording.** Footer now «نسخة من الموافقة والتوقيع كما أُرسلت إلى جمعية تمهيد» (what was sent, not a claim it was stored).
- **P3 graduate.** Public registration adds `graduationPatch(layer, {}, now)`. Test in `parent-registration.test.js` (trailing blank line removed).
- **P3 text size.** `clearStorageKeepingTextSize()` in `utils/textSize.js` replaces `localStorage.clear()` in sign-out (`fuctionsAuth.jsx`), `accessScheduler.js` (2) and `logoutScheduler.js`. Test added.
- **P3 statement.** Parent fields in `EditStudent.jsx` get `aria-label` (name, phone, work for each parent); the statement now names the forms covered.

Tests: server 1,731 pass; System 1,356 pass; IT 123 pass; System and IT builds compiled. Not checked in a browser, on a phone, with a screen reader, or against a real database.

Please check: the async `visible` hook for users/vehicles (sync hooks still work), the restore rollback order, `mayRead` against `loadActor`, and the row packing on a real long table.

## Addendum 13 (2026-11-18): fixes for the Codex re-review of addendum 12

Owner: fix all four.

- **P2 restore rollback.** `Student.controller.js` `trashHooks.restore`: the signatures are written first and the student last, so a student is never live without its signature. A signature already there from an earlier attempt (duplicate key on the one-per-student index) counts as back, so a retry works even when an undo failed. A failed student write takes this attempt's signatures back out. `purge` also deletes any signature left for a student that is not back. Tests in `photo-storage.test.js` (double failure then retry; failed student write; purge).
- **P2 locked push.** `alertEngine.mayRead` applies `isLocked(user, { isSystem: realSystem })` like `loadActor`. Test in `alert-push.test.js` (locked manager and locked IT user get no push).
- **P2 rules by height.** New `splitTallSections(sections, measure, maxHeight)` in `ExportPDF.jsx`; `exportCardPdf` runs it with the measured section height against the smaller of the two page budgets before paging. A too-tall section is cut between rows, then a single text row by its lines, then a too-tall line by its words; continuation titles get «(تابع)» once. `rulesParts` stays as a first cut.
- **P2 tall table rows.** `packRows` leaves the first page to the title when the first row fits only a later page. `exportTablePdf` cuts a row taller than a later page into several rows (`splitRow`: every cell cut to the same piece size, so short cells stay whole) and measures again (up to 3 rounds).
- New tests in `pagination.test.js` (100 short lines, many rows, title-only first page, row cut).

Not checked in a real browser: the measured split and the cut rows were tested with fake heights only.

Please check: the restore order against concurrent signing (links are deleted with the student), the purge of leftover signatures, and the measured split in a real browser.

## Addendum 14 (2026-11-18): fixes for the Codex second re-review of addendum 13

Owner: fix all four.

- **P2 concurrent restore.** `trashHooks.restore`: when the student write fails, this attempt's signatures are taken back out only when a read confirms no live student with that `_id`; when the read shows the student (another restore won) or fails, they stay (a leftover is harmless; the purge removes it). Test: the loser of a duplicate-key race keeps the winner's signature.
- **P2 purge lookup.** `trashHooks.purge`: a failed or unsuccessful student read answers `{ failed: 1 }`, so nothing is removed (signature or photo) and the bin row stays for another try (the route answers 502 FILES_LEFT, the daily job retries tomorrow). Test added.
- **P3/P2 one long word.** `splitTallSections`: a word that does not fit alone is cut by characters (`cutToFit`, the longest start that fits, found by halving). Test: 1,400 characters with no spaces.
- **P2 dropped rows.** New `fitRows(rows, measure, maxRounds = 4)` replaces the loop in `exportTablePdf`: it measures again after every cut, so the heights always belong to the rows packed, and stops when a round cuts nothing more. Tests: every row kept across several rounds; an uncuttable row stops the rounds.

Not checked in a real browser (fake heights only).

## Addendum 15 (2026-11-18): fix for the Codex third re-review of addendum 14

Owner: fix it, as Codex suggested.

- **P2 restore race.** `trashHooks.restore` no longer takes a written signature back out on any failure (signature write or student write): another restore at the same moment may have adopted it. A leftover is shown nowhere while the student is missing; the next restore adopts it (duplicate key on the one-per-student index) and the purge removes it. Tests in `photo-storage.test.js` updated (no deletes on failure) and one added (a failing restore deletes nothing; the next one succeeds and the student keeps its signature).

Server 1,738 pass.
