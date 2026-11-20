# Codex review 5 of the student-to-staff build fixes (2026-11-20)

Read-only Codex review of the fixes for docs/reviews/2026-11-20-codex-student-to-staff-build-review-4.md, plus a whole-feature server pass. Verbatim output below (local absolute links shortened to repo paths).

**One fixed; one partly fixed. Four P2 defects remain.**

| Review-4 point | Status | Evidence |
|---|---|---|
| Stale retry skips failed cleanup | **Fixed** | Cleanup now runs before returning `409 STALE`: [Attendance.controller.js:363](server/Entities/Attendance/Attendance.controller.js:363). |
| Out-of-plan marks double-count the person | **Partly fixed** | [conversionAttendance.js:91](server/utils/conversionAttendance.js:91) now re-keys these marks when invoked, but the path below still bypasses settlement. |

Remaining defects, ranked:

1. **P2 — Out-of-plan marks can still survive conversion as student rows.** During `prepared`, cleanup skips settlement when the account does not yet exist ([Attendance.controller.js:277](server/Entities/Attendance/Attendance.controller.js:277)); conversion subsequently settles only planned programs ([staffConversion.js:102](server/services/staffConversion.js:102)). A future-date save races roster removal and account creation, then conversion resumes successfully. Later staff membership and opening that date produce both student and staff marks. **Reproduced in the export.**

2. **P2 — Opening a sheet can recreate a forbidden student row after conversion.** Sheet creation uses its earlier roster snapshot without post-write settlement ([Attendance.controller.js:184](server/Entities/Attendance/Attendance.controller.js:184)). If conversion finishes between reading that snapshot and inserting tomorrow’s missing rows, the request inserts a student row after cleanup. Reopening creates the staff row alongside it. **Reproduced.**

3. **P2 — Re-keying can race staff-row creation and leave duplicate staff marks.** The existence check and re-key are separate operations ([conversionAttendance.js:91](server/utils/conversionAttendance.js:91)). While conversion settles a late-planned program, opening its staff sheet can insert the destination row between those operations. Re-keying then leaves two rows for the same user/program/date. **Reproduced.**

4. **P2 — `moveStudent` can remove existing membership before conversion plans it.** Unlike `enrolAll`, it calls cleanup even when it added nothing ([educationalLesson.js:86](server/services/educationalLesson.js:86)). During a guide change, the student already belongs to the destination program; conversion enters `preparing` after the eligibility read. Cleanup removes that existing membership before the conversion scan, so conversion completes without restoring it as staff membership. **Reproduced.**

**Validation:** 108 focused tests passed; isolated in-memory probes reproduced the four defects. No files edited. `npm run verify` was not run because its synchronization/build steps write files.