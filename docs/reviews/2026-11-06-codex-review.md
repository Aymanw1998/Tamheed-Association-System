# Codex review of Claude Code changes — 2026-11-06

Requested by the owner. Reviewed at HEAD `f33f475` plus the existing uncommitted
weekly-task, educational-lesson and student-guide changes. Claude Code is the
implementer; Codex is the independent reviewer. Application files were not
edited. This is a focused review of recent work, not certification of every
historical change or of production.

Read `AI_COLLABORATION.md`, the review-log history relevant to the recent changes,
the current diff and related callers/tests. Focus: automatic updates, parent
consent/registration, educational rosters and weekly tasks; also inspected recent
authentication, grade promotion and report-filter code. Earlier deliberate owner
decisions recorded in the log are not treated as bugs.

## Findings

### R1 — P1: An automatic update can discard input on a newly visited page

Locations: `apps/system/src/pwa/autoUpdate.js:23-38,49-53`; identical logic in
`apps/sport/src/pwa/autoUpdate.js`.

`onEdit` marks the page dirty without updating the remembered pathname.
`safeNow()` subsequently calls `notePath()`, which resets `edited` when it first
notices navigation. Input already entered on the destination page is forgotten.
After the three-second settling delay, the update is allowed to reload the page.
This also happens when an update arrives after someone has already navigated and
filled a form: pathname tracking is only polled when applying an update.

Reproduced against both real modules: navigate, dispatch an input event, poll,
advance 3,001 ms; `safeNow()` incorrectly returns true while the field remains.
The existing "typing on the new page" test only checks the first false result
during the settling interval, so it misses the later reload.

Resolution requested: synchronize route state before marking a new edit, or track
dirty state by route; test beyond the settling interval and with a late-arriving
worker. Recheck safety if application takes time after the initial decision.

### R2 — P1: Concurrent student enrolments overwrite each other's roster changes

Location: `server/services/educationalLesson.js:13,28-36` (uncommitted work).

The service reads a lesson, constructs a replacement `list_students`, then writes
it using only `_id`. Two students accepted or reassigned to the same guide at the
same time can both read the old list. Both saves succeed, but the second replaces
the first student's addition. The same pattern can overwrite concurrent removals
or a manual lesson save; the controller's version checks do not protect this
separate service write.

Reproduced with snapshot-returning in-memory models, matching the real read
semantics: two concurrent `moveStudent` calls complete successfully, but only one
student remains. Existing tests return shared object references and exercise
sequential calls, so they do not cover this interleaving.

Resolution requested: atomic array additions/removals, or conditional versioned
writes with retries. Keep lesson versioning and live notifications consistent.

### R3 — P2: A partial consent save leaves an unsigned student that retry cannot repair

Location: `server/Entities/InviteToken/InviteToken.controller.js:166-179`.

`signConsent` inserts a consent, then separately updates `Students.consentAt`.
If the second write fails, the endpoint returns 500 with the consent still saved.
A retry stops at `ALREADY_SIGNED` before repairing the student. The student list
uses `consentAt` for its pink rows, count and unsigned filter, so it continues to
report an unsigned student even though the consent view displays a signature.

Reproduced by injecting one transient student-write failure: first call 500,
retry 409, one persisted consent, no `consentAt`.

Resolution requested: atomic persistence or an idempotent recovery path that
reconciles the student's marker with the existing consent. Check a null update
result as well as thrown failures.

### R4 — P2: The staff attribution promised in the log is never stored

Locations: `server/Entities/InviteToken/InviteToken.controller.js:124,177`;
actual actor construction at `server/middleware/permissionMiddleware.js:59-69`.

The controller reads `req.actor.firstname` / `lastname`. Real actors have `name`
and `user.firstname` / `user.lastname`; there are no top-level name fields. Thus
`recordedBy` for a later signature and `createdByName` for published rules are
empty. This contradicts the review log's statement that the staff member's name
is kept. The existing consent test passes an unrealistic top-level-name actor.

Reproduced the consent endpoint with the actual middleware actor shape: status
200, but `recordedBy === ""`.

Resolution requested: use the established actor-label helper, preserving hidden
IT identity rules, and test with the real actor shape.

### R5 — P2: Weekly-task integration leaves two regression checks failing

Locations: `server/Entities/WeeklyTask/WeeklyTask.route.js:23-29`,
`server/test/route-guards.test.js:126,151`, and
`apps/system/src/Components/Header/Header.test.js:125` (uncommitted work).

The route checker does not recognize the `manage` alias for
`requirePermission("tasks.manage")`, so the server suite fails on `GET /board`.
Inspection confirms the actual middleware is present: this failure is not
evidence of an unguarded endpoint. Separately, the Header test expects only
students/lessons while the navigation now also includes weekly tasks. These
failures prevent a clean `npm run verify` result.

Resolution requested: align the route checker/route convention and the menu
expectations with the intended behavior; retain actual authorization coverage.

## Verification and limits

- `node docs/reviews/2026-11-06-repros.cjs` confirms R1 in both apps and R2–R4
  without a database, network or environment file. Its assertions document
  observed bugs; it is not a regression suite asserting the desired behavior.
- System: 1,045 tests passed, 1 failed (Header), 117 suites.
- IT: 78 tests passed. Sport: 102 tests passed.
- All three production builds passed. All 313 server JavaScript files passed
  `node --check`; `git diff --check` passed (line-ending warnings only).
- The initial server run passed 1,419 of 1,439 tests: one route-check failure
  and 19 Bash-environment failures. Default Windows `bash.exe` selected WSL;
  outside the sandbox it still mishandled Windows paths. Running the deployment
  and open-items suites with Git Bash passed all 29 tests. Final full verification
  is recorded in `AI_REVIEW_LOG.md`.
- No production service, real database, email, real device or deployment was
  exercised. No seed, migration, administrator-creation or data-clearing command
  was run. Deployment tests used their existing disposable stand-in commands.

Implementation fixes and Claude's response are pending. This document is Codex's
review response to Claude's recorded pending handoffs; no new Claude response or
agreement is claimed, and no recursive peer-review invocation was started.

## Follow-up: owner's recovered Claude conversation

The owner supplied the approved decisions after this review. They confirm that
the current working tree is unfinished Claude implementation, not an unexplained
change. Review remains read-only for application files. No additional commit or
push was requested or performed by Codex.

| Approved item | Observed implementation |
| --- | --- |
| 9: report filters; commit without push | Implemented and committed as `f33f475`; current branch `weekly-tasks` points to it. Local `master` and cached `origin/master` remain at `fe3eebd`. No remote network check was made. |
| 10: promote grades each July 1 from 2027 | Present in committed code; focused grade tests pass. |
| 11A: attendance tab inside lessons | `LessonsHub` wraps both lesson list and attendance routes. Separate attendance menu item removed. The old `/calendar` URL still renders the attendance tab directly, rather than issuing a redirect; old links remain usable. |
| 12: responsible guide may be management; require one for new accepted students; retain existing unassigned students | Present in the form/controller and approval picker. Automatic self-assignment follows permissions; the picker requires both `students.viewAll` and `users.view`. No bulk change of existing students was added. |
| 12: regular/educational lesson; one educational lesson per guide; automatic student movement | Present on the normal save path. R2 remains. The uniqueness check is read-before-write, not an atomic uniqueness guarantee for simultaneous creation. |
| 13–16: guide plus students is a group; editing and assignment by click/drag | Implemented in `ManageWeeklyTasks`; the separate display page supports own completion and management approval, including management members with their own group. |
| Weekly reset; persistent assignments; own completion counts; praise only for finishers | Implemented with a Sunday-midnight Israel-time week boundary and a 00:05 Sunday scheduled close. An unfinished group does not get the congratulatory dialog. R6 below qualifies delivery at the next login. |
| Dashboard and bell | Card and targeted alert hooks exist. Management does not receive a broadcast about other groups; a manager who owns a group can receive that group's own notification. |
| Tasks on the display page | They exist on `/weekly-tasks`, not the edit page. `LessonView.jsx:140-177` has only details and students tabs, with no weekly-task integration. If "display page" means the lesson record, that part is still missing; the recovered wording alone does not justify silently choosing a different screen. |

### R6 — P2: A congratulation can disappear before the next login

Location: `server/services/weeklyTasks.js:89-90,173-175`.

`mine()` reads only the immediately preceding week's summary, not all earned,
unseen summaries. A guide completes all tasks in the week starting November 8;
the scheduled close records an unseen successful summary on November 15. If the
guide next visits on November 22, the endpoint looks only at November 15's week,
so the earlier earned message is never shown, although `seenAt` remains null.
This does not meet "once, at the next login" for someone absent more than a week.

Confirmed in the isolated reproduction script, using the real service and a
controllable clock. Fix by selecting an outstanding earned summary and marking
that specific summary seen, with an explicit rule if several are pending.

Follow-up verification: 26/26 focused server tests (weekly tasks, educational
lessons, grades) and 12/12 client tests (weekly-task display, report filters)
passed. The new delayed-visit reproduction confirms R6. These focused passes do
not supersede the two full-suite failures already recorded. No full rerun was
needed because only review documentation and reproduction code changed.

Subsequent implementation update: the owner then requested weekly-task changes.
Codex implemented them and resolved R5 (both integration checks) and R6
(unseen praise is selected across weeks and acknowledged by exact week).
The reproduction script now asserts the corrected R6 result. R1–R4 are outside
that new task and remain open. See the later implementation entry in the log.
