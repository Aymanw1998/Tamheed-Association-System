# Independent Codex review request: users (staff) as sport players, stage 2 (2026-11-09)

Actual Claude Code is the sole implementer. You are the independent Codex
reviewer. Review only the uncommitted working-tree changes (`git diff` plus the
untracked new files) in this repository. Do not edit files, run
seed/migration/admin/data-clearing commands, touch `.env`, or start another
reviewer. The repository is public. This request contains no credentials or
real records.

Stage 1 (everyday lessons) is committed as `1eb80a2`; its own request is
`docs/reviews/2026-11-09-users-in-lessons-codex-request.md`. The working tree
also holds the attendance-index fix that answers stage 1's open point (below).

## Owner request

A staff user can be a football player: added by whoever adds players today;
any user, no teacher/helper rule in sport; a player profile and card but with
no statistics; attendance like any player; he signs in to the Sport app.
Spec: `docs/superpowers/specs/2026-11-09-users-as-lesson-participants-design.md`
(stage 2). Plan: `docs/superpowers/plans/2026-11-09-users-as-lesson-participants-stage2-sport.md`.

## What was built

- **Storage (writer's call):** a user player is kept like a student player.
  The user's `_id` goes in the existing `studentId` fields (player row, lesson
  roster, attendance, login code, push, lock keys), and his `SportPlayers` row
  has `kind: "user"`. No index or existing row changes.
- **`server/utils/sportPeople.js` (new):** reads and writes "a person": the
  student, else an active, non-hidden (`isHiddenUser`) user, tagged
  `kind: "user"`, with the user model's placeholder email `test@test.com`
  blanked. `updateExisting` writes the student when one matches, otherwise
  the visible user by `_id`.
- **Sport controller:**
  - Players, rosters and the sheet read people instead of students; each row
    carries `kind`.
  - `savePlayer`, `addLessonPlayer` and `playerPhoto` use `findPerson`.
  - `bumpStat` on a user player answers 409 `NO_STATS_FOR_STAFF`.
  - `buildCard` gives a user player `statDefs: []` and `values: {}`.
  - New `GET /api/sports/users/search` (`sports.coach`, `sports.manage`)
    returns `{ _id, firstname, lastname, tz, age, kind, isPlayer }`.
- **Sport app sign-in:**
  - `SportPortal.auth` and `SportPortal.passkey` default to the adapter.
  - When one ID number names several people, only those with a football
    player row count. If exactly one is left, he signs in; otherwise sign-in
    is refused as before.
  - The user API's `sanitize` drops `sportCardHash` and `sportPasskeys`.
- **System sport pages:**
  - The picker has two tabs, «الطلاب» / «الموظفون».
  - A «موظف» badge shows on players, rosters and the sheet.
  - Stat cells read «—», and a staff player's card modal gets no stats.
- **Attendance index (stage 1 open point):** at startup,
  `ensureAttendanceIndexes` drops a unique `{ lesson, student, dateKey }` index
  if one exists, and nothing else. On a new database, where the collection
  does not exist yet, it still creates the regular index.

## Verification done

- Server: 1,629 tests pass.
- System: 1,192 tests (139 suites) pass, and the CI build passes.
- `git diff --check` passes.
- Local browser check, with a mock API and synthetic data only: the staff
  badge, «—» stats, and the picker's staff tab with «لاعب بالفعل».
- The Sport app and IT are unchanged.

## What to look for

- Readers that look up `StudentModelDef` by a sport `studentId` and now meet a
  user id: alerts (`sport_lesson_no_attendance`), push, the assistant, the
  student pages.
- Whether `sportPeople.get({ tz })` and its duplicate narrowing leak anything,
  or lock a student out.
- Sport fields written on a user record (`sportCardHash`, `sportPasskeys`,
  `sportSignedOutAt`, `sportCardIssuedAt/By`) reaching any user response, IT
  included.
- Whether the index drop is safe on Atlas, and whether matching on `unique`
  plus the exact key is right.
- RTL, accessibility (the tablist) and dark-theme tokens in the new UI.

State explicitly if you have no findings. A request is not approval.
