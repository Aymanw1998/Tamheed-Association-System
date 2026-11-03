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

## 2026-09-23 - Fixed parent registration link into the waiting list (Claude implemented)

**Request:** a fixed link the admins send to parents so they can add a child
(with photo) to the students waiting list. The owner approved the design
section by section. Spec:
[2026-09-23-parent-registration-link-design.md](superpowers/specs/2026-09-23-parent-registration-link-design.md),
plan: [2026-09-23-parent-registration-link.md](superpowers/plans/2026-09-23-parent-registration-link.md).

**Rules (all enforced on the server):**

- The secret token is stored once in `InviteToken` and changes only on admin
  rotate.
- Link management is ادارة only.
- 30 parent requests per rolling 7 days, and 3 submissions per hour per
  client address.
- The ID number must pass the check digit. A known ID (active or waiting) is
  not saved; it is logged to `RegistrationAttempts` for staff instead.
- Parents always get the same reply. The photo (JPG/PNG/WEBP, 5MB or less) is
  uploaded after replying, so neither the reply content nor its timing
  reveals whether an ID is registered.
- Status, source, and assigned guide are always set by the server.

**Changes:**

- Server:
  - New [israeliId.js](../server/utils/israeliId.js) and
    [RegistrationAttempt.model.js](../server/Entities/InviteToken/RegistrationAttempt.model.js).
  - Rewrote [InviteToken.controller.js](../server/Entities/InviteToken/InviteToken.controller.js)
    and the active routes in
    [InviteToken.route.js](../server/Entities/InviteToken/InviteToken.route.js).
    Old unauthenticated `create-link` removed.
  - [server.js](../server/server.js): `PARENT_INVITE_ENABLED` removed; the
    router is always mounted.
  - [Student.controller.js](../server/Entities/Student/Student.controller.js)
    `deleteS` now deletes the Drive photo, so rejecting a request cleans up.
- Client:
  - Rewrote [functionInviteToken.jsx](../client/src/WebServer/services/inviteToken/functionInviteToken.jsx).
    Public calls use `publicApi`.
  - [EditStudent.jsx](../client/src/Components/Student/EditStudent.jsx)
    parent mode: token from `/register-student/:token`, one multipart
    submit, and a received, closed, or invalid screen.
  - [Routes.jsx](../client/src/Components/Routes/Routes.jsx): public route
    replaces `/parent-register`.
  - New [ParentLinkPanel.jsx](../client/src/Components/Student/ParentLinkPanel.jsx),
    shown on the [Dashboard](../client/src/Components/Dashboard/Dashboard.jsx)
    and as a dialog from
    [ViewAllStudent.jsx](../client/src/Components/Student/ViewAllStudent.jsx),
    where the old parent-link dialog was removed.

**Tests (written first, each watched failing):**
[parent-registration.test.js](../server/test/parent-registration.test.js)
(16), [israeli-id.test.js](../server/test/israeli-id.test.js) (1), and one
more in [photo-storage.test.js](../server/test/photo-storage.test.js).

**Verification:**

- `npm run verify` passed: 39 server tests (21 existing + 18 new), 10 client
  tests, client production build. `node --check` passed on the touched
  server files.
- Against the owner's running dev servers:
  - `/register-student/<wrong>` renders the invalid-link page without
    redirecting to login.
  - `GET /api/inviteToken/validate/<wrong>` returns `404 {"valid":false}`.
  - `GET /api/inviteToken/link` without a token returns `401`.
- Not exercised: the admin panel and a real submission with a Drive photo,
  because no admin session is available to Claude. The owner is asked to run
  one end-to-end check.

**Known limits:**

- The per-device limit keys on `X-Forwarded-For` like the existing
  `rateLimit`, so it can be bypassed on purpose.
- There are no push notifications; staff see refusals in the panel.
- Concurrent submissions can slightly exceed 30.
- Pre-existing unrelated dead code: `Profile.jsx` references an undefined
  `inviteToken` behind a `parent` prop that is never set.

**Codex connection:** not reachable from this session. No review request
sent and no response claimed.

**Pending review:** Codex review of the files above.

**Delivery state:** Local changes only on `master`; no commit, push, or
deployment.

## 2026-09-26 - Claude: startup fix in ensureSystemAdmin.js + manual end-to-end run

**Change (Claude implementer):** [ensureSystemAdmin.js](../server/scripts/ensureSystemAdmin.js)
lines 4-5. The owner's uncommitted edit had `String(process.env.SYSTEM_ADMIN_TZ;`
(missing `)`), which crashes the server at start. Now
`String(process.env.SYSTEM_ADMIN_TZ || "").trim()` and the same `|| ""` guard for
`SYSTEM_ADMIN_PASSWORD`, so a missing value skips the bootstrap instead of
creating an admin whose password is the string "undefined". Owner approved.

**Verification:** `node --check` passed; `npm test` passed (39 server, 10 client).
Manual run against the owner's dev servers (Atlas `tamheed_db`, owner-approved)
exercised register, login gating, user create/edit, student create/edit, parent
link submit + duplicate + invalid tz, approval, lesson create, attendance save and
reload, report create + PDF preview, files list, profile edit, and guide-role
access checks. Test records use tz prefix `99000` and `@example.com` emails.

**Findings for follow-up (not changed):**
- Passwords are stored with reversible AES-GCM and `GET /api/user/viewPassword/:tz`
  returns them to admins; bcrypt hashing is safer.
- `/users` has no client role guard (RoleGuard is commented out in Routes.jsx);
  the server returns 403, but a guide sees an error page with an add button.
- Files page uses `window.prompt()` for folder names.
- `EditStudent` passes `null` as a select value (React warning).
- Report PDF preview is overlapped by the floating add-report button.

**Codex connection:** not reachable from this session. Review pending.

## 2026-09-26 - Claude: route guard for every signed-in page

**Owner request:** check permission on every link; without permission, go back
to the dashboard. Resolves the `/users` finding in the entry above.

**Change (Claude implementer):**
- New [routeAccess.js](../client/src/utils/routeAccess.js): one rules table.
  `/users*`, `/students/new`, `/lessons/new` are admin only; `/students*` is admin
  or guide; every other signed-in page is open to all roles. Trailing slashes are
  normalized. Rules follow what the menu and buttons already offer each role.
- [RoleGuard.jsx](../client/src/Components/Routes/RoleGuard.jsx) now checks the
  current path and redirects to `/dashboard`; it wraps all protected routes in
  [Routes.jsx](../client/src/Components/Routes/Routes.jsx) except `/dashboard`.
  Unknown signed-in paths also redirect to `/dashboard`.
- `GUIDE_ROLES` moved to [session.js](../client/src/utils/session.js) and reused by
  Header and Dashboard. The Dashboard "الطلاب" link is hidden from assistants.

**Tests (written first, watched failing):**
[routeAccess.test.js](../client/src/utils/routeAccess.test.js) (19).

**Verification:** `npm run verify` passed (39 server, 29 client, build compiled).
Live as guide: `/users`, `/users/:tz`, `/students/new`, `/lessons/new?day=7`, and an
unknown path redirect to `/dashboard`; `/students/:tz` and `/reports/new` open.
Live as assistant: `/students` and `/students/:tz` redirect; `/lessons` and
`/calendar` open. Logged out, `/users` still goes to login. Admin paths are
covered by unit tests only (owner's admin session was not available again).

**Notes:**
- Server allows a guide to POST lessons, but the UI only offers "add lesson" to
  admins, so `/lessons/new` follows the UI. Owner may widen it.
- `setUser` stores roles as `roles.join(",")`, and `normalizeRoles` does not split
  commas, so a user with two roles would not match either. Single-role users are
  unaffected.

**Codex connection:** not reachable from this session. Review pending.

## 2026-09-26 - Claude: named rooms 6-9 and bulk test data

**Owner request:** room 6 becomes "المصلى", and add 7 "مقر قديم", 8 "الساحة",
9 "التدريب الخارجي". Then add 30 users (5 ادارة, 20 مرشد, 5 مساعد), 100 students,
and 30 lessons as admin.

**Change (Claude implementer):**
- New [rooms.js](../client/src/utils/rooms.js): `roomLabel(room)` and
  `ROOM_OPTIONS` (1-9). Lessons still store the number, so existing room-6
  lessons now show "المصلى" with no data migration.
- Room text now comes from `roomLabel` in
  [EditLesson.jsx](../client/src/Components/Lesson/EditLesson.jsx) (select offers 1-9),
  [ViewAllLesson.jsx](../client/src/Components/Lesson/ViewAllLesson.jsx) (cards, day
  columns, filter, tooltips; labels "غرفة:" became "المكان:"),
  [AttendancePage.jsx](../client/src/Components/Attendance/AttendancePage.jsx), and
  [Dashboard.jsx](../client/src/Components/Dashboard/Dashboard.jsx).
- Server unchanged: `room` is a free string and conflicts compare by value.

**Tests (written first, watched failing):**
[rooms.test.js](../client/src/utils/rooms.test.js) (13).

**Verification:** `npm run verify` passed (39 server, 42 client, build compiled).
Live: the lesson form lists rooms 1-9 with names; the lessons filter and cards
show the names.

**Data (Atlas `tamheed_db`, owner-approved), sent from the owner's admin browser
session to the same API endpoints the forms use:**
- 30 active users, tz `991000001`-`991000290`, emails `user.<tz>@example.com`.
  Random passwords are kept outside the repo in Claude's session scratchpad.
- 100 active students, tz `992000000`-`992000992`, every field filled, each with
  one of the 20 new guides as `main_teacher`.
- 30 lessons Sunday-Friday 14:00-18:45, rooms 1-9, one new guide and one new
  assistant each, 10 students each. No 409 conflicts.
- User creation also creates a Google Drive folder per user (about 3 s each).

**Codex connection:** not reachable from this session. Review pending.

## 2026-09-26 - Claude: phone layouts for the lessons program and students list

**Owner request:** a clear table design for phones, applied to lessons and students.

**Change (Claude implementer):**
- Lessons, at 900px or narrower (the existing `.mobileView` breakpoint; the JS
  `isMobile` check moved from 768px to match):
  - New [MobileLessonList.jsx](../client/src/Components/Lesson/MobileLessonList.jsx):
    day chips with per-day counts, starting on today, and lessons sorted by start
    time. Each card shows the place (named places in green), guide, and student
    count. Only admins can open a lesson, as before.
  - [ViewAllLesson.jsx](../client/src/Components/Lesson/ViewAllLesson.jsx): on phones
    the filters fold behind a "فلترة" button with an active-filter count, the day
    dropdown is replaced by the chips, and the add button uses the chosen day.
    Desktop is unchanged.
- Students, at 768px or narrower (the existing `.subTable` breakpoint):
  - New [MobileStudentList.jsx](../client/src/Components/Student/MobileStudentList.jsx):
    a compact card with initial, name, one line of grade, age, and father, and a
    health note only when it isn't "سليم". Tapping opens the student; PDF and
    approve/reject buttons stay. The desktop table is unchanged.
- New helpers: [lessonSchedule.js](../client/src/utils/lessonSchedule.js),
  [studentCard.js](../client/src/utils/studentCard.js), and `isNamedPlace` in
  [rooms.js](../client/src/utils/rooms.js).

**Tests (written first, watched failing):**
[lessonSchedule.test.js](../client/src/utils/lessonSchedule.test.js) (14),
[studentCard.test.js](../client/src/utils/studentCard.test.js) (11), and
`isNamedPlace` cases in [rooms.test.js](../client/src/utils/rooms.test.js) (7).

**Verification:** `npm run verify` passed (39 server, 73 client, build compiled
with no warnings). Checked live at 375px: day chips switch days, filters open,
student cards open the student. Checked at 1280px: both desktop views are
unchanged.

**Codex connection:** not reachable from this session. Review pending.

## 2026-09-26 - Claude: restore roles when a session is restored

**Found while opening the system for the owner:** signed in as System Admin
(header correct), but local storage had no `roles`, `user_id`, or `isLoggedIn`,
only a fresh `accessToken`. The dashboard showed the no-role view, and the new
RoleGuard would have blocked admin pages.

**Cause:** roles and user id were written only at login (`markSignedIn`).
`hardResetToLogin` in `accessScheduler.js` clears all local storage when a
refresh fails (likely here: two tabs refreshing with a rotating refresh cookie).
RequireAuth then restores the session from the refresh cookie and `/auth/me`,
but never writes the roles back.

**Change (Claude implementer):**
- [session.js](../client/src/utils/session.js): new `rememberSessionUser(user)`
  stores `user_id` and roles as a JSON array. `normalizeRoles` now splits the
  older comma-separated value, which fixes users with two roles.
- [fuctionsAuth.jsx](../client/src/WebServer/services/auth/fuctionsAuth.jsx)
  `markSignedIn` and [RequireAuth.jsx](../client/src/Components/Routes/RequireAuth.jsx)
  (after every successful `/auth/me`) call it.

**Tests (written first, watched failing):**
[session.test.js](../client/src/utils/session.test.js) (5).

**Verification:** `npm run verify` passed (39 server, 78 client, build compiled).
Live: in the broken state, opening `/users` restored `roles` to `["ادارة"]`, and
both `/users` and the admin dashboard rendered.

**Not changed:** `hardResetToLogin` still clears storage on any refresh failure,
including a temporary network error. Worth a separate look.

**Codex connection:** not reachable from this session. Review pending.

## 2026-09-26 - Claude: phone cards for the users list

**Owner request:** give the users list the same phone design as the students.

**Change (Claude implementer):**
- New shared [PersonCard.jsx](../client/src/Components/UI/PersonCard.jsx)
  (`PersonCard` and `PersonCardList`). Its CSS moved from the students list to
  [PersonCard.module.css](../client/src/Components/UI/PersonCard.module.css).
  `onOpen` is optional, so waiting people show as plain text.
- [MobileStudentList.jsx](../client/src/Components/Student/MobileStudentList.jsx)
  now uses it. Waiting students no longer open on tap, matching the table,
  which has only approve/reject for them.
- New [MobileUserList.jsx](../client/src/Components/User/MobileUserList.jsx):
  initial, name, and one line of role, age, and city. Active users open on tap
  and keep "ملف المستخدم"; waiting and disabled users show a status badge and
  their activate/delete buttons.
- [ViewAllUser.jsx](../client/src/Components/User/ViewAllUser.jsx) and
  [User.module.css](../client/src/Components/User/User.module.css): cards at 768px
  or narrower; the desktop table is unchanged.
- `utils/studentCard.js` was renamed to [personCard.js](../client/src/utils/personCard.js)
  (`studentInitial` became `personInitial`) and gained `userSummary`.

**Tests (written first, watched failing):** 3 `userSummary` cases in
[personCard.test.js](../client/src/utils/personCard.test.js).

**Verification:** `npm run verify` passed (39 server, 81 client, build compiled).
Live at 375px: user cards render, and tapping one opens `/users/:tz`. The students
list still renders all 102 cards after the refactor. At 1280px the users table
shows 34 rows and the cards are hidden.

**Codex connection:** not reachable from this session. Review pending.

## 2026-09-26 - Claude: grouped student form, optional parents, single-flight refresh

**Owner request:** the teacher said city and street belong above the health
status, and parent details must be optional.

**Change 1 - student form (Claude implementer):**
- [EditStudent.jsx](../client/src/Components/Student/EditStudent.jsx) is now five
  fieldsets: student details; residence and contact (city, street, phone, email);
  school (school, grade, responsible guide); parents, marked optional; health and
  notes. The inputs and handlers are unchanged. The main-teacher select gets
  `value || ""`, which removes the React null warning.
- New [studentForm.js](../client/src/utils/studentForm.js): `isRequiredStudentField`.
  Required: tz, names, birth date, gender, city, street. Parent fields, phone, and
  email no longer show "املأ الحقل" when empty, and submit no longer checks them.
  The server already required only tz and names.
- Styles are in [Student.module.css](../client/src/Components/Student/Student.module.css).
  The parent rows stack on phones.
- School, grade, and health status keep their red star but are still not
  enforced on submit (unchanged behavior).

**Change 2 - forced logouts (found while verifying):** `/auth/refresh` rotates
a single `refreshHash` per user, and five client paths called it independently
(RequireAuth, PublicOnly, the api interceptor, accessScheduler, and
`fuctionsAuth.refresh`). Two overlapping calls (for example React StrictMode's
double effect in dev, or the scheduler plus RequireAuth) make the second call
return `REFRESH_MISMATCH` and trigger `hardResetToLogin`. Observed: two back-to-back
401 refreshes, then signed out.
- New [singleFlight.js](../client/src/WebServer/utils/singleFlight.js) and
  `refreshSession` in [api.jsx](../client/src/WebServer/services/api.jsx). All five
  paths now share one in-flight request.

**Tests (written first, watched failing):**
[studentForm.test.js](../client/src/utils/studentForm.test.js) (16),
[singleFlight.test.js](../client/src/WebServer/utils/singleFlight.test.js) (3).

**Verification:** `npm run verify` passed (39 server, 100 client, build compiled).
The live check of the grouped form was cut off when the session ended; it needs
the owner to sign in again.

**Remaining limits:** one refresh hash per user still means signing in to the
same account in a second browser ends the first session, and two tabs can still
race across tabs. A short server-side grace period for the previous hash would
fix both.

**Codex connection:** not reachable from this session. Review pending.

## 2026-09-26 - Claude: health status and notes as 4-row text areas

**Owner request:** health status and notes should each be a textarea with 4 rows.

**Change (Claude implementer):** in [EditStudent.jsx](../client/src/Components/Student/EditStudent.jsx),
`health_status` and `notes` are `<textarea rows={4}>` (value falls back to ""),
styled in [Student.module.css](../client/src/Components/Student/Student.module.css)
like the other fields, with vertical resize. This applies to the admin form and
the parent link. The server already accepts up to 1000 characters for both.

**Verification:** `npm run verify` passed (39 server, 100 client, build compiled).
Live as admin on `/students/new`: five sections in order, both textareas have 4 rows,
multi-line health text works. Required fields with empty parents passed
validation and reached the confirm dialog; cancelled, and `GET /student/990000051`
returns 404, so nothing was created. No test was added: markup only.

**Codex connection:** not reachable from this session. Review pending.

## 2026-09-26 - Claude: "مفعالين" label renamed to "مسجل"

**Owner request:** replace "مفعالين" with "مسجل".

**Change:** the active status label is now "مسجل" in
[StudentStatusFilter.jsx](../client/src/Components/Student/StudentStatusFilter.jsx),
[UserStatusFilter.jsx](../client/src/Components/User/UserStatusFilter.jsx), and the
summary lines of [ViewAllStudent.jsx](../client/src/Components/Student/ViewAllStudent.jsx)
("102 طالب مسجل") and [ViewAllUser.jsx](../client/src/Components/User/ViewAllUser.jsx)
("34 مستخدم مسجل"; the noun is now singular to agree with the adjective).
Text only; the data value `room: "active"` is unchanged.

**Verification:** `npm run verify` passed (39 server, 100 client, build compiled),
and both pages show the new text live.

## 2026-09-26 - Claude: grouped user/profile/report/lesson forms, report list, lesson roster

**Owner requests (in sequence):** group the user form like the student form;
redesign reports inside and out; remove "عرض المعلومات"; hide report attendees for
now; in lessons, improve adding and removing students (look at other apps) and
group the fields.

**Changes (Claude implementer):**
- Shared [FormSection.module.css](../client/src/Components/UI/FormSection.module.css),
  moved out of Student.module.css. The student, user, profile, report, and lesson
  forms use it.
- [EditUser.jsx](../client/src/Components/User/EditUser.jsx) and
  [Profile.jsx](../client/src/Components/Profile/Profile.jsx): account; personal;
  residence and contact (city and street first). "بلد" became "مدينة السكن".
  Fixed the phone error label, which showed `error.mother_phone`.
- [ViewAllReport.jsx](../client/src/Components/Report/ViewAllReport.jsx): toolbar,
  table buttons, and tags now match the other lists; "Reset" became "مسح الفلاتر".
  Phone cards use `PersonCard` (new `tags` prop). The "عرض المعلومات" modal and its
  state were removed.
- [EditReport.jsx](../client/src/Components/Report/EditReport.jsx): sections for
  report details and body. Attendees are hidden in the form and the report PDF via
  `SHOW_REPORT_ATTENDEES = false` in
  [reportOptions.js](../client/src/Components/Report/reportOptions.js). Saved
  attendance is kept, and the PDF no longer fetches `/user/` while hidden.
- [Fabtn.css](../client/src/Components/Global/Fabtn/Fabtn.css): z-index
  9999999999999 changed to 900, so the floating add button no longer covers the
  PDF preview (10000), dialogs, or the header (1000).
- Lessons: [EditLesson.jsx](../client/src/Components/Lesson/EditLesson.jsx) has
  lesson, time and place, staff, and students sections. The modal checkbox picker
  was replaced by [LessonRoster.jsx](../client/src/Components/Lesson/LessonRoster.jsx),
  following the Google Classroom and transfer-list pattern. Search offers only
  registered students not already added (up to 8, plus "add all"). Each row has
  "إزالة" with an undo bar, and a warning shows when the student is in another
  lesson on the same day at an overlapping time. Non-admins see the list read-only
  (before, they saw only a count). Changes still apply on "حفظ البيانات".
  Helpers are in [lessonRoster.js](../client/src/utils/lessonRoster.js).

**Tests (written first, watched failing):**
[lessonRoster.test.js](../client/src/utils/lessonRoster.test.js) (8) and a
`joinParts` case in [personCard.test.js](../client/src/utils/personCard.test.js).

**Verification:** `npm run verify` passed (39 server, 109 client, build compiled).
Live: the user and profile forms show three sections; the reports list shows
cards and no info button; the report form has no attendees. On lesson
6ab7e57f…825, search found 992000604, and adding it after moving the start to
15:00 showed "لديه درس آخر في نفس الوقت: رياضة - مجموعة أ". Remove and undo restored
the order. Nothing was saved: the server still shows 10 students at 14:00.

**Codex connection:** not reachable from this session. Review pending.

## 2026-09-26 - Claude: dashboard lessons panel (today plus upcoming) and attendance link fix

**Owner decision:** keep today's lessons on the dashboard, and add upcoming
lessons when nothing is left today.

**Change (Claude implementer):**
- New [dashboardLessons.js](../client/src/utils/dashboardLessons.js). It marks
  today's lessons as done, now, next, or later, using the device clock. Finished
  lessons stay listed so attendance can still be taken after class. When nothing
  is left today, it adds the nearest following day that has lessons (wrapping
  around the week). Non-admins see only lessons where they are the teacher or
  helper.
- [Dashboard.jsx](../client/src/Components/Dashboard/Dashboard.jsx):
  - The panel title is "دروس اليوم" for admins and "دروسي اليوم" for others. Rows
    show "الآن" and "التالي" tags and fade when done, followed by a "الدروس القادمة"
    list (5 lessons plus a "more" link to /lessons).
  - The header link now goes to /lessons ("كل الدروس"). The stat card counts the
    same list.
  - The `getLessonsToday` request was dropped: it used the server's day, and the
    full lesson list was already loaded. The panel re-renders every minute.
- **Bug fix:** "دخول" navigated to `/dashboard` (commit f2db306 had replaced the
  route), so it did nothing. It now goes to `/calendar` with `state.lessonId`,
  which AttendancePage already reads.

**Tests (written first, watched failing):**
[dashboardLessons.test.js](../client/src/utils/dashboardLessons.test.js) (7).

**Verification:** `npm run verify` passed (39 server, 116 client, build compiled).
Live on Saturday at 20:42: today's 16:00 lesson is shown faded, followed by
"الدروس القادمة: الاحد (6)" with 5 rows and "ودرس آخر". "دخول" opened /calendar with
that lesson selected and its saved attendance (1 present, 1 late).

**Codex connection:** not reachable from this session. Review pending.

## 2026-09-26 - Claude: dashboard waiting panels only when needed

**Owner request:** hide the waiting panel when nobody is waiting, and rename
"بانتظار الموافقة" to "مستخدمون بانتظار الموافقة". The owner typed "ببانتظار"; it is
written with a single ب.

**Change:** in [Dashboard.jsx](../client/src/Components/Dashboard/Dashboard.jsx),
the users panel and the students panel render only after loading and only when
their list is non-empty; their empty-state texts were removed. The users panel
title and stat card are now "مستخدمون بانتظار الموافقة".

**Verification:** `npm run verify` passed (39 server, 116 client, build compiled).
Live: with nobody waiting, neither panel shows and the card reads 0. A temporary
test user (990000069) registered through `/api/auth/register` made the panel
appear with the card at 1. Rejecting it from the panel removed the panel at once.

**Correction (same session):** a later server check showed 990000069 was still
in the waiting room. See the next entry: the delete endpoint never used the room.

## 2026-09-26 - Claude: DELETE /user/:tz/:from ignored the room

**Found while verifying the waiting panel:** rejecting a waiting user returned
200, but the user stayed in the waiting room. The route is
`DELETE /user/:tz/:from`, but `deleteU` read only `req.query.from` and
`req.body.from`, so the room always defaulted to "active". Rejecting waiting users
and deleting disabled users never worked; the dashboard only removed the row from
its own state.

**Change (Claude implementer):**
- [User.controller.js](../server/Entities/User/User.controller.js) `deleteU` reads
  `req.params.from` first and returns 400 for an unknown room instead of falling
  back to "active".
- [functionsUser.jsx](../client/src/WebServer/services/user/functionsUser.jsx):
  `deleteU(tz, from = "active")`. EditUser's "حذف الحساب" calls `deleteU(form.tz)`,
  which used to request `/user/<tz>/undefined` and worked only through the old
  fallback.

**Tests (written first, watched failing):**
[user-delete.test.js](../server/test/user-delete.test.js) (4). Before the fix,
the waiting and noActive cases deleted from "active", and an unknown room
returned 200.

**Verification:** the new test file passes. The live re-check is blocked: the
admin session in the pane ended, because `/auth/refresh` returned 401 even
before the server restart. The cause could not be confirmed from the logs; one
explanation is that the same account signed in elsewhere, since the server keeps
one refresh hash per user. Test user 990000069 is still in the waiting room.

**Codex connection:** not reachable from this session. Review pending.

## 2026-09-26 - Claude: attendance page layout, date dropdown, scrolling lesson lists

**Owner request:** fix the order of "حضور وغياب" together with "سجل الحضور السابق",
make the lesson list scroll with 3 lessons visible, use a dropdown for dates, and
make today's lessons on the dashboard scroll too.

**Change (Claude implementer):**
- [AttendancePage.jsx](../client/src/Components/Attendance/AttendancePage.jsx):
  - "حفظ" and the unsaved-changes hint moved from the top bar (where they sat before
    any lesson was chosen) to a sticky footer on the sheet, next to the counts.
  - Both tabs: the lesson search stays above a list limited to three cards that
    scrolls.
  - History: the date buttons and their text search became one `<select>`
    ("اختر تاريخ (n)", newest first), labelled with the weekday, for example
    "السبت 26/09/2026". The wrong empty text "لا يوجد تواريخ مستقبلية" is now
    "لا يوجد حضور مسجّل لهذا الدرس بعد". The unused `searchDate` state was removed.
- New [attendanceDates.js](../client/src/utils/attendanceDates.js) (`attendanceDateLabel`).
- Styles in [AttendancePage.module.css](../client/src/Components/Attendance/AttendancePage.module.css).
- [Dashboard.jsx](../client/src/Components/Dashboard/Dashboard.jsx): today's lesson
  rows sit in a scroll box about three rows tall.

**Tests (written first, watched failing):**
[attendanceDates.test.js](../client/src/utils/attendanceDates.test.js) (4).

**Verification:** `npm run verify` passed (43 server, 120 client, build compiled).
Live, signed in as test admin 991000001 (the pane's session had ended again):
history lists 32 lessons with exactly 3 visible (client height 202px); choosing
"درس تجريبي - رياضيات" gives a dropdown with "السبت 26/09/2026", and choosing it
loads the sheet with "حاضر: 1 • متأخر: 1" and the save button in the footer.

**Codex connection:** not reachable from this session. Review pending.

## 2026-09-26 - Claude: attendance on phones - lessons, date window, then students

**Owner request:** on phones, tapping a lesson should open a window to choose the
date, then move from the lesson list to the students list.

**Change (Claude implementer):** [AttendancePage.jsx](../client/src/Components/Attendance/AttendancePage.jsx)
at 900px or narrower (the page's existing breakpoint, tracked with `matchMedia`):
- Step 1 shows only the tabs and the lesson list, which now uses the full screen
  (the three-card limit applies on desktop only).
- In "درس اليوم", tapping a lesson opens the sheet. In "سجل الحضور السابق", it opens a
  bottom-sheet dialog of recorded dates (with weekday). It closes on "إلغاء",
  on a backdrop tap, or with Escape, and picking a date opens the sheet.
- Step 2 is the sheet with a sticky bar: "→ الدروس", plus "تغيير التاريخ" in
  history. Going back with unsaved changes asks first, using the existing
  "navigate" confirm. A lesson preselected from the dashboard opens straight
  into the sheet.
- `doChange` now returns whether it went ahead, so views only switch after the
  user confirms.
- Desktop keeps the side-by-side layout and the date `<select>`.
- Also fixed: on narrow screens the search box and cards overflowed their panel
  by a few pixels (grid column sized to the input's default width); now
  `minmax(0, 1fr)`.

**Verification:** `npm run verify` passed (43 server, 120 client, build compiled).
Live at 375px as test admin 991000001:
- The history tab showed only the list (32 lessons). Tapping "درس تجريبي - رياضيات"
  opened the date window, and choosing "السبت 26/09/2026" opened the sheet with 2
  students.
- Changing a status and pressing back asked for confirmation: "الغاء" stayed,
  "نعم" returned to the list. The server still has حاضر and متأخر, so nothing
  was saved.
- In the today tab, tapping a lesson went straight to the sheet.
- At 1280px both panels, the date select, and 3 visible cards are unchanged.

No unit test was added: this is view wiring; the date label logic is already
covered.

**Codex connection:** not reachable from this session. Review pending.

## 2026-09-26 - Claude: lesson roster - add-student window, scrolling, enrolled search

**Owner request:** adding a student opens a window listing students not in the
lesson, with scrolling and search; the enrolled list scrolls after 3 students,
and its search looks only among enrolled students.

**Change:** [LessonRoster.jsx](../client/src/Components/Lesson/LessonRoster.jsx)
now has a search over enrolled students (`filterRosterStudents`), a list about
three rows tall that scrolls, and a "+ إضافة طالب" dialog (bottom sheet on phones).
The dialog lists every registered student not in the lesson, with search, an
"added" counter, "add all results", and "تم". Escape or a backdrop tap closes it.
Undo, conflict warnings, and saving on "حفظ البيانات" are unchanged.
[lessonRoster.js](../client/src/utils/lessonRoster.js) gained `filterRosterStudents`.

**Tests (written first, watched failing):** 2 new cases in
[lessonRoster.test.js](../client/src/utils/lessonRoster.test.js).

**Verification:** `npm run verify` passed. Live on lesson 6ab7e57f…825: 3 of 10
enrolled students visible; "ليان" filtered to one; the dialog listed 92 students;
searching 992000604 and adding it kept the dialog open with "أُضيف 1". The list
did not scroll at first, so it was given an explicit max-height and re-checked.
Nothing was saved (the server still has 10 students).

**Codex connection:** not reachable from this session. Review pending.

## 2026-10-02 - Claude: GPT-6 ASTRA UI review - triage and fixes

**Source:** an external UI pass with an administrator account (read-only, nothing
saved). Each finding was checked against the code before any change.

**Fixed:**
- Unsaved-changes warning on a pristine lesson form: `Header.jsx` asked on every
  edit-page path. New [unsavedChanges.js](../client/src/utils/unsavedChanges.js)
  lets a page report dirty state; `EditLesson.jsx` reports it (baseline taken after
  load). Pages that don't report yet (students, users, subs, next-month) still ask
  every time, as before.
- Duplicate mentor/helper names: options now end with the last 4 digits of the ID
  number.
- Form labels in `EditLesson.jsx` now use `htmlFor`/`id`.
- Wording: "يتحدث..." became "جارٍ تحميل البيانات…" in four pages; the leave-page
  message in `confirmBus.js` was rewritten.
- `apiBase.js`: "No API server found on LAN" is now `console.warn` (the code falls
  back to the production URL, so it was never a failure).

**Not fixed, needs data inspection:** `???? ?????` in the dashboard's rejected
requests looks like text stored as literal question marks; the client cannot
recover it.

**Still open:** label binding in the student, user, profile and report forms;
dirty tracking for those pages.

**Verification:** `npm run verify` passed (122 tests, client build compiled).

**Codex connection:** not reachable from this session. Review pending.

## 2026-10-02 - Claude: vehicles & trailers section ("المركبات والمقطورات")

**Owner request:** a new section for vehicles and trailers: licence, annual test
(טסט), several insurance policies, documents, in-app alerts, separate
permissions, change log, archive instead of delete; manual entry first.

**Design decisions:**
- Permissions: the app only has roles, so five vehicle permissions
  (view, edit, compliance, documents, archive) are stored on the user
  (`vehiclePermissions`) and granted by an administrator in the user form.
  Administrators hold all; guides/assistants hold none by default; nothing works
  without `view`. Enforced per route in `Vehicle.controller.js` from the
  database, never from the token alone. The field is outside `SELF_EDIT_FIELDS`
  (test added).
- Documents: the existing `googleDrive.uploadFile` makes files public to anyone
  with the link, which is wrong here. New `uploadPrivateFile` and `downloadStream`
  in `googleDrive.service.js`; files are streamed through the API after a
  permission check, type is decided from the file bytes (PDF/JPG/PNG/WEBP,
  10MB), the stored name is generated, and the Drive id is never sent to the
  browser. Replaced documents are kept and marked superseded.
- Alerts are derived from the data on each request (30/14/7 days, expired,
  missing), so nothing duplicates and a renewal clears them. The lead times are
  a constant (no settings store exists). Administrators and anyone with `view`
  see all; an assigned person sees only their vehicles.
- Dates are `YYYY-MM-DD` text; "today" is Asia/Jerusalem. The next test date is
  never computed; payment never implies validity; a future policy is not active
  and a cancelled one never is.
- Official data (data.gov.il) is only a placeholder (`vehicleLookup.service.js`);
  no dataset or field names were assumed.

**Tests:** `vehicle-rules`, `vehicle-controller`, `vehicle-files` (server),
`vehicleDisplay` (client), plus a self-grant case in
`user-profile-authorization.test.js`. `npm run verify` passed (server 92, client
134, build compiled).

**Live check:** not against the real database (the local `.env` points at a
remote cluster, and server start also runs `ensureSystemAdmin`). Instead the real
controller, routes and auth middleware ran behind a throwaway in-memory server
and the real client was driven in the browser: list, filters, file page, policy
add, upload (fake PDF refused, real accepted), unsaved-changes warning, Hebrew,
phone width, permission box in the user form.

**Codex connection:** not reachable from this session. Review pending.

**Follow-up 2026-10-02 - official data (data.gov.il) for vehicles:** implemented in
`server/services/vehicleLookup.service.js` (route `GET /api/vehicle/official-lookup/:plate`,
needs `edit`, rate limited) and `client/.../Vehicle/OfficialLookup.jsx`. Field names
were checked against the live datastore response (resource `053cea08-...`). The
result is a pending-review proposal with source and fetch time; only make, model,
year, colour and chassis are proposable, and a value already recorded is replaced
only if the user ticks it. The dataset's date fields (`tokef_dt`,
`mivchan_acharon_dt`) have no published definition, so they are shown as source
information and never mapped to licence/test dates. Applied fields are recorded in
the change log with source and time. Any failure returns "unavailable" and manual
entry is unaffected. Tests: `vehicle-lookup.test.js` (stubbed HTTP), 2 controller
cases, 1 client case; one read-only live call succeeded. `npm run verify` passed
(server 100, client 135). Codex review pending.

**Follow-up 2026-10-02 - permanent vehicle delete (owner request):** `DELETE /api/vehicle/:id`,
administrators only (not a delegable permission), plate typed back as confirmation. Drive
files and the vehicle's Drive folder are removed first; if any file fails nothing else is
deleted (retry-safe, a missing file counts as done). Then the change log and the vehicle
(licences, tests, policies, document records) are deleted. One content-free `delete`
marker (plate, who, when, document count) is kept in `VehicleAudit` for accountability.
Archive remains the default non-destructive option. Tests: 3 controller cases.
`npm run verify` passed (server 103, client 135). Not driven in the browser. Codex review pending.

**Follow-up 2026-10-02 - documents inside each section:** each licence, test and policy
record now shows its own attached documents (view/download) with an upload in place
(`RecordDocuments.jsx`, linked via `linkedType`/`linkedId`; same server rules and
permissions as the Documents tab, which still lists everything). Also fixed a crash
after saving a NEW vehicle (page stayed mounted with `vehicle = null` while the address
changed; now the saved vehicle is stored before navigating, plus a loading guard).
Driven in the browser against the in-memory harness on isolated ports. `npm run verify`
passed. Codex review pending.

**Follow-up 2026-10-02 - attachments strip (replaces the per-record boxes):** each section
tab (basic, trailer, licence, test, insurance) now has one slim "attachments" line
(`AttachmentsBar.jsx`): small chips for the section's files (click to view, arrow to
download) and a single "+ attach" button that uploads as soon as a file is chosen. Files
belong to the section (`linkedType`, empty `linkedId` allowed on the server; test added);
the Documents tab still lists everything and handles replacement. Same permissions and file
rules. Driven in the browser against the in-memory harness. `npm run verify` passed
(server 104, client 135). Codex review pending.

**Follow-up 2026-10-02 - optional file names, rename and delete files:** a file now has an
optional display name (`title`, max 100; asked in a small window when attaching, changeable
later; the Drive name stays generated). `PUT/DELETE /api/vehicle/:id/documents/:docId`
(permission `documents`, not on archived vehicles). Delete removes the Drive file first and
the record only if that succeeded (a missing file counts as done); deleting a version that
replaced an older one makes the older one current again. Both actions are in the change log.
Tests: 4 controller cases. Driven in the browser against the in-memory harness (attach with
name, rename, delete). `npm run verify` passed (server 108, client 135). Codex review pending.

**Follow-up 2026-10-02 - download name and phone layout of the attachments strip:** downloads
are named "<plate> - <your name or type>.<ext>" (`buildDownloadName`, tested) instead of the
internal generated name. On phones the strip is a rounded box with the title and attach
button on the first line, then one file per line (name truncated with an ellipsis, date, icons);
checked at 375px in the browser against the in-memory harness, no horizontal overflow.

**Follow-up 2026-10-02 - tabs on phones:** at 600px and below the file page tabs wrap into
buttons (three per row, active one filled) instead of a sideways-scrolling bar; all seven are
visible at once. Checked at 375px in the browser, no horizontal overflow.

**Follow-up 2026-10-02 - pill tabs (replaces the previous phone tab layout):** file page tabs are
rounded pills with a small count badge (licences, tests, policies, documents), selected one
highlighted, wrapping onto several lines on phones instead of scrolling. Checked on desktop and
at 375px in the browser, no horizontal overflow.

**Follow-up 2026-10-02 - compact vehicles list on phones (<=600px):** page header without the long
description and with a compact add button; the five counters are small pills in a wrapping row; the
filters are search + three selects in one row; each card puts a date and its status badge on one line
(card height about 280px). First vehicle now starts near the top. Checked at 375px, no horizontal overflow.

**Follow-up 2026-10-02 - permanent delete leaves nothing behind:** the content-free `delete` marker
that was kept in `VehicleAudit` is removed, per the owner's explicit "delete every record" request.
Verified that the real model/api layer deletes by string `_id` and deletes the audit records
(throwaway database on the local mongod, dropped afterwards; Atlas and tamheed_db untouched).
A marker created by the earlier version stays in an already-used database until removed by hand
(`VehicleAudit` documents with `action: "delete"`).

## 2026-10-14 - Claude: vehicle document reading, nightly expiry check and administrators' notices

**Owner request:** read vehicle licences and insurance policies with Claude as a reviewed
proposal (never saved automatically), check vehicle documents every night, and tell the
administrators through an in-app notices board with an unread bell, plus an email digest.

**Implementation:** spec `docs/superpowers/specs/2026-10-14-vehicle-docs-expiry-notices-design.md`,
plan `docs/superpowers/plans/2026-10-14-vehicle-docs-expiry-notices.md` (Tasks 1-9). Local
commits on `feature/vehicle-docs-notices`, range `51d88bf..HEAD`.

**Changes (files changed in the range, 36, plus this commit):**
- `client/src/Components/Header/Header.jsx`
- `client/src/Components/Notice/Notice.module.css`
- `client/src/Components/Notice/NoticeBell.jsx`
- `client/src/Components/Notice/NoticesBoard.jsx`
- `client/src/Components/Routes/Routes.jsx`
- `client/src/Components/Vehicle/DocumentScan.jsx`
- `client/src/Components/Vehicle/EditVehicle.jsx`
- `client/src/Components/Vehicle/VehicleAlerts.jsx`
- `client/src/Components/Vehicle/VehicleRecords.jsx`
- `client/src/WebServer/services/notice/functionsNotice.jsx`
- `client/src/WebServer/services/vehicle/functionsVehicle.jsx`
- `client/src/i18n/I18nContext.jsx`
- `client/src/i18n/noticeStrings.js`
- `client/src/i18n/vehicleStrings.js`
- `client/src/utils/routeAccess.js`
- `client/src/utils/routeAccess.test.js`
- `client/src/utils/vehicleScan.js`
- `client/src/utils/vehicleScan.test.js`
- `server/Entities/Notice/Notice.controller.js`
- `server/Entities/Notice/Notice.model.js`
- `server/Entities/Notice/Notice.route.js`
- `server/Entities/Notice/Notice.service.js`
- `server/Entities/Vehicle/Vehicle.controller.js`
- `server/Entities/Vehicle/Vehicle.route.js`
- `server/Entities/Vehicle/VehicleExtract.controller.js`
- `server/server.js`
- `server/services/vehicleDocExtract.service.js`
- `server/services/vehicleExpiryJob.js`
- `server/test/notice-controller.test.js`
- `server/test/vehicle-doc-extract.test.js`
- `server/test/vehicle-expiry-job.test.js`
- `server/test/vehicle-notices.test.js`
- `server/test/vehicle-rules.test.js`
- `server/utils/sendEmail.js`
- `server/utils/vehicleNotices.js`
- `server/utils/vehicleRules.js`
- `server/config/.env.example` (this commit: AI and SMTP notes)
- `docs/AI_REVIEW_LOG.md` (this entry)

**Verification** (in the worktree; the root `npm run verify` client Jest script finds no tests
because the path contains ".claude", so its three parts were run separately):
- `npm test --prefix server`: tests 140, pass 140, fail 0.
- client `CI=true npx react-scripts test --watchAll=false --testMatch "**/*.test.js"`:
  Test Suites 14 passed, 14 total; Tests 139 passed, 139 total.
- `npm run build --prefix client`: Compiled successfully.
- Manual nightly-check proof (run the check from `/notices` as an administrator, see 0 new
  notices on a second press): NOT run, it needs a signed-in administrator.

**Claude - Codex review request:** Requesting Codex review of the range above.

Review Focus:
1. A vehicle with an expired policy and a newer valid policy must produce no insurance alert.
2. Server restarted twice on the same day after 01:00 must not run the catch-up twice or
   duplicate notices.
3. Claude returning an invalid date (2026-02-30) or swapped start/end must arrive as null +
   warning, never pre-filled.
4. SMTP missing or one admin with a bad email: notices still created, other admins still mailed.
5. A non-admin with vehicle "compliance" permission may extract documents but gets 403 on every
   /api/notices route.

**Unverified:** no live Claude API call (no ANTHROPIC_API_KEY; the model id `claude-opus-5-5`
and the nullable JSON-schema shape are unverified live); no real email sent; no signed-in
browser check of the notices page, the bell, or the scan UI.

**Delivery state:** local commits on `feature/vehicle-docs-notices` only; nothing pushed; the
final squash to master awaits the owner's approved commit message. Codex review pending.

## 2026-10-15: System-account-only Google Drive connection

**Owner request:** Only the system account (SYSTEM_ADMIN_TZ) may connect or
change the app's single Google Drive account, from a button inside the system;
other administrators only see which account is connected.

**Problem found:** `GET /api/storage/google/connect` and `/callback` required no
authentication. Anyone could open the public connect link and replace the app's
Drive account with their own, silently redirecting every later upload
(student photos, vehicle documents, staff files) to that account.

**Changes:**

- `server/utils/driveConnectState.js` (new): in-memory, single-use OAuth `state`
  values bound to the requesting user, valid for 10 minutes.
- `server/Entities/Storage/GoogleDrive.route.js`: removed the open `GET /connect`;
  added `POST /connect-url` (requireAuth + system account: token tz equals
  SYSTEM_ADMIN_TZ; unset matches nobody) that returns Google's
  consent URL with a fresh state; `/callback` accepts only an issued, unexpired,
  unused state and redirects to `/files?drive=connected|denied|error`;
  `/status` also returns `canConnect`.
- `server/services/googleDrive.service.js`: `getAuthUrl(state)` forwards the state.
- `client/src/Components/Files/DriveConnection.jsx` (new), `FilesPage.jsx`,
  `functionsStorage.jsx`, `I18nContext.jsx`: administrators see the connected
  account on the Files page; only the system account gets the connect/change
  button (confirm on change).
- `server/test/drive-connect.test.js` (new): 8 tests.

**Verification:** server 151/151, client 14 suites / 139 tests, client build
compiled. Not verified live: the local server could not reach Atlas (IP not on
the Atlas access list), and no real Google consent flow was run.

**Requesting Codex review.** Focus: state cannot be forged, replayed or used
after 10 minutes; the system-account check on `/connect-url`; no remaining
unauthenticated path that writes the Drive connection; behaviour behind more
than one server process (state is in memory).

**Delivery state:** uncommitted local changes; commit awaits the owner's message.

## 2026-10-17: Permissions project, Phase 1 (login backdoors and lockout)

**Owner request:** Hybrid permissions design approved
(`docs/superpowers/specs/2026-10-17-hybrid-permissions-design.md`, plan
`docs/superpowers/plans/2026-10-17-hybrid-permissions.md`). Phase 1 = security
fixes and locking an account after 5 failed sign-ins.

**Problems found:** `login` accepted a master password from the environment and
the stored password value itself as a password; `viewPassword` showed admins the
stored value, so any admin could sign in as any user, including the system
account. `POST /api/user/checkPasswordisGood` let an admin test any user's
password with no limit.

**Changes:**

- `server/Entities/User/User.controller.js`: `login` accepts only a verified
  password; lock check (423 `ACCOUNT_LOCKED`) before verification; failure count
  is incremented atomically and the lock set by a conditional update; the system
  account (SYSTEM_ADMIN_TZ) is never locked; forgot/reset password refused for
  locked accounts with no email; reset clears the counter; `viewPassword` returns
  only `{ ok, hasPassword }`; `CheckPasswordisGood` removed.
- `server/utils/loginLockout.js` (new), `server/Entities/User/User.model.js`
  (`failedLoginCount`, `lockedAt`, atomic increment and conditional lock),
  `server/Entities/api.js` (`increment` with `$inc`, no upsert).
- `server/Entities/User/User.route.js`: photo upload/delete limited to self or
  admin; `checkPasswordisGood` route removed.
- `server/scripts/unlockUser.js` (`npm run user:unlock -- <tz>`) and
  `server/scripts/encryptPlainPasswords.js` (`npm run users:encrypt-plain-passwords`,
  dry-run counts only; `--apply` re-saves plain-text passwords in the protected
  format).
- Client: `ForgotPassword.jsx` shows the locked message; `EditUser.jsx`,
  `Profile.jsx` no longer read or log password values.
- Tests: `login-security.test.js`, `login-lockout.test.js`,
  `user-scripts.test.js` (new); loaders updated in `photo-storage`,
  `user-delete`, `user-profile-authorization` tests.

**Process:** each task implemented by a fresh Claude subagent and reviewed by a
separate one; a final Phase 1 review found 5 issues (removed endpoint, atomic
counter, unlock script, plain-text passwords, gate); all fixed and re-reviewed.

**Verification:** `npm run verify`: server 180/180, client 15 suites / 141
tests, client build compiled. Not verified: no live database or real sign-in
was used; neither script has been run against a database.

**Before deploying:** run `npm run users:encrypt-plain-passwords` (dry run) and,
if it reports any, `-- --apply`; otherwise those users cannot sign in. The master
password from the environment no longer works, so the system account's real
password must be known. Until the unlock screen (Phase 4), locked users are
unlocked with `npm run user:unlock -- <tz>` on the server.

**Requesting Codex review.** No live Codex connection from this session; this
entry is the handoff. Focus: no remaining path that accepts a password without
verification or bypasses the lock; atomic counter and conditional lock under
parallel attempts; the system account can never be locked; the two scripts
cannot corrupt already-protected passwords.

**Delivery state:** uncommitted local changes; commit awaits the owner's message.

## 2026-10-17: Permissions project, Phase 2 (permission engine, migration, guards)

**Scope:** plan Tasks 3–7 (`docs/superpowers/plans/2026-10-17-hybrid-permissions.md`).
Access now comes from permission keys computed as role defaults plus
per-account grants minus revokes, read from the database on every request
(not from the JWT). Role defaults equal what each role can do today.

**Changes:**

- `server/utils/permissions.js`: permission tree (incl. new leaves
  `vehicles.delete`, `lessons.viewAll`), role defaults, `effectivePermissions`,
  `can`, `resolveRole`, `normalizeRole` (Arabic spelling variants and misencoded
  text), `isSystemTz`, `applyLegacyEditToPermissions`. Legacy `canByRole` removed.
- `server/middleware/permissionMiddleware.js` (new): `loadActor` (401 if not
  active, 423 if locked), `requirePermission`, `requireSelfOr`, `actorLabel`.
- `requireRole`, `requireSelfOrRole`, `ADMIN_ROLES` and every `isAdminUser` copy
  removed; every route in `server/Entities/*/*.route.js` guarded by a key;
  `server/test/route-guards.test.js` lists the public routes.
- Intended changes: `viewPassword` needs `users.passwords` (system-granted only);
  permanent vehicle delete needs `vehicles.delete`; notice audience = holders of
  `notices.view`; users without a recognised role lose view access (fail-closed);
  AI chat needs sign-in and `ai.use`.
- Edit-user screen: role and vehicle-permission edits now update `role` and
  `permissionGrants` (demotion clears special permissions); `storagePermissions`
  through `PUT /user/:tz` needs `files.manageAll`.
- `server/scripts/migratePermissions.js` (`npm run permissions:migrate`):
  dry-run by default, `--apply` writes; before/after safety check per user;
  lists users with no or unknown role.
- `/api/auth/me` returns `role` and `permissions`; the client hides UI by key
  (`client/src/utils/permissionKeys.js`, `session.js`, `routeAccess.js`,
  `lessonVisibility.js`, 11 components).

**Process:** each task built by a fresh Claude subagent and reviewed by a
separate one (Tasks 4, 5, 7 needed one fix round each); final Phase 2 review
found one critical issue (edit-user role/vehicle changes ignored after
migration) and four minors; all fixed and re-reviewed.

**Verification:** `npm run verify`: server 253/253, client 17 suites / 154
tests, client build compiled. Not verified: no live database, no browser check
of the changed screens, migration not run against any data.

**Deploy order (required):** run `npm run permissions:migrate` (dry run) on the
server, fix any users listed with no/unknown role, then
`npm run permissions:migrate -- --apply` before or together with this server
code. Without it, guides/assistants with vehicle rights lose them.

**Known open items (later phases):** public `register` still accepts role,
vehicle and storage fields from the request body (Task 11); any `users.edit`
holder can set roles (rank rules in Task 10); `PUT /user/:tz` admin path can
still write session/reset fields (pre-existing).

**Requesting Codex review.** No live Codex connection from this session; this
entry is the handoff. Focus: no route more open than before; no path where JWT
roles grant access; migration safety; the edit-user role/vehicle translation.

**Delivery state:** uncommitted local changes; commit awaits the owner's message.

## 2026-10-19: Permissions project, Phase 3 (audit log)

**Scope:** plan Tasks 8–9 (`docs/superpowers/plans/2026-10-17-hybrid-permissions.md`).

**Changes:**

- `server/Entities/Audit/Audit.model.js` (collection `AuditLog`),
  `server/Entities/Audit/Audit.route.js` (`GET /api/audit`, needs `audit.view`;
  filters from/to/module/actor/action/targetId/q; 50 per page; date-only
  filters are whole days in Asia/Jerusalem; invalid date → 400 `BAD_DATE`),
  `server/utils/audit.js` (`audit.record` never throws; recursive redaction
  of passwords, hashes, tokens, OTPs, secrets; the system account's TZ is
  masked as "system"/"النظام" at write time), `readPage` in
  `server/Entities/api.js`, mounted in `server/server.js`.
- Every module records changes after a successful write: students, users
  (incl. approve, role and permission changes), reports, lessons (incl.
  roster), attendance (one row per save), notices, vehicles (alongside the
  vehicle's own log), files (upload, delete, rename, folder create, share,
  unshare) and the Google Drive connection.
- The log is append-only: no update or delete route.

**Process:** each task built by a fresh Claude subagent and reviewed by a
separate one (Task 8 needed a fix round for nested redaction; Task 9's
implementer was interrupted by a rate limit and resumed). Final Phase 3
review found the system TZ could be written into audit rows and the date
filter used UTC; both fixed and re-reviewed.

**Verification:** `npm run verify`: server 286/286, client 17 suites / 154
tests, client build compiled. Not verified: no live database; no audit page
yet (Phase 4, Task 12). Only the system account can read the log until
`audit.view` can be granted (Phase 4).

**Known open items:** the automatic lock and public registration are not yet
logged (Task 11); AuditLog indexes come with the audit page (Task 12).

**Requesting Codex review.** No live Codex connection from this session; this
entry is the handoff. Focus: nothing secret or the system TZ reaches the log;
the log cannot be read without `audit.view` or changed through any API;
logging never changes a response.

**Delivery state:** uncommitted local changes; commit awaits the owner's message.

## 2026-10-19: Permissions project, Phase 4 (who may change whom, permissions screen, audit page)

**Scope:** plan Tasks 10–12.

**Changes:**

- `server/utils/permissionRules.js` (new): who may change whom — a manager
  edits only lower-rank users, never peers, the system account, or holders of
  a dangerous key; permission managers change others only and grant only what
  they hold (never dangerous keys); roles are assigned only below one's own
  rank; demotion clears special permissions.
- `server/Entities/User/User.controller.js` / `User.route.js`:
  `GET`/`PUT /api/user/:tz/permissions` (`permissions.manage`),
  `PUT /api/user/:tz/role` (`users.changeRole`), `POST /api/user/:tz/unlock`
  (`users.unlock`). `PUT /api/user/:tz` no longer changes tz, role, grants,
  vehicle rights, storage folder or session fields; setting another user's
  password needs `users.passwords`. ID numbers are trimmed and validated on
  create and checked across all three rooms (leading zeros ignored).
  Approval and user creation give a first role below the approver's own rank.
  Register and create derive the storage folder on the server. The automatic
  lock is written to the audit log. Photo changes need rank over the target.
- Client: permissions tab on the user page (`PermissionsTab.jsx`,
  `permissionTree.js`), role picker and approve dialogs (roles below one's
  own; the system account sees all), unlock buttons, "my permissions" on the
  profile, `/audit` page and recent-changes panels, actions hidden for users
  the viewer cannot manage. AuditLog indexes added.

**Process:** each task built by a fresh Claude subagent and reviewed by a
separate one; every task needed one fix round (Task 11's review found that an
ID number padded with spaces could become the system account — fixed). The
final Phase 4 review found that any admin could set another user's password;
fixed together with cross-room duplicate IDs, a stray-record upsert and photo
access.

**Verification:** `npm run verify`: server 370/370, client 20 suites / 194
tests, client build compiled. Not verified: no browser check of the new
screens (no reachable database from this machine) — owed.

**Deploy notes:** default admins have no permissions tab and cannot change
roles until the system account grants them `permissions.manage` and/or
`users.changeRole`. Approving a registrant now requires choosing a role.

**Known open item (fixed first in Phase 5):** a `users.edit` holder can change
a subordinate's email and then use forgot-password to reset their password.

**Requesting Codex review.** No live Codex connection from this session; this
entry is the handoff. Focus: any path to gain a role/permission or edit a peer
or the system account; ID-number tricks; the permissions tab sending only
changes the server accepts.

**Delivery state:** committed by the agent with the owner's standing approval
(2026-10-19); not pushed.

## 2026-10-19: Permissions project, Phase 5 (system account)

**Scope:** plan Tasks 13–14, plus two items carried from the Phase 4 review.

**Changes:**

- Carried fixes: changing another user's email needs `users.passwords` (it
  was a way to take over an account through forgot-password); duplicate-ID
  checks no longer pass silently on a database error.
- Hidden system account (`SYSTEM_ADMIN_TZ`): left out of user lists and
  lookups, pickers, vehicle responsibles, notice recipients, file sharing and
  dashboard counts; lessons refuse it as teacher or helper; its actions are
  stored and shown as "system" / "النظام" (`actorRef`, `actorDisplayName` in
  `server/utils/permissions.js`).
- Passwords: `POST /api/auth/change-password` is now the only way for anyone
  to change their own password (current password, 8–128 characters, must
  differ; wrong attempts count toward the lockout). Older sessions end when a
  password changes or the system account is recovered.
- System account: password must change every 30 days (and at the first
  sign-in after deploy); recovery by a `systemRecovery.reset` holder only after
  3+ failed sign-ins (rate limited, 10-minute cooldown) with a temporary
  password emailed only to `SYSTEM_ADMIN_EMAIL`; IT script
  `npm run system:recover`; alert email every 5th failed sign-in;
  forgot-password for it goes only to `SYSTEM_ADMIN_EMAIL`.
- Client: forced password-change screen, change-own-password form on the
  profile, recovery button on the users page, reset-by-email shows the
  password rule.
- New: `server/utils/systemPassword.js`, `server/scripts/systemRecover.js`,
  `client/src/Components/Auth/ForcedPasswordChange/`,
  `client/src/Components/Profile/ChangeOwnPassword.jsx`,
  `client/src/utils/passwordChange.js`, tests `system-account`,
  `system-password`.

**Process:** each task built by a fresh Claude subagent and reviewed by a
separate one (both needed one fix round; Task 13's implementer was interrupted
by a usage limit and resumed). The final Phase 5 review found that the system
account's forgot-password went to a changeable address and that reset-by-email
gave an unreadable error; both fixed and re-reviewed.

**Verification:** `npm run verify`: server 437/437, client 21 suites / 201
tests, client build compiled. Not verified: no browser check, no real email
sent, no database.

**Deploy steps for the owner:**
1. In the server's environment (not in the repo) set `SYSTEM_ADMIN_EMAIL` to
   the real mailbox and configure `SMTP_*`; the server warns at startup if
   either is missing.
2. After deploy, the system account must choose a new password at its first
   sign-in, then every 30 days.
3. Lost access: `npm run system:recover` on the server emails a temporary
   password; if the mailbox itself is lost, change `SYSTEM_ADMIN_EMAIL`,
   restart, then run the script.
4. Users who change their password are signed out of their other tabs.

**Requesting Codex review.** No live Codex connection from this session; this
entry is the handoff. Focus: nobody but the owner can take over or lock out
the system account; its ID, name and temporary password never leave the
server except to its mailbox.

**Delivery state:** committed by the agent with the owner's standing approval;
not pushed.

## 2026-10-20: Permissions project, Phase 6 (guides see only their students)

**Scope:** plan Tasks 15–17 — the last phase of
`docs/superpowers/plans/2026-10-17-hybrid-permissions.md`.

**Changes:**

- `server/utils/studentScope.js` (new): a user without `students.viewAll`
  sees only students whose responsible guide (`main_teacher`, the existing
  field — used instead of a new one) is him, plus students in lessons where he
  is teacher or helper. Matches ids stored as string or ObjectId.
- Students: list, view, edit, photo and delete are limited to that scope
  (hidden students answer 404 like missing ones); only `students.viewAll`
  holders set the responsible guide; a guide who creates a student becomes
  its guide; ID-number changes that collide are refused; delete removes only
  the record found. New `GET /api/student/lookup/:tz` (exact full ID only,
  not students pending approval, rate limited).
- Lessons: responses show only visible students plus a count of the others;
  saving a roster never removes students the guide can't see; a guide can't
  make himself teacher or helper of someone else's lesson; students outside
  his scope are added only by exact ID number (`list_tz`, max 50) — internal
  record ids he can't see are ignored.
- Attendance: the sheet and save cover only visible students on that lesson.
- Client: one responsible-guide select (admins), "others: N" on the roster,
  add a student by full ID number, guides preselected as teacher on a new
  lesson, one shared Israeli-ID validator.

**Process:** each task built by a fresh Claude subagent and reviewed by a
separate one. Task 16 needed two fix rounds (a guide could add himself to
another guide's lesson, and could add children by guessing internal ids);
Task 17 was interrupted by a usage limit and resumed. The final Phase 6
review found that an admin could not save a student whose guide had been
deactivated, and that older records stored as ObjectId would not match;
both fixed and re-reviewed.

**Verification:** `npm run verify`: server 476/476, client 21 suites / 217
tests, client build compiled. Not verified: no browser check (no reachable
database), no production data.

**Before deploying:** check in production that guides see their students
(sign in as one guide after deploy); the browser checks owed from Phases 4–6
(permissions tab, forced password change, roster "others: N", add by ID).

**Requesting Codex review.** No live Codex connection from this session; this
entry is the handoff. Focus: no endpoint lets a guide see, add or remove a
child outside his scope.

**Delivery state:** committed by the agent with the owner's standing approval;
not pushed.

## 2026-10-20: Smart assistant, Phase A (secure live channel and alerts)

**Scope:** plan `docs/superpowers/plans/2026-10-20-smart-assistant.md` Tasks
1–3 (spec `docs/superpowers/specs/2026-10-20-smart-assistant-design.md`).

**Changes:**

- Live channel `/api/live` (new): single-use 60-second tickets stored hashed
  in MongoDB, an SSE stream per signed-in user fed from MongoDB (works across
  several server processes), user re-checked every minute, 1-hour cap. The
  old `/api/events` (open to everyone) and the broadcast of server errors are
  removed. File changes reach only the owner, people it is shared with and
  `files.manageAll` holders, without ID numbers or paths.
- Alerts (new `AiAlerts`, `server/services/alertEngine.js`, `alertJob.js`):
  parent registrations, users waiting for approval, locked accounts, access
  changes, failed system sign-ins, lessons without attendance, three real
  absences in a row (auto-marked absences don't count), missing reports, and
  vehicle documents. Each goes only to users entitled to it now; ar/he/en
  text; one per day per user; the 15-minute job runs 07:00–21:00 Israel time
  under a lock; old alerts expire after 180 days.
- Attendance rows written by the nightly job are now marked `auto: true`.
- Client: the floating assistant is back for `ai.use` holders with an alerts
  tab, unread badge and in-app links; the chat tab says "coming soon" until
  Phase B.
- A fatal error now always restarts the server within 5 seconds even with
  open live connections.

**Process:** each task built by a fresh Claude subagent and reviewed by a
separate one (each needed one fix round). The final Phase A review found a
possible hour-long outage after a crash, ID numbers in file events and an
extra database count per poll; fixed and re-reviewed.

**Verification:** `npm run verify`: server 548/548, client 23 suites / 234
tests, build compiled. Not verified: no browser check, no database.

**Note:** `client/src/Components/Profile/Profile.jsx` has an uncommitted
change (the "my permissions" list commented out) that is not part of this
work; left for the owner.

**Requesting Codex review.** No live Codex connection from this session; this
entry is the handoff.

**Delivery state:** committed by the agent with the owner's standing approval;
not pushed.

## 2026-10-20: Smart assistant, Phase B (conversation engine and chat)

**Scope:** plan `docs/superpowers/plans/2026-10-20-smart-assistant.md` Tasks 4–6.

**Changes:**

- Read tools for the assistant (`server/services/assistant/`): whoami,
  search_students, get_student, list_lessons, attendance_summary,
  pending_items, vehicle_alerts, my_reports, notices, navigate. Every tool
  runs as the signed-in user with the same permission and scope rules as the
  screens (a guide only reaches his own students); strict input schemas;
  results trimmed; the system account never appears; a child's ID number and
  parents' phones are sent to the model only when explicitly asked for; tool
  calls are logged by actor id, tool and input keys only.
- `POST /api/ai/chat` streams the answer; Claude (`claude-opus-5-5`, low
  effort, with server-side fallback) can call the tools up to 8 rounds per
  message; conversations are saved per user only after each round completes
  (no half-saved turns after errors, refusals or closed tabs); 30 messages per
  user per hour; one turn at a time per conversation; conversations capped in
  size and deleted after 90 days unused; list / open / delete conversations.
- Chat UI in the floating assistant: streaming text, conversation list,
  suggestions by permission, navigation buttons, copy, ar/he/en. Model text is
  shown as Markdown through `marked` 12.0.2 + `dompurify` 3.1.6 with raw HTML
  escaped and links only to the app's own screens.

**Process:** each task built by a fresh Claude subagent and reviewed by a
separate one (search inputs were being written to the log; a link with a
hidden tab character could leave the site — both fixed). The final Phase B
review found a stop reason that could break a conversation permanently, no
lock against two sends at once, and a chat that could stay stuck after an
error; fixed and re-reviewed.

**Verification:** `npm run verify`: server 623/623, client 27 suites / 285
tests, build compiled. Not verified: no real Anthropic key (the SDK request
shapes were checked against the installed 0.125.0 types only), no browser,
no database.

**Before release:** set `ANTHROPIC_API_KEY` on the server; try one text
question, one data question, stopping mid-answer, and two tabs on the same
conversation. Mention in the privacy policy that questions and the data
needed to answer them are sent to Anthropic.

**Requesting Codex review.** No live Codex connection from this session; this
entry is the handoff.

**Delivery state:** committed by the agent with the owner's standing approval;
not pushed. The owner's own in-progress UI edits (Header, Profile,
EditStudent, EditUser, ViewAllUser, session.js) are not part of this commit.

## 2026-10-21: Smart assistant, Phase C (actions after approval)

**Scope:** plan `docs/superpowers/plans/2026-10-20-smart-assistant.md` Tasks 7–8
— the last phase of the assistant.

**Changes:**

- The assistant can propose five actions: save attendance, add a child to a
  lesson (by full ID number, existing rules), write a report, publish a
  notice, approve a waiting user (existing approval rule). A proposal stores
  nothing but a pending action (`AiPendingActions`, 15 minutes, single use).
- The chat shows a card with everything that will be written, in full and as
  plain text; nothing changes until the user presses "approve" (extra
  confirmation for notices and user approval). On approval the server checks
  the user's permissions again, runs exactly the stored values through the
  same code as the normal screens, and records the change in the audit log
  with `via: "assistant"`. Refused, expired, cancelled and already-used
  actions show a clear state; a lost response no longer shows a completed
  action as "not carried out".
- Text written by the model or typed by outside people never appears in the
  system notes the assistant reads back.

**Process:** each task built by a fresh Claude subagent and reviewed by a
separate one. Task 7's review found the card cut long notice/report text
after 120 characters (content could be hidden from the approver) and model
text reaching system notes — both fixed. The final Phase C review found the
lost-response case; fixed and re-reviewed.

**Verification:** `npm run verify`: server 668/668, client 28 suites / 312
tests, build compiled (one run had a single timing-sensitive test file fail
once; two following full runs were clean). Not verified: no browser, no
database, no real Anthropic key.

**Before release:** with `ANTHROPIC_API_KEY` set on staging, try one action of
each kind, approve and cancel, and let one card expire.

**Requesting Codex review.** No live Codex connection from this session; this
entry is the handoff.

**Delivery state:** committed by the agent with the owner's standing approval;
not pushed. The owner's own in-progress UI edits (Header, Profile,
EditStudent, EditUser, ViewAllUser, session.js) are not part of this commit.

## 2026-10-21: AI switched off by default (AI_ENABLED)

**Owner request:** hide the AI from the system for now.

**Changes:** `server/utils/aiFeature.js` (new) — AI is on only when
`AI_ENABLED=true` and `ANTHROPIC_API_KEY` is set. While off, every chat and
action route under `/api/ai` answers 404 `AI_DISABLED` (new
`GET /api/ai/status` tells the client), and vehicle document reading is off
(`/api/vehicle/extract` 404, status `available:false`). Client: the assistant
panel shows only the alerts tab (no chat, no "explain" button) and the
"read document" helper on vehicle forms is hidden. Real-time alerts are
unchanged. `server/config/.env.example` documents `AI_ENABLED=false`.
Tests: `server/test/ai-feature.test.js` (new), `client/src/utils/assistantChat.test.js`.

**Verification:** `npm run verify`: server 671/671, client 28 suites / 313
tests, build compiled. Not checked in a browser.

**Requesting Codex review.** No live Codex connection; this entry is the handoff.

**Delivery state:** committed by the agent with the owner's standing approval; not pushed.

## 2026-10-21: Product tour (onboarding)

**Owner request:** a guided product tour: welcome on first sign-in, a tour per
section screen, prompts when a user gains new access, a what's-new list, and a
help center to replay tours.

**Changes:** Server: `server/utils/tourState.js` (progress, known permission
keys, seen releases), `server/routes/tours.routes.js` (`/api/tours`: progress,
known keys, seen releases, reset), user fields `tours` / `knownKeys` /
`seenReleases`, and a `tourSummary` in `getOneU`. Client: `client/src/tours/`
(`registry.js` TOURS + PENDING_TOURS, `releases.js` RELEASES, `sections.js`,
`logic.js`, `TourProvider.jsx`, `runTour.js`, `HelpCenter.jsx`),
`client/src/i18n/tourStrings.js` (ar/he/en), driver.js 1.3.1. Later fixes:
page stays usable when a tour fails, tour waits for typing to stop, stale tour
navigation dropped, routes anchored, the assistant tour opens its tabs and
closes the panel afterwards. Registry comment explains how to add a tour or a
what's-new entry. Tests in the review: server `tour-state`, `tours-routes`;
client tour logic tests.

**Task 6 (after the owner's UI edits were committed, 3a3ceea):** menu steps in
the welcome tour (the mobile side menu opens for them), `users`, `user`
(including the permissions tab), `student` and `profile` tours, "new" badges
on menu links (on the bell for notices), and a tour status section with
"show again at next sign-in" on the user page. `PENDING_TOURS` is empty.

**Final review fixes:** tour navigation now asks before leaving a page with
unsaved edits (shared `confirmLeave` in `utils/unsavedChanges.js`, also used by
Header); tour writes update one entry and never create a user
(`UserModelDef.updateExisting`); automatic tours wait for typing to stop before
probing tabs; tab events carry the tour id; tour status only for active
accounts; `known-keys` rejects a non-array body.

**Verification:** `npm test` at the repo root: server 694/694, client 31
suites / 368 tests; `cd client && npm run build` compiled. Not checked in a
browser; no database (the nested `tours.<id>` write is worth one real-DB check).

**Requesting Codex review.** No live Codex connection; this entry is the handoff.

**Delivery state:** committed by the agent with the owner's standing approval;
not pushed.

## 2026-10-22: Guided journey with illustrated guides and a training mode

**Owner request:** an illustrated guide (تمهيد for women, إبراهيم for men,
chosen by the user's gender) that walks a user through one journey in 13
chapters covering every screen and dialog, with examples that are never saved
to the database or to Drive.

**Changes:** `client/src/journey/` holds the feature: `demoMode`, `demoData`,
`demoRoutes`, `demoAdapter`, `demoDocument`, `TrainingBanner`, `characters`,
`Guide`, `JourneyProvider`, `JourneyOffer`, `actions`, `journeyLogic` and
`chapters/*` (intro, dashboard, students, lessons, attendance, reports, files,
vehicles, notices, users, audit, assistant, profile). `chapters/index.js`
carries a "how to add a chapter" comment. `client/src/tours/` keeps
`TourProvider`, `HelpCenter`, `releases`, `sections` and `NewBadge`; the old
per-screen tours and driver.js are removed. `server/utils/tourState.js`
`tourSummary` now counts `journey-*` ids. The same day, in their own commits:
Arabic-only app and Arabic polish (`docs/arabic-style-guide.md`), dependency
security updates (jspdf 4, nodemailer 10, dompurify 3.4.17; puppeteer,
html2pdf.js and react-quill removed), role labels, site title.

**Safety design:** training mode keeps everything in memory. An axios demo
adapter answers only requests on a method-exact allowlist in `demoRoutes`;
anything else is refused, so no real call is made. `fetch`, `EventSource`,
`window.open` and PDF generation are guarded while training. Every save a
chapter performs must be handled in `demoRoutes`. Small real-mode UI changes:
an in-page new-folder dialog (replacing the browser prompt) and a «إلغاء»
button on the password form.

**Verification:** `npm test` at the repo root: server 694/694, client 46
suites / 506 tests; `cd client && npm run build` compiled successfully. Not
checked in a browser: no test credentials, and the server uses the owner's
real database.

**Requesting Codex review.** No live Codex connection; this entry is the handoff.

**Delivery state:** committed with the owner's approval; not pushed.

## 2026-10-24: Tamheed Sport phase 1 (sport site and the «الرياضة» section)

**Owner request:** a sub-site at sport.<domain> for the association's students,
sharing the system's database. Each student signs in with their ID number and
a code sent to their email, and sees their own FIFA-style player card per
sport, their next training and their teams. Staff manage sports, teams,
players and trainings in a new «الرياضة» section. Spec:
`docs/superpowers/specs/2026-10-24-tamheed-sport-design.md`. Plan:
`docs/superpowers/plans/2026-10-24-tamheed-sport-phase1.md`.

**Changes (8f90e55..e37991d, 14 commits):**
- **Permissions:** `sports` module (view, coach, manage) on server and client.
- **Data:** `server/Entities/Sport/*` models and `server/utils/sportCards.js`.
- **Staff API:** `/api/sports` in `Sport.controller.js` and `Sport.route.js`.
- **Student sign-in:** `server/Entities/SportPortal/*` with `server/utils/otp.js`. Cookie `tamheed_sport`, a separate `SPORT_SESSION_SECRET`, uniform answers, a per-student lock and an IP rate limit keyed on `req.ip`.
- **Hosting:** `server/utils/sportHost.js` serves `sport/dist` by host name, only when `SERVE_CLIENT=true`.
- **Staff client:** `client/src/Components/Sport/*`.
- **Student site:** the Vite app in `sport/`.
- **Deployment:** `deploy/update.sh`, a nginx sport block, and a «موقع الرياضة» section in `DEPLOY.md`.

**Review:** subagent-driven, with a task review after each task and a final
whole-branch review. The final review raised one Important finding: the
coach student search matched and returned `tz`. It was fixed in e37991d,
together with these smaller fixes:
- IP limit 30;
- nosniff and X-Frame-Options on sport responses;
- `ageOn` returns null for a future birth date;
- larger tab hit area.

**Verification:**
- server 748/748, client 50 suites / 538 tests, sport 15/15;
- the client and sport builds are clean;
- the sport UI was checked at 360px against a mock API with made-up data.

Not tested against a live server: a real sign-in needs a real student and an
emailed code.

**Open notes for review:**
- A user needs `sports.view` together with `coach` or `manage`.
- Student sessions (30 days) cannot be revoked one by one.
- The staff refresh cookie (domain-wide) also reaches the sport host. This predates the branch.

**Requesting Codex review.** No live Codex connection; this entry is the handoff.

**Delivery state:** committed with the owner's approval; not pushed.

## 2026-10-24: Tamheed Sport v2 (football lessons, attendance, stats, flip card)

**Owner request:** rebuild the sport section around one sport, football. The
association's football sessions become lessons in the outdoor room, with
per-session attendance, configurable player stats and a flip player card on
the sport site. Spec: `docs/superpowers/specs/2026-10-24-tamheed-sport-v2-design.md`.
Plan: `docs/superpowers/plans/2026-10-24-tamheed-sport-v2.md`.

**Changes (f4cbd4a..HEAD):**
- **Data (server):** new `SportLesson.model.js` and `SportAttendance.model.js`; `SportPlayer.model.js` gains `stats`; `SportTeam.model.js` and `SportTraining.model.js` are removed; `api.js` gains a helper for conditional writes; `server.js` registers the new indexes.
- **Calculations:** `server/utils/sportCards.js` is rebuilt (`israelToday`, `dayOfDate`, attendance rate from each member's `joinedAt`, next lesson, `buildCard`); `server/utils/lessonConflict.js` checks room 9 both ways.
- **Staff API:** `Sport.controller.js` and `Sport.route.js` are rewritten (`ensureFootball`, players, stats and stat settings, lessons, attendance, today's lessons).
- **Lesson schedule:** `Lesson.controller.js` and `Lesson.route.js` show sport lessons read-only and check conflicts.
- **Student portal:** `SportPortal.controller.js` serves the card, lessons and attendance history.
- **Tests (server):** `sport-lessons`, `lesson-sport-schedule`, `sport-staff`, `sport-cards` and `sport-portal-data`, plus small updates to `assistant-actions`, `lesson-attendance-audit` and `student-scope-routes`.
- **Staff client:** `client/src/Components/Sport/*` (players, lessons, attendance and stat settings tabs; the sports, teams and trainings tabs are removed), `sportStrings.js`, `functionsSport.jsx`, `functionsLesson.jsx`, `ViewAllLesson.jsx` and its CSS, `sportSchedule.js`, `lessonVisibility.js`, `routeAccess.js` and their tests.
- **Student site (`sport/src/*`):** stadium theme, flip player card (`FlipCard.jsx`, `Art.jsx`, `StadiumHeader.jsx`), `LessonsPage.jsx`, `HomePage.jsx`, `LoginPage.jsx`, `BottomTabs.jsx`, `format.js` and its test, `styles.css`; `PlayerCard.jsx` and `TeamsPage.jsx` are removed.
- **Demo data and docs:** `server/scripts/seedSportDemo.js` is rewritten for football lessons; `deploy/DEPLOY.md` gets one line on the script.

**Verification:**
- server 773/773, client 51 suites / 551 tests, sport 21/21.
- The demo script was run against a local MongoDB (scratch database, no remote server touched). It seeded 16 demo students, 3 lessons, 16 players and 126 attendance records with all three statuses. Every date was in the past and on its lesson's weekday. `buildCard` built a card with stat values and an attendance rate. A second seed was refused.
- `--remove` left 0 demo documents. A non-demo student and a non-demo sport survived, and football was kept. The test documents and the scratch database were then removed.

Not tested against a live server: a real student sign-in needs an emailed code.

**Open notes for review:**
- `--remove` deletes demo players, so demo stat values go, but football's stat labels set by the seed (when it had none) stay.
- A lesson counts as demo data only when it has one of the three demo lesson names and holds only demo students.
- Student sessions (30 days) still cannot be revoked one by one.

**Requesting Codex review.** No live Codex connection; this entry is the handoff.

**Delivery state:** committed with the owner's approval; not pushed.

## 2026-10-24: Sport site moved from Vite to Create React App

**Owner request:**
- Build the sport site the same way as the client: CRA, with output in `build`.

**Changes:**
- `sport/` now uses `react-scripts` 5.0.1, like `client/`. It has `public/index.html`, `src/index.js`, the `proxy` setting and `eslintConfig`.
- `vite.config.js` is gone, and so is the root `index.html`.
- Tests run on Jest; the Vitest imports were removed.
- `sport/.env.development` sets `PORT=3001`, so the dev server does not clash with the client's 3000.
- The build goes to `sport/build`, as the client's does. To match, `server/server.js` now serves `sport/build` and `.gitignore` ignores `sport/build`.
- `deploy/update.sh` is unchanged; it still runs `npm ci` and `npm run build` in `sport/`.

**Verification:**
- sport: 21/21 (Jest);
- `CI=true npm run build --prefix sport` is clean;
- server: 778/778;
- the built site was checked at 360px against a mock API.

**Requesting Codex review.** No live Codex connection; this entry is the handoff.

**Delivery state:** committed with the owner's approval; not pushed.

## 2026-10-24: Sports section: search by ID or name, player card, lesson rows

**Owner request:** in the system's «الرياضة» section:
- add a child by ID number or free search, with all students listed when the search is empty;
- show the player's card with photo and the ID number in «اللاعبون»;
- lessons as rows, not a weekly grid, added by day, start time and end time only;
- add a student to a lesson the same way, and the student becomes a player automatically.

The owner explicitly reversed the earlier rule that hid ID numbers from sports staff.

**Changes (84057f1..f806314):**
- **`server/Entities/Sport/Sport.controller.js` and `Sport.route.js`:**
  - Search matches the ID number or the name. An empty query returns all students. Results include `tz` and `photo`, with no cap.
  - `/players` adds `tz`, `photo` and `birthDate`.
  - A lesson's name is optional. The server generates «كرة القدم · <اليوم> <HH:MM>» and stores `nameGenerated`, and it regenerates the name only for generated names.
  - `studentIds` is optional on lesson PUT, so the roster is kept.
  - New `POST /lessons/:id/players`, which creates the player when needed, and `DELETE /lessons/:id/players/:studentId`. Both need coach or manage.
- **`server/Entities/Sport/SportLesson.model.js`:** adds `nameGenerated`.
- **Client:** new `StudentPicker.jsx`, `LessonRosterDialog.jsx`, `PlayerCardModal.jsx` and `PlayerCardModal.module.css`. Updated `PlayersTab`, `LessonsTab`, `AddPlayerDialog`, `sportForm`, `functionsSport` and `sportStrings`.

**Verification:**
- server 787/787 and client 560/560, and the client build is clean;
- task review approved, and the minor findings were fixed in f806314.

The new screens were not checked in a browser.

**Requesting Codex review.** No live Codex connection; this entry is the handoff.

**Delivery state:** committed with the owner's approval; not pushed.

## 2026-10-24: Tamheed apps phase 1 (installable PWAs, push, offline attendance)

**Owner request:**
- Make the system and the sport site installable as apps (PWA), with offline reading.
- Record attendance offline and sync it later.
- Send web push to phones: staff get no-attendance alerts and new notices, and players get a reminder before training and a message when their card changes.
- Staff can turn notifications on in their profile; players opt in from the sport site.

**Changes (3ff1bb8..HEAD):**
- **Server:**
  - `Entities/Push/` (`Push.route.js`, `PushSubscription.model.js`) and `utils/push.js` add web push subscriptions and a sender. Only push-service endpoints are accepted, and subscriptions are limited per user.
  - `services/alertJob.js`, `alertEngine.js`, `alertAccess.js`, `alertTemplates.js` and `Notice.controller.js` push no-attendance alerts and new notices to staff. Empty sport lessons are skipped.
  - `services/sportPushJob.js` and `utils/cardPush.js` remind players before training and tell them when their card changes. `SportPlayer.model.js` and `server.js` are updated to match.
  - `Attendance.controller.js`, `Attendance.model.js`, `Sport.controller.js` and `SportAttendance.model.js` tell the client when a save replaced someone else's mark.
  - `SportPortal.route.js` and `config/.env.example` gain the push routes and the three `VAPID_*` settings.
- **Client (system):**
  - PWA shell: `index.js`, `service-worker.js`, `serviceWorkerRegistration.js`, `public/index.html`, `public/manifest.json`, icons, `pwa/AppChrome.jsx`, `pwa/shouldCache.js`.
  - Offline attendance: `pwa/attendanceQueue.js` and `pwa/queuedSave.js` keep only the latest queued mark per lesson and date. `pwa/QueueStatus.jsx` shows the queue. `AttendancePage.jsx`, `Sport/AttendanceTab.jsx` and `functionsAttendance.jsx` use it.
  - Notifications opt-in: `pwa/pushOptIn.js` and the «إشعارات الهاتف» section in `Profile.jsx`.
  - Session end clears cached data: `pwa/clearApiCache.js`, `WebServer/utils/logoutScheduler.js`, `accessScheduler.js`, `api.jsx` and `fuctionsAuth.jsx`.
- **Sport site (`sport/`):**
  - Installable as an app, with `service-worker.js`, `serviceWorkerRegistration.js`, `public/manifest.json`, icons, `pwa/AppChrome.jsx` and `pwa/shouldCache.js`. The offline card is cached, and the reminder button is `pwa/PushButton.jsx` with `pwa/pushOptIn.js`.
  - Pages and styles: `App.jsx`, `HomePage.jsx`, `LoginPage.jsx`, `styles.css`.

**Verification:**
- server 822/822 (`npm test --prefix server`, run for this entry).
- client 595 tests, sport 42 tests, per the owner's run before this entry.
- Client and sport builds are clean.
- Nothing has been tried on a real phone yet.

**Open notes for review:**
- No device testing: Android install, iOS Add to Home Screen, and push delivery are not checked on real devices.
- No tests for the push opt-in UI (`Profile.jsx` section and `PushButton.jsx`).
- Re-subscribe edge cases are untested for both staff and students: an expired or replaced push subscription, and a student who signs in on a second device.

**Requesting Codex review.** No live Codex connection; this entry is the handoff.

**Delivery state:** committed with the owner's approval; not pushed.

## 2026-10-25: Sport site shows staff changes without signing in again

**Owner report:** after a player's data changed in the system, the sport site kept showing the old data until the student signed out and in again.

**Root cause:**
- The site loaded `/me` only once, when it opened. An installed app stays open in the background, so returning to it showed stale data.
- Separately, `/photo` has a fixed URL that is cached for an hour, so a new photo stayed hidden.

**Changes:**
- `sport/src/refreshOnReturn.js` (new): when the signed-in app is shown again, gets focus or comes back online, it quietly re-fetches `/me`, at most once per 15 seconds. Wired in `sport/src/App.jsx`.
- `/me` returns `student.photoVersion`, a short hash of the photo link (`server/Entities/SportPortal/SportPortal.controller.js`).
- The card loads `/api/sport-portal/photo?v=<version>` (`sport/src/api.js`, `sport/src/FlipCard.jsx`).

**Verification:**
- server 823/823, sport 49/49, and the sport build is clean;
- in the browser against a mock whose `/me` value changes, the card value updated when the app returned to view.

**Requesting Codex review.** No live Codex connection; this entry is the handoff.

**Delivery state:** committed with the owner's approval; not pushed.

## 2026-10-25: Stage A, item locks, stale-save protection and live updates

**Owner request:**
- Stop two people from editing the same item at once: the second person sees who holds it and can only read.
- Refuse a save made from an out-of-date screen, instead of overwriting the other person's work.
- Show changes made by others on every open screen within 2 seconds, and on the player's sport site.

**Changes (81c85a1..HEAD, plus this commit):**
- **Server, locks and live hub:**
  - `services/locks.js`, `Entities/Lock/Lock.model.js`, `Lock.route.js` and `middleware/lockGuard.js` add tab-owned locks (heartbeat 20 s, expiry 120 s, admin release) and the stale-save version check.
  - `services/liveHub.js` is the in-memory fan-out: `change` and `lock` events to staff, `me` to players. `Entities/Live/Live.route.js` streams them.
  - `Entities/SportPortal/SportPortal.live.js` (new) and `SportPortal.route.js` add `GET /api/sport-portal/live`, an SSE stream for the signed-in student.
  - Write paths refuse with 423 `LOCKED` or 409 `STALE` and announce their changes: `Attendance`, `Lesson`, `Report`, `Sport` (and `SportAttendance`, `SportLesson`), `Student`, `User` and `Vehicle` controllers, models and routes, plus `Entities/api.js` and `server.js`.
  - `services/assistant/actionRunner.js`: assistant actions obey locks.
- **Client (system):**
  - `locks/`: `useItemLock`, `LockedScreen`, `ReadOnlyArea`, `StillHereDialog`, `SaveNotice`, `staleSave`, `clientId`, `forceRelease`, `withLock`, `useLiveRefresh`, `useReloadOnUnblock`, `LiveEventsProvider`.
  - `WebServer/services/live/liveStream.js` and `WebServer/services/api.jsx`, plus the `functions*` services (attendance, lesson, report, sport, student, user, vehicle), send `X-Client-Id` and read the new statuses.
  - Edit and list screens: Attendance, Lesson, Report, Student, User, Vehicle, and the Sport tabs and dialogs.
  - `pwa/attendanceQueue.js` (this commit): 423 is a transient status, so a locked sheet stays queued and is retried later.
- **Sport site (this commit):** `sport/src/liveMe.js` (new) opens an `EventSource` to `/api/sport-portal/live` with backoff (1 s up to 30 s) and a single reload on reopen; `App.jsx` reloads `/me` on `me` and closes the stream on logout or 401.
- **Deploy and docs (this commit):** `deploy/nginx-tamheed.conf` now has an SSE location (no buffering, 1 h read timeout) for `/api/live/`, `/api/ai/chat` and `/api/sport-portal/live` in both server blocks. `deploy/DEPLOY.md` has a troubleshooting row for it.
- **Tests:** `server/test/` (`locks`, `lock-guard`, `live-hub`, `sport-live`, and updated suites for each write path), `client/src/locks/*.test.js`, `EditStudent.lock.test.js`, `attendanceQueue.test.js`, `sport/src/liveMe.test.js`, `sport/src/App.live.test.js`.

**Verification:**
- server 882/882, client 630/630, sport 56/56.
- `CI=false` client build and `CI=true` sport build both compile clean.
- nginx was not reloaded and the SSE locations were not tried against a real nginx.

**Open notes for review:**
- The live hub is in memory, so `me`, `change` and `lock` events reach only streams on the same server process. A second process (cluster, pm2 instances) would miss them; staff streams also poll the database every 10 s, the sport stream does not.
- Pending queued attendance that hits 423 retries only on the next flush trigger (reconnect or the queue's own timer); there is no separate message for it.
- The sport stream is not capped in length and is not re-checked after the cookie expires; a stream stays open until the client or proxy closes it (nginx cap is 1 h, then the client reopens).
- No browser or real-device test of the lock screen, the idle prompt, or the sport live update with a real EventSource.

**Requesting Codex review.** No live Codex connection; this entry is the handoff.

**Delivery state:** committed with the owner's approval; not pushed.

**Codex review attempt (2026-10-26, owner request):** Claude Code ran the Codex CLI that comes with the Codex app (`%LOCALAPPDATA%\OpenAI\Codex\bin\codex.exe`, v0.130.0-alpha.5) in read-only mode on the range 81c85a1..54dd250. **No review was received.** The first run failed to load `~/.codex/config.toml`, because this CLI doesn't know `model_reasoning_effort = "ultra"`. The second run, with a one-run override to `xhigh`, was refused by the server: `gpt-6-astra` needs a newer Codex. The config was not changed. The newer `codex.exe` inside the app package can't be run from outside the app. The owner then asked to update the CLI (see the next paragraph).

**Codex review (2026-10-26, Codex CLI 0.164.0, gpt-6-astra, read-only, range 81c85a1..54dd250):** received. Codex reports six confirmed defects; Claude has not yet checked them.
1. **High**: `server/Entities/Report/Report.route.js:7` (same pattern in the lesson, sport and vehicle routes). The lock key uses the raw ID from the URL. An uppercase ObjectId reaches the same record without getting 423.
2. **High**: `server/middleware/lockGuard.js:32`, `server/Entities/Lesson/Lesson.controller.js:328`. The lock check and version check are separate reads, and the update filters only by ID. A delayed save can overwrite a newer save after its lock expires or is released. Two concurrent calls with the same baseVersion both returned 200.
3. **High**: `server/middleware/lockGuard.js:69`, `client/src/Components/Attendance/AttendancePage.jsx:279`. Queued attendance and the assistant's attendance action (`actionRunner.js:167`) send no baseVersion, and the guard accepts that. Sport attendance (`Sport.controller.js:474`) doesn't check a version at all.
4. **High**: `server/Entities/Sport/Sport.controller.js:217`. Saving a player replaces lesson rosters but checks only the `player:<id>` lock, not the `sportLesson` locks.
5. **Medium**: `server/Entities/Lock/Lock.route.js:39`. A report lock ignores ownership: `reports.editOwn` lets a user lock someone else's report, and the holder lookup exposes the holder's name and ID number.
6. **Medium**: `server/Entities/Live/Live.route.js:193`. Staff `change` and `lock` events go out without checking module permissions or record visibility, which leaks identifiers and activity.

Codex verification: 56 targeted isolated tests passed, plus in-memory reproductions; no files changed. Codex recommends behavioral tests for normalized IDs, concurrent saves across lock expiry, stale queued and assistant attendance, cross-player roster writes, and lock/SSE authorization, then `npm run verify` and browser checks.

**Status:** review received; the findings are waiting for Claude (the implementer) to answer and fix them.

## 2026-10-26: Fixes for Codex's Stage A findings (Claude implementer, Codex reviewer)

**Owner request:** check Codex's six Stage A findings, fix the confirmed ones with tests, and send the fixes back to Codex.

**Check (Claude):** all six were confirmed against the code. In finding 3, the queued and assistant attendance parts were confirmed; for sport attendance, the owner chose to keep the current behavior.

**Owner decisions (2026-10-26):**
- Queued (offline) attendance is checked against the sheet version, but rows the system writes (the nightly automatic absences, the empty rows a sheet view adds for new roster students) do not count as changes.
- Sport attendance keeps its per-mark merge with the "overwritten" warning, with no version check.

**Changes (uncommitted):**
1. **Lock keys:** `server/services/locks.js` `normalizeKey` lowercases 24-hex ObjectId segments in every lock operation.
2. **Guarded writes:** `server/middleware/lockGuard.js` adds `sameVersion` (the write filter also requires the `updatedAt` that was read; `{ updatedAt: null }` when there was none), `raceLost` (409 STALE with the current record) and `nextStamp`. These are used with `updateExisting` (never an upsert) in Lesson, Report (update and delete), Student (update and delete), Vehicle (form update), the sport lesson save, and User (putU, storage permissions, delete, permissions, role). `updateExisting` was added to the Lesson, Report, Student and Vehicle models. A new lesson is now stored with `updatedAt`.
3. **Attendance:** `server/utils/attendanceMarks.js` `sheetVersion` counts only rows a person saved; a sheet nobody saved is `EMPTY_SHEET_VERSION` (epoch). It is used by `getSheet` and `bulkSave`. `client/src/Components/Attendance/AttendancePage.jsx` puts `baseVersion` into the queued body. `server/services/assistant/actionRunner.js` stores the sheet version in the proposal's params, sends it at approval, and ignores any `baseVersion` in the model's input.
4. **Sport rosters:** `server/Entities/Sport/Sport.controller.js` answers 423 from `savePlayer`/`deletePlayer` when a lesson whose roster they would change is held by another tab (`lockGuard.holderOf`). `setMembership` makes each roster change a compare-and-set on `updatedAt` with a strictly later stamp, redone on the fresh roster; add/remove-player use it too.
5. **Report locks:** `server/Entities/Lock/Lock.route.js` report rules read the report. editOwn locks only the caller's own report, and the holder is shown only with viewAll or to the owner. `server/Entities/Report/Report.route.js`: a PUT checks the lock only when the caller may edit that report, so editOwn on someone else's report gets the controller's 403, never the holder.
6. **Live events:** the new `server/services/liveAudience.js` (`mayReceive`) filters staff `change`/`lock` events by module permission, the guide's visible students (re-read before a student event when more than 2 s old) and the report owner. The owner travels as an `audience` in `services/liveHub.js` and is never sent. `Entities/Live/Live.route.js` applies the filter.
- **Tests:** concurrent-save tests (lesson, report, user, vehicle, sport roster with a frozen clock), ObjectId case, sheet version with system rows, stale assistant attendance, stale queued sheet (client), report-lock ownership on `/locks` and on the report route, the live audience (unit and stream, including a mid-stream scope change). The in-memory test stores gained `updateExisting` and delete counts, and match `null` and dates to the millisecond like MongoDB.

**Codex re-review (2026-10-26, Codex CLI 0.164.0, read-only, on the first version of these fixes):** finding 1 resolved, finding 3 resolved for the agreed scope, findings 2, 4, 5 and 6 partly resolved. Five new findings:
1. Records without `updatedAt` were written without a guard.
2. A roster retry in the same millisecond could match again.
3. The report PUT revealed the holder before the ownership check.
4. The cached student scope lagged about a minute.
5. Lesson viewers lost sport-lesson events.

All five are fixed in the changes above (`{ updatedAt: null }` plus lessons created with `updatedAt`, `nextStamp`, the report route key, a scope re-read before student events, `sportLesson` also for `lessons.view`), with tests.

**Known limits (not changed):**
- No compare-and-set on: the user move between rooms (create then delete), the vehicle delete (Drive files are deleted first), the multi-row attendance sheet itself (the lock and the sheet version protect it), and the vehicle document and licence writes.
- A report *lock* event has no owner, so only reports.viewAll receives it.
- Lesson and report viewers without users.view no longer get live `user` events (renames show on the next load).
- The live hub is still per process.

**Further Codex re-review rounds (2026-10-26, Codex CLI 0.164.0, read-only):**
- **Round 2:** confirmed `updatedAt: null`, the report route and `sportLesson` for `lessons.view`. New findings:
  - The full sport lesson save still used the raw clock. Fixed: `nextStamp`.
  - A failed scope read kept the old scope. Fixed: fail closed.
  - A student leaving the scope gave the former guide no refresh.
- **Round 3:** a student-specific exception for the previous scope could drop the removal notice or let other events through. It was replaced: after a successful read, the stream writes exactly one `change` per student who left the scope, and every event is checked only against the new scope.
- **Round 4:** found two gaps, both fixed:
  - The removal notice must also require students.view.
  - A failed read must not erase the last read scope (`lastRead` is kept).
- **Round 5:** "Resolved ... No new concrete findings within the requested scope."

**Verification:**
- **Server:** 918/918 (`npm test` in server/, after the last change).
- **Client:** 656/656 and the production build compiled (`npm run verify`; the client was unchanged after that run).
- One earlier full run had a 5 s timeout in `client/src/journey/JourneyProvider.test.js`, a file not touched here. It passed alone (20/20) and in the following full run.
- Codex ran its own focused suites read-only. Its 2 failures in `sport-host.test.js` came from its sandbox refusing a temp directory.
- Not tested: a real MongoDB, browsers, nginx and the sport site. The ObjectId letter case was checked locally through Mongoose casting. That `{ updatedAt: null }` matches a missing field is documented MongoDB behavior and was not run against a database.

**Status:** Codex review complete for this change; nothing committed.

## 2026-10-27: Faster sign-in and screens (fewer, shared requests)

**Owner request:**
- Fix slow responses: a production login recording took about 8.5 s from sign-in to a ready dashboard.
- No longer send many requests at the same time, in every part of the system.
- The owner approved the whole plan, including a 5 s cache of the signed-in user on the server.

**Diagnosis (from the owner's recording and the server):**
- The server alone answers in about 2 ms. Each database round trip takes about 205 ms, because the server is in Israel and Atlas M0 is in Oregon (`us-west-2`).
- After sign-in about 13 requests were sent together, several of them twice (`/auth/me` x2, `/vehicle/me/permissions` x3, `/tours` x2), and the whole set again about 2 s later. Each request waited 1–3 s.
- The cause of the repeated set was not found: the recording shows XHR only.
- Also outside the code: one DNS lookup on the user's machine took 2.35 s.

**Changes (uncommitted):**
- **Server:**
  - `services/actorCache.js` and `middleware/permissionMiddleware.js`: `loadActor` reads the user through a 5 s cache. Requests that arrive together share one read. A missing user is not cached. Every write through `UserModelDef` (wrapped in `User.model.js`) empties the cache.
  - `Entities/Dashboard/Dashboard.route.js` (`/api/dashboard/summary`): runs the four list handlers in parallel. Each part first needs its own route's permission, and reports are sent as a count.
  - `getAllU`, `getAllS` and the lesson `getAll` read in parallel.
  - `scripts/perfCheck.js`: a read-only response-time check to run on the server. Its sport calls run only when football already exists.
- **Client:**
  - `WebServer/services/traffic.js`, under the `api` adapter, below training mode and the token refresh:
    - identical reads share one request;
    - reads are kept for 3 s (30 s for `/auth/me`, my vehicle permissions, `/tours` and the unread count);
    - writes empty the memory when they start and when they end, and so do live `change`/`open` events, a token change and sign-out;
    - never kept: `/locks`, `/live`, `/auth/refresh`, `/storage`, `/ai` and non-JSON responses;
    - at most 4 requests on the network, with background reads queued behind screen reads.
  - `Dashboard.jsx` uses the summary (training mode keeps its four reads).
  - `NoticeBell` does not poll while the tab is hidden.

**Tests:** `server/test/actor-cache.test.js`, `server/test/dashboard-summary.test.js`, `route-guards.test.js` (the summary entry), `client/src/WebServer/services/traffic.test.js` (11 tests).

**Verification:**
- **Server:** 927/927.
- **Client:** 663/664. The one failure is the known `JourneyProvider.test.js` 5 s timeout under full-suite load, which also happened before this change; that file passes alone (20/20).
- **Build:** compiled. The build folder was removed afterwards at the owner's request.
- **Local measurement** (local MongoDB, about 1 ms per round trip): the dashboard's four requests (avg 14.9 ms) became one summary request (avg 10.4 ms).
- **Not tested:** the real browser login on the server, and Atlas latency.

**Codex review (2026-10-27, Codex CLI 0.164.0, read-only):** three medium findings, all confirmed and fixed with tests:
1. A read running during a write could keep old data. Fixed: memory is also emptied when the write ends.
2. Assistant reads were kept while its chat writes bypass the layer. Fixed: `/ai` is never kept.
3. `perfCheck.js` could create the football sport. Fixed: sport calls run only when it exists.

**Known limits:**
- The biggest remaining cost is the Oregon database.
- The owner cannot create a second free cluster. The options given were a new Atlas project, a dump/recreate in Frankfurt, or MongoDB on the server.

**Codex re-review (2026-10-27):** all three fixes "Resolved"; "No new concrete findings in the scoped lines or tests." **Status:** Codex review complete; nothing committed or deployed.

## 2026-10-27: Faster sport player card and sport lists

**Owner request:** speed up the sport player card and the staff sport lists. On the production server (database about 221 ms away) they measured:

| Screen | Time | Database rounds |
| --- | --- | --- |
| `/api/sport-portal/me` | 1.66 s | about 8 |
| `GET /api/sports/players` | 0.71 s | about 3 |
| `GET /api/sports/lessons` | 0.48 s | about 2 |

**Changes (uncommitted):**
- `server/Entities/Sport/Sport.controller.js`:
  - `ensureFootball` keeps the football row in memory for 60 s, and each caller gets a copy.
  - `setStats` reads the row fresh, keeps nothing while it runs, and afterwards drops the kept copy and lets go of any read still on its way. A read started before or during a save is never kept (`footballGeneration`).
  - `listPlayers` reads players, students, lessons and all sport attendance in one round.
- `SportPortal.auth.js`: `requireSportStudent` reads the student and the player row together.
- `SportPortal.controller.js`: `me` reads the player, lessons and attendance together. These are still only the student's own rows, and a missing player is still 401.

**Tests:**
- `sport-portal-data.test.js`: two rounds of reads instead of five, timed. It fails on the old code (245 ms).
- `sport-staff.test.js`: the football row is read once; a stat added elsewhere keeps its key on rename; two saves answering out of order; a read during a save is not kept; a request after a save never joins an older read (that last test fails without the fix).

**Verification:** server 933/933. Not measured on the production server yet.

**Codex review (2026-10-27, Codex CLI 0.164.0, read-only), four rounds:**
1. Round 1, two findings: `setStats` used the kept copy, and an in-flight refresh could overwrite the saved copy. Fixed with the fresh read and the generation counter.
2. Round 2, one finding: concurrent saves could keep an older result. Fixed: the copy is dropped instead of replaced.
3. Round 3, one finding: a later GET could join a stale pending read. Fixed: the save lets go of the pending read, and the copy is dropped at the start of the save too.
4. Round 4: "Resolved... No new concrete findings within the requested scope."

**Status:** Codex review complete; nothing committed.

## 2026-10-27: The database moves from Atlas to the server (owner decision)

**Owner decision (2026-10-27):** run MongoDB on the VPS itself instead of Atlas. This changes the platform design's constraint ("one server, Atlas, Drive as they are").
- **Why:** every database round trip to Atlas M0 in Oregon (`us-west-2`) takes about 221 ms from the server in Israel. The owner does not want a paid tier, and could not create a second free cluster in a nearer region.
- **Measured before the move,** after the code speed-ups: about 263 ms average per screen; the player card 0.47 s.

**Changes (uncommitted):**
- `deploy/DEPLOY.md`, new section "MongoDB על השרת":
  - an AVX check first (MongoDB 5+ needs it), 2 GB swap, and MongoDB 8.0 from the official repo;
  - `bindIp: 127.0.0.1` and a WiredTiger cache of 0.25 GB;
  - an admin user and an app user with `readWrite` on `tamheed_db`, then `authorization: enabled`;
  - the night move: stop pm2, `mongodump` from Atlas (read-only), `mongorestore` locally, compare counts, switch `MONGO_URI` (the old line kept as a comment for rollback), restart, run `perfCheck`;
  - Atlas is kept for a week;
  - a nightly cron backup and three troubleshooting rows.
- `deploy/mongo-backup.sh`: a gzip `mongodump` of the database. It reads `MONGO_URI` from the server `.env` and passes it in a private temporary config file, so the password never appears in the process list. Archives are kept 14 days in `/var/backups/tamheed`.
- No application code changes: `MONGO_URI` and `DB_NAME` already support a local server.

**Known risks:**
- The backups sit on the same server until the Stage B offsite (Drive) backup exists. The guide tells the owner to copy archives to his computer from time to time.
- Writes made after a rollback to Atlas would not carry over.
- Not run on the server yet. The backup script was only syntax-checked here.

**Codex review (2026-10-27, Codex CLI 0.164.0, read-only), three rounds so far:**
1. **Round 1, six findings, all fixed:**
   - A restore ran while the app was running. Now pm2 is stopped, then `--nsInclude`, counts, and start.
   - Nightly dumps could be inconsistent. The app is stopped for the dump. This was Claude's choice over a single-node replica set with `--oplog`, which needs a keyFile with auth.
   - Fragile .env parsing and YAML quoting.
   - A partial archive under the final name. It is now a hidden `.partial`, renamed on success.
   - The Atlas URI showed in the process list. It now goes through a private config file.
   - `DB_NAME` was assumed.
2. **Round 2:** three partly resolved and two new: the parsers in the guide and the script differed, and an already-stopped app was restarted. Fixed with a shared `deploy/env-get.sh` (export, spaces, quotes, comments; last wins) and the pm2 status check.
3. **Round 3:** the stopped-app item resolved; three partly resolved and two new: pm2 transitional states, concurrent runs. Fixed:
   - unquoted values are cut at the first `#` as dotenv does;
   - `online`/`launching`/`waiting restart` mean stop and start again; `stopped`/`errored` are left alone; anything else refuses;
   - a non-blocking `flock` covers the whole run.

4. **Round 4: not finished.** Codex hit its usage limit (available again 2026-10-28 01:59) before answering. Its own run had written 10 dotenv samples for `env-get.sh`; one failed only in its harness, which fed the sample through `/dev/stdin`. All 10 pass with a sample file, which is how the script reads `.env` (Claude, Git Bash). **Pending:** a Codex verdict on the round-3 fixes (pm2 states, `flock`, dotenv comments).

**Owner's server progress (2026-10-27):** AVX present, Ubuntu 24.04 (`noble`), 2 GB swap on, MongoDB 8.0.34 and tools 100.20.0 installed, `mongod` running with the guide's config.

**Move done (2026-10-27, by the owner):**
- Users and authorization were set; the first `mongorestore` failed authentication, and the owner then completed it.
- The data was moved from Atlas, `MONGO_URI` switched, and the app restarted.
- `deploy/mongo-backup.sh` ran (`backup ok`, a 12K archive), and root's crontab has `30 2 * * *`. The server is on UTC, so that is 04:30/05:30 in Israel.

**Measured on the server after the move (`perfCheck`):**

| Measure | Before (Atlas) | After (local) |
| --- | --- | --- |
| One database round trip | ~221 ms | ~1.2 ms |
| Average answer, app | ~263 ms | 10 ms |
| Average answer, nginx + HTTPS | ~280 ms | 12.8 ms |
| Slowest public call | | 24.1 ms (the player card) |

**Still open:**
- A reboot for the pending kernel.
- The Atlas cluster is kept a week.
- Offsite copies of the backups (Stage B).
- Codex's round 4 on the backup script.

**Codex round 4 (2026-10-28, Codex CLI 0.164.0, gpt-6-astra, read-only):** received.
- pm2 states, `flock -n` and unquoted dotenv comments: all three "Resolved". Codex ran 10 parser samples and 13 mocked pm2 paths (success, refusal, dump failure).
- **New, low:** `deploy/env-get.sh:22` knows only `"` and `'`. dotenv also accepts backtick quotes, so a backtick-quoted `MONGO_URI` would reach `mongodump` with the backticks and the backup would fail. Claude confirmed it: dotenv 16.5.0 parses ``A=`x y` `` as `x y`. The server's backup already ran (`backup ok`), so its `.env` doesn't use backticks. Not fixed yet.
- **Correction to an older entry:** nginx `proxy_read_timeout 1h` resets on any data. The 25 s sport SSE heartbeat keeps a stream open longer than an hour, so it doesn't cap a stream's life.
- Not exercised: real Ubuntu `flock`, pm2 and MongoDB.

**Fresh local run (2026-10-28, Claude):** server 933/933. Client 666/667: the one failure is the known `JourneyProvider.test.js` timeout, and that file passes alone (20/20). Build compiled. `npm run verify` doesn't cover the sport site.

## 2026-10-29: Print does nothing on iPhone

**Owner report:** on an iPhone, the "طباعة" button in the PDF preview did nothing (screenshot of a report preview).

**Cause:** the client is a home-screen app (`"display": "standalone"` in `client/public/manifest.json`), and iOS ignores `print()` there. The button printed through a hidden iframe.

**Change (uncommitted), `client/src/Components/ExportPDF/pdfPreview.js`:**
- On iOS, including iPadOS that reports a Mac with touch, the print button makes a PDF `File` and calls `navigator.share` inside the click. The share sheet offers Print.
- It does that only when `share` and `canShare` exist and `canShare` accepts the file. Otherwise the old iframe print runs. Other platforms are unchanged.
- Closing the sheet (`AbortError`) does nothing. Any other failure shows a message to download the PDF and print it from the file.

**Tests:** `pdfPreview.test.js`: share on iPhone, the iframe when `canShare` refuses or is missing, the iframe elsewhere, and one message per non-cancel failure (`NotAllowedError`, `DataError`), none for `AbortError`.

**Codex review (2026-10-29, Codex CLI 0.164.0, gpt-6-astra, read-only):**
- **Round 1, two P2 findings, both fixed:**
  - every share failure was swallowed, so the button could look dead again;
  - a missing `canShare` was taken as file-sharing support.
- **Round 2:** both "Resolved"; "No new concrete findings in the supplied diff."

**Verification:** the PDF preview tests passed 10/10. The full client run passed 673/674; the one failure is the known `JourneyProvider.test.js` timeout. **Not tested:** a real iPhone, including whether Print appears in the share sheet.

**Status:** Codex review complete; committed in 4a2dc2f. Not deployed by Claude.

## 2026-10-29: In-app user guide, stage 1 (structure and three screens)

**Owner request:**
- A user guide that opens from a link inside the system and updates when the system changes, rather than a booklet that goes stale.
- Arabic or Hebrew, chosen by the reader; for all roles; short on phones.
- Approved first stage: the structure, plus the dashboard, lessons and attendance.

**Changes (uncommitted):**
- **New `client/src/guide/`:**
  - `guideContent.js`: one entry per screen in Arabic and Hebrew. A step can require permissions. Each entry has an `updated` value and its journey chapter. Screens not written yet are listed in `GUIDE_PENDING`.
  - `guideLogic.js`:
    - shows only the screens the user can open (`canAccessPath`) and the steps they can do;
    - search, in the chosen language;
    - the «جديد» badge;
    - the language and the last-seen versions are kept per device, in `localStorage`.
  - `GuidePage.jsx` at `/guide`. Cards start folded. «أرني» runs the screen's journey chapter alone on demo data; "open screen" goes to the page.
- **Links:** a menu item in `Header.jsx`, and a «دليل المستخدم» button in the help center. `TourProvider` asks `confirmLeave` before it navigates.
- **What's new:** a release entry announces the guide.
- `journeyLogic.js`: `held` is exported.
- `releases.test.js`: the journey release is found by id, plus a newest-first check.

**Updates:**
- Changing a screen means editing its entry and changing `updated`, with a letter for a second change the same day.
- Readers who last saw another `updated` get «جديد». So does a screen they didn't have before.
- `guideContent.test.js` fails when a section in `tours/sections.js` has no entry and isn't pending. It can't detect a change to an existing screen.

**Codex review (2026-10-29, Codex CLI 0.164.0, gpt-6-astra, read-only):**
- **Round 1, three findings, all fixed:**
  - **P2:** approve and reject were one step, gated by the approve permission. They are now four steps that match `Dashboard.jsx:41-44`.
  - **P2:** a change made the same day as a visit was never marked new. The guide now keeps the version it last saw for each entry.
  - **P3:** the date color had 2.56:1 contrast. It is now `#64748b` (4.76:1).
- **Round 2:** all three "Resolved"; "No new concrete findings within the reviewed scope."
- **After round 2:** the page reads permissions once per visit (`useState`) instead of two `eslint-disable` comments. The build failed on those comments, because the project doesn't load the `react-hooks` rule.

**Verification:**
- Server 933/933.
- Client 693/694. The one failure is the known `JourneyProvider.test.js` timeout; the guide tests pass 19/19.
- The client build compiled after the eslint fix.
- At phone width (375 px), the page was rendered under Jest with its real CSS and checked in the browser pane, in Arabic and Hebrew.
- **Not tested:** the real app while signed in, a real phone, and the Hebrew translation, which needs a fluent reader.

**Status:** Codex review complete; nothing committed or deployed. Next: the remaining eight screens (`GUIDE_PENDING`), then saving the guide as a PDF.

## 2026-10-29: User guide, stage 2 (all screens, save as PDF)

**Owner request:** "complete the rest" of the in-app user guide.

**Changes (uncommitted):**
- **`client/src/guide/guideContent.js`:** entries for students, reports, vehicles, files, notices, users, audit and sports, in Arabic and Hebrew. `GUIDE_PENDING` is now empty.
  - The texts follow the journey chapters. Sports follows `Components/Sport`.
  - A step may have `requiresAny` (one key is enough). Sports uses it for coach or manage, as in `SportPage.jsx:13-14`.
- **Save as PDF:** a button on the guide exports the whole guide the user can see, in the chosen language. The search doesn't narrow it.
  - It uses `exportCardPdf` with two new options: `profile: false` (no photo and name row) and `labels` (Hebrew texts for the document and the preview).
  - Arabic stays the default, so existing callers are unchanged.
  - Long entries are split into sections of at most 4 rows (`PDF_ROWS_PER_SECTION`).
- **`ExportPDF.jsx`, a fix that also affects user and student PDFs:** pages are now measured at the real content width and with the page's font (Arial, RTL). Before, the width included the 10 mm side padding, so long text could reach the footer.

**Codex review (2026-10-29, Codex CLI 0.164.0, gpt-6-astra, read-only):**
- **Round 1, four findings; no permission mismatch found:**
  - **P2:** a long section overlapped the footer;
  - **P3:** the Hebrew PDF kept Arabic labels and preview buttons;
  - **P3:** reports quoted «تصدير PDF» instead of the real «ملف التقرير»;
  - **P3:** the iPhone note promised the share sheet unconditionally.
- **Round 2:** findings 2-4 "Resolved". Finding 1 was "Partly": the width was measured with the padding and without the page font.
- **Round 3:** "Resolved"; "No new concrete findings within the reviewed scope."

**Verification:**
- Server 933/933. Client 700/700, including the usually flaky `JourneyProvider` test.
- The build compiled.
- **Not tested:** a real PDF generated in a browser (footer overlap and Hebrew rendering), the signed-in app, a phone, and the Hebrew wording, which needs a fluent reader.

**Status:** Codex review complete; committed in 498b9d3 and pushed. Not deployed by Claude.

## 2026-10-29: Player photos (local cut-out) and the new player card

**Owner request:** a professional player card. Local and free: when a student with a photo becomes a player, make a player photo and keep it on the server, delete it with the player, and show the card as before when there is no photo. Then a new card design in the logo's colours (approved from sample images), centred photo, ID number on the staff card, no "كرة القدم" wording, and a cleaner back side.

**Changes (uncommitted):**
- **Cut-out:** `server/services/playerPhoto.service.js` uses `sharp` and `onnxruntime-node` with the MODNet portrait model (Apache-2.0, about 26MB).
  - `server/scripts/fetchPortraitModel.js` fetches the model from a pinned Hugging Face revision and checks its SHA-256. `server/models/` is git-ignored.
  - Each photo runs in a worker thread (`playerPhotoWorker.js`), with input limits.
  - The person is kept and other figures are dropped (`keepMainPerson`, `keepRowsUnder`). The result is framed 4:5 and saved as WebP with transparency.
- **Job:** `server/services/playerPhotoJob.js` runs one photo at a time in the background.
  - It runs when a player is saved, and lazily from `listPlayers` and the portal's `me`.
  - Photos are stored in the `SportPlayerPhotos` collection. The player row keeps `photoCutout` or `photoCutoutFailed` (the source photo's version).
  - Deleting a player, a student or a photo removes the player photo at once. A stored photo is served only while it matches the current photo.
  - Downloads time out after 30 s. A photo that is too large or has no person is not retried. Drive failures back off for 10 minutes.
- **Routes:**
  - `GET /api/sports/players/:studentId/photo` (sports.view/coach/manage, `no-cache`).
  - The portal's `/photo` serves the cut-out first, and `me` returns `photoCutout`.
- **Cards:**
  - The new artwork is in `sport/src/CardArt.jsx` and `client/src/Components/Sport/CardArt.jsx` (two copies, kept equal).
  - Front and back are redesigned. The staff back shows the ID number; the portal still never sends it.
  - The words "كرة القدم" were removed from the card bar, the sport header and the login subtitle.
- **Deploy:**
  - `deploy/update.sh` installs with `ONNXRUNTIME_NODE_INSTALL=skip`, so no CUDA download.
  - It then fetches the model. A failed fetch does not stop the update.
  - `deploy/DEPLOY.md` has a "תמונות שחקן" section and a troubleshooting row. Node 20.9 or later is needed.

**Codex review (2026-10-29, Codex CLI, gpt-6-astra, read-only):**
- **Round 1, seven findings:**
  - **P1:** an extreme aspect ratio could make a 3 GiB input tensor.
  - **P2:** deletion cleanup was lost on restart.
  - **P2:** a stalled download blocked the queue.
  - **P2:** oversized photos were retried forever.
  - **P2:** inference blocked the event loop (about 630 ms).
  - **P2:** the staff cut-out was cached after the photo changed.
  - **P2:** a failed model fetch aborted `update.sh`.
- **Round 2:** six resolved. Deletion was "Partly": a job finishing after a delete could store the photo again. Fixed with a check before and after storing. No defects found in the card redesign, the staff ID display or the wording changes.
- **Round 3:** "Resolved"; no new defects in the fix or either card's UI.
- **Round 4** (the mentor on the card back): "No concrete defects". Only the mentor's first and last name are sent; the student's ID number stays staff-only.

**Later owner changes, in the same work:** the card back reads the name, a rule, then one label and value per line. The rows are ID number, jersey number, birth date and educational mentor (`main_teacher`'s name). Position, lessons and attendance are off the back. The photo frame shows with a cut-out too, and "TAMHEED SPORT" is at the foot.

**The ID number on the student's own card:** the owner asked for it twice ("ماذا عن رقم الهوية؟"). It comes from a separate `GET /api/sport-portal/id` (the caller's own number, `no-store`). It is never in `/me`, which the sport site keeps offline for 7 days.
- **Round 5:** putting it in `/me` was rejected. A pending `/me` could refill the shared cache after logout and show A's number to B on a shared phone.
- **Round 6:** the card kept A's number after another tab switched the session to B. Fixed by asking again whenever the card changes.
- **Round 7:** "Resolved"; no new defects.
- **Residual risk, as Codex noted:** the number is visible on the screen and in screenshots.

**Verification:**
- Server 964/964, sport site 58/58, client 700/700, and both builds compiled.
- A real cut-out of the owner's sample photo took about 1.5 s in the worker, without blocking timers.
- Rendered cards were checked in the browser as a static page.
- **Not tested:** the Ubuntu server (installing `sharp` and `onnxruntime-node`, downloading the model, memory), a real iPhone (mask and clip-path), and the signed-in app with real students.

**Status:** Codex review complete; committed in 484a4c8. Not deployed by Claude.

## 2026-10-29: Sport notices (the «دروسي» tab replaced)

**Owner request:**
- The sport site gets one main screen and notices.
- The «دروسي» tab is removed and notices take its place.
- In the Tamheed staff system's sport section, staff post important notices for distribution.

The owner approved these defaults:
- A coach or manager posts; viewers read.
- A notice goes to every player or to one lesson's players.
- An optional end date.
- A push to the players it reaches.
- New notices are marked on the sport site.
- Posting and deleting only, no editing.

**Changes (uncommitted):**
- **Server:**
  - `SportNotice.model.js`.
  - `Sport.controller.js`: `listNotices`, `createNotice`, `deleteNotice`, with an audience and a best-effort push.
  - `Sport.route.js`: `GET/POST /api/sports/notices` and `DELETE /notices/:id`.
  - The portal's `GET /api/sport-portal/notices`: only this player's notices (sport-wide or a lesson they are in), not expired, newest first, at most 50, `no-store`.
  - `liveAudience.js`: a `sportNotice` rule for sport staff.
  - The portal's `/me` returns an opaque `student.key`, so the app can tell sign-ins apart on a shared phone.
- **Staff client:** a «الإعلانات» tab (`NoticesTab.jsx`) to post, list and delete notices. The sports entry of the user guide is updated (`2026-10-29a`).
- **Sport site:**
  - `NoticesPage.jsx` replaces `LessonsPage.jsx` (deleted).
  - The bottom tab has a counter of new notices.
  - A notice push opens `/?tab=notices`.
  - Seen marks are kept per student key (`noticesSeen.js`).
  - The notices are never in the offline cache.
  - The first-visit guide text is updated.

**Codex review (2026-10-29, Codex CLI, gpt-6-astra, read-only):**
- **Round 1:**
  - **P1:** a previous student's notices could stay visible after another sign-in on the same phone.
  - **P2:** staff live refresh never fired, because `liveAudience` had no `sportNotice` rule.
  - **P2:** one device-wide "seen" time hid one student's new notices after another student read theirs.
  - **P3:** impossible end dates such as 2027-02-31 were accepted.
- **Round 2:** findings 1, 2 and 4 resolved; finding 3 "partly". During an account switch, A's list could be marked seen under B's key. Fixed by tagging each list with the key it was read for.
- **Round 3** (on commit 135c744, after Codex's usage limit reset):
  - The round-2 race: "resolved".
  - **P2:** `/me` and `/notices` could be answered for different accounts. If another tab signed in as B while A's card was loading, B's notices were shown and marked seen under A's key. Codex reproduced it in an isolated React check.
  - **Fix:** `/api/sport-portal/notices` now returns the cookie's student `key`. `sport/src/App.jsx` accepts a list only when that key matches the card. On a mismatch it reads `/me` again, once per card key, so it cannot loop. Tests were added in `sport-portal-data.test.js` and `App.live.test.js`.
- **Round 4** (on ea911bd):
  - The round-3 P2: "resolved".
  - **P2:** on a mismatch, the list loaded earlier stayed on screen. So if the /me reread failed, A's notices stayed visible under B's session. **Fix:** the mismatch branch now clears `noticeBox` at once.
- **Round 5** (on ee730b1): "Resolved". The list stays cleared even if the reread fails or is skipped. No new concrete defect.

**Verification:**
- After the round-3 and round-4 fixes: server 971/971, sport site 63/63 (client unchanged).
- Before it: server 971/971, sport site 62/62, client 700/700 (the flaky `JourneyProvider` test failed once and passed on rerun). Both builds compiled.
- The notices page was checked at phone width as a static render.
- **Not tested:** the signed-in staff tab, a real push on a phone, the live Ubuntu server.

**Status:** committed locally in 135c744. The owner pushed 135c744 (and 0c6d07c). The round-3 and round-4 fixes (ea911bd, ee730b1) are committed locally and are not pushed yet: the push needs the owner's GitHub sign-in.

## 2026-10-30: Phone notifications switch in the system (Claude writer)

**Request:** The owner's server had no VAPID keys in `server/config/.env`, so no phone notifications were sent. The owner asked for a setting inside the system to turn phone notifications on or off, so the `.env` file never needs editing.

**Changes:**
- **Server:**
  - `server/utils/push.js`: the keys come from the environment, or else from a new `PushSettings` row (`server/Entities/Push/PushSettings.model.js`).
    - The first switch-on with no keys generates a pair (`web-push generateVAPIDKeys`).
    - Switching off keeps the keys.
    - With env keys and no row, push stays on, as before the switch existed.
    - Each process rereads the row at most every 30 s. A failed read means off.
    - `publicKey()` is now async.
  - `Push.route.js`: `GET/PUT /api/push/settings` with `requirePermission("permissions.manage")`.
    - Answers `{ ok, enabled, keysFrom }` and never the keys.
    - The VAPID subject is `https://<Host>`.
    - `/key` is `no-store`.
- **Staff client:**
  - New `Components/Profile/PhoneNotifications.jsx` on the profile page: the system switch (managers only) and this device's checkbox (only while the server has a key). On an iPhone in a browser tab it shows a hint to add the site to the home screen.
  - `/api/push/*` is never in the service-worker cache.
- **Sport site:** `PushButton` is offered only while the server has a key. The label is now «فعّل الإشعارات».
- **Deploy guide:** the notifications section now describes the switch. The `.env` keys are optional.

**Also in this round (separate commit 3b8e139, not reviewed by Codex):** the photo pickers no longer set `capture="environment"`, so phones offer the gallery and not only the camera.

**Verification:**
- Server 977/977, client 709/709, sport site 68/68. Both builds compiled after the round-3 fix.
- **Not tested:** a real phone, the live server.

**Codex review (2026-10-30, Codex CLI, read-only):**
- **Round 1:** no secret leak, no permission bypass, no missed caller of the now-async `publicKey()`. Findings:
  - **P2:** two concurrent first switch-ons could each make a key pair and overwrite each other.
    - **Fix:** switches run one at a time in the process. The server runs one pm2 process (`instances: 1`).
  - **P2:** a read started before a switch-off could refill the cache with "on" for another 30 s.
    - **Fix:** a generation counter. A read that started before a switch never fills the cache.
  - **P2:** in the profile, a late `/key` "off" answer could hide the device checkbox after a manager switched on.
    - **Fix:** for a manager, the switch's own state decides. Only the newest check counts.
  - **P3:** the profile and the sport button never reread the switch while open.
    - **Fix:** both reread when the page comes back to the screen (`visibilitychange`).
  - Codex reproduced the first three with in-memory stubs. New tests were added for each fix.
- **Round 2:** findings 1–2 resolved (single-process deployment); the `/key` race and the refresh on return were also resolved. Two related findings:
  - **P2:** a `/settings` read started before a switch-on could finish afterwards and uncheck the switch.
  - **P3:** a sport check started before subscribing could bring the button back.
  - Codex reproduced both with in-memory React checks.
  - **Fix:** the check counter is a ref. A switch or a subscribe bumps it before and after, so answers already on their way are dropped. A test was added for each.
- **Round 3:** both round-2 findings resolved. One new finding:
  - **P2:** if the browser subscribed but the POST to the server failed, a return to the tab hid the sport retry button, because `isSubscribed()` checks only the browser. Codex reproduced it against HEAD and the working tree.
  - **Fix:** a new `resyncSport()` posts the existing subscription again, once per visit. The button stays as the retry until that succeeds. A test was added.
- **Round 4:** the round-3 case resolved. One new finding:
  - **P2:** `synced` stayed true after the subscription changed. Scenario: another tab dropped the subscription, a new one was made, and its POST failed. On return the retry button was hidden.
  - **Fix:** `synced` is cleared when the browser has no subscription, and before every enable. A test was added.
- **Round 5:** "partly resolved". Two cases remained around the cached `synced` flag:
  - **P2:** another tab replaced the subscription and its POST failed. This tab kept `synced` from the old subscription.
  - **P2:** an old resync finished late and set `synced` back to true.
  - **Fix:** the flag is removed. Every check (on load and on return to the screen) posts the browser's existing subscription again; the POST is idempotent on the server. The button stays as the retry while that fails. No state is left to go stale.
- **Round 6:** "Resolved". No new concrete defects in the diff or the untracked files.

**Status:** committed locally; not pushed (the push needs the owner's GitHub sign-in); not deployed.

## 2026-10-30: Kamatera capacity and local-file-storage advice (Codex)

**Owner request and scope:** Discuss Tamheed with actual Claude Code and advise
on a Kamatera server for the main system, sports, a growing local DB, and
photos/documents stored on the server instead of Drive. The owner clarified
50–60 simultaneous users maximum. Existing file volume, growth and budget are
unknown. This explicitly authorizes the bounded architecture discussion, not
infrastructure purchases, application changes, migrations or deployment.

**Ownership:** Codex is the advisory-document author and sole writer of this log,
`KAMATERA_CAPACITY_PLAN.md`, and `claude-capacity-review-2026-10-30.md`.
A separate Codex agent independently inspected source read-only; it did not
edit files or count as the required actual Claude reviewer.

**Findings and recommendation:** Main and sport share one API/DB; the owner's
2026-10-27 DB move is recorded above (not live-verified today). General storage
and original photos remain Drive-dependent; derived player photos are Mongo
buffers. Start pricing Type B / 4 vCPU / 8 GB, with 16 GB as optional headroom;
80 GB OS + an example 200 GB data disk, subject to measured size and growth.
Revisit old 700M PM2 restart and 0.25 GB Mongo cache settings. Account for upload
temp space and on-server builds. Local-file migration requires an authorized
storage provider, link/metadata migration, verification and rollback. Current
14-day local full DB backups stop the shared app; add off-server DB+file backups
and plan consistency/restore testing as data grows. No concurrent-user capacity
or live-server inspection is claimed. Official Kamatera and MongoDB sources
are linked in the advisory document; no complete account-specific quote obtained.

**Actual Claude request and response:** Prepared a minimal, sanitized architecture
brief at `claude-capacity-review-2026-10-30.md`, excluding .env files, credentials,
runtime logs and user records. Claude Code 2.1.258 authentication status was
false in both restricted and owner execution contexts. A dedicated print-mode
invocation with safe mode, all tools disabled, strict MCP configuration and no
session persistence returned: `Failed to authenticate: OAuth session expired
and could not be refreshed`. It reported zero API usage; no review opinion was
received. This was an authentication/availability block, not an approval denial.
No unrelated Claude session was resumed or interrupted.

**Resolution/status:** Independent local advice completed; actual Claude review
is pending sign-in. The owner was asked to run `claude auth login`. Do not claim
Claude agreement. After login, resend only the prepared brief, address concrete
feedback, and append the real response and resolution here.

**Verification:** Source/document inspection and current official public docs;
no production access, DB access, secret-file reads, real records, migration,
seed, administrator creation, load tests or external storage changes. No app
code changed, so `npm run verify` was not run for this documentation-only task.
Final internal document review and `git diff --check` are recorded below once
completed. No commit, push, deployment or unattended work was started.

## 2026-10-30: Passport photos on a white background (Claude writer)

**Owner request and scope:** every student and user photo shown at the same
passport size. Agreed design: the server removes the background with the
local MODNet model and puts the person on white, head and shoulders centred,
35:45 (420x540 JPEG); the original stays in Drive; the passport version is
stored on the server and shown in lists, profile/edit previews and the PDF
export; existing photos are processed one by one, automatically; the sport
card keeps its transparent cut-out; with no person found, the original is
cropped to passport size without background change.

**Ownership:** Claude is the writer. Codex reviewed read-only (5 rounds via
`codex exec --sandbox read-only`). This entry is appended after Codex's own
uncommitted Kamatera entry, which this commit leaves untouched and unstaged.

**Design:** rows in `PassportPhotos` keyed by the original's Drive file id (a
new photo is a new file, so nothing on Student/User records can go stale).
Public `GET /api/photos/passport/:fileId` (an `<img>` cannot send the bearer
token; the Drive link is already public by id) serves the JPEG or redirects to
the Drive link. `passportPhotoJob` makes them on upload and through a sweep
(1 min after start, then every 30 min) that backfills, re-checks originals and
drops unused rows. Client `passportSrc()` maps Drive links to that address.

**Codex round 1 (8 findings, all fixed):** private Drive ids could be published
(now `isPublicImage` before any download); passport and sport jobs could run
the model at once (one process-wide worker queue); PDF export tainted by the
cross-origin redirect (photo inlined as a data URL, fallback to the link);
sweep could delete a just-made row (rows read before links); a failed row
delete could keep serving a removed photo (`read` honours `forgotten`); bust
framing cut short; extreme aspect ratios not cropped (plain fallback); sport
thumbnails and the registration preview not 35:45.

**Round 2 (5 findings, all fixed):** originals made private or deleted later
stayed public (each sweep re-checks; rows unconfirmed for 2 h are not served);
storage-browser deletion bypassed `forget()` (hooked); room transfers could
make a row look unused (removed only after two sweeps in a row); arms-out
full-body framing (head-based framing, `headOf`); the Drive check had no
timeout (15 s, retryable).

**Round 3 (2 findings, fixed):** asymmetric arms moved the head column (now the
crown's middle); revocation suppressed the id until restart (row deleted only;
storage-browser `forget()` after a successful Drive delete).

**Round 4 (1 finding, fixed):** a file private through a second sweep got a
permanent failed row (NOT_PUBLIC now stores nothing and is retried).

**Round 5:** "Resolved". No new concrete defects.

**Verification:** server `npm test` 1006/1006; client 713/713; client build
compiles. Real MODNet run locally on two sample portraits (head and shoulders
on white). Not verified: a real deploy, real Drive permission answers, the PDF
export in a browser.

**Status:** committed locally; not pushed; not deployed.

## 2026-10-30: Gallery photo picker (Claude writer, Codex review)

**Scope:** commit 3b8e139 removes `input.capture = "environment"` from the
photo pickers in RegisterPage.jsx, Profile.jsx, EditStudent.jsx and
EditUser.jsx, so phones offer the gallery as well as the camera. It was
pushed before review; Codex reviewed it afterwards, read-only.

**Codex round 1:** no regression. All four pickers keep `accept="image/*"`
and the same file handling (first file, cancel ignored, object-URL preview,
same upload path). No other picker in `client/` or `sport/` forces the
camera. Existing gap, not from this commit: the pickers have no client-side
type or size check, so a GIF or a photo over 5 MiB can be chosen and
previewed, while the invite photo route accepts only JPEG/PNG/WebP up to
5 MiB and answers `BAD_PHOTO` on submit.

**Status:** resolved for 3b8e139. The owner asked for the type/size gap to
be fixed (below).

## 2026-10-30: Photo check when a photo is picked (Claude writer)

**Scope:** the gap from the review above. New client/src/utils/photoPick.js:
`preparePhoto` loads the picked file as an image (unreadable -> refused with
a message); JPEG/PNG/WebP under 5 MiB is kept as it is; anything else
(larger, GIF, HEIC the browser can read) is redrawn on white as a JPEG with
the long side at most 2400 px, quality 0.9 then 0.8, and refused if still
5 MiB or more. `usePhotoPick` wires it into RegisterPage, Profile,
EditStudent and EditUser.

**Codex round 1:** the run stopped at Codex's usage limit before a final
answer; its probes showed four defects, all fixed: an earlier slow pick could
overwrite a later one (only the latest pick counts); Profile delete during a
pending pick brought the photo back (remove buttons call `cancel()`); a
parent submit during a pending pick went out with no photo (save waits while
`busy`); a file of exactly 5 MiB passed the client but multer refuses it
(the limit is now strict).

**Round 2 (1 finding, fixed):** a pending pick survived a move to another
record when React reused EditStudent/EditUser (`scope: id` invalidates it).

**Round 3:** "Resolved". No new concrete defects.

**Verification:** client tests 732/732; client build compiles. In a real
Chromium page a 46 MB 4000x3000 PNG became a 2.77 MB 2400x1800 JPEG, a small
JPEG came back unchanged, a GIF became a JPEG and a non-image was refused.
Not verified: a real phone (gallery, HEIC, EXIF orientation).

**Status:** not committed.

## 2026-10-31: Password eye and lesson day headers (Claude writer)

**Scope:** two issues from a tester. (1) The login page's show/hide password
button worked only sometimes: `.loginForm button:active { transform:
translateY(1px) }` outranked the toggle's `translateY(-50%)`, so on press the
button dropped ~16px from under the pointer and the click was lost. Fixed
with `.loginForm .togglePassword` rules that keep its centring, padding and
background. (2) The lessons week view's day headers used an undefined
`var(--text)` and inherited white text on a pale yellow fill; now the
system's dark blue with white text (about 6.5:1).

**Codex round 1:** no regression. Three pre-existing defects in the same
control, all fixed: on the register page `.formContainer button:hover`
painted the eye away; ChangeOwnPassword (Profile) and EditUser used
`passwordWrapper`/`togglePassword` classes missing from their CSS modules,
so the eye sat outside the field.

**Round 2:** "Resolved". No new concrete defects.

**Verification:** in Chromium, three clicks on the top edge of the login
eye toggled the field each time; on /register the eye sits inside the field
with a transparent background. Not seen on screen: the lessons page, Profile
and EditUser (they need a signed-in session).

**Status:** not committed.

## 2026-10-31: Responsible guide field always shown (Claude writer)

**Scope:** the same tester did not see the responsible guide (main_teacher)
in student edit. It was hidden while the user list was empty; the owner asked
for it to show anyway, with only «بدون مرشد مسؤول» to choose. EditStudent.jsx
drops `instructors.length > 0` (still `!parent && canAssignGuide`).

**Codex round 1:** no unintended clearing (the empty choice stores null for a
`students.viewAll` holder; a failed list keeps the stored id). One P3, fixed:
a stored guide missing from a list still loading or failed was labelled
inactive; now "loading" / "unavailable" labels until the list really loads.

**Round 2:** "Resolved". No new concrete defects.

**Verification:** client tests 734/734 (two new in EditStudent.lock.test.js).

**Status:** not committed.

## 2026-10-31: Linked student, guide and lesson pages (Claude writer)

**Scope:** spec `docs/superpowers/specs/2026-10-31-student-lesson-guide-links-design.md`
(owner-approved after a builder check), plan
`docs/superpowers/plans/2026-10-31-student-lesson-guide-links.md`, built
inline. Read-only pages with tabs for a student (personal details, lessons,
responsible guide), a user (their students and lessons, empty tabs hidden)
and a lesson (details, students with add/remove); the profile gains "my
students/my lessons" tabs. Lists open the page; the form is `/x/new` and
`/x/:id/edit`. The server sends a guide's name and phone with a student and a
lesson (tz only to `users.view` holders). On the owner's request during the
work, «دليل المستخدم» left the navigation bar (the guide stays in the help
center).

**Codex rounds (read-only), all findings fixed with a failing test first:**
malformed guide id gave a 500 (only 24-hex ids looked up); lessons stored
with `date.hh` showed 00:00; the `/new` routes lost their id (`RecordRoute`);
overlapping roster writes, a stale student load and a late lesson answer;
the roster's "press save" hint; a slow first student load hid a student
added by ID; the profile form was rebuilt when its tabs arrived; the guided
tours expected the form after "open" (new `*-view-edit` steps); roster
writes from two tabs or users (each write takes the lesson lock through
`withLock`, which now awaits its release); `removeFromList` ignored stored
ObjectIds (server, string comparison); the user page offered «تعديل» for
waiting/inactive or not-manageable users; «تعديل» on the lesson page now
freezes the roster, waits for pending writes and opens the form only if the
page is still on that lesson; a confirmation answered after moving to
another lesson writes nothing; the picker counted «أُضيف» before the save
(counted only after a successful write).

**Pending:** round 8 (confirming the «أُضيف» fix) was sent but not answered:
Codex hit its usage limit until 2026-11-04. The request is preserved in this
entry; no Codex agreement is claimed for that last fix.

**Found in the browser walk-through (local test DB, owner's test account):**
a `+972…` phone showed its plus at the end (values in `<bdi>`); leaving a
view page asked "leave?" (`unsavedChanges` patterns now match only the
forms).

**Not changed (ruling):** the roster endpoints still read-modify-write the
whole list on the server; writes from the lesson page take the lock, the
edit form holds it, so the remaining exposure is outside these pages.

**Verification:** client 801/801, server 1013/1013, build compiles. Browser:
student page on desktop and 375px, empty-tab texts, `/students/new`, profile
without tabs, navigation bar. Not walked in the browser (no such data in the
test DB): a regular lesson page, a user page, a guide's profile tabs.

**Status:** not committed.

## QA round on seeded local data (2026-11-01)

**Writer:** Claude. **Scope:** a full QA pass (UI and API, every role) of the
linked pages and the tester fixes, on a local MongoDB filled by the new
`server/scripts/seedTestData.js` (10 admins, 10 guides, 10 assistants, 160
students, 50 lessons, 2 football lessons; `--remove` deletes exactly that
data; refuses a non-local database). The local `config/.env` now points
`MONGO_URI` at `127.0.0.1:27017` (git-ignored; Atlas kept as a comment).

**Bugs found and fixed, each with a failing test first:**
- `/lessons/<not an id>` showed the database's English cast error; GET, PUT,
  DELETE, addToList and removeFromList on such an id answered 500. New
  `middleware/objectIdParam.js` (`router.param('id')` in `Lesson.route.js`)
  answers 404 «غير موجود».
- addToList/removeFromList with `list_students` that is not a list answered
  500; now 400 `BAD_LIST`.
- An admin could add an id that is no student to a roster (it was stored).
  Unscoped actors now add only existing students (`existingIds`). This
  reverses the earlier pinned rule "admin adds as today (no existence
  check)"; the two tests that pinned it were updated.
- The responsible-guide select offered waiting and inactive users (the
  student page then showed "no guide"). Only active users are offered
  (`responsibleGuideOptions`).
- A double click on «إضافة» in the lesson picker counted «أُضيف: 2» for one
  student (`LessonRoster` ignores an id whose add is on its way).
- At 769–1180px an admin's menu hid «المركبات» and the logout button
  (`overflow: hidden`, one row). The desktop menu now wraps
  (`Header.module.css`); checked at 800, 1024 and 1440px.
- The record pages' tab bar showed a vertical scrollbar (1px overflow);
  `overflow-y: hidden` in `RecordPage.module.css`.
- `public/index.html` loaded `bootstrap.min.css` relative to the page, so
  every nested route (`/students/…`, `/lessons/…`) got a 404 and no
  Bootstrap; now `%PUBLIC_URL%/bootstrap.min.css`. Student page, edit form
  and lesson page checked afterwards: no visible change.

**Passed (browser + 38 API probes):** password eye on login/profile (repeated
clicks, label switches, stays centred); day headers; guide field with and
without a guide; student page tabs, empty texts, unknown tz, `?tab=bogus`,
print preview; guide link to `/users/<tz>` for admins, `/profile` for the
guide himself, no link without `users.view`; lesson page details, picker
search, Escape, add, remove with cancel/confirm, lock held by another user
(clear Arabic message, nothing written); guide cannot open another guide's
student or user pages; assistant read-only; profile tabs hidden when empty;
375px pages without horizontal scroll; unsaved-changes guard on forms only.

**Observations for the owner (not changed):** signing in again elsewhere
ends the earlier session at its next token refresh (one refresh token per
account); a guide may edit and change the roster of other guides' lessons
(current permission defaults); `/users/<own tz>` sends a guide to the
dashboard rather than `/profile`; the guided-tour invitation reappears on
each page after «لاحقًا» and sits above dialogs.

**Verification:** client 803/803, server 1018/1018, build compiles.

**Codex review:** requested for this round; not available (usage limit until
2026-11-04). Pending.

**Status:** not committed.

## Owner's rulings after QA: sessions, admin-only editing (2026-11-01)

**Writer:** Claude. **Owner's rulings:** one account may be signed in on
several devices; only an admin edits students, lessons and users; a guide or
assistant opening `/users/<own tz>` lands on `/profile`, any other blocked
page on the dashboard; only existing students accepted in the association
(not waiting) are added to a lesson.

**Changes (each with a failing test first, unless noted):**
- Sessions: `utils/refreshSessions.js` keeps one refresh hash per device in
  `refreshHashes` (newest 10), with atomic `api.pushCapped`/`api.pull`
  through `UserModelDef.addRefreshHash`/`dropRefreshHash`. Sign-in adds,
  refresh replaces only that device's hash (new added before old removed),
  sign-out removes only that device. The old single `refreshHash` still
  refreshes and moves to the list. Recovery and a forced password change
  clear both. `refreshHashes` is hidden like `refreshHash` (user DTOs,
  student DTO, assistant tools) and redacted in the audit log
  (`hash(es)?$`). Tests: `refresh-sessions.test.js`,
  `multi-device-session.test.js` (fails on the previous controller).
- Found by the live check, not by the unit tests: two refresh tokens signed
  in the same second for one user were identical, so a rotation removed the
  other device's copy too. Each refresh token now has a random `jwtid`.
- Admin-only editing: the guide defaults lose `students.edit`,
  `students.photo`, `lessons.create`, `lessons.edit`, `lessons.roster`
  (server `utils/permissions.js` and its client copy in
  `journey/demoRoutes.js`). An admin can still grant a key to one person.
  The `/x/:id/edit`, `/users/new` forms now need their edit/create key in
  `routeAccess.js`; the student list shows «تعديل» only with
  `students.edit` (test written after the change, then shown to fail
  without the gate); the student tour's form steps require `students.edit`.
- `blockedRedirect` (RoleGuard): own user page → `/profile`, else dashboard.
- Roster: `existingIds` also refuses waiting students; the same rule now
  covers an admin's `postOne` and `putOne` (self-review found the form
  bypassed it). Students already on a lesson are kept.
- Older tests that pinned the replaced rules were updated: guide actors in
  lock/assistant tests get explicit grants; "admin adds as today" and
  "guides delete photos" assertions follow the new rules.

**Self-review (harsh):** (1) I wrote the multi-device controller code before
its tests; I then ran the tests against the previous controller to show they
fail there. (2) My first pass missed the lesson form path for the roster
rule and the identical-token case; both are fixed with tests. (3) Two tabs
of one browser refreshing at the same moment can each store a new hash; the
spare hash is unusable by anyone else and drops out at the 10-device cap.
(4) A refresh token whose sign-out arrives after it expired stays in the
list until the cap; it cannot be used. (5) Guides now cannot take student
photos, create lessons or change rosters, including through the AI
assistant: this follows the ruling but is a visible change for them.
(6) Each newly listed student costs one database read when an admin saves a
lesson form. (7) On a desktop, a guide's student tour waits for the missing
«تعديل» anchor before skipping that step.

**Verification:** server 1034/1034, client 808/808,
build compiles. Live: two devices on one account both refresh; the spent
token is refused; signing out one leaves the other. Browser as a guide:
`/users/<own>` → `/profile`, another user → dashboard, a student form →
dashboard, no «تعديل», roster or add buttons.

**Codex review:** pending (usage limit until 2026-11-04).

**Status:** not committed.

## System guidance turned off for now (2026-11-01)

**Writer:** Claude. **Owner's ruling:** turn the system's guidance off for
now. **Change:** `Components/Routes/GuidanceProviders.jsx` with
`GUIDANCE_ENABLED = false` wraps the protected layout instead of
`JourneyProvider` + `TourProvider`; while off, neither mounts, so there is no
guided-journey invitation («أهلًا، أنا إبراهيم»), no "?" help button, no
new-access or "what's new" cards and no "new" badges (`useJourney`/`useTour`
answer their built-in empty defaults). Setting the constant to `true` brings
everything back unchanged. Test: `GuidanceProviders.test.js` (written
first). **Side effect:** `/guide` (the user guide) was reached only through
the help center, so it has no entry point while the guidance is off; its
«ابدأ» buttons do nothing. **Noted, not changed:** the lessons page asks for
`/api/user/` for its guide filter, which a guide may not read (403 in the
console; existed before today). **Verification:** client 811/811, build
compiles; browser: no invitation or help button on the dashboard, student,
lesson and guide pages. **Codex review:** pending (until 2026-11-04).
**Status:** not committed (owner: wait).

## Guides and assistants see only their own lessons (2026-11-01)

**Writer:** Claude. **Owner's ruling:** a guide or assistant sees only the
lessons they teach or assist in; an admin (`lessons.viewAll`) sees all.

**Changes (each with a failing test first):**
- `server/utils/lessonAccess.js`: `seesAllLessons`, `isOnLesson` (moved out
  of the lesson controller), `mayOpenLesson`, `ownLessons`. Tests:
  `lesson-access.test.js`.
- Lesson controller: `getAll`, `getLessonsByQuery`, `getLessonsByToDay`
  return only own lessons; `getOne` answers 404 for someone else's lesson;
  the football schedule is empty without `lessons.viewAll`. `getAll` also
  returns `names` (teacher/helper full names by user id, via
  `contactById`) for the lessons it returns. Tests:
  `lesson-own-only.test.js`. The dashboard reuses `getAll`, so its lesson
  figures follow.
- Attendance: the sheet, its dates and saving answer 404 for someone else's
  lesson (also covers an attendance proposal approved from the assistant,
  which saves through `bulkSave`).
- Assistant tools: `list_lessons`, `get_student` (the student's lessons) and
  `attendance_summary` (rows of other lessons skipped for non-admins only,
  so an admin still counts rows of deleted lessons).
- Client: `getAllLesson` passes `names` through; the lessons page takes the
  guide names and its guide filter from them and no longer reads the user
  list (the 403 a guide got). Test: `ViewAllLesson.test.js`.
- Older tests that read another guide's lesson as a guide were rewritten to
  the new rule.

**Self-review (harsh):** (1) While rewriting the old scope tests I assumed a
student on a guide's own lesson could be hidden from him; it cannot (the
student scope is built from his lessons), so those tests now assert the
full roster and the 404 for other lessons. (2) My first client edit missed
the real `getAllLesson` (the line appears twice) and the page test passed
only because it mocks that function; caught by re-reading, fixed and
checked live. (3) My first `attendance_summary` change would have dropped
an admin's rows of deleted lessons; limited to non-admins. (4) The names
cost one user lookup per distinct staff member per list load. (5) A lesson
whose teacher is the system account gets no name in `names`. (6) A guide no
longer sees, for a student of his, a lesson of another guide that student
attends (by the ruling).

**Verification:** server 1047/1047, client 813/813, build compiles. Live: a
guide gets 8 lessons (his), names in the filter, 404 for another guide's
lesson, no football lessons, no `/api/user/` call; the admin gets 50
lessons, 2 football lessons, 15 names.

**Codex review:** pending (until 2026-11-04). **Status:** not committed.

## The responsible guide sees everything about his student (2026-11-01)

**Writer:** Claude. **Owner's ruling:** the responsible guide (`main_teacher`)
sees all of his student's information, including lessons the student
attends with other guides. Writing stays as before (admin only); the
lesson schedule and attendance pages stay "own lessons only".

**Changes (each with a failing test first, except the guard test below):**
- `utils/lessonAccess.js`: `isResponsible`, `mayViewLesson`,
  `responsibleStudentIds`.
- Lesson `getOne`: a lesson holding one of the actor's own students opens
  read-only (only his visible students named, the rest counted).
- Student `getOneS` returns `lessons` (name, time, room): all of them for an
  admin and for the responsible guide, otherwise the actor's own lessons.
  The student page uses it instead of the user's lesson list (whose
  `studentLessons` helper is removed; `byLessonTime` exported).
- Assistant: `get_student` lists all lessons of his own student;
  `attendance_summary` counts his own students' rows in any lesson.
- Tests from the previous round that used S1 (a guide's own student) were
  rewritten: S1 now shows everything, S2 (only in his lesson) does not.

**Self-review (harsh):** (1) The first `isResponsible` checks compared
`main_teacher` with the actor id as strings with no guard; an empty id
against a student without a guide would have matched. One guarded
`isResponsible` now serves all three places; its test was added after the
fix (it guards the refactor, it did not fail first). (2) My cut of the old
`studentLessons` test left half a block behind and broke the suite; fixed.
(3) `getOneS` now reads all lessons to find the student's ones (no array
matching in the test store); fine at this size, a filter on
`list_students` would scale better. (4) A responsible guide can open such
a lesson's attendance? No: attendance stays "own lessons" (404), by the
ruling's "view" scope; the student's attendance is visible through the
assistant summary only.

**Verification:** server 1054/1054, client 812/812, build compiles. Live
(student 770000354 of guide 770000107 added by an admin to another
guide's lesson): the student page lists 3 lessons including it; the lesson
opens with 2 named students and «طلاب آخرون: 10», no edit buttons; it is
not in his schedule; saving attendance there is 404; an assistant with no
student there gets 404.

**Codex review:** pending (until 2026-11-04). **Status:** not committed.

## The student page shows the student's attendance, read-only (2026-11-01)

**Writer:** Claude. **Owner's ruling:** yes, the responsible guide sees his
student's attendance in other guides' lessons on screen too, read-only,
only his student's rows.

**Changes (each with a failing test first):**
- Student `getOneS` returns `attendance` (lesson, lessonName, date,
  status, notes; newest first, at most 200 rows) to an attendance.view
  holder: every row for an admin and for the responsible guide, otherwise
  the rows of the actor's own lessons. A deleted lesson's row keeps an
  empty `lessonName`.
- The student page gets a «الحضور» tab (only when `attendance` is sent):
  date · lesson, status · notes; a row links to its lesson, a deleted
  lesson shows «درس محذوف» with no link. No inputs.
- `LinkList` renders a row without `to` as plain text.
- `test/helpers/liveStubs.js`: an empty attendance model for the tests that
  load the student controller without one.

**Self-review (harsh):** (1) The attendance page itself is unchanged (own
lessons only); the student's rows from other lessons are on the student
page only. (2) The 200-row cap drops the oldest rows with no notice; enough
for a school year at a few lessons a week, not beyond. (3) The nightly
absence job and opening a sheet create rows marked absent/present
automatically; the tab shows them as they are stored. (4) The liveStubs
default answers for `../Attendance/Attendance.model` silently; no other
Entities controller requires that path today, but a new one would get the
empty stub instead of an "Unexpected dependency" failure.

**Verification:** server 1060/1060, client 815/815, build compiles. Live:
an admin marked student 770000354 absent («QA») on 2026-10-29 in another
guide's lesson 6ae6fd27a81837285224f0f4 (local test data changed). The
responsible guide 770000107 and the admin see that row (10 rows); the
lesson's own guide 770000149 sees only that lesson's rows; an assistant
with no link to the student gets 404. The tab shows the rows, no inputs.

**Codex review:** pending (until 2026-11-04). **Status:** not committed.

## Signed in until signing out, in the system and on the sport site (2026-11-01)

**Writer:** Claude. **Owner's ruling:** like Instagram or Facebook: a person
stays signed in until he signs out himself or is signed out.

**Changes (each with a failing test first):**
- `utils/jwt.js`: refresh token 1 year by default (was 7 days), access
  token 15 minutes by default (was 1 day); the refresh cookie now has
  `maxAge` (it was a browser-session cookie, lost when the browser closed).
  Each refresh already issues a new refresh token, so only a year without a
  visit ends a session. Local `.env` `JWT_REFRESH_TTL_SEC` set to a year;
  **the production environment must be updated too** (an env value
  overrides the default).
- `POST /api/user/:tz/sign-out-all` (users.edit, `canManageTarget`, not the
  system account): clears `refreshHashes` and sets `signedOutAt`;
  `tokenIsStale` now also counts `signedOutAt`, so the user's access tokens
  are refused at once (TOKEN_STALE) on every device. Recorded as
  `sign_out_all`. `signedOutAt` is server-owned (stripped from putU).
  The user page gets «تسجيل الخروج من كل الأجهزة» (with confirmation).
- TOKEN_STALE message is now generic («انتهت الجلسة، سجّل الدخول من جديد»).
- Sport site: a session lasts a year and is renewed for another year on a
  visit a day or more after it was made. `POST
  /api/sports/players/:studentId/sign-out` (sports.manage) sets
  `student.sportSignedOutAt`; older sport sessions are refused. The players
  list gets «تسجيل الخروج» for sports.manage holders.

**Self-review (harsh):** (1) Times are compared in whole seconds (as for a
password change): a device that signed in within the same second as the
sign-out keeps its session. Seen live when everything ran in one second.
(2) An access token keeps working up to the actor cache's 5 s after a
sign-out. (3) A session lasting a year on a shared or lost phone exposes
the player's photo and ID number until a manager signs him out. (4) The
sport sign-out was not checked live (sign-in needs an emailed code); only
by tests. Admins do not hold sports.manage by default (grant-only), so the
button shows only to whoever was granted it. (5) The production env values
are outside the repo; without updating them the old lifetimes stay.

**Verification:** server 1070/1070, client 821/821, build compiles. Live:
the refresh cookie has Max-Age 365 days; two sessions of guide 770000107
worked, an admin's sign-out-all → both get 401 TOKEN_STALE and both
refreshes 401; he signs in again fine; a guide trying sign-out-all gets
403. Guide 770000107's local sessions were ended by this check.

**Codex review:** pending (until 2026-11-04). **Status:** not committed.

## My devices, attendance summary, absence pushes and the sport sign-in card (2026-11-01)

**Writer:** Claude. **Owner's ruling:** "do everything" on the suggestions
list: my devices, sign out other devices, attendance summary with a month
filter and status colours, a summary card on the student page, a danger zone,
scrolling tabs on phones, an absence alert to the responsible guide, and the
sport sign-in card (QR) for players without email.

**Changes (a failing test first, except where the self-review says not):**
- My devices: each session has an id (`sid`) carried in its access and
  refresh tokens and kept across refreshes, and an entry in
  `user.deviceTokens` `{ sid, hash, label, startedAt, lastSeenAt }`, written
  in the same atomic write as `refreshHashes` (`api.pushCapped`/`pull` take
  `also`). The label is "Chrome · Android" from the User-Agent; the whole
  line is never stored. `GET /api/auth/sessions`, `DELETE
  /api/auth/sessions/:sid`, `POST /api/auth/sessions/sign-out-others` (own
  sessions only, loadActor, no permission key). `loadActor` and `getme` refuse
  a token whose `sid` is no longer listed (`sessionEnded`), so a signed-out
  device stops at once. Tokens from before ids keep working until their
  refresh, which gives them an id. `deviceTokens` is stripped by `sanitize`,
  server-owned, hidden by the audit log (its name ends in "Tokens"), and
  cleared by `endAllSessions`. Profile: «الأجهزة المتصلة» (`MyDevices.jsx`).
- Student page: the attendance tab has a month select, the rate (present and
  late count as attended) and counts, and a coloured status badge per row
  (`utils/attendanceView.js`, `StudentAttendance.jsx`). `RecordPage` takes
  `facts` (guide, lessons, attendance rate under the name) and puts
  `variant: "danger"` actions in a separate zone; the user page's «تسجيل
  الخروج من كل الأجهزة» is one. Tabs already scrolled sideways on phones
  (`overflow-x: auto`); unchanged.
- Absence streak: the existing in-app `absence_streak` alert (three recorded
  absences in a row, to the student's scope) now also goes to phones
  (`PUSHED_TYPES`).
- Sport sign-in card: `POST /api/sports/players/:studentId/login-card`
  (sports.manage) makes a 32-byte random token, stores only
  `student.sportCardHash` (+ issued at/by), and returns the link
  `<sport site>/#card=<token>` and its QR as SVG (new dependency `qrcode`
  1.5.4, pinned). A new card cancels the old one. `POST
  /api/sport-portal/card { token }` (rate-limited like the code sign-in)
  starts the usual year-long session. The sport site reads `#card=` on load,
  wipes it from the address bar first, signs in, and shows the refusal on the
  sign-in page; the sign-in page tells players without email to ask for the
  card. The players list gets «بطاقة الدخول» (asks first when a card exists)
  and a printable card the size of a bank card. `sportCardHash` is stripped
  from the student page and list. No "code to the parent": students have no
  parent email field.

**Self-review (harsh):** (1) TDD order slipped twice: I wrote
`utils/attendanceView.js` and `LoginCardModal`/the PlayersTab card wiring
before running their new tests red; the tests were written first but not
watched failing. (2) Sign-out-others keeps only this device; a token from
before session ids on another device still works up to 15 minutes (its
access token). (3) "Sign out one device" is checked against the 5 s actor
cache in `loadActor` too. (4) The card is a bearer credential: whoever scans
it signs in, until a new card is printed; reprinting does not sign out phones
already in (the sign-out button does). (5) The absence push goes to every
recipient of the alert (responsible guide, lesson teachers and helpers,
students.viewAll holders), not only the responsible guide. (6) A full
vehicle test failed once in a full run and passed alone and in the next full
run (timing). (7) The live script that looked for a sports.manage holder hit
the staff sign-in rate limit (20 per 15 min) and signed several seeded test
accounts in once more.

**Verification:** server 1094/1094, client 841/841, sport 72/72, client and
sport builds compile. Live (local server): guide 770000107 on three devices
→ the list shows "Safari · iPhone", "Chrome · Windows" (this one),
"Chrome · Android"; signing out the iPhone → its next request 401
TOKEN_STALE and its refresh 401; sign-out-others → ended 2, only this device
listed, the Android 401, this device 200; `deviceTokens` not in the user
page. Sport site at `/#card=<bad token>`: the token is wiped from the
address bar, the page shows an error. Not checked live: card issue and card
sign-in end to end, because the local `server/config/.env` has no
`SPORT_SESSION_SECRET` (the sport sign-in fails closed locally, the emailed
code too), and the signed-in screens (profile devices, student summary,
danger zone, card print), which need a browser sign-in; covered by tests.

**Codex review:** pending (until 2026-11-04). **Status:** not committed.

## Sport sign-in with a passkey (fingerprint or face) (2026-11-01)

**Writer:** Claude. **Owner's ruling:** the sport site signs in "several
ways, with keypass". Read as passkeys (the owner declined the clarifying
question); the ways are now the emailed code, the QR card and a passkey.

**Changes (a failing test first, except where the self-review says not):**
- `SportPortal.passkey.js` (new dependency `@simplewebauthn/server` 13.3.3,
  pinned): `POST /api/sport-portal/passkey/register-options` and
  `/passkey/register` (signed-in player) save a discoverable passkey on the
  student (`sportPasskeys: { id, publicKey, counter, transports, createdAt,
  lastUsedAt }`, at most 10); `/passkey/login-options` and `/passkey/login`
  (public, the sign-in rate limit) find the student by the credential id,
  verify, update the counter and start the usual year-long session. The
  options name the player, never the ID number. The challenge travels in a
  signed 5-minute cookie (`tamheed_sport_pk`), bound to its purpose (and to
  the student for registration) and cleared on use. Relying party:
  `SPORT_HOST` (https) in production, `localhost:3001` in development.
- A sports manager's «تسجيل الخروج» also clears `sportPasskeys`, so a lost
  phone cannot sign in with a fingerprint. `sportPasskeys` is stripped from
  the student page and list. `SportPortal.auth` exports `signIn` and
  `isPlayer` for it.
- Sport site (`@simplewebauthn/browser` 13.3.0, pinned): «الدخول بالبصمة أو
  بالوجه» on the sign-in page where the browser supports passkeys; after a
  sign-in, a one-time offer on the home tab («حفظ» / «لاحقًا», remembered per
  phone in localStorage). Closing the phone's prompt is not shown as an
  error.

**Self-review (harsh):** (1) I wrote `sport/src/passkey.js` before running its
test red. (2) A passkey is only as safe as the phone's lock; a passkey synced
to a family's shared Apple or Google account signs any of its devices in.
(3) The "saved on this phone" mark is localStorage, so after clearing site
data the offer shows again (saving again replaces the same credential id).
(4) Not checked live end to end: the local env has no `SPORT_SESSION_SECRET`,
so `/passkey/login-options` answers 500 locally (fail closed), and a real
fingerprint needs a phone on the real host (passkeys require https or
localhost and the exact host name).

**Verification:** server 1105/1105 (one test runs the real webauthn library
for the options), client 841/841, sport 81/81, sport build compiles. Live:
the sport sign-in page shows «الدخول بالبصمة أو بالوجه» in the browser pane.

**Codex review:** pending (until 2026-11-04). **Status:** not committed.

## "Install the app" button with a step-by-step guide (2026-11-01)

**Writer:** Claude. **Owner's ruling:** stay a web app for now (no store
apps); on a phone, show a button that installs it for people who do not know
how.

**Changes:**
- `pwa/installState.js` (client and sport, the same file): catches the
  browser's `beforeinstallprompt` once for the whole app (AppChrome no longer
  listens itself), tells the platform (`installed`, `android`, `ios-safari`,
  `ios-other`, `desktop`), and lets any button open the guide.
- `pwa/InstallApp.jsx` (both): `InstallAppButton` «📲 ثبّت التطبيق على
  الهاتف», shown only on a phone where the app is not installed: on Android
  with the browser's prompt it installs at once, otherwise it opens
  `InstallGuide`, a bottom sheet with three steps for that phone (iPhone
  Safari: Share → Add to Home Screen → Add, with drawn icons; iPhone Chrome:
  the share button by the address, or open in Safari; Android: the ⋮ menu →
  Install app). The guide is mounted once in AppChrome; the iPhone hint bar
  gets «كيف؟» to open it.
- Placed: the staff sign-in page and the phone menu (above «خروج»); the
  sport sign-in page and the sport home tab.

**Self-review (harsh):** (1) I wrote `installState.js` and `InstallApp.jsx`
before running their tests red (the tests existed first). (2) The two apps
keep two copies of the same two files (as with AppChrome); a fix must go in
both. (3) Android browsers other than Chrome (Samsung Internet, Firefox) get
the Chrome menu steps, which may not match their menus exactly. (4) The
phone menu placement was not seen live (needs a staff sign-in); covered by
the component tests only.

**Verification:** client 849/849, sport 89/89, both builds compile. Live
(browser pane, phone size, Android): the button shows on the sport and staff
sign-in pages and opens the Android steps; at desktop size it does not show.

**Codex review:** pending (until 2026-11-04). **Status:** not committed.

## Alerts follow their records; actions move from the lists to the record pages (2026-11-02)

**Writer:** Claude. **Owner's request:** a deleted vehicle's alerts and
notices go with it; a read alert is deleted 30 days later, or on an end date
the admin picks; licence/test/insurance alerts stay until renewed; a parent's
registration request stays until someone opens it. Lists of students, users
and lessons open the record's page, and print, edit and delete are there,
not in the list or the edit form.

**Changes (server):**
- `services/alertRetention.js` (new): `expiryOnRaise` (180 days; none for
  `parent_registration` and the vehicle types), `expiryOnRead` (30 days; none
  for the vehicle types), `recordPrefixes(kind, id)` (the dedupKey starts of
  a vehicle's, student's, lesson's or user's alerts), `prefixPattern`.
- `Alert.model`: every row has `expireAt`; reading moves it; the TTL index is
  now `{ expireAt: 1 }, expireAfterSeconds: 0`. `ensureAlertIndexes` drops
  the old `at_1` TTL index and backfills `expireAt` on older rows (MongoDB
  4.2+ pipeline update). New `removeByPrefixes`, `removeExcept`,
  `removeForRecipient`.
- `services/recordAlerts.js` (new): `forget(kind, id)`, `syncVehicle(vehicle)`
  (keeps only the keys of the vehicle's current stages, in AiAlerts and
  Notices), `pruneVehicles(keys)`. Wired into vehicle save (every
  `saveVehicle`, so renewal and archive) and delete, student/lesson/user
  delete (a user's own inbox too). Each call is caught and logged, never
  failing the write. The nightly vehicle check prunes stale vehicle keys
  unless a vehicle failed to be checked.
- Notices: optional `endDate` on a manual notice (today to a year ahead;
  `expireAt` is the end of that day at UTC+2, a TTL index deletes it; hidden
  at once after it). `readTimes[userId]` is kept on read; a non-vehicle
  notice read more than 30 days ago is hidden for that reader (rows read
  before this count from `createdAt`).

**Changes (client):**
- `mergeAlerts` drops an alert the server no longer sends (older than the
  newest fetched), so deleted alerts leave the open list.
- Notices board: «تاريخ الانتهاء (اختياري)» with a hint; the row shows it.
- Students and users lists: a row opens the record's page; «تعديل», «ملف
  الطالب/المستخدم», unlock and «عرض التفاصيل» are gone from the rows (phone
  cards too). Waiting/inactive queues keep approve/reject/activate/delete.
- Record pages: student «حذف» (students.delete), lesson «حذف»
  (lessons.delete, after roster writes settle), user «طباعة الملف», «رفع
  الحظر», «إيقاف الحساب» (confirmed) and «حذف الحساب» (users.delete, a user
  the viewer may manage); delete/suspend in the danger zone. The edit forms
  no longer have delete (or suspend).

**Rulings:** (1) The "delete with the record" rule was applied to students,
lessons and users too, not only vehicles. (2) Queue buttons (approve/reject
waiting students and users, activate/delete inactive users) stay in the
lists: waiting/inactive rows have no page actions. (3) A read vehicle alert
stays until the renewal (or a newer stage) replaces it, so only the current
stage of each document is ever shown. (4) The guided tour (switched off)
still walks the old order for the student delete step; its anchors exist.

**Self-review (harsh):** (1) TDD was followed: every new test was run red
before the code. (2) The Alert model's backfill and the TTL changes ran
against the local database without an error, but were not checked against
production data. (3) A vehicle edit that creates a new due stage shows it
only after the nightly check. (4) `endDate` uses UTC+2, so in summer the
notice lasts one hour past midnight. (5) Not checked live in the browser:
signing in needs the seeded password from `.env`, which I do not read.

**Verification:** server 1140/1140 (one pre-existing flaky vehicle
concurrency test failed once in a full run, passed alone 5/5 and in the next
full run), client 869/869, client build compiles. The server started
locally with the new indexes without an error.

**Codex review:** pending (until 2026-11-05). **Status:** not committed.

### Follow-up: waiting and inactive records are decided on their page (2026-11-02)

**Owner's request:** waiting and inactive students, and users, are opened
from the list first; approve or reject is done on the details page.
This replaces ruling (2) above.

**Changes (client):**
- Students and users lists (table and phone cards): every row opens the
  record's page; no approve/reject/activate/delete buttons remain. The users
  table's last column is now «الحالة» (waiting / suspended / locked badge).
- Student page: «الحالة» fact when not «عادي»; a waiting request gets «قبول»
  (students.edit, sets «عادي» after the confirm, stays on the page) and
  «رفض» in the danger zone (students.delete); an inactive student gets
  «تفعيل» (students.edit).
- User page: «الحالة» fact for a waiting or suspended account; «قبول» picks
  a role and calls changeStatus waiting→active; «تفعيل» reactivates
  (asks for a role only when the account has none); both need users.approve
  and a user the viewer may manage, then the page reloads. «حذف الحساب»
  deletes from the account's own room.
- `getUserById` now keeps the `room` the server sends beside the user. Before
  this, the user page treated every account as active.
- «إيقاف الحساب» now also needs users.approve (the changeStatus route's
  permission), so it is no longer offered to someone the server refuses.

**Rulings:** (1) Inactive students had no list buttons; they get «تفعيل» on
their page, since the request covers inactive ones too. (2) Edit and print stay
on a waiting student's page, so parent details can be fixed before
approving. (3) Tour anchors `users-approve` and `students-reject` moved to
the page actions; the (switched-off) tour still walks the old order.

**Self-review (harsh):** (1) TDD was not followed for this follow-up: the
code came first and the new tests passed on their first run, so they were
not seen failing. (2) Not checked live in the browser, for the same reason
as above.

**Verification:** client 882/882, client build compiles. The server was not
changed.

**Codex review:** pending (until 2026-11-05). **Status:** not committed.

### Follow-up: the sport site's guide is off too (2026-11-02)

**Owner's ruling:** turn off the sport site's guide as well. The 2026-11-01
switch covered only the main system; I had told the owner the sport site
had no guide, which was wrong (missed `sport/src/guide`).

**Change (sport):** `guide/guideSwitch.js` with `GUIDE_ENABLED = false`.
While it is off, `App.jsx` does not open `FirstVisitGuide` on a first visit
and passes no `onHelp`; `StadiumHeader` shows the "؟" button only when
`onHelp` is given. Setting it to `true` brings both back unchanged.

**Test:** `App.guide.test.js` (a first visit opens no guide; no help
button), written first and seen failing on both.

**Verification:** sport 91/91, sport build compiles. Not checked live.

**Codex review:** pending (until 2026-11-05). **Status:** not committed.

### Follow-up: a lighter main menu (2026-11-02)

**Owner's ruling:** step 1 only: take the non-page items out of the main
menu. Grouping the pages into sections was offered and not chosen.

**Change (client, `Components/Header`):** the menu holds the pages only.
«لوحة التحكم» left it; the logo is now a link to `/dashboard` (it used to go
to `/`, which redirects). «الملف الشخصي», «ثبّت التطبيق» (phones only) and
«تسجيل الخروج» moved to a small menu under the user's name (`AccountMenu`,
a button with `aria-expanded`; closes on Escape, on a click outside, and
after choosing the profile). Before `getMe` answers, the button reads
«حسابي», so signing out is always reachable. The tour anchors
`menu-dashboard` and `menu-profile` moved with their items.

**Test:** `Header.test.js` (7 tests), written first and seen failing (the
logo test first passed against the old menu link and was tightened to the
logo).

**Verification:** client 889/889, client build compiles. Not checked in the
browser (signing in needs the seeded password); the dropdown's look on a
phone is unverified.

**Codex review:** pending (until 2026-11-05). **Status:** not committed.

### Follow-up: signing in became slow after the update (2026-11-02)

**Owner's report:** after updating the server, signing in takes a long time.

**Finding (not measured on the server):** login waited for the separate file
storage service before answering: one POST `/folder` for the user's folder,
then one GET `/list` per shared file, in sequence, none with a time limit.
A slow or unreachable storage service made every sign-in wait for it. The
code is older than the update; what changed on the storage side is unknown.

**Change (server):**
- `User.controller.js` `login`: answers first; the folder and the shared-file
  permissions run right after (still never fatal).
- `Storage.controller.js`: the `/folder` and `/list` calls have a 10-second
  limit (`STORAGE_QUICK_TIMEOUT_MS`).
- `filterExistingSharedItems`: a storage error used to delete the share
  record; now the share stays, and only a file the storage service no
  longer lists loses it. Without this the time limit would have deleted
  shares whenever the service was slow.

**Test:** `multi-device-session.test.js` (+2: login answers while storage
never answers; a failing storage service does not fail the sign-in) and
`storage-share-check.test.js` (3: no answer keeps the share; an unlisted
file loses it; both calls have a time limit). The login and keep-the-share
tests were seen failing first; the time-limit test was written after the
timeouts. The storage test helper gained a `get` stand-in (throws unless a
test gives one) and matches `sharedWith.userId`.

**Verification:** server 1145/1145. Not checked on the live server.

**Codex review:** pending (until 2026-11-05). **Status:** not committed.

### Follow-up: permissions taken away show at once; permissions on the user page (2026-11-02)

**Owner's report:** permissions removed from another account do not show on
that person's screen at once; a guide whose role defaults were revoked still
had them. **Owner's ruling:** the permissions belong on the user's page, not
in the edit form.

**Finding:** the server computes (role defaults + grants) - revokes on every
request, so it already refused the revoked keys. The person's browser did
not: it keeps the permissions in local storage and the pages read them only
when they draw. They were refreshed on navigation (`RequireAuth` -> `getMe`)
but after the new page had drawn, with no redraw, and never while a page was
open. The server already broadcasts `change {entity: "user", id}` to every
staff screen when a user's permissions or role change; the person's own
screen ignored it.

**Change (client):**
- `utils/session.js`: `rememberSessionUser` announces a real change in the
  stored roles or permissions (`subscribePermissions`, `getPermissionsVersion`).
- `Components/Routes/useOwnAccessLive.js`: on a live change of the signed-in
  user's own record, or a reconnected channel, reloads `/auth/me`;
  `usePermissionsVersion` for the layout.
- `Routes.jsx` `ProtectedLayout`: the header and page keys include the access
  version, so both redraw (remount) when access changes.
- Owner's follow-up ruling: the page says what changed. `AccessChangeNotice.jsx`
  (`useAccessUpdates`) shows «ألغت الإدارة صلاحياتك: …» / «أضافت الإدارة لك
  صلاحيات: …» under the menu. The menu redraws at once; the page redraws at
  once unless it holds unsaved edits (`getUnsavedChanges() === true`), then
  it waits until the user leaves it or presses «حدّث الآن».
- `UserView.jsx`: a «الصلاحيات» tab (permissions.manage, active accounts)
  with `PermissionsTab`; tour anchors `user-tab-permissions` and
  `user-permissions` moved with it (`RecordTabs` gained a tab `tour`).
- `EditUser.jsx`: the details/permissions tabs are gone; after a role
  change, «الآن» opens `/users/:tz?tab=permissions`.

**Test:** `session.test.js` (+1), `useOwnAccessLive.test.js` (5),
`UserView.test.js` (+2), `AccessChangeNotice.test.js` (6), all seen failing first (the "no tab without
permissions.manage" one passed at once, as it should). The edit form's
missing tab has no test of its own.

**Verification:** client 903/903, client build compiles. Not checked in the
browser or live.

**Codex review:** pending (until 2026-11-05). **Status:** not committed.

### Follow-up: menu links follow every section's permission; a general message; install guide close (2026-11-03)

**Owner's report:** taking «التقارير» away from a guide left the link in the
menu. The access message should be general, without listing what changed.
«إغلاق» in the install guide opened from «كيف؟» did nothing.

**Change:**
- Client `utils/routeAccess.js`: `/calendar` needs attendance.view,
  `/lessons` lessons.view, `/reports` any reports key, `/files` files.use or
  files.manageAll (they were open to every signed-in user). `Header.jsx`
  shows those four links through `canAccessPath`, so menu and page agree.
  The help page (`guide/guideLogic.js`) uses the same rules.
- Server `Report.route.js`: reading reports needs some reports key; the
  controller still filters per caller. Removed from the route-guards
  public list.
- Client `AccessChangeNotice.jsx`: one message, «عدّلت الإدارة صلاحياتك.»;
  the waiting text and «حدّث الآن» stay.
- `pwa/AppChrome.jsx` (client and sport): the bars' wrapper has
  `pointer-events: none` and the install guide was rendered inside it, so
  the guide got no clicks whenever a bar showed. The guide is now rendered
  beside the wrapper.

**Test:** `routeAccess.test.js` (+8), `Header.test.js` (+1),
`AccessChangeNotice.test.js` (2 rewritten), `AppChrome.test.js` (+1 in each
app), the guards test: all seen failing first. `GuidePage.test.js` and
`guideLogic.test.js` fixtures gained the section keys (+1 test: no keys,
dashboard only).

**Verification:** client 914/914, sport 92/92, server 1145/1145; client and
sport builds compile. Not checked on a phone or live.

**Codex review:** pending (until 2026-11-06). **Status:** not committed.

### Follow-up: dashboard follows the sections; filters in a «فلتر» window (2026-11-03)

**Owner's report:** after «التقارير» was taken from a guide, the dashboard
still showed the reports shortcut and card. On every screen the filters
should sit in a window opened by a «فلتر» button, and «تصفية» becomes
«فلتر».

**Change:**
- Client `Dashboard.jsx`: the lessons, reports and attendance parts follow
  `canAccessPath` (as the menu): shortcuts, stat cards, the lessons panel
  and its «دخول» button. The students card follows students.view.
- Server `Dashboard.route.js`: the report count needs some reports key, as
  `GET /api/report` does (it ran the controller directly and skipped the
  route guard); without one the part is null.
- Client `UI/FilterDialog.jsx` (new): «فلتر» button with the active count,
  «مسح الفلتر» beside it, the window (`c-overlay`), Escape/«إغلاق» close;
  with `onApply` it is a form with «تطبيق». Used by users (status, role),
  students (status), lessons (day, place, guide), vehicles (type, status,
  documents), notices, the audit log (its whole form) and the sport players
  tab. Search fields stay on the page; lesson/date pickers in attendance
  are choices, not filters, and stay.
- Wording: «تصفية» → «فلتر» in labels, the help page, the journey and
  `audit.filters.clear`. The users and audit journey chapters open and
  close the window; `chapters.test.js` also reads FilterDialog's tour props.

**Test:** `Dashboard.test.js` (new, 4), `FilterDialog.test.js` (new, 4),
`dashboard-summary.test.js` (+1, 2 updated): seen failing first.
`ViewAllUser`, `ViewAllStudent`, `ViewAllLesson` tests open the window.

**Verification:** client 922/922, server 1146/1146, client build compiles.
The journey's users and audit chapters not run in the browser.

**Codex review:** pending (until 2026-11-06).

### Follow-up: «معلومات التخزين» window; the Drive account by permission (2026-11-03)

**Owner's report:** on the files screen the Google Drive card and the
storage space should sit in a window opened by a button, like «فلتر», named
«معلومات التخزين». The linked account and «تغيير الحساب» are the system
account's, and it may give them to whom it wants.

**Change:**
- New permission `storage.drive` («حساب Google Drive»), server and client
  trees; dangerous (only the system account grants it), in no role default.
- Server `GoogleDrive.route.js`: connect-url and `canConnect` accept the
  system account or `storage.drive`; the audit actor's isSystem now follows
  who started the flow.
- Client `DriveConnection.jsx`: shown only with `storage.drive` and the
  server's `canConnect` (administrators no longer see the read-only card).
- Client `FilesPage.jsx`: «معلومات التخزين» (FilterDialog with a `label`)
  holds the card and the storage space; Google's return (`?drive=`) opens
  it so the result toast shows.

**Test:** `drive-connect.test.js` (+1), `permissions.test.js` (shape),
`DriveConnection.test.js` (new, 3), `FilesPage.test.js` (+1),
`FilterDialog.test.js` (+1): seen failing first.

**Verification:** client 927/927, server 1147/1147, client build compiles.
Not checked live; reconnecting Drive with a granted user not tried.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: one record per ID number (unique tz index) (2026-11-03)

**Owner's request:** close the gap found while answering about concurrent
requests: the ID-number check before a save cannot stop two saves of the
same moment.

**Change:**
- `server/utils/tzUnique.js` (new): `TZ_UNIQUE_INDEX` (`{ tz: 1 }`, unique,
  partial on `tz > ""`) and `isDuplicateKey` (E11000).
- `Student.model.js` `ensureStudentIndexes`; `User.model.js`
  `ensureUserIndexes` (each room: Users, UsersNoActive, UsersWaitingRoom);
  both created at startup in `server.js`, logged and skipped on failure.
- A duplicate refused by the index answers like the existing check:
  `postS`/`putS` and `postU`/`changeRoom` 409 `TZ_EXISTS`, `register` 400
  «المستخدم موجود», the parents' form its usual received reply.
- `server/scripts/findDuplicateTz.js` (new, read-only): lists ID numbers held
  twice in one collection; the index is not created while any exist.

**Not covered:** the same ID in two different user rooms at the same moment,
and spellings that differ only by leading zeros (the pre-save check handles
both when the saves are not simultaneous).

**Test:** `tz-unique.test.js` (new, 5), `student-scope-routes.test.js` (+2),
`user-audit.test.js` (+2): seen failing first.

**Verification:** server 1156/1156. Not run against a real MongoDB; on the
server, run `node scripts/findDuplicateTz.js` and check the startup log.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: the sites move into apps/ (2026-11-03)

**Owner's request:** separate the systems by folder: `client` -> `apps/system`,
`sport` -> `apps/sport`, and later `apps/it`.

**Change:** `git mv` only, plus the paths that name the folders:
`server/server.js` (the built sites it serves), `deploy/update.sh`, root
`package.json`, `scripts/setup.js`, `.github/workflows/ci.yml`, `.gitignore`,
one server test that reads a client file, and comments that pointed at the
old paths. Older plans, specs and this log keep the old names.

**Verification:** server 1156/1156, apps/system 927/927, apps/sport 92/92 (one journey test
timed out once under load, passed alone and on the rerun), both builds
compile. On the server, `update.sh` builds the new folders; the ignored
leftovers in the old `client/` and `sport/` folders there are unused.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: profile photos in the everyday lists (2026-11-03)

**Owner's request:** a small round profile photo beside the name in every
student and user list, on desktop and phone; first-letter circle without one.

**Change:** new `UI/Avatar` (component + CSS module, no app imports: lazy `img`,
falls back to the letter when empty or on `onError`); `PersonCard` takes an
optional `photo`; the student and user tables and phone cards pass
`passportSrc(record.photo)`, the same value the record pages show.

**Test:** `Avatar.test.js` (new, 3), `ViewAllStudent.test.js` and
`ViewAllUser.test.js` (+1 each): seen failing first.

**Verification:** apps/system 932/932.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: the IT layer in the permission model (2026-11-03)

**Change:** `server/utils/permissions.js`: `users.resetPassword` leaf;
`IT_KEYS` (`permissions.manage`, `users.passwords` now meaning *view*,
`users.unlock`, `audit.view`, `storage.drive`, `systemRecovery.reset`), with
`DANGEROUS_KEYS` kept as an alias; ادارة defaults gain `users.changeRole` and
`users.resetPassword`; `effectivePermissions` never holds an IT key (system
included; stored IT grants ignored); new `isItUser`, `itPermissions`.
`server/utils/permissionRules.js`: actor flag `it` (missing = false);
`canManageTarget` (IT target: system IT actor only; IT actor: any everyday
user), `canAssignRole` (IT actor may give himself a role),
`validatePermissionChange`/`grantableBy` (IT actor only, never an IT key),
new `canResetPassword`; `holdsDangerous`/`isPermissionManager` removed. Client
mirrors: `permissionKeys.js` (tree, `IT_KEYS`), `demoRoutes.js`
(defaults, grantable), `accessStrings.js` (labels). No controller change.

**Test:** `it-rules.test.js` (new, 10), seen failing first. Existing tests
that asserted the old dangerous-key behaviour were moved to the design's table:
`permissions`, `permission-rules`, `alert-engine`, `assistant-tools`, `locks`,
`login-security`, `permission-middleware`, `system-account`,
`system-password`, `user-audit`, `user-permissions-api` (permission changes
now by an IT actor), apps/system `demoRoutes`, `permissionKeys` (+1).

**Verification:** server 1166/1166, apps/system 933/933. Until Tasks 3 and 5
land, nobody in the everyday app sets another user's password or email (putU
still checks `users.passwords`), unlocks, sees the audit log, force-releases a
lock or changes permissions.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: everyday user routes follow the IT rules (2026-11-03)

**Change:** `putU` sets another user's password (and the email a reset is sent
to) only where `canResetPassword` allows it (`users.resetPassword`, a lower
rank, not IT), checked after the target is read in full so `isIT` reaches the
rules. Every account action on an IT user from an everyday actor is 403. Removed
from `User.route.js` (handlers stay exported for the IT router, Task 6):
`GET /viewPassword/:tz`, `GET|PUT /:tz/permissions`, `POST /:tz/unlock`,
`POST /system/recover`. The `DANGEROUS_KEYS` alias is gone.

**Test:** `user-it-protection.test.js` (new, 7), seen failing first. Moved with
the new rules: `user-permissions-api`, `system-account`, `system-password`
(password/email now by `users.resetPassword`; the route-regex test for
`/system/recover` dropped, Task 6 re-pins it on the IT router), `route-guards`,
`login-security`, `permissions`; `student-scope-routes` +1 (an IT guide can be a
student's responsible guide).

**Verification:** server 1173/1173.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: the system account is IT (2026-11-03)

**Change:** the user model gains `isIT` (false), `itBlockedAt` (null) and
`itSince` (null). `ensureSystemAdmin` creates or normalizes the system account
as `role: null, roles: [], isIT: true, itBlockedAt: null`, setting `itSince`
when it first becomes IT; its password and other details are kept. The three
fields join `SERVER_OWNED_FIELDS`, so an everyday edit never sets them.

**Test:** `system-account.test.js` +3 (new account is IT with no role; an
existing `ادارة` account becomes IT keeping its password and `itSince`; model
defaults), seen failing first. `user-audit.test.js` asserts a PUT body carrying
`isIT` stores nothing.

**Verification:** server 1176/1176.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: IT sign-in and the IT actor (2026-11-03)

**Change:** `POST /api/it/login { tz, password }` always answers the same
generic message; only an active, unlocked IT user (not blocked) with the right
password and a real email (`hasRealEmail` in `utils/permissions.js`: has "@",
not `test@test.com`) gets a 6-digit code, stored hashed in `ItLoginCodes`
(unique `userTz`, TTL on `expiresAt`), 10 minutes, ended after 5 wrong tries.
The system account's code goes to `SYSTEM_ADMIN_EMAIL`; while its password has
expired it gets no code. A wrong password counts in the everyday lockout
(`countFailedSignIn`, now exported with `verifyPasswordAndMaybeUpgrade`).
`POST /api/it/verify` uses the code once and sets `it_session` (httpOnly,
sameSite Strict, path `/api/it`, 12 h, secure in production), a JWT
`{ sub: tz, typ: "it" }` signed with `IT_SESSION_SECRET` (fails closed when
missing). A system sign-in emails `SYSTEM_ADMIN_EMAIL` and writes the audit
row `it / sign_in`. `middleware/requireIt.js`: 404 off `IT_HOST` (also on the
whole router), then re-reads the user every request and refuses (401
`IT_SIGNED_OUT`) a blocked, removed, locked or inactive user or a token older
than a password change, sign-out, `itSince` or `itBlockedAt`; builds the IT
actor with `itPermissions`. `/logout`, `/me`. `IT_HOST`, `IT_SESSION_SECRET`
in `.env.example`.

**Test:** `it-auth.test.js` (new, 19), seen failing first;
`route-guards.test.js` lists the four IT routes with their own guard.

**Verification:** server 1195/1195.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: IT code guesses limited per account (2026-11-03)

**Change:** review finding on the IT sign-in: `/login` reset the code's wrong
tries, so the code could be guessed without a per-account limit once the
password was known. Now five wrong tries end the code (`codeHash: null`, the
row stays until it expires); `/login` sends no code while an unexpired row has
five tries, and a new code keeps the tries of the unexpired one it replaces:
at most five guesses per account per ten minutes. A wrong code also counts as
a failed sign-in (`countFailedSignIn`: lock for ordinary users, the existing
alert for the system account).

**Test:** `it-auth.test.js` +3 (22), the new and changed ones seen failing
against the previous code.

**Verification:** server 1198/1198.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: one-time pass between the sites (2026-11-03)

**Change:** `Entities/It/sitePass.js` + `SitePass.model.js` (`SitePasses`:
unique `hash`, TTL on `expiresAt`, index ensured in `server.js`). A pass is 32
random bytes base64url, stored as its sha256 with `{ tz, to, expiresAt: now +
60 s }`; any use deletes it (only the request whose delete reports
`deletedCount === 1` goes on), also one shown to the wrong site.
`POST /api/auth/it-pass` (requireAuth + loadActor; 403 unless IT and not
blocked) and `POST /api/it/system-pass` (requireIt; 403 without an everyday
role) issue it. `POST /api/it/login-pass` replaces only the password step:
`It.auth.js` login is split so the password login and the pass share
`signInUser` (active, not locked) and `sendCodeAfterPassword` (expired system
password, IT, mailbox, five tries); the answer is login's generic one plus the
`tz` the code step needs when the pass was good. `POST /api/auth/login-pass`
gives the everyday sign-in answer: `User.controller.js` login's tail is now
`finishSignIn`, shared with `signInWithoutPassword` (lockout first). Both
login-pass routes use their neighbours' rate limits; a pass use is audited
(`it` / `pass_to_it`, `pass_to_system`).

**Test:** `site-pass.test.js` (new, 12), seen failing first;
`route-guards.test.js` lists the four routes.

**Verification:** server 1210/1210.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: site pass only for IT users with an everyday role (2026-11-03)

**Change:** review finding on the one-time pass: `POST /api/auth/it-pass`
checked only IT and not blocked, so an IT user with no everyday role holding
an everyday session, and the system account, got a pass. Both pass routes now
require both sides (IT, not blocked, an everyday role), as the design says;
the system account gets 403 on both. `POST /api/it/login-pass` checks
`IT_SESSION_SECRET` before spending the pass, so a missing secret neither
burns it nor writes an audit row.

**Test:** `site-pass.test.js` +1 (13): the no-pass test adds an IT user
without a role and the system account on it-pass; a missing secret keeps the
pass and writes no audit row. Both seen failing first.

**Verification:** server 1211/1211.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: the IT API (2026-11-03)

**Change:** Task 6 of the IT site. `server/Entities/It/It.route.js` is now
`createItRouter(deps)`; below the sign-in routes every route takes
`requireIt`. Users: `GET /api/it/users?room=` (only tz, names, role, isIT,
photo, lockedAt, room; never the system account), `GET /users/:tz`, and
`/users/:tz/role|permissions|password|unlock|sessions[/:sid]`, which reuse
the everyday handlers (getOneU, putRole, getPermissions, putPermissions,
viewPassword, unlockUser) with the IT actor; new thin handlers
`resetUserPassword` (canResetPassword, password length rule,
passwordChangedAt as putU), `listUserDevices`, `signOutUserDevice`.
viewPassword now checks canManageTarget (403 on another IT user).
`POST /system/recover` is rate-limited again (3 an hour, after the
permission check). Audit list, Drive status/connect-url, lock force-release
and push settings moved from the everyday API to `/api/it/audit`,
`/api/it/storage/google/*`, `/api/it/locks/force-release`,
`/api/it/push/settings` through router factories that take the
auth middleware; Google's `/api/storage/google/callback` stays, shares one
state store, and sends a flow started on the IT site back to
`https://IT_HOST/storage?drive=`. Members (`ItMembers.controller.js`,
`requireSystemIt`): list/add/remove/block/unblock, system account only,
real email required, the system account never removed or blocked, audit
module `it`. A new `itSignedOutAt` (block, removal) keeps sessions from
before a block ended after the unblock. Alerts: `account_locked` goes to IT
users not blocked plus the system account, `access_changed` to IT users;
both link to the IT site's user page when `IT_HOST` is set.

**Test:** `it-api.test.js` (new, 18), seen failing first (module missing);
`alert-engine.test.js` restores the other-recipient text/link coverage for
IT users (7 seen failing first); `route-guards.test.js` learns `requireIt`
and `requireSystemIt` and pins the IT keys; `audit`, `locks`, `push`,
`login-security`, `system-password` tests follow the moved routes.

**Verification:** server 1231/1231.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: the IT site, apps/it (2026-11-03)

**Change:** New CRA app `apps/it` (React 18.3.1, RTL Arabic, no router
library): sign-in (ID number + password, then the email code; no sign-up),
Users (every room, search, «فلتر» window, round lazy photos), the user page
(role, the permissions editor copied from the everyday app, reset and view
password, unlock, signed-in devices), IT users (`/members`, only when
`/me` says `isSystem`), audit log, storage (Drive card), settings (lock
force-release, push settings, system recovery). Copied, not imported:
Avatar, FilterDialog, the permission tree and labels, the Drive card.
Moving between the sites: «النظام» shows only when `POST /system-pass`
answers 200 and opens the everyday site (`REACT_APP_SYSTEM_URL`) with
`#pass=<pass>`; on load the sign-in reads `#pass=`, removes it with
`history.replaceState` before anything else, calls `/login-pass` and goes to
the code step. The password value is never shown (only «يوجد/لا توجد كلمة
مرور»), and the system account's ID number is never displayed. Server:
`hostStatic(distDir, host)` in `utils/sportHost.js` (`sportStatic` kept as
the same function), `server.js` serves `apps/it/build` for `IT_HOST`.
Deploy: `update.sh` builds `apps/it`, nginx block `it.example.org`,
DEPLOY.md section (DNS, nginx, certbot, `IT_HOST`, `IT_SESSION_SECRET`,
`REACT_APP_SYSTEM_URL`, local development with `IT_HOST=it.localhost`),
root `package.json`, `.gitignore`, CI job for `apps/it`.

**Test:** `apps/it` 34 tests in 8 suites (SignIn, App, Users, UserPage,
Members, Audit, Storage, Settings), written first and seen failing (modules
missing); `sport-host.test.js` gains `hostStatic serves the IT build only for
IT_HOST` and the empty-host case (seen failing first).

**Verification:** `apps/it` tests 34/34 and `CI=false npm run build`
compiles; server 1233/1233.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: IT site «النظام» from /me, a pass only on click (2026-11-03)

**Change:** `GET /api/it/me` also returns `hasEverydayRole` (the pass routes'
condition, `resolveRole`). The IT site shows «النظام» from it and asks
`/system-pass` only when the button is clicked (a refusal hides the button).
Users role filter expression parenthesised.

**Test:** `it-auth.test.js` me answer (with and without a role); `App.test.js`
button from /me, no /system-pass on load, refused pass hides the button.

**Verification:** apps/it 36/36 and build compiles; server full suite passes.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: the everyday app loses the IT screens (2026-11-03)

**Change:** `apps/system` no longer calls what the server stopped serving to it:
lock force-release (`forceRelease.js`, the lock screen's button), the push
system switch (`getPushSettings`/`setPushSettings`), the audit screen, route
and `audit.view` rule (`Components/Audit/*`, `functionsAudit`, `auditDisplay`),
the Drive card (`DriveConnection*`, `getDriveStatus`/`getDriveConnectUrl`; the
«معلومات التخزين» window keeps the storage space), view-password, the
permissions tab (`PermissionsTab.jsx`), unlock, and the system-account
recovery button. Users keep role change and password reset for lower rank
(`users.resetPassword`), hidden on IT users: `canManageTargetClient` refuses
`isIT` targets, the system viewer included. «قسم الIT» in the name menu (IT,
not blocked, an everyday role, not the system account): `POST /auth/it-pass`
on click (403 hides the button), then the IT site (`REACT_APP_IT_URL`, default
`it.<host>`) in a new tab with `#pass=` in the fragment. The sign-in screen
reads `#pass=`, removes it with `history.replaceState`, and calls
`POST /auth/login-pass` (`loginWithPass`, same success handling as `login`).
Alert links to the IT site (`https://<IT host>/users/:tz`) open in a new tab
(`alertTarget`, only the IT site's own origin); other absolute links stay
refused. Journey: `journey-audit` dropped, the users chapter ends after the
role save; guide and tours sections follow; demo routes for the removed
endpoints removed.

**Test:** `UserView.test.js` (role change and password reset, not permissions,
view-password or unlock; no account actions on an IT user), `FilesPage.test.js`
(no Drive card), `EditUser.account.test.js`, `roles.test.js`, `siteLink.test.js`,
`alertDisplay.test.js` (`alertTarget`), `Header.test.js` (button conditions,
pass on click, refusal), `LoginPage.pass.test.js`, `ViewAllUser.test.js`,
`PhoneNotifications.test.js`, `chapters.test.js` (twelve chapters).

**Verification:** `apps/system` 941/941 tests in 102 suites; `CI=false npm run
build` compiles.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: migration of stored IT-key grants (2026-11-03)

**Change:** `server/scripts/migrateItGrants.js` (`findItGrants`, `clearItGrants`;
pattern of `unlockUser.js`). Without a flag it lists, per room, users whose
`permissionGrants` / `permissionRevokes` hold an IT key (leaf keys, and module
keys that expand to IT leaves); `--apply` removes only those, in every room,
skips the system account, and writes one `users` / `it_grants_cleared` audit
row per changed user (actor: the system). A module key that also holds
everyday leaves (`users`) is replaced by those leaves, so nothing else changes.
The one-time run is step 7 of the IT-site section in `deploy/DEPLOY.md`.

**Test:** `server/test/migrate-it-grants.test.js` (list, apply with a fake
model and audit, dry run writes nothing, system account skipped).

**Verification:** server suite 1235/1235.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: final review fixes of the it-site branch (2026-11-03)

**Change:** `deploy/nginx-tamheed.conf` sets `X-Forwarded-Host $host` in every
proxying `location` (a client-sent value no longer reaches the IT/sport host
checks); `deploy/DEPLOY.md` gets the step for running servers (add the line by
hand, reload, `curl` check must print 404), the Drive pointer now says the IT
site's «التخزين», the first-sign-in note (change the system password on the
main domain first) and the deactivate/delete order for IT users. The everyday
header shows «النظام» for the system account (`roles.system`). The
`migrateItGrants.js` apply uses `updateExisting`; a user that no longer exists
is reported as skipped, with no audit row.

**Test:** `Header.test.js` (system account label), `migrate-it-grants.test.js`
(skipped user). nginx and DEPLOY changes: docs only.

**Verification:** see the commit; server and `apps/system` suites run once each.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: role defaults and account state on the IT site (2026-11-03)

**Change:** Owner: any IT user sets each everyday role's default permissions
(«صلاحيات الأدوار»), and IT may disable, re-enable, approve and delete users.
`server/utils/permissions.js`: `roleDefaults(role)` (a stored set or the code's
`ROLE_DEFAULTS`), `setRoleDefaultsOverride`, `checkRoleDefaults` (no IT key, no
grant-only module, no unknown key), `ROLE_DEFAULT_KEYS`; `effectivePermissions`,
`canAssignRole`, `canGiveFirstRole` and `getPermissions` read `roleDefaults`.
`IT_SET` gains `users.delete`. New `server/Entities/It/RoleDefaults.model.js`
(one row per changed role) and `RoleDefaults.controller.js` (`load` at start in
`server.js`, `list`, `save`, `reset`; audit `permissions` /
`role_defaults_change|role_defaults_reset`). `It.route.js`: `GET|PUT|DELETE
/role-defaults[/:role]` (`permissions.manage`), `POST /users/:tz/room`
(`users.approve`, everyday `changeRoom`), `DELETE /users/:tz?from=` (`users.delete`,
everyday `deleteU`); another IT user stays out of reach (`canManageTarget`).
`apps/it`: `screens/RoleDefaults.jsx` (menu «صلاحيات الأدوار»), «حالة الحساب»
card on `UserPage.jsx`, `api.js`, `strings.js`.

**Test:** `server/test/role-defaults.test.js`, `it-api.test.js` (routes behind
the IT session, role defaults reach the role's users, disable/enable/delete,
403 on another IT user), `it-rules.test.js`; `apps/it`
`RoleDefaults.test.js`, `UserPage.test.js`.

**Verification:** server 1246/1246, `apps/it` 44/44, `apps/it` build; local
browser check with made-up data.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: IT-site passkeys and the password eye (2026-11-03)

**Change:** Owner: a passkey replaces both the password and the email code on
the IT site. `server/Entities/It/It.passkey.js` (pattern of
`SportPortal.passkey.js`): rpID `IT_HOST`, discoverable, user verification
required, challenge in a signed single-use cookie `tamheed_it_pk` (path
`/api/it`, `IT_SESSION_SECRET`), stored as `itPasskeys` on the user (max 10).
Saving needs the IT session; signing in ends in `It.auth.completeSignIn`, now
shared with the email code (re-read user, `mayUseIt`, not locked, and for a
passkey no expired system password; system-account alert and audit row).
Blocking or removing an IT user clears `itPasskeys`; `sanitize` drops them.
`It.route.js`: `POST /passkey/login-options|login` (open, `loginLimit`),
`POST /passkey/register-options|register` (`requireIt`). `apps/it`:
`@simplewebauthn/browser` 13.3.0, `passkey.js`, «الدخول بالبصمة أو بالوجه» on
the sign-in, `ui/PasskeyOffer.jsx` after sign-in, the show/hide-password eye
(`ui/EyeIcon.jsx`, copied from `apps/system`).

**Test:** `server/test/it-passkey.test.js`, `it-api.test.js` (passkeys cleared
on block/remove, never in a response; route guards), `it-auth.test.js`,
`route-guards.test.js`; `apps/it` `passkey.test.js`, `PasskeyOffer.test.js`,
`SignIn.test.js`.

**Verification:** server 1252/1252, `apps/it` 56/56, `apps/it` build; sign-in
screen checked locally. A real passkey on `it.` is not verified yet.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: any IT user creates a brand-new IT user (2026-11-03)

**Change:** Owner: any IT user (not only the system account) may create a
user who does not exist yet and is IT from the start. Making an *existing*
user IT, blocking and removing IT users stay with the system account.
`User.controller.js` `createItUser` (`POST /api/it/members`,
`users.create`, now in `IT_SET`): valid, unused ID number in every room
(`newTzProblem`, `roomHoldingTz`), first and last name, a real email
(`hasRealEmail`), an optional everyday role; active room, `isIT`, `itSince`;
a `generateTempPassword()` value sent only to the user's email
(`sendEmail.sendAccountEmail`, not awaited) and never returned; audit `users` /
`create`. Once made, only the system account manages him (`canManageTarget`).
`apps/it`: «مستخدم IT جديد» on «المستخدمون», `ui/NewItUserDialog.jsx`.
Not done: a forced password change at first sign-in for non-system users
(none exists today); the user changes it through «نسيت كلمة المرور».

**Test:** `it-api.test.js` (create, temp password only in the email, the
creator then gets 403 on him; taken/invalid tz, fake email, missing name,
unknown role refused), `it-rules.test.js`; `apps/it` `Users.test.js`.

**Verification:** server 1254/1254, `apps/it` 58/58, build; form checked
locally with made-up data.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: first password, clear sign-in answers, no periodic change (2026-11-03)

**Change:** Owner, four requests.
1. A new IT user's first password is 8 digits (`generateTempDigits`) and the
   user is flagged `mustChangePassword`. `mustChangePassword()` now honours
   the flag for any user. On the IT site `requireIt` lets a flagged user reach
   only `/me` and `POST /change-password` (403 `PASSWORD_CHANGE_REQUIRED`
   elsewhere); `It.auth.changePassword` (flagged users only, new password
   rules of `newPasswordProblem`) stores it encrypted, clears the flag, audits
   `users` / `password_change` and issues a new IT cookie. The everyday
   change also clears the flag. `apps/it`: `screens/ChangePassword.jsx`.
2. `POST /api/it/login` goes to the code step only after a right ID number
   and password: 401 `BAD_LOGIN` for an unknown number, a wrong password or
   missing input (one answer for all); with the right pair 423 `LOCKED`,
   403 `NO_IT_ACCESS` / `NO_EMAIL` / `SYSTEM_PASSWORD_CHANGE`, 429
   `TOO_MANY_CODES`. This reveals a right pair whose user has no IT access,
   at the owner's request. The everyday → IT pass keeps its generic answer.
3. Sport `request-code`: 404 `NOT_IN_SPORT` for a number with no player in
   the department (unknown included), 404 `NO_EMAIL` for a player without an
   email; a duplicated number keeps the generic answer.
4. No periodic password change: `PASSWORD_MAX_AGE_DAYS` removed; the system
   account changes only its first or recovered password (date missing or 0).

**Test:** `system-password.test.js`, `it-auth.test.js`, `it-api.test.js`,
`sport-portal-auth.test.js`, `route-guards.test.js`; `apps/it`
`ChangePassword.test.js`, `SignIn.test.js`, `App.test.js`.

**Verification:** server 1258/1258, `apps/it` 62/62, `apps/sport` 92/92,
`apps/it` build; change screen checked locally.

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: administrators edit an IT user's personal details (2026-11-03)

**Change:** Owner: an administrator updates the personal details of a user
below him even when that user is also IT; never his password, and he can't
suspend or delete him; the everyday app shows him as IT.
`utils/permissionRules.js` `canEditDetails(actor, target)`:
`canManageTarget`, or an everyday actor ranked above an IT target (never
oneself, the system target, or the IT actor on another IT user).
`User.controller.js`: `putU` and the photo upload/delete
(`canManageUserMedia`) use it; for an IT target only `DETAIL_FIELDS`
(`SELF_EDIT_FIELDS` without `email`) are kept. Ruling: the email stays out,
since an IT user's sign-in codes go to it. Account actions (role, room,
delete, sign-out everywhere, storage) still need `canManageTarget`.
`apps/system`: `canEditDetailsClient` (`utils/roles.js`), the user page's
«تعديل» for such a user without sign-out/suspend/delete, an «قسم IT» fact,
the form's note and save button (no role, password or email).

**Test:** `server/test/user-it-protection.test.js`, `it-rules.test.js`;
`apps/system` `UserView.test.js`, `EditUser.account.test.js`,
`roles.test.js`.

**Verification:** server 1261/1261, `apps/system`
943/943, build. Not checked in a browser (needs the database).

**Codex review:** pending (until 2026-11-06). **Status:** committed.

### Follow-up: the app shell is never served stale; the change screen opens on any refusal (2026-11-03)

**Change:** The owner saw a new IT user reach the full IT site after the first
sign-in (the server refused every call with `PASSWORD_CHANGE_REQUIRED`, but
the page had no change screen): the browser ran an older build. The shell
had no Cache-Control, so Chrome could reuse an old `index.html`.
`utils/sportHost.js` `cacheHeaders`: `Cache-Control: no-cache` for
`index.html`, `service-worker.js` and `manifest.json` in `hostStatic` (sport,
IT) and on the everyday static and shell fallback (`server.js`); hashed
`static/` files keep the default. `apps/it` `api.js`
`setPasswordChangeHandler`: any 403 `PASSWORD_CHANGE_REQUIRED` switches the
app to «تغيير كلمة المرور» (`App.jsx`), whatever `/me` said.

**Test:** `server/test/sport-host.test.js` (no-cache on the shell, the SPA
fallback and the worker; not on a hashed asset), `apps/it` `App.test.js`.

**Verification:** server 1262/1262, `apps/it` 63/63, build.

**Codex review:** pending (until 2026-11-06). **Status:** committed.
