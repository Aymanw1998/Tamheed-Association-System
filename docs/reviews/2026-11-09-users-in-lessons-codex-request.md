# Independent Codex review request: users (staff) as lesson participants, stage 1 (2026-11-09)

Actual Claude Code is the sole implementer. You are the independent Codex
reviewer. Review only the uncommitted working-tree changes (`git diff` plus the
untracked new files) in this repository. Do not edit files, run
seed/migration/admin/data-clearing commands, touch `.env`, or start another
reviewer. The repository is public. This request contains no credentials or
real records.

The working tree also holds the small quick-search close-button fix (see the
2026-11-09 quick-search entry in `docs/AI_REVIEW_LOG.md`); review it too.

## Owner request

Instead of opening a duplicate student record for a staff member who takes
part in a program, register the existing user on the lesson directly. Spec:
`docs/superpowers/specs/2026-11-09-users-as-lesson-participants-design.md`.
Plan: `docs/superpowers/plans/2026-11-09-users-as-lesson-participants-stage1.md`.

## What was built (stage 1, everyday lessons)

- **Permission:** `lessons.staffRoster` («إضافة موظفين كمشاركين») in
  `shared/permissions.json`. It is synced to System and IT. An admin gets it
  through the `lessons` module default; guides and helpers do not.
- **Rules:** `server/utils/lessonParticipants.js`.
  - A lesson keeps `list_users`, a list of user `_id`s.
  - Only active, non-hidden users can be added.
  - The lesson's teacher or helper is refused with 409
    `STAFF_IS_PARTICIPANT`, in both directions: adding the staff member, and
    an edit that makes a participant the staff member.
- **Lesson controller:**
  - Create and edit accept `list_users` only from a `lessons.staffRoster`
    holder. Otherwise the stored list is kept.
  - New endpoints `POST /addUsers/:id` and `POST /removeUsers/:id` (locked,
    versioned, audited) and `GET /:id/addable-users`, all guarded by
    `lessons.staffRoster`. They answer 404 when `!mayOpenLesson`.
  - `getOne` returns `participants [{_id, name}]`.
  - `GET /participating` returns any signed-in user's own lessons and his own
    last 10 attendance rows. It never includes the roster.
- **Attendance:**
  - Rows have either `student` or `user`.
  - The sheet lists the students, then the participants (`kind: "user"`).
  - `bulkSave` writes `userId` items only for active participants of that
    lesson.
  - The nightly job marks participants absent too.
  - `alertJob` ignores user rows in the absence-streak check.
- **Client (System):**
  - A "الموظفون المشاركون" tab on the lesson page, with a picker that greys
    out the lesson's staff and the current participants.
  - A "موظف" badge on the attendance sheet, and separate counts for students
    and staff (`utils/attendanceRows.js`).
  - A "البرامج المسجّل فيها" section at the bottom of the Profile page.

## Verification done

- Server: 1,605 tests pass.
- System: 1,190 tests (138 suites) pass, and the CI build passes.
- IT: 116 tests pass, and the build passes.
- `syncShared --check` and `git diff --check` pass.
- Local browser check, with a mock API and synthetic data only: the staff
  tab, the picker states, adding a user, and the Profile section.

## Known open point (owner decision, not changed)

The old Mongoose schema (commented at
`server/Entities/Attendance/Attendance.model.js:120`) had a unique index
`{lesson, student, dateKey}`. If that index still exists in the production
collection, a second user row for the same lesson and date (no `student`)
would collide. Please assess this and say what the safe migration is.

## What to look for

- Permission leaks:
  - Can a participant open the lesson, its roster or its sheet?
  - Can anyone without `lessons.staffRoster` change `list_users` through
    create, edit, add/remove or the assistant?
- Races and version handling on the new writes.
- Attendance rows without `student` reaching student-only readers (alerts,
  the assistant's `attendance_summary`, the student pages).
- Inactive users after removal.
- Arabic RTL, accessibility and dark-theme tokens in the new UI.

State explicitly if you have no findings. A request is not approval.
