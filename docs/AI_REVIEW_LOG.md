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

**Status:** Codex review complete; nothing committed or deployed.

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

**Status:** Codex review complete; nothing committed or deployed.
