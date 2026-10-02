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
