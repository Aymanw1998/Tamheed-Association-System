# Student to staff, student archive, and «المسؤول» on a program

Status: design, revised after the Codex design review
(`docs/reviews/2026-11-19-codex-student-to-staff-design-review.md`). Owner
decisions of 2026-11-13, 2026-11-14 and 2026-11-19. Nothing built yet.

## Why

A student who grows up becomes an assistant (مساعد) or guide (مرشد). Today a
student and a staff user are separate records with nothing between them, so the
manager types everything again and the student history is cut off. Also, some
programs have no guide: an assistant runs them alone, but the program form only
lets a guide or a manager be the person in charge.

## Owner decisions

1. **Make staff from a student.** A button on the student's page opens a new
   staff user with the student's details already filled in; the manager picks
   the role (مساعد or مرشد).
2. **Student archive.** The student record is never deleted. It leaves the
   active student list and moves to a «طلاب سابقون» tab with its history,
   linked to the new user both ways.
3. **He stays in his programs, as staff** (2026-11-19). In every program he is
   in as a student, he becomes a staff participant.
4. **«المسؤول» on a program.**
   - The form's «المرشد / الإدارة» becomes «المسؤول», on every place that shows
     a program (2026-11-19).
   - The field is a choice list you can also type in, to narrow it. Only names
     from the list can be saved.
   - A regular program: «المسؤول» may be ادارة, مرشد or **any** مساعد.
   - A درس تربوي: only ادارة or مرشد. Changing a program to تربوي while an
     assistant is in charge is refused (2026-11-19).
   - An assistant in charge gets, on that program, what a guide in charge gets.
5. **A student's «المرشد المسؤول»**: guides and managers only.
6. **Minors** who become users use the system with no extra limits.

Decisions after the Codex review (2026-11-19, owner took all recommendations):

7. **Attendance for an assistant in charge.** He may record attendance only on
   programs where he is «المسؤول». Other assistants are unchanged.
8. **Sport is not part of this.** A converted student keeps his Sport player
   record, card and history as they are; Sport is handled separately later.
9. **Demoting a guide** who is «المسؤول» of a درس تربوي is refused until those
   programs get another guide or manager.
10. **Assistants who are already a student's «المرشد المسؤول»** keep it; from
    now on only a guide or a manager can be chosen. IT gets a list of the
    existing cases.
11. **No undo of the archive.** An archived student stays archived.

## What the code does today (checked by Codex and by hand)

- `Lesson.teacher`/`helper` are user ids. The server checks neither's role,
  and does not refuse teacher == helper (`lessonParticipants` only compares them
  with `list_users`). The form lists مرشد/ادارة as teacher and مساعد as helper.
- Role-blind already: `lessonAccess.isOnLesson`, the attendance and report
  reminders in `alertJob`, `weeklyTasks`, the wall display name lookup.
- Not role-blind: saving attendance needs `attendance.record`
  (`Attendance.route.js:29`), which assistants do not have by default; the
  attendance page lists only lessons where the viewer is teacher
  (`AttendancePage.jsx:142`).
- A student's `main_teacher` accepts any active, visible user
  (`Student.controller.js:31`, `studentForm.js:18`), assistants included.
- `getSheet` builds every date from the program's **current** roster and
  creates missing rows (staff rows default to present).
- The public registration link answers an existing tz with the same generic
  success as a new one (privacy).
- `EditUser` drops `photo` on create; replacing a user photo deletes the old
  Drive file.

## Design

### A. «المسؤول» on a program

**Form (`EditLesson.jsx`).**
- Label «المسؤول», placeholder «اختر المسؤول». Groups الإدارة, المرشدون,
  المساعدون; المساعدون is hidden when `kind` is `educational`.
- **As built (2026-11-19):** a search box (`<input type="search">`,
  `aria-label`, `aria-controls` to the select) above the native
  `<select id="lesson-teacher">`. Typing narrows the select's options; the
  chosen person always stays listed. This keeps the browser's own keyboard and
  screen-reader behaviour and the guided tour (which sets the select's value),
  instead of a hand-made combobox. Only a listed person can be chosen; typed
  text is never saved. The type-specific error is linked by
  `aria-describedby` and shown with `role="alert"`.
- Typing filters by first name, last name, or the last 4 tz digits.
- The chosen «المسؤول» is removed from the «المساعد» list and the other way
  round.
- Switching `kind` to `educational` with an assistant chosen shows «البرنامج
  التربوي يحتاج مرشدًا أو أحد الإدارة مسؤولًا عنه» and blocks saving.

**Server (`Lesson.controller.js`, create and update).** On the merged record
(`next` = current + body, before any write):
- `teacher` must be an existing, active, not hidden user (fail closed on a
  lookup error: 503, nothing written). Role is read with the existing
  role helper (`role`/`roles` normalised).
- `kind === "educational"` needs a teacher whose role is مرشد or ادارة, else
  400 `EDUCATIONAL_NEEDS_GUIDE` with the message above. This covers a teacher
  change, a kind change, and both.
- `teacher !== helper`, else 400 `SAME_STAFF`.
- **As built (2026-11-19):** the teacher is looked up only when it is new or
  changed, or when the program is created or becomes تربوي. An old program
  whose teacher has since left, or an old تربوي with an assistant, can still be
  edited in other ways without first changing the teacher (owner took this
  recommendation after the Codex build review, finding 14).
- A regular program accepts any staff role as teacher.

**Demotion (`User.controller.js` `putRole`, and any other role change).**
Changing a user to مساعد while he is the teacher of a درس تربوي is refused 409
`IN_CHARGE_OF_EDUCATIONAL` with the program names. Nothing is saved.

**Attendance for an assistant in charge (decision 7).**
- One predicate, `mayRecordAttendance(actor, lesson)` (server, mirrored on the
  client): true when the actor has `attendance.record`, **or** is the program's
  `teacher` and `attendance.record` is not revoked after module expansion (a
  revoke of `attendance` or of `attendance.record` both count, with the same
  expansion as `permissions.js`).
- Used by `bulk-save`, by the attendance-sheet lock acquire **and** heartbeat
  (`Lock.route.js:45`, `:137`), and by `AttendancePage` to take the lock and
  enable editing (`AttendancePage.jsx:94`). Lock and version checks stay.
- `AttendancePage` lists the programs where the viewer is teacher (as today)
  for such an assistant too; editing is enabled only on those.
- `attendance.view` stays needed to open a sheet (assistants have it).

**Labels.** «المرشد» becomes «المسؤول» for a program in: `LessonView.jsx:176`,
`ViewAllLesson.jsx` (`:209`, `:380`, `:421`, the print columns `:623`, the
filter `:697`), `LessonParticipants.jsx:15`, `excelExport.js:77`, the required
check message in `EditLesson.jsx:195`, and the wall display if it prints a role
word. The student's «المرشد المسؤول» stays.

### B. A student's «المرشد المسؤول» (decision 10)

- Server: `isValidInstructor` accepts only مرشد or ادارة for a **new or changed**
  `main_teacher`. A save that keeps the current value is allowed even if that
  value is an assistant.
- Form: `responsibleGuideOptions` lists only guides and managers, plus the
  current value if it is someone else (shown as today's inactive entry).
- IT: a read-only list of students whose `main_teacher` is an assistant (name,
  assistant), so a manager can change them. No automatic change.

### C. Make staff from a student

**Permission and scope.** New key `students.makeStaff` («تحويل طالب إلى
الطاقم»), admin default (module key), not for guides or assistants. The route
needs `students.makeStaff` **and** `users.create`, and the student must be inside
the actor's student scope (the same check as other student changes,
`Student.controller.js:337`) on the first call. On a resume the scope check
also accepts an actor who is on any program in `plannedLessons` (the moves
take the student off those rosters, so the ordinary scope can no longer see
him); the permission keys are checked again as usual. The roster
moves are part of this action and do not need `lessons.roster` /
`lessons.staffRoster`. The button shows only with both keys.

**Stored conversion.** On the student, `staffConversion`:

    { phase: "preparing" | "prepared" | "account" | "rosters" | "done",
      userId,           // chosen in "prepared", never changes
      cutoverDateKey,   // Israel date of the day after "prepared", never changes
      plannedLessons: [ids], // every program with him in list_students, fixed
                             // in "prepared" (provenance, kept forever)
      movedLessons: [ids],   // progress only
      role, startedAt, startedBy, doneAt,
      claim: { by, until } }

The user gets `fromStudentId`. A unique sparse index on `staffConversion.userId`
and the unique tz index on users make a second account impossible.

**Claim.** Every call (first or resume) first takes the conversion claim with
one conditional update on the student: `claim = { by: requestId, until: now +
2 min }` only when there is no claim or it has expired. A call without the claim
answers 409 `CONVERSION_BUSY`. Every step below writes with the condition
`claim.by === requestId`, and the claim is renewed between steps and cleared at
the end (or expires after a crash).

**Steps** (`POST /api/student/:id/make-staff`; body: role, password, email,
phone; nothing else is taken from the body):
1. Permissions, scope, role مساعد or مرشد passing `canGiveFirstRole`.
2. Take the claim, read the student. `phase === "done"`: 409 `ALREADY_STAFF`.
   No conversion yet: the student must be active with status «عادي».
3. No conversion yet: write the required audit row (`audit.recordRequired`, 503
   `AUDIT_FAILED`, nothing written). Then the barrier: `phase: "preparing"`
   (claim held). From this write on every roster writer refuses to add him
   (below). Only **after** the barrier, scan the programs whose `list_students`
   holds him and write `phase: "prepared"` with a new `userId`,
   `cutoverDateKey`, and `plannedLessons` = that scan.

   **Roster writers** (adding students to a program, `list_tz`, educational
   enrolment and the move between guides): before the lesson write they refuse
   a student with any `staffConversion`; **after** the lesson write they read the
   student again and, if a conversion started meanwhile, remove that student id
   from the lesson again (versioned, idempotent) and answer 409
   `CONVERSION_IN_PROGRESS`. So an add that was in flight when the barrier was
   written either landed before the scan (and is planned) or is taken back.
   Step 5 ends with one more scan; a program still holding him is added to
   `plannedLessons` and moved like the others.
4. `prepared`: create the user **with that `_id`**, from the student's own tz,
   names, birth date, gender, city, street, in the active room, with
   `fromStudentId`. A user with that `_id` and this `fromStudentId` already
   there is the same account (a retry) and is kept. The tz belonging to other
   staff: 409 `TZ_EXISTS`, and the conversion is cleared (nothing else changed).
   Then `phase: "account"`.
5. `account`: for each program in `plannedLessons` (never a fresh scan), one
   versioned lesson update that removes the student id and adds the user id to
   `list_users` unless he is that program's teacher or helper (only the staff
   insertion is ever skipped). A program counts as moved when the student id is
   absent and the user is in `list_users` or is its teacher/helper; the update
   is skipped for a moved program. After each program, `movedLessons` is updated
   on the student (conditional on the claim). A deleted program is counted as
   moved. When every planned program is moved: `phase: "rosters"`.

   The lesson update cannot test the claim held on the student, so before each
   lesson write the caller renews the claim (conditional on `claim.by`) and
   stops if that fails. A writer whose claim expired between the renewal and the
   lesson write can only repeat the same idempotent change (remove the student,
   add the user), which is harmless; it can never add or remove anything else.
   Progress is read from the lessons themselves, so a lost `movedLessons` write
   only means the lesson is checked again on resume.
6. `rosters`: archive (`archivedAt`, `archivedBy`, `archiveReason: "أصبح من
   الطاقم"`), `phase: "done"`, `doneAt`; written only while the claim is held
   and `phase === "rosters"`.
7. Copy the photo (below). Answer `{ ok, userId }`.

Any failure answers 503 `CONVERSION_INCOMPLETE` and leaves the phase where it
is. The student page then shows «التحويل لم يكتمل» with «إكمال التحويل», which
calls the same route and continues from the stored phase; steps 4-6 are
idempotent. Until `done`, the student record refuses edits, delete, photo
change and roster adds (409 `CONVERSION_IN_PROGRESS`).

**Photo.** The server copies the student's photo to a new file in the user's
storage (never shares the same file), so replacing either photo later never
removes the other. A failed copy leaves the user without a photo and says so in
the answer; it does not stop the conversion.

**Client.** The button «تحويل إلى الطاقم» on `StudentView` opens a small form:
role (مساعد/مرشد), email, phone, first password, with the name and tz shown
read-only. The new user's page shows «كان طالبًا في الجمعية» with a link to the
archived student (for a viewer with `students.viewAll`).

### D. Attendance before and after the cutover

The cutover is `cutoverDateKey`: the day **after** the conversion started. The
whole conversion day stays a student day, so a mark made that morning is never
doubled or replaced, and nothing has to be merged.

Stored rows are never hidden or deleted: every student row he already has, in
any program (also programs he left before the conversion), stays in sheets
for its date, exports and the monthly email, exactly as today. The rule below
only decides which **missing** row a sheet, a save or the nightly writer may
create, and which row a sheet shows for him on a date:

- Before the cutover, in a program of `plannedLessons`: the **student** row
  (existing, or created as a student row). No staff row is created or accepted.
- Cutover or later, in a program of `plannedLessons`: the **staff** row only.
- A program not in `plannedLessons`: no new student row is created after
  `prepared` (he is archived or about to be); staff rows only from the cutover.
  Older student rows there stay as history.
- From `prepared` on, the rule reads `plannedLessons`, so a program not moved
  yet is still treated as his student program before the cutover.

**Rows dated on or after the cutover that already exist.** A sheet can be
opened for a future date, which creates student rows ahead of time. In the
`prepared` step, for each planned program, student rows of this student dated
on or after `cutoverDateKey`:
- never saved by a person (the rows a sheet creates on opening, which
  `sheetVersion` already tells apart): deleted;
- saved by a person: re-keyed to the staff row (same date, status and notes,
  `user` = the new user id), unless a staff row for that date already exists,
  in which case the student row is deleted and the staff row kept.
This is idempotent and runs again on resume. After it, no student row of his
exists on or after the cutover in a planned program.

So he never gets both a student row and a staff row on the same date in the
same program, and exports and the monthly counts stay single.

### E. Archived students

`archivedAt` set = archived. They stay in the `Students` collection (tz
uniqueness, recycle bin and history unchanged). Queries take an explicit mode:
`active` (default for lists, pickers, scope, jobs), `history` (names and rows
for past periods), `any` (tz uniqueness, duplicate checks).

Archived students are left out of, or refused by:
- the students list, roster pickers, exact-tz lookup and `list_tz` adds,
  addable-id checks (`Lesson.controller.js:31`), the assistant tools;
- responsible-guide scope (`studentScope.js:18`, `lessonAccess.js:44`): the
  `main_teacher` stays on the record for history but no longer gives access;
- edits, delete, photo change (`Student.route.js:43`): 409 `ARCHIVED`;
- educational auto-enrolment and the move between guides
  (`educationalLesson.js:42`, `:50`);
- nightly absence creation and absence-streak alerts
  (`Attendance.controller.js:428`, `alertJob.js:193`);
- the yearly grade promotion (`gradePromotionJob.js:26`);
- parent-signature links already sent (`InviteToken.controller.js:244`): the
  link answers as an expired link;
- public registration with his tz: the same generic success as today (no
  disclosure), nothing written.

Must still find archived students (`any` mode):
- Sport: `sportPeople` and Sport sign-in keep resolving an archived student's
  existing Sport identity, card and sessions (decision 8);
- the recycle-bin purge check before deleting signatures and photos
  (`Student.controller.js:747`), so a stale bin entry of a student who was
  restored and later converted never deletes the archived student's files;
- tz uniqueness and duplicate checks.

Kept for history: past attendance rows, exports and reports for past periods
(names resolved in `history` mode), the monthly email for a period he was a
student in. Scoped exports include his past rows for programs the viewer may
see.

The «طلاب سابقون» tab (`students.viewAll`) shows archived students; opening one
shows the read-only student page with «أصبح من الطاقم في <date>» and a link to
the user. No edit, no attendance, no adding to programs, no undo (decision 11).

### F. The smart assistant (AI)

`list_lessons` reports staff participants with the student count; the
attendance summary includes staff rows by user id; `propose_attendance` and the
action runner accept a user id for a staff participant and revalidate it against
`list_users`. If this is too large for the first build, the assistant says that
staff attendance is not available through it (no silent drop).

## Out of scope

- Sport (decision 8).
- Archiving students who finished or left without becoming staff.
- Data move: none, except the IT list of decision 10.

## Tests to write

- Lesson server: educational with an assistant teacher refused on create, on
  teacher change, on kind change; regular with an assistant accepted;
  teacher == helper refused; unknown/inactive teacher refused; lookup failure
  503 with nothing written.
- Demotion of a guide in charge of a تربوي refused with the names.
- Attendance: assistant in charge saves his program; assistant not in charge
  refused; `attendance.record` revoked refused; UI save button only there.
- `main_teacher`: new assistant refused, kept assistant allowed.
- Make-staff: permissions (both keys, revoke each); role limits; tz from the
  student only; audit failure writes nothing; failure after each of steps 4, 5,
  6 then resume finishes without a second user; simultaneous requests; photo
  copy independence; `ALREADY_STAFF`.
- Attendance by cutover: the conversion day stays student (a morning mark is
  kept); the cutover and later staff only; a program joined only as staff never
  gets a student row; the nightly writer follows the rule; no double row in
  exports or the monthly email.
- Claim: a second call during a running one gets `CONVERSION_BUSY`; a crash in
  each phase then resume ends with exactly one user; resume keeps the scope and
  permission checks; a scoped actor cannot convert another guide's student.
- Assistant attendance: lock acquire and heartbeat follow the predicate; a
  module revoke `attendance` blocks it.
- Archive: Sport keeps working for an archived student; the purge check with a
  stale bin entry keeps the archived student's files.
- Archive inventory: every path in section E.
- AI tools with a staff participant.
- Client: combobox keyboard and screen-reader attributes, labels «المسؤول», the
  button visibility, the form, «طلاب سابقون» tab and banner, «إكمال التحويل».
