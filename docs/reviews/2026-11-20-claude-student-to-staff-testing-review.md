# Claude testing-expert review of student to staff (2026-11-20)

Read-only review by a Claude subagent (testing focus), run alongside Codex review 5. No repo files changed. Ran: server `npm test` (1809/1810, the known notice-controller date failure), System tests (174 suites, 1393 pass), a mutation probe (one guard reverted at a time against 14 server test files; 23 of 40 reverted guards still passed every test), and a photo probe. Not verified: real MongoDB (duplicate key, partial unique index, `$or`, id casting, nested `$set` under null), Drive, browser, keyboard, screen reader.

## Defects

1. **Photo never copied when `DB_NAME` is unset (medium, confirmed).** `server/Entities/User/User.controller.js` `copyStudentPhotoToUser` passes `process.env.DB_NAME` to `handleUpload`, which needs a name; with the supported empty `DB_NAME` (falls back to `tamheed_db` in `utils/dbName.js`) every conversion answers 200 with `photoCopied: false`. Use `DB_NAME` from `utils/dbName`. (The user photo upload in the same file passes `process.env.DB_NAME` too.)
2. **`postOne` answers 201 after taking the converting student back off (low-medium).** `Lesson.controller.js:371` ignores the `takeBack` result; `addToList` and `putOne` answer 409 `CONVERSION_IN_PROGRESS`. The create audit row also lists him. `putOne` answers 409 after the rest of the edit was saved.
3. **Student page stale after a failed conversion (low, client).** After 503/409 the dialog shows the error, but the page still offers «تحويل إلى الطاقم», «تعديل», «حذف» and lacks the «لم يكتمل» banner until reload. Re-read the student after a failed `makeStaff`.
4. **Accessibility (low, client).** `MakeStaffDialog`: no focus trap, focus not returned, no initial focus when resuming in phase account/rosters, error not tied by `aria-describedby`. StudentView banner uses `role="alert"` (announced on every load; `role="status"` fits). `FormerStudents`: an old error is not cleared on reopen; the "…" loading text says nothing.
5. **The chosen «المسؤول» can vanish from the select (low, client).** `utils/inChargeOptions.js` `inChargeGroups` drops the assistants group for a تربوي before keeping the chosen person; an old program whose teacher left also shows an empty select while saving the old id.
6. **A resume from "preparing" writes "prepared" before its role/password checks (low).** `staffConversion.js:170-182`.
7. **Demotion check may miss ObjectId-stored teachers (low, unverified).** `educationalProgramsRunBy` queries `{ teacher: String(userId) }`; `studentScope` matches both forms.
8. **Per-student reads in `conversionRules` (low, performance).**

Question for the owner: `moveProgram` adds the new user to a planned program even if someone took the student off that roster between "prepared" and the move. Intended?

## Test gaps (reverted guards that no test caught)

- High: no test reaches the make-staff route/controller (both permission keys, scope 404, resume via planned programs, notices only on 200); `createUserFromStudent` and `copyStudentPhotoToUser` untested; concurrency guards (claim on writes, version on student/lesson/row writes, claim renewal) not caught because the hand-made stores compare dates with `String()` (second precision); no test for a saved row when a staff row exists; nightly job ignoring the conversion rules; roster guards before and after the write in `addToList`, `idsFromTz`, `postOne`, `putOne`.
- Medium: mid-conversion read-only (putS, deleteS, photo upload/delete, lookupS, consent link) tested only for archived; archive inventory (grade promotion, alerts, scope, lesson access, moveStudent); stops in preparing/rosters then resume; failed photo copy; two simultaneous `run()` calls; lock heartbeat after the teacher changed.
- Client: MakeStaffDialog error/Escape/focus/resume fields/success; no tests for FormerStudents, UserView banner, ConsentView readOnly, AttendancePage; EditLesson تربوي validation, search keeps the chosen person, teacher/helper exclusion.
