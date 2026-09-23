# Review log

## 2026-09-14: Initial stability and shared workflow

**Owner request:** Codex and Claude Code should communicate and work together
on a stable Tamheed system.

**Implementation:** Codex coordinated separate file owners. One internal agent
fixed refresh-cookie deletion; another fixed self-edit authorization; Codex
fixed ordinary permission-denial logout and added refresh request timeouts.
An internal reviewer checked the combined authorization and client changes and
reported no actionable introduced regression. This is not Claude review.

**Changes:**

- Self-edit accepts only profile fields for non-administrators and targets the
  active account. Account roles, storage authority, identity and authentication
  metadata cannot be overwritten through the self-edit payload. Administrator
  management behavior is preserved.
- Ordinary `403/FORBIDDEN` responses reject the request without clearing the
  session. Explicit `BLOCKED` responses still reset it.
- All four raw Axios refresh call sites have a 15-second timeout.
- Logout expires the same production-domain refresh cookie created at login.
- Root test/verification scripts and CI run the new regression suites.
- `AGENTS.md` and `CLAUDE.md` point to the shared collaboration procedure.

**Verification:** `npm run verify` passed: 12 server tests, 4 client tests, and
the optimized client build. All 58 server JavaScript files passed `node
--check`; `git diff --check` passed. Client build emitted pre-existing
Browserslist-data and Node deprecation warnings. No production service, real
database, or external storage/email integration was exercised. Timeout tests
check configuration and error handling without real network traffic.

**Claude connection:** Installed CLI version 2.1.258; authentication status
reported logged in. The restricted review invocation returned no response and
was stopped. The network-enabled invocation was rejected before execution by
automatic approval review because it would send internal repository code to
Claude's external service without payload-specific authorization. No Claude
review or agreement has been obtained. No bypass was attempted.

**Pending approval:** `docs/claude-review-request.md` contains the exact proposed
review payload: selected code/configuration diffs and the new regression tests.
It excludes environment files, credentials, runtime logs and real user data.
Ask the owner to authorize sending relevant Tamheed source to Claude via their
Claude account for shared reviews, starting with this prepared payload. Record
the owner's actual answer here before sending; authorization persists for its
stated scope.

**Next exchange after approval:** Send the prepared payload to actual Claude
Code in a dedicated read-only review invocation. Record its response, address
concrete findings, rerun relevant verification and send changed logic back when
needed. Cross-caller refresh coordination and API-initialization ordering remain
areas for further review; a fully stable production system is not yet certified.

**Delivery state:** Local changes only; no commit, push, deployment or unattended
monitor was started.

## 2026-09-20: Storage upload filename encoding and multi-page file viewing

**Owner request:** Two Google Drive-backed storage bugs reported directly by
the owner: (1) uploading a file to Storage replaces the original name with a
garbled name; (2) opening a file for viewing returns an
`https://lh3.googleusercontent.com/d/<id>` link that is treated as a single
image, so a multi-page file (PDF, Office document) cannot be paged through.

**Implementation (actual Claude Code, no Codex subagent):** Investigated the
upload and open-file code paths in
[server/Entities/Storage/Storage.controller.js](../server/Entities/Storage/Storage.controller.js),
[server/Entities/Storage/CentralStorageBackend.route.js](../server/Entities/Storage/CentralStorageBackend.route.js),
and [server/services/googleDrive.service.js](../server/services/googleDrive.service.js).
Reproduced the filename bug locally with a direct `busboy` multipart parse of
a Hebrew filename before implementing a fix, confirming the existing
`repairMisencodedText` helper (`server/utils/textEncoding.js`, already used
for legacy role-text mojibake) reverses it correctly.

**Changes:**

- Root cause 1: `multer`/`busboy` decode the multipart `filename=` header
  parameter as Latin-1 by default, so any non-ASCII original filename
  (Hebrew/Arabic, etc.) arrives mojibake'd. The upload request hops through
  two separate multer parses (client to `Storage.controller.js`, then
  `Storage.controller.js` to `CentralStorageBackend.route.js`), so both hops
  needed the fix. `req.file.originalname` is now repaired with
  `repairMisencodedText` immediately after each multer parse, before the name
  is normalized, stored, or forwarded.
- Root cause 2: the signed "open file" route
  (`CentralStorageBackend.route.js` `GET /file/:name`) always redirected to
  `googleDrive.toViewUrl()`, Google's `lh3.googleusercontent.com` thumbnail
  CDN, which only ever renders one flattened preview image and ignores the
  `download` flag entirely. First attempt streamed the real file bytes
  through this server instead; the owner asked to keep opening routed
  through Drive itself rather than proxying bytes through Tamheed's server.
  Replaced that with `googleDrive.toDriveViewUrl(fileId)` /
  `toDriveDownloadUrl(fileId)` (`https://drive.google.com/file/d/<id>/view`
  and `https://drive.google.com/uc?export=download&id=<id>`) and the route
  now redirects there based on the signed token's `download` flag. Drive's
  own viewer already paginates multi-page PDFs/Office docs and its download
  link serves the real bytes, so no server-side streaming code was needed.
  `toViewUrl` (the `lh3` thumbnail) is left in place for the unrelated
  `<img>`-src use (profile photo `secure_url`) and other existing callers
  (list thumbnails, upload/rename metadata `url`) — out of scope here.

**Verification:** `npm run verify` passed after the streaming attempt (12
server tests, 4 client tests, client production build); `npm test --prefix
server` (12 tests) plus `node --check` on the two touched files passed again
after switching to the Drive-redirect approach. The Hebrew-filename mojibake
fix was verified directly against `busboy` (the library `multer` uses) with
a synthetic multipart request before and after the fix. No production
Google Drive account, real user upload, or browser PDF viewer was
exercised — this is local code and regression-suite verification only.

**Codex connection:** No Codex CLI session is reachable from this machine
right now (`codex` is not on `PATH` in this session; no peer session is
registered either). No review request has been sent and no Codex response
has been received or claimed. Changed files are listed above for whenever a
live Codex session is available.

**Pending review:** Codex review of the changed files above (filename
repair at both multer hops; redirecting to Drive's own view/download links
instead of the `lh3` thumbnail CDN) is outstanding. Ask the owner to run
Codex on this branch, or to confirm a channel to reach the running Codex
session, so the review can actually happen.

**Delivery state:** Local changes only; no commit, push, deployment, or
unattended monitor was started.

## 2026-09-20: Report permissions for guide/assistant roles

**Owner request:** Reported directly by the owner, in two parts, and
confirmed with browser screenshots (role "مرشد" opening `/reports/new`,
DevTools Network tab showing `GET /user/` returning 403): (1) it looks like
only admin can add/edit a report - a guide gets a "خلل في جلب البيانات"
(data fetch error) instead of the form; (2) a guide or assistant should only
be able to see their own report, not everyone's. Owner also asked (via a
clarifying question this session asked back) to additionally grant "مساعد"
the same create/edit permission "مرشد" already had, on top of the
own-report-only view restriction.

**Implementation (actual Claude Code, no Codex subagent):** Root-caused
bug (1) before writing any fix: `Report.route.js` already allowed `مرشد` to
POST/PUT reports server-side. The screenshots' failing `GET /user/` request
is [EditReport.jsx](../client/src/Components/Report/EditReport.jsx)'s
`getUsers()`, called unconditionally in a `useEffect` to populate an
admin-only "attendance" field (`{isAdmin && ...}`) - for any non-admin role
it always 403s against the admin-only `GET /user/` route, and the
component's catch block turns that into a blocking `err` state that hides
the entire form. Bug (2) was a gap, not a regression: `getAll`/`getById`/
`put` had no ownership check at all; `ViewAllReport.jsx`'s heading already
said "قائمة تقاريري" ("my reports") for non-admins without the data ever
being scoped that way.

**Changes:**

- [Report.route.js](../server/Entities/Report/Report.route.js): added
  `مساعد` to the roles allowed to POST/PUT a report (DELETE stays
  admin-only, unchanged - not requested).
- [Report.controller.js](../server/Entities/Report/Report.controller.js):
  added `isAdminUser`/`isReportOwner` helpers (role check uses the same
  `repairMisencodedText` mojibake-repair convention as
  `authMiddleware.js`/`Storage.controller.js`). `getAll` now filters to the
  caller's own reports for non-admins; `getById` and `put` now 403 a
  non-admin who isn't the report's owner. `post` no longer trusts a
  client-supplied `createdBy` (the client always sent
  `localStorage.user_id`, unenforced) - it's now always the authenticated
  caller's `id`/`tz`, which is what makes the ownership checks above
  trustworthy rather than a client-side illusion.
- [EditReport.jsx](../client/src/Components/Report/EditReport.jsx): the
  `getUsers()` call now only runs `if (isAdmin)`, matching where its result
  is actually used - this is the fix for bug (1).
- New `server/test/report-authorization.test.js` (same
  load-the-real-controller-in-a-vm pattern as
  `user-profile-authorization.test.js`): admin sees/edits every report;
  guide/assistant see and can edit only their own; a non-owner GET-by-id/PUT
  gets 403; `post` ignores a spoofed `createdBy`.

**Follow-up same day:** Owner reported the report list's "صاحب التقرير"
(report owner) column was blank. Cause: `ViewAllReport.jsx` still called
the same admin-only `GET /user/` (via `getUsers()`) unconditionally to
resolve owner display names, which 403s for a guide/assistant and was
already tolerated as a soft failure (empty `usersById`) rather than a
blocking error - so the column silently stayed empty instead of the page
breaking. Since `getAll` now scopes a non-admin to only their own reports,
[ViewAllReport.jsx](../client/src/Components/Report/ViewAllReport.jsx)
was changed to call the self-accessible `getMe()` (`POST /auth/me`,
already used by `Header.jsx`, allowed for any authenticated role) instead
of the admin-only user list when `!isAdmin`, building a one-entry owner
lookup from the caller's own profile. Admin view is unchanged (still uses
the full user list, since an admin can see reports from many owners).

**Verification:** `npm run verify` passed: 16 server tests (12 existing + 4
new), 4 client tests, client production build. `node --check` passed for
every server `.js` file. Not independently re-verified against the owner's
live `localhost:3000` session that produced the original screenshots - the
owner is asked to confirm the guide/assistant flow there.

**Codex connection:** No Codex CLI session is reachable from this machine
right now (`codex` is not on `PATH` in this session; no peer session is
registered either). No review request has been sent and no Codex response
has been received or claimed.

**Pending review:** Codex review of the five changed/added files above
(role addition; ownership enforcement in the report controller;
client-side conditional fetch in `EditReport.jsx` and `ViewAllReport.jsx`;
new permission tests) is outstanding, same constraint as the storage/Drive
entry above.

**Second follow-up same day:** Owner asked for the report list's "تاريخ"
column to show the date and time of creation, not just the date. Traced
the data model first: `Report.controller.js`'s `post` already defaults
`date` to `new Date()` when the client sends none (there is no date input
in `EditReport.jsx`'s form), and `put` only touches `date` if the client
explicitly sends one - since the edit form round-trips the original loaded
value unchanged, `report.date` already reliably holds the creation instant
across edits. The only gap was display: `formatDate()` in
[ViewAllReport.jsx](../client/src/Components/Report/ViewAllReport.jsx)
called `toLocaleDateString` only, discarding the time of day. Added the
time (`toLocaleTimeString`, `en-GB`, `HH:mm`) alongside the date there, and
did the same for the equivalent `dateLabel` in
[ExportPDF.jsx](../client/src/Components/Report/ExportPDF.jsx) for
consistency with the PDF export. No server or data-model change needed.

**Verification:** `npm run verify` passed again (16 server tests, 4 client
tests, client production build).

**Third follow-up same day:** Owner sent screenshots of the exported PDF
and asked to remove the "تاريخ التقرير"/"أُعِدّ بواسطة" chips from the top of
the first page and instead show creation date+time and the report's
author in the footer (which previously only showed the association name,
page number, and the PDF-generation timestamp - a different, less useful
moment than the report's actual creation time).
[ExportPDF.jsx](../client/src/Components/Report/ExportPDF.jsx): removed
the header `.meta-strip` (and its now-unused CSS) from `firstPageBodyHtml`;
`footerHtml` now takes `(pageNum, totalPages, dateLabel, authorLabel)` and
renders all four on every page's footer instead of the old generation
timestamp; removed the now-dead `now`/`generatedAt` variables. The
auto-pagination budget measurement (`measurePageBudget`) already
re-measures the real rendered DOM per report, so it adapts automatically
to the footer's new (slightly taller, 4-item) row without any manual
constant changes.

**Verification:** `npm run verify` passed again (16 server tests, 4 client
tests, client production build). Not visually verified against a real
rendered PDF in this session (no logged-in session/report data available
here to trigger `exportReportPdf` end-to-end) - verified by code review and
a successful production build only. Owner should re-export a report PDF to
confirm the new layout looks right.

**Delivery state:** Local changes only; no commit, push, deployment, or
unattended monitor was started.

## 2026-09-20: Dashboard "0 users" - API base URL startup race

**Owner request:** Sent screenshots showing the users list with 3 active
users, immediately followed by the dashboard's "المستخدمون" (users) stat
card reading 0, with a bare "???" - no further description.

**Investigation (actual Claude Code, no Codex subagent, live reproduction
against the owner's own running dev server):** Code review alone did not
explain it - `Dashboard.jsx`'s fetch logic looked correct, and a fresh
login + normal navigation didn't reproduce a "0" on the first few tries.
Given this machine can reach the same `localhost:3000`/`:5000` the owner's
browser uses, logged in through the browser pane with the seeded
`scripts/ensureSystemAdmin.js` bootstrap account (tz `000000000`, password
`123`, an intentional local-dev account already in the codebase) and
captured the actual network trace on a fresh page load. That surfaced the
real bug: on load, [index.js](../client/src/index.js) fires `initApiBase()`
(an async probe that finds the real API server - see
[apiBase.js](../client/src/WebServer/services/apiBase.js) - and only then
sets `api.defaults.baseURL`) without awaiting it before `root.render(...)`.
Every component that fetches on mount (`Header.jsx`'s `getMe()`,
`Dashboard.jsx`'s five parallel fetches, etc.) can therefore fire before
that probe resolves, going out with no `baseURL` set - which axios then
resolves against the page's own origin. Captured trace before the fix:
`POST http://localhost:3000/auth/me → 404`,
`GET http://localhost:3000/user/ → 404`, same for student/lesson/report,
all against the dev server itself, not the API - followed moments later by
the same calls succeeding against `http://localhost:5000/api/...` once the
probe caught up. Since these are 404s, not `401 TOKEN_EXPIRED`, the
axios interceptor's refresh-and-retry logic never touches them - they just
fail and resolve as `{ok:false}`, and (before this session's other fix
below) Dashboard rendered that as a plain "0" indistinguishable from a
real empty system.

**Changes:**

- [index.js](../client/src/index.js): `root.render(...)` now happens
  inside `initApiBase().catch(...).finally(...)` instead of firing
  immediately after an un-awaited `initApiBase()` call - nothing mounts,
  and therefore nothing fetches, until the real API origin is known.
  Verified live: reloading `/dashboard` against the owner's dev server no
  longer produces any `localhost:3000/...` (wrong-origin) requests: every
  request goes straight to `localhost:5000/api/...`, and the users card
  correctly reads 3.
- [Dashboard.jsx](../client/src/Components/Dashboard/Dashboard.jsx) /
  [Dashboard.module.css](../client/src/Components/Dashboard/Dashboard.module.css):
  independently of the race above, none of the four stat cards could ever
  distinguish "loaded, genuinely zero" from "the fetch failed" - a defensive
  fix in its own right, since the startup race isn't the only way a fetch
  can fail. Added `loadFailed` tracking; a failed section now shows "-"
  with a "تعذر تحميل هذه البيانات" hint in danger styling instead of a
  bare, indistinguishable "0".

**Verification:** `npm run verify` passed (16 server tests, 4 client
tests, client production build). Live-verified end to end against the
owner's actual running dev server and seeded data (not just a code
review or a clean build) - reproduced the wrong-origin 404 burst before
the fix, confirmed it is gone and the dashboard reads correctly after.

**Delivery state:** Local changes only; no commit, push, deployment, or
unattended monitor was started.

## 2026-09-20: Dashboard users count excludes the bootstrap admin and self

**Owner request:** Confirmed the report-owner column already worked for
admins (verified live in the previous entry), then separately asked that
the dashboard's "المستخدمون" stat exclude the system-admin bootstrap
account (tz `000000000`) and the currently logged-in viewer, with a
screenshot showing "3" for that card.

**Implementation:** [Dashboard.jsx](../client/src/Components/Dashboard/Dashboard.jsx)
now filters the fetched user list once, right where it lands in state -
excluding `tz === "000000000"` (the account
`server/scripts/ensureSystemAdmin.js` bootstraps; matches the same default
tz that script falls back to) and excluding `_id === getStoredUserId()`
(the same self-exclusion `ViewAllUser.jsx` already does for its own list).
Every stat and panel that reads from that state (المستخدمون, بانتظار
الموافقة count and list) picks this up automatically from the one filter
rather than needing separate changes.

**Verification:** `npm run verify` passed (16 server tests, 4 client
tests, client production build). Live-verified against the owner's actual
dev server, logged in as the same bootstrap admin used in the earlier
entries: "المستخدمون" changed from 3 to 2 (the two مرشد accounts), i.e.
excludes System Admin correctly (it is simultaneously the bootstrap tz and
the current viewer here, so this run only exercises one exclusion branch
directly - the other follows from identical logic).

**Delivery state:** Local changes only; no commit, push, deployment, or
unattended monitor was started.

## 2026-09-20: Dashboard adapts to what a guide/assistant can actually do

**Owner request:** "لوحة التحكم تتغير عند المرشد والمساعد للفعاليات التي
تستطيع ان يفعلها" - the dashboard should change for مرشد/مساعد to reflect
what they're actually able to do.

**Investigation:** Read every relevant route's role gate before touching
anything - [User.route.js](../server/Entities/User/User.route.js) (all
user-management actions are admin-only), 
[Student.route.js](../server/Entities/Student/Student.route.js) (`PUT`
allows ادارة+مرشد, i.e. approving a pending student; `DELETE`/reject is
ادارة only), [Lesson.route.js](../server/Entities/Lesson/Lesson.route.js)
and [Attendance.route.js](../server/Entities/Attendance/Attendance.route.js)
(both allow ادارة+مرشد). Also found the router already had a commented-out
`RoleGuard allows={['ادارة','مرشد','مساعد']}` on `/dashboard` in
[Routes.jsx](../client/src/Components/Routes/Routes.jsx) - the route itself
has never actually been role-restricted, only
[Header.jsx](../client/src/Components/Header/Header.jsx)'s nav link was
hard-gated to admin, hiding an already-unrestricted page.

**Changes:**

- [Dashboard.jsx](../client/src/Components/Dashboard/Dashboard.jsx): the
  "المستخدمون" and users "بانتظار الموافقة" stat cards/panel, and the
  "المستخدمون" quick-link, now only render for admins (managing accounts
  is exclusively an admin action - for anyone else they were always a
  dead, always-zero, non-actionable number, one of them literally the "0"
  from the earlier dashboard entries). The "طلاب بانتظار الموافقة" panel
  is now admin+مرشد only (مساعد can approve nor reject a pending student,
  so the panel would be entirely non-actionable for them); within it, the
  "رفض" (reject) button is admin-only even for مرشد, since only `DELETE
  /student/:tz` is ادارة-only while `PUT` (approve) allows مرشد too - a
  مرشد would otherwise see a reject button that 403s. Added a "التقارير"
  stat card for everyone, using report data the component already fetched
  but never rendered.
- [Header.jsx](../client/src/Components/Header/Header.jsx): the "لوحة
  التحكم" nav link is no longer admin-only, matching the route's actual
  (never-enforced) access and the adapted content above.

**Verification:** `npm run verify` passed (16 server tests, 4 client
tests, client production build). Live-verified role-by-role against the
owner's dev server: created a temporary مرشد test account (tz
`999999907`, deleted again afterward, no trace left in the owner's data),
logged in as it, and confirmed the dashboard shows only الطلاب/الدروس
اليوم/التقارير (3 cards, no المستخدمون), no "المستخدمون" nav link or
quick-link, and the "طلاب بانتظار الموافقة" panel is present (بانتظار
الموافقة for users is not). Admin view separately confirmed to show all 5
cards and both panels as before.

**Delivery state:** Local changes only; no commit, push, deployment, or
unattended monitor was started.

## 2026-09-23 - PDF preview before download/print (Claude implemented)

**Request:** when exporting to PDF, first show a preview page with
download/print buttons instead of saving immediately.

**Changes:**

- New [pdfPreview.js](../client/src/Components/ExportPDF/pdfPreview.js):
  full-screen RTL overlay that shows the rendered page images, with
  "تحميل PDF" (`pdf.save`), "طباعة" (prints the page images through a hidden
  iframe with `@page A4, margin 0`), and "إغلاق" (also Escape / backdrop
  click). Uses page images instead of an inline PDF iframe because mobile
  browsers do not reliably display embedded PDFs.
- [ExportPDF/ExportPDF.jsx](../client/src/Components/ExportPDF/ExportPDF.jsx)
  (user/student) and [Report/ExportPDF.jsx](../client/src/Components/Report/ExportPDF.jsx):
  collect each page's JPEG and call `showPdfPreview` instead of `pdf.save`.

**Verification:** `npm run verify` passed (client build compiled). In the dev
client, loaded the module through webpack and opened the preview with two test
pages: overlay rendered with 2 pages and 3 buttons, download invoked `save`
with the file name, Escape closed it and restored body scroll. The real print
dialog and an end-to-end export from a logged-in list page were not exercised
(needs a signed-in session).

**Review:** Codex review requested - pending (no live Codex connection from
this session).

**Delivery state:** Local changes only; no commit or push.

## 2026-09-23 - Photo change/remove on save, Drive-safe replacement (Claude implemented)

**Request:** in the user/student edit screens the photo can be changed or
removed; on save a removed photo is deleted from the DB and from Google Drive.
The owner approved the full design (client + server).

**Findings before the change:**

- [Profile.jsx](../client/src/Components/Profile/Profile.jsx) called the
  photo-delete endpoint on every save, so saving any profile field deleted the
  user's photo from Drive and the DB.
- [EditUser.jsx](../client/src/Components/User/EditUser.jsx) had no way to
  remove a photo, and showed "تعديل الاختيار" even with no photo
  (`photo != ""` is true for `null`).
- Both `uploadPhoto` handlers deleted the old Drive file before uploading the
  new one. When the upload failed, the record kept pointing at a deleted Drive
  file, which renders as a broken ("blocked") image.
- Every form save sent the form's copy of `photo` back through `PUT`, so a
  stale form could restore a link to an already-deleted Drive file.
- `DELETE /api/student/photo/:tz` had no role guard (any signed-in user,
  including مساعد), while upload is ادارة/مرشد only.

**Changes:**

- New [photoChange.js](../client/src/utils/photoChange.js): `photoAction`
  returns `keep` / `remove` / `upload` from the loaded link and the form state.
- EditUser, EditStudent and Profile: remove `photo` from the save payload;
  after a successful save, call the photo delete endpoint only for `remove`
  and upload only for `upload`. EditUser gets a "حذف الصورة" button and the
  label fix; Profile tracks the stored link after save.
- [User.controller.js](../server/Entities/User/User.controller.js) and
  [Student.controller.js](../server/Entities/Student/Student.controller.js)
  `uploadPhoto`: upload first, return 502 with the current photo untouched if
  Drive fails, store the new link, then delete the old Drive file.
- [Student.route.js](../server/Entities/Student/Student.route.js): photo
  delete now requires ادارة or مرشد.

**Tests (written first and watched failing):**
[photo-storage.test.js](../server/test/photo-storage.test.js) - failed upload
keeps the photo and its Drive file; the new link is stored before the old file
is deleted (users and students); only ادارة/مرشد reach student photo delete.
[photoChange.test.js](../client/src/utils/photoChange.test.js) - six keep /
remove / upload cases, including an untouched photo (the Profile bug).

**Verification:** `npm run verify` passed: 21 server tests (16 existing + 5
new), 10 client tests (4 existing + 6 new), client production build. The
screens were not exercised in a browser: the local server cannot reach MongoDB
Atlas from this machine (IP not on the Atlas access list), so no sign-in was
possible. No real Drive upload or delete was performed.

**Remaining limitations:** `handleDeleteByUrl` swallows Drive errors, so if
Drive is disconnected a removed photo is cleared from the DB while its Drive
file stays (orphaned, not broken). Existing records that already point at
deleted Drive files are not repaired by this change.

**Codex connection:** `codex` is not on `PATH` in this session and no peer
session is registered. No review request has been sent and no Codex response
has been received or claimed.

**Pending review:** Codex review of the changed files above is outstanding.

**Delivery state:** Local changes only; no commit, push, or deployment.
