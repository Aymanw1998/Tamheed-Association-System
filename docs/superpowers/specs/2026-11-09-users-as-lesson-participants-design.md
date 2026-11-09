# Users (staff) as lesson participants

Date: 2026-11-09. Status: approved by the owner; stage 1 built 2026-11-09 (uncommitted), stage 2 (sport) not started. Builder check
done by the writer (no subagent run); the owner answered its two questions
(see "Owner's answers").

## Why

Today a lesson's participants are students only (`Lesson.list_students`, and
`SportLesson.players` by `studentId`). When a staff member (a user) takes part
in a program, the association has to open a second, duplicate student record
for the same person. The owner wants an existing user to be registered to a
lesson directly, the same way a student is, without a second record.

Success: a manager adds a user to a lesson from the same place students are
added; the user is marked present or absent like a student; the user shows in
attendance summaries and exports; nobody has to create a student record for a
staff member again.

## Goals

The work is two stages, in this order (the writer's call; the owner did not
object):

**Stage 1: everyday lessons (System, with the permission in IT)**

- A lesson holds, beside its students, a list of **participating users**.
- Users are added and removed by the people who today build lessons and add
  students to them, **only if they also hold a new permission**:
  `lessons.staffRoster`, label `إضافة موظفين كمشاركين`, in the `lessons`
  section of `shared/permissions.json` (owner). Because the catalog is shared,
  the permission appears in IT's permission screen too and can be granted and
  revoked there (owner: "sync between systems").
- **Rule (owner):** a user can never be a participant in a lesson where he is
  the teacher or the helper. The server enforces both directions:
  - adding a user who is the lesson's teacher or helper is refused;
  - saving a lesson whose new teacher or helper is already a participant is
    refused (the manager removes him from the participants first).
- Attendance is recorded for participating users exactly as for students
  (حاضر / غائب / متأخر, notes), on the same attendance sheet.
- Users appear in attendance summaries and exports, marked as staff
  (`موظف`) so they are not counted as students by mistake.
- **The participant's own section (owner):** at the bottom of his own page
  (Profile), a section "البرامج المسجّل فيها" lists the programs he is
  registered to: name, day, time, room, teacher and helper names, and his own
  attendance in each. Nothing about the other participants.

**Stage 2: sport (System sport pages, the Sport app)**

- A user can be added to a sport lesson as a player by whoever adds players
  today (`sports.coach` / `sports.manage`).
- **No responsibility rule in sport (owner):** any user may be a player;
  sport lessons have no teacher or helper of their own.
- The user gets a player profile and the player card (`PlayerCardModal`, the
  card shown in the Sport app) **but empty: no statistics are shown or
  recorded for him** (owner).
- Sport attendance is recorded for him like any player.
- **He signs in to the Sport app (owner)** the same way a student player does
  (a login code / login card issued by `sports.manage`), and sees his empty
  card there.

## Non-goals

- No automatic merge of existing duplicates. Staff who already have a student
  record keep it; the owner can delete the duplicate by hand later.
- No self-registration: a user does not sign himself up to a lesson (owner:
  "whoever is responsible today").
- No time-conflict check for a participating user (a user teaching another
  lesson at the same hour) in this version.
- No change to the educational-program auto-enrolment of a guide's students
  (`services/educationalLesson.js`), which stays students only.
- The AI assistant is not extended to add users to lessons; it only must not
  leak them (see Constraints).

## Anti-goals (would count as a failure even if it works)

- A student-only screen, count or export silently mixing users into student
  numbers (for example "35 students" when 5 of them are staff).
- Anyone without `lessons.staffRoster` able to add or remove users through
  any path (lesson create, lesson edit, the add/remove list endpoints, copy
  month, the assistant).
- A participating user gaining edit rights on the lesson, or seeing the other
  participants' records, because he is now "on the lesson".
- Existing student rosters, attendance rows or sport players changed or lost
  by a migration.

## Constraints

- Server is the authority. Every rule above is enforced in
  `server/Entities/Lesson/Lesson.controller.js` (and the sport controller in
  stage 2); the client only hides buttons.
- The existing scope rules stay: a scoped actor (a teacher without
  `lessons.viewAll`) manages only lessons he teaches or helps on
  (`utils/lessonAccess.js`), so he may add users only to those, and only with
  `lessons.staffRoster`.
- Users that can be added: active users only; never the system account
  (`namesSystemAccount`), never an IT-only hidden account, never a blocked or
  archived user.
- When a user is deleted or archived, he leaves future rosters; his past
  attendance rows stay for history.
- `lessons.copyMonth` copies the participating users with the lesson.
- Lesson locks (`lockedLesson`, `lockedSheet`) apply to the user list exactly
  as to the student list.
- Every add, remove and refusal is audited like the student roster changes
  (`recordLesson`).
- The assistant tools that read rosters (`services/assistant/tools/*`,
  `actionRunner.js`) must apply the same visibility to users.
- Route guards: new endpoints are covered by `test/route-guards.test.js`
  (first `requirePermission` is the specific one).
- Repository is public: no real names or ID numbers in tests or docs.

## Decided by the writer (the owner may overrule)

- **Storage:** a new `list_users` array on the lesson (user `_id`s as
  strings), not a mixed list, so every existing reader of `list_students`
  keeps working unchanged.
- **Attendance rows:** an attendance row gets an optional `user` field; a row
  has either `student` or `user`. The `student` field stops being required at
  the model level, and the controller requires exactly one of the two.
  Existing rows are untouched.
- **Endpoints:** separate `POST /lessons/addUsers/:id` and
  `POST /lessons/removeUsers/:id`, guarded by `lessons.staffRoster`, so the
  student roster endpoints and their guards do not change. Create and edit
  accept `list_users` only from a holder of `lessons.staffRoster`; from anyone
  else the field is ignored and the stored list is kept.
- **The participant's view is read-only:** being a participant never grants
  `mayOpenLesson`, edit rights, the roster or other people's attendance; the
  Profile section reads from a dedicated "my participations" endpoint that
  returns only his own rows.
- **Lesson UI:** on the lesson page and the edit form, a second block
  "الموظفون المشاركون" under the students, with a user picker that lists only
  addable users (the teacher and helper are greyed out with the reason).
- **IT:** the new permission shows in IT through the shared catalog. IT's
  user page does not list lesson participation in this version.

## Left to the builder

- Exact Arabic error texts (follow `docs/arabic-style-guide.md`).
- How the attendance sheet orders users (after the students, with a staff
  marker, is the suggestion).
- Stage 2 storage: how a sport player record refers to a user (for example a
  `participant: { kind: "user", id }` beside `studentId`) without breaking the
  Sport app's student flows.

## Owner's answers (2026-11-09)

1. The participant gets a section at the bottom of his own page listing the
   programs he is registered to.
2. A user player can sign in to the Sport app.
