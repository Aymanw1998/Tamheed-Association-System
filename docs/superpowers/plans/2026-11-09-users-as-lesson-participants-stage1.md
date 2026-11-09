# Users as Lesson Participants — Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a manager register existing users (staff) on an everyday lesson
next to its students, record their attendance, and show each user the
programs he is registered to.

**Architecture:** A new `list_users` array on the lesson, managed through new
endpoints guarded by a new permission `lessons.staffRoster`. One server
helper (`utils/lessonParticipants.js`) owns the rules (who is addable, the
teacher/helper clash). Attendance rows gain an optional `user` field beside
`student`. The client gets a participants block on the lesson page, staff rows
on the attendance sheet, and a bottom section on the Profile page.

**Tech Stack:** Node/Express + generic Mongo models (`Entities/api.js`),
`node:test` on the server; React (CRA 5) + jest/jsdom in `apps/system`.

**Spec:** `docs/superpowers/specs/2026-11-09-users-as-lesson-participants-design.md`

## Global Constraints

- Permission key `lessons.staffRoster`, label `إضافة موظفين كمشاركين`, in the
  `lessons` section of `shared/permissions.json`; synced by
  `node scripts/syncShared.js` (CI runs `--check`).
- Rule: a user is never a participant of a lesson where he is `teacher` or
  `helper`; refused in both directions with HTTP 409, code
  `STAFF_IS_PARTICIPANT`.
- Addable user: in the active `Users` collection, `!isHiddenUser(user)`, a
  24-hex `_id`. Inactive users stay stored but are skipped on every read.
- Without `lessons.staffRoster`, `list_users` in any request body is ignored
  and the stored list is kept.
- Scoped actors (no `lessons.viewAll`) manage users only on lessons where
  `mayOpenLesson` is true.
- Every roster write uses `sameVersion`/`nextStamp`/`editorStamp`, is audited
  with `recordLesson`, and calls `notifyChange("lesson", id)`.
- Existing `list_students`, attendance rows and their readers keep working
  unchanged; no migration.
- Public repo: synthetic names and ids only in tests and docs.
- Commits: propose messages to the owner; do not commit without his word.

## Review Focus

1. A participant who later becomes the lesson's teacher or helper through the
   edit form must be refused, not silently kept twice. (Task 3 test.)
2. Attendance rows for users must never feed student alerts (absence streak):
   `String(undefined)` is truthy. (Task 5 test.)
3. A user deactivated after being added must vanish from the lesson page, the
   sheet and his own section, while his past rows stay. (Tasks 3, 5, 6 tests.)
4. A user who is only a participant (not teacher/helper, no `viewAll`) must
   not open the lesson, its roster or its sheet through being a participant.
   (Task 6 test.)
5. A body with `list_users` from an actor without `lessons.staffRoster` on
   create or edit must not change the stored list. (Task 3 test.)

---

### Task 1: The permission

**Files:**
- Modify: `shared/permissions.json` (tree `lessons` after `roster`; labels)
- Modify: `docs/FEATURE_PERMISSIONS.md` (Programs row), `docs/PERMISSIONS_CATALOG.md` if it lists leaves
- Generated: `apps/{system,it}/src/generated/permissions.json` via `node scripts/syncShared.js`
- Test: `server/test/permissions-catalog.test.js` (existing catalog test; add one assertion) or the nearest existing catalog test

**Produces:** the key `lessons.staffRoster` (admins get it through the
`"lessons"` module default; guides and helpers do not).

- [ ] Step 1: Add the assertion `ALL_KEYS includes "lessons.staffRoster"` and
  `roleDefaults("مرشد")` does not include it. Run `node --test test/` for that
  file; expect FAIL.
- [ ] Step 2: Add the leaf `"staffRoster"` and label
  `"staffRoster": "إضافة موظفين كمشاركين"`; run `node scripts/syncShared.js`.
- [ ] Step 3: Run the test file, then `node scripts/syncShared.js --check`;
  expect PASS / no diff.

### Task 2: Participant rules helper

**Files:**
- Create: `server/utils/lessonParticipants.js`
- Test: `server/test/lesson-participants.test.js`

**Produces:**
- `staffIds(lesson) -> Set<string>` (teacher, helper; nulls dropped)
- `staffClash(lesson) -> string[]` ids in both `list_users` and `staffIds`
- `isParticipant(actor, lesson) -> boolean`
- `async addableUsers(userModel, ids, lesson) -> { ids: string[], refused: { id, reason }[] }`
  reasons: `"STAFF"` (teacher/helper), `"NOT_FOUND"` (not active, hidden, bad id).
  Dedupes, keeps request order, skips ids already on `lesson.list_users`.
- `async activeUsers(userModel, ids) -> { _id, name }[]` (active, not hidden,
  name = first + last, input order)
- `CLASH = { ok: false, code: "STAFF_IS_PARTICIPANT", message: "لا يمكن أن يكون المرشد أو المساعد مشاركًا في نفس البرنامج" }`

- [ ] Step 1: Tests with a `memoryModel` user fake: teacher refused as
  `STAFF`; hidden system user and unknown id refused as `NOT_FOUND`; duplicate
  and already-listed ids dropped; `staffClash` finds a helper listed as user;
  `activeUsers` skips an id missing from the active collection.
- [ ] Step 2: Run `node --test test/lesson-participants.test.js`; expect FAIL.
- [ ] Step 3: Implement (use `isHiddenUser` from `utils/permissions`, the
  same `OBJECT_ID` regex as the lesson controller).
- [ ] Step 4: Run; expect PASS.

### Task 3: Lesson create, edit and read

**Files:**
- Modify: `server/Entities/Lesson/Lesson.model.js` (field
  `list_users: { type: "array", required: false, default: [] }`)
- Modify: `server/Entities/Lesson/Lesson.controller.js` (`buildLesson`,
  `postOne`, `putOne`, `getOne`)
- Test: `server/test/lesson-users.test.js` (same `vm` loader pattern as
  `test/lesson-roster-remove.test.js`)

**Consumes:** Task 2 helpers. `can(actor, "lessons.staffRoster")` from
`utils/permissions`.

- [ ] Step 1: Tests:
  - create with `list_users` by an admin stores the addable ids; the teacher's
    id in `list_users` → 409 `STAFF_IS_PARTICIPANT`, nothing stored;
  - create/edit with `list_users` by an actor without `lessons.staffRoster` →
    stored list unchanged (empty on create);
  - edit that sets `helper` to a current participant → 409
    `STAFF_IS_PARTICIPANT`, lesson unchanged;
  - edit without `list_users` in the body keeps the stored list;
  - `getOne` returns `participants: [{ _id, name }]` of active users only, and
    `num_users`; a deactivated user is absent.
- [ ] Step 2: Run; expect FAIL.
- [ ] Step 3: Implement. `buildLesson` carries `list_users` as given (array or
  `[]`); `postOne` replaces it with `addableUsers(...).ids` when the actor
  holds the key, else `[]`; if `refused` has a `STAFF` reason → 409 `CLASH`.
  `putOne` keeps `current.list_users` unless the actor holds the key and the
  body has an array (then: kept ids that are still listed + newly addable
  ones); after building `next`, `staffClash(next).length` → 409 `CLASH`.
  `getOne` adds `participants` via `activeUsers` and `num_users`.
- [ ] Step 4: Run the new file and `node --test test/lesson-*.test.js`;
  expect PASS.

### Task 4: Add/remove endpoints and the picker list

**Files:**
- Modify: `server/Entities/Lesson/Lesson.controller.js` (new `addUsers`,
  `removeUsers`, `addableUsersList`), `server/Entities/Lesson/Lesson.route.js`
- Modify: `server/test/route-guards.test.js` (`EXACT_GUARDS` for the three)
- Test: `server/test/lesson-users.test.js`

**Produces (routes, under `/lesson`):**
- `POST /addUsers/:id` body `{ list_users: string[] }` → `{ ok, updatedAt, refused }`
- `POST /removeUsers/:id` body `{ list_users: string[] }` → `{ ok, updatedAt }`
- `GET /:id/addable-users` → `{ ok, users: [{ _id, name, reason? }] }` every
  active non-hidden user; `reason: "STAFF"` for teacher/helper, `"ON_LESSON"`
  for current participants.
- All three: `requirePermission('lessons.staffRoster')`, `lockedLesson` on the
  two writes, 404 when `!mayOpenLesson`, 400 `BAD_LIST` when not an array.

- [ ] Step 1: Tests: add by admin writes and audits; add of the teacher →
  409 `CLASH` and nothing written; scoped actor on someone else's lesson → 404;
  remove drops only listed ids (string vs ObjectId); version race → 409;
  route-guards: the three keys map to `lessons.staffRoster`.
- [ ] Step 2: Run; expect FAIL.
- [ ] Step 3: Implement, mirroring `addToList`/`removeFromList`.
- [ ] Step 4: Run lesson tests and `node --test test/route-guards.test.js`;
  expect PASS.

### Task 5: Attendance for participants

**Files:**
- Modify: `server/Entities/Attendance/Attendance.model.js` (`student`
  becomes `required: false`; add `user: { type: "string", required: false }`)
- Modify: `server/Entities/Attendance/Attendance.controller.js` (`getSheet`,
  `bulkSave`, `runDailyAbsenceJob`)
- Modify: `server/services/alertJob.js` (skip rows with `user`)
- Test: `server/test/lesson-users-attendance.test.js`; extend the alert job
  test that covers `absence_streak`

**Produces:** sheet `items` keep the student shape and add, after the
students, `{ userId, studentName: <user name>, kind: "user", status, notes }`.
`bulkSave` accepts items with `userId` (written under `{ lesson, user, dateKey }`)
only for ids on `list_users` and active; never from a scoped actor's hidden
set (users are not scoped by students).

- [ ] Step 1: Tests: sheet lists students then active participants with
  `kind: "user"`; creates missing rows with `user`; bulk save writes a user row
  and ignores a `userId` not on the lesson; daily job creates auto absences for
  participants too; alert job ignores user rows (no `findStudent("undefined")`).
- [ ] Step 2: Run; expect FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run `node --test test/` (whole server suite); expect PASS.

### Task 6: "My programs" for the participant

**Files:**
- Modify: `server/Entities/Lesson/Lesson.controller.js` (`myParticipations`),
  `server/Entities/Lesson/Lesson.route.js` (`GET /participating`, declared
  before `/:id`, no permission: own data)
- Modify: `server/test/route-guards.test.js` (`ANY_ACTOR_ROUTES` entry)
- Test: `server/test/lesson-users.test.js`

**Produces:** `GET /lesson/participating` → `{ ok, lessons: [{ _id, name,
date, room, teacherName, helperName, attendance: [{ dateKey, status }] }] }`,
only lessons whose `list_users` holds `req.actor.id`; attendance = his own
rows, newest first, at most 10 per lesson.

- [ ] Step 1: Tests: returns only own lessons and own rows; no `list_students`,
  no `list_users` in the answer; being a participant does not make `getOne`,
  `getSheet` or `addToList` succeed (404).
- [ ] Step 2: Run; expect FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run; expect PASS.

### Task 7: Client — participants on the lesson page

**Files:**
- Modify: `apps/system/src/WebServer/services/lesson/functionsLesson.jsx`
  (`addUsers(id, ids)`, `removeUsers(id, ids)`, `getAddableUsers(id)`,
  `getMyParticipations()`)
- Create: `apps/system/src/Components/Lesson/LessonParticipants.jsx` (+ `.module.css`)
- Modify: `apps/system/src/Components/Lesson/LessonView.jsx` (third tab
  "الموظفون المشاركون", shown when `lesson.participants?.length` or
  `canStored("lessons.staffRoster")`)
- Test: `apps/system/src/Components/Lesson/LessonParticipants.test.js`

**Interfaces:** `LessonParticipants({ lessonId, participants, canEdit, apply })`
where `apply` is LessonView's existing queued, locked writer.

- [ ] Step 1: Tests: lists names; without `canEdit` no add/remove buttons;
  picker shows `STAFF` users disabled with "المرشد/المساعد في هذا البرنامج";
  adding calls `addUsers` through `apply`; a 409 shows the server message.
- [ ] Step 2: Run `CI=true npx react-scripts test --watchAll=false
  src/Components/Lesson`; expect FAIL.
- [ ] Step 3: Implement with the shared `Button`, `EmptyState`, `ask` for
  removal confirm, tokens only.
- [ ] Step 4: Run; expect PASS.

### Task 8: Client — staff rows on the attendance sheet

**Files:**
- Modify: `apps/system/src/Components/Attendance/AttendancePage.jsx`
  (+ `.module.css`)
- Test: `apps/system/src/Components/Attendance/AttendancePage.test.js`
  (create or extend)

- [ ] Step 1: Tests: a `kind: "user"` item renders with a "موظف" badge after
  the students; changing its status and saving sends `{ userId, status, notes }`;
  the counts line shows students and staff separately.
- [ ] Step 2: Run; expect FAIL.
- [ ] Step 3: Implement with a row key `it.kind === "user" ? "u:" + it.userId : it.studentId`
  used by `updateItem`, the React keys and the save mapping.
- [ ] Step 4: Run; expect PASS.

### Task 9: Client — "البرامج المسجّل فيها" on the Profile page

**Files:**
- Create: `apps/system/src/Components/Profile/MyParticipations.jsx` (+ `.module.css`)
- Modify: `apps/system/src/Components/Profile/ProfilePage.jsx` (render under
  the tabs)
- Test: `apps/system/src/Components/Profile/MyParticipations.test.js`

- [ ] Step 1: Tests: renders nothing when the list is empty; shows name,
  day/time (`lessonWhen`), room (`roomLabel`), guide names and the last
  statuses; no links to the lesson page.
- [ ] Step 2: Run; expect FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run; expect PASS.

### Task 10: Full verification, docs and review

- [ ] Run server `npm test`, System/IT/Sport tests and `CI=true npm run build`
  in each app, `node scripts/syncShared.js --check`, `git diff --check`.
- [ ] Check `services/assistant/tools/*` return no `list_users` ids.
- [ ] Mark the spec "Stage 1 built"; add the review-log entry with files and
  verification; write `docs/reviews/2026-11-09-users-in-lessons-codex-request.md`
  and send it to Codex when its limit resets (Nov 11, 18:18), or record it as
  PENDING.
- [ ] Propose the commit message to the owner.
