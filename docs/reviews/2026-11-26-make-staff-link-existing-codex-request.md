# Codex review request: student to staff, link to existing staff + iPhone submit (2026-11-26)

Implementer: Claude Code. Reviewer requested: Codex (owner triggers). Read-only review.

## Scope

1. **iPhone: «تحويل» did nothing.** `apps/system/src/Components/Student/MakeStaffDialog.jsx`: the form has `noValidate`; a non-empty invalid email is reported in the window (`aria-invalid`, focus). The student's saved email is never format-checked, and Safari on iOS refused the form silently.
2. **Link to existing staff (owner decisions: active only; role kept; only an actor who may give that role).** Spec addendum: `docs/superpowers/specs/2026-11-19-student-to-staff-design.md`, "Addendum 2026-11-26".
   - `server/services/staffConversion.js`: `existingFor`, the link branch of the first call, `linkUserId` through the phases, `preview`.
   - `server/Entities/User/User.controller.js`: `findStaffByTz`, `linkUserToStudent`, `copyStudentPhotoToUser({ keepExisting })`.
   - `server/Entities/Student/StaffConversion.controller.js`, `Student.route.js`: `GET /:id/make-staff` (same two keys, scope).
   - Client: `functionsStudent.jsx` (`makeStaffPreview`), `MakeStaffDialog.jsx`, `StudentView.jsx` (toast).
3. Test-only fixes: `server/test/notice-controller.test.js` (relative date), `apps/system/src/journey/JourneyProvider.test.js` (guide preloaded).

## Questions for the reviewer

- Races: the account suspended, re-linked or its tz changed between "preparing" and "prepared" (`linkUserToStudent` re-checks; versioned write on `updatedAt`).
- Is `mayGiveStaffRole(actor, existingRole)` the right gate for linking to a manager or IT account?
- Cutover rows when the linked account already has staff rows in the same programs and dates (`settleStudentRow`).
- Does the preview leak more than it should (name and role of a staff account by the student's tz, to an actor with `students.makeStaff` + `users.create`)?

## Verification so far

Server 1,866, System 1,418 pass; System build compiled. Not run on a real MongoDB, Drive, browser or iPhone.
