# Codex request: student to staff, built (2026-11-19)

Base: `1ff124e`. Spec: `docs/superpowers/specs/2026-11-19-student-to-staff-design.md` (revision 5; its design reviews 1-4 are in `docs/reviews/2026-11-19-codex-student-to-staff-design-review*.md`; the fifth design review did not run, Codex usage limit). Owner chose to build and review design and code together.

What changed:
1. **«المسؤول» rules** `server/utils/lessonInCharge.js`, wired into `Lesson.controller` create/update on the merged record: teacher must be an active visible user (looked up when new or changed, or when the program becomes تربوي; lookup failure 503), teacher != helper (`SAME_STAFF`), تربوي only guide/manager (`EDUCATIONAL_NEEDS_GUIDE`).
2. **Demotion** `User.controller.putRole`: a guide/manager who is teacher of a تربوي cannot become مساعد (409 `IN_CHARGE_OF_EDUCATIONAL`, names; lookup failure 503).
3. **Assistant in charge records attendance** `server/utils/attendanceRecord.js` (`mayRecordAttendance`: `attendance.record`, or teacher + `attendance.view` and no expanded revoke), `middleware/attendanceRecordGuard.js` on `bulk-save`, the lock rule for `attendance:` keys (acquire + heartbeat; failed read refuses), client `utils/attendanceRecord.js` in `AttendancePage`.
4. **Program form** `EditLesson.jsx`: label «المسؤول», search box + native select (`utils/inChargeOptions.js`; deviation from the spec's combobox, noted in the spec), assistants hidden for تربوي, the helper list excludes the chosen «المسؤول». Labels «المسؤول» in `LessonView`, `ViewAllLesson` (cards, print, filter), `LessonParticipants`, the lessons Excel, the tour.
5. **Student «المرشد المسؤول»** guides/managers only when set or changed (`isValidInstructor`), kept otherwise; `responsibleGuideOptions` keeps a current assistant by name; IT list `GET /api/it/assistant-guides` (`utils/assistantGuides.js`, `permissions.manage`) and screen `apps/it/src/screens/AssistantGuides.jsx`.
6. **Make staff** `services/staffConversion.js` (phases preparing/prepared/account/rosters/done; claim with lease via conditional writes on `conversionClaim`; audit first; `plannedLessons` after the barrier; future rows settled; user created with the planned `_id`; versioned per-program moves with renewal and final rescan; archive), `Entities/Student/StaffConversion.controller.js`, route `POST /api/student/:id/make-staff` (`students.makeStaff` + `users.create`), `User.controller.createUserFromStudent` / `copyStudentPhotoToUser` / `mayGiveStaffRole`. New key `students.makeStaff` (catalog, label, synced).
7. **Rosters** `utils/rosterGuard.js`: `rosterable` in `addableIds`/`idsFromTz`/`existingIds`, educational `enrolAll`/`moveStudent`; `takeBackConverting` after `addToList`, `postOne`, `putOne` (409 `CONVERSION_IN_PROGRESS`).
8. **Attendance by cutover** `utils/conversionAttendance.js` in `getSheet`, `bulkSave`, `runDailyAbsenceJob`.
9. **Archive inventory**: `getAllS` (`?archived=1` for `students.viewAll`), `getOneS` (archived hidden without `viewAll`), `putS`/`deleteS`/`uploadPhoto`/`deletePhoto` (409 `ARCHIVED` / `CONVERSION_IN_PROGRESS`), `lookupS`, `studentScope`, `lessonAccess.responsibleStudentIds`, consent links, grade promotion, absence-streak alerts, `search_students`. Sport and the purge check left as they were (they read any student).
10. **Client** `MakeStaffDialog.jsx`, `StudentView` (button, «إكمال التحويل», banners), `FormerStudents.jsx` in the students page, `UserView` «كان طالبًا في الجمعية».
11. **AI tools** (spec F fallback): `list_lessons.staffParticipants`, `attendance_summary.staffRows`, descriptions point staff attendance to the attendance page.

Tests: server 1784 pass (new `staff-conversion`, `conversion-attendance`, `attendance-record`, `assistant-guides`, lesson/user/route/lock tests); system and IT suites and builds (see the review log entry).

Not checked: a real MongoDB (the `$or`/`$lt` claim filter, dotted `$set`, creating a user with a given `_id`), Google Drive photo copy, the browser, a screen reader, concurrent requests against a real database.

Please check: the claim and phase protocol against real Mongo semantics, every place an archived student must disappear from, the cutover rule in getSheet/bulkSave/nightly, the role and scope gates on make-staff and resume, and anything the build got wrong against the spec.

## Fixes for the build review (2026-11-20)

Owner: fix all 15; #14 keep the old-program grandfathering and write it in the spec. Review: `docs/reviews/2026-11-19-codex-student-to-staff-build-review.md`.

1. Account first, then future rows settled (a refused account changes nothing). 2. Every conversion write moves `updatedAt` on (an edit/delete read before fails its version check). 3. Row settling is conditional on the row as read (`updatedAt`), never upserts (`AttendanceModelDef.updateExisting`), and rereads after a miss. 4. Programs found by the last scan are settled too. 5. `bulkSave` applies the cutover to every submitted student id (`alsoCheck`). 6. `getSheet` keeps stored student rows of a converted student before the cutover; a scoped export keeps his rows in programs he was moved out of (`formerStudentOf`). 7. Educational `enrolAll`/`moveStudent` take back a raced student after the write; `takeBackConverting` retries and throws instead of failing open. 8. Resume rechecks the stored role and the first password/phone while the account is not made. 9. `getOneS` opens a stopped conversion to an actor on a planned program. 10. Staff-assisted signing and consent links refused for archived/converting students; `ConsentView readOnly`. 11. A creator/approver who is not a guide or manager is not made responsible guide (400 `GUIDE_REQUIRED`). 12. `attendance_summary.staffRows` counts only lessons in scope. 13. The nightly job skips a program when the conversion read fails. 14. Spec documents the grandfathering. 15. Unique partial index on `staffConversion.userId`.

Tests: server 1794 pass (new cases in `staff-conversion`, `lesson-users-attendance`, `conversion-attendance`, `student-scope-routes`, `tz-unique`); system 1393 and IT 130 pass; both builds compile. Not checked on a real database, Drive or browser.

## Fixes for the second build review (2026-11-20)

Review: `docs/reviews/2026-11-20-codex-student-to-staff-build-review-2.md`.

- #2: `writeHeld` reads the student and writes conditionally on its version with `nextStamp`, so updatedAt always moves strictly forward (retried 4 times).
- #3: after an attendance save, `settleRacedRows` re-reads the saved students; a row on or after a conversion's cutover is settled like the conversion does (`settleStudentRow`, shared in `utils/conversionAttendance.js`). A failed read answers an error.
- #4: `settleFutureRows` runs once after the account-phase loop, with the final plan, before the phase moves to "rosters"; a resume runs it again.
- #6 and the new P2: one rule, `historyRowOf(student, dateKey)` (converting and before the cutover), for the sheet, the save (existing rows only) and the scoped export, whether or not the program was in his plan.
- #7: `enrolAll` checks every id it put on the roster after the write, not only the ones missing from the first snapshot; its lookup fails closed.
- #10: the consent marker is written only while the student is not archived or converting; when it misses, the evidence written by this call is restored or removed and the answer is 409 `ARCHIVED`.

Tests added: staff-conversion (version ahead of the clock, resume after a late program), lesson-users-attendance (raced save, history save, export of a program left before), conversion-attendance (educational retry), parent-registration (signing raced by the conversion). Server: 1802 pass, 1 fail unrelated (notice-controller test whose fixed date 2026-11-20 is today). System and IT not re-run (no client change).

## Fixes for the third build review (2026-11-20)

Review: `docs/reviews/2026-11-20-codex-student-to-staff-build-review-3.md`.

- P1: `settleRacedRows` leaves the row alone while the conversion is "prepared" and its account does not exist yet (the conversion's own settling, after the account is made, still sees it). A failed user read answers an error.
- #3: the cleanup after a save runs on every submitted student id, also the ones the save skipped, so a retry settles a row an earlier save left.
- P2 enrolment: `change` reports the roster it wrote over; `enrolAll` re-checks only the ids that write put on, so an existing member is never taken off (the conversion's scan finds him), and one a retry put back is.
- P2 consent: the undo is skipped when the student's `consentAt` equals this evidence's `signedAt` (another request adopted it).
- P2 scope: the history save needs an existing lesson the actor may open.
- P2 outside the plan: `settleStudentRow` keeps a row a person saved in a program outside the plan.

Tests added: lesson-users-attendance (4), conversion-attendance (1), parent-registration (1). Server: 1808 pass, 1 unrelated failure (notice-controller fixed date 2026-11-20). System and IT not re-run (no client change).

## Fixes for the fourth build review (2026-11-20)

Review: `docs/reviews/2026-11-20-codex-student-to-staff-build-review-4.md`.

- #3: a save refused as stale runs `settleRacedRows` on its submitted ids before answering 409, so a retry after a failed cleanup settles the row.
- New P2: `settleStudentRow` re-keys a row a person saved to his staff row in any program (not only planned ones), so he is never counted as student and staff on one date; the mark is kept.

Tests: lesson-users-attendance (stale retry; the outside-plan test now expects the staff row). Server: 1809 pass, 1 unrelated failure (notice-controller fixed date 2026-11-20).

## Fixes for Codex review 5 and the Claude testing review (2026-11-20)

Reviews: `docs/reviews/2026-11-20-codex-student-to-staff-build-review-5.md`, `docs/reviews/2026-11-20-claude-student-to-staff-testing-review.md`.

Codex review 5:
- Rows from the cutover are settled in every program, not only planned ones (`settleFutureRows`); a person's mark becomes his staff row.
- `getSheet` settles the student rows it just added (`settleRacedRows`) and drops duplicate staff rows it added (`dropDuplicateRows`).
- `settleStudentRow` drops a duplicate staff row a sheet added between its check and the re-key (the person's mark stays).
- `moveStudent` takes back only when its own write put the student on (as `enrolAll`).

Testing review:
- Photo copy (and the user photo upload) use `UserModelDef.dbName`, not `process.env.DB_NAME`.
- `postOne`, `putOne` and `addToList` answer success with `notAdded` and a message when a raced student is taken back, with the roster and version re-read after the take-back; the create audit row shows the stored roster.
- A resume from "preparing" checks role and password before writing "prepared".
- `conversionRules` reads roster ids in one `$in` query.
- Grade promotion filters archived students inside `createGradePromotion` (testable).
- Client: the student page re-reads the student after a failed conversion; the dialog keeps focus inside (Tab wraps), focuses the button when a resume asks nothing, returns focus to the opener, ties the error with `aria-describedby`; the stopped-conversion banner is `role="status"`; «طلاب سابقون» clears an old error on reopen and its loading text is readable; the chosen «المسؤول» keeps an option (assistant on a تربوي, or someone no longer on the staff list).
- Not changed: the demotion lookup by string teacher id (educational programs are always written with string ids, and `educationalLesson` reads them the same way); `moveProgram` still adds the user to a planned program even if he was taken off it after "prepared" (spec; question left to the owner); AttendancePage page-level tests and the pre-existing viewer lock state.

Tests added: server `staff-account.test.js` (5), `make-staff-controller.test.js` (4), and more in staff-conversion (13), conversion-attendance (2), lesson-users-attendance (5), student-scope-routes (3), parent-registration (1), student-scope (2), alert-job (1), grades (1), locks (1); the conversion test store now compares dates to the millisecond. System: StudentView (7), FormerStudents (2, new), inChargeOptions (2), EditLesson (2), UserView (2), ConsentView read-only (2, new).

Results: server 1848 pass, 1 unrelated failure (notice-controller fixed date 2026-11-20); System 1410 pass; IT 130 pass; System and IT builds compile.

Mutation check (the testing agent's probe, re-run with patterns updated for the new code and new probes for these fixes): 54 of 55 guards are now caught by a test. The one left is the claim renewal before each program write (`noRenew`): the test clock is fixed, so an expiring claim cannot be shown yet.
