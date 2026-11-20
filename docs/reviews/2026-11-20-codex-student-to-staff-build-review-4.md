# Codex review 4 of the student-to-staff build fixes (2026-11-20)

Read-only Codex review of the fixes for docs/reviews/2026-11-20-codex-student-to-staff-build-review-3.md. Verbatim output below (local absolute links shortened to repo paths).

**5 fixed; 1 partly fixed. One new P2 defect found.**

| Review-3 point | Status | Evidence |
|---|---|---|
| Earlier #3: failed cleanup leaves a student row that retries skip | **Partly fixed** | Cleanup now includes every submitted student ID ([Attendance.controller.js:397](server/Entities/Attendance/Attendance.controller.js:397)), but the version check runs first ([361](server/Entities/Attendance/Attendance.controller.js:361)). Reproduced: save writes the row, cleanup fails with 500, then the same versioned retry returns **409 STALE**, leaving the forbidden row. |
| P1: rejected conversion re-keys attendance to a nonexistent account | **Fixed** | In `prepared`, settlement requires an existing account; lookup failure throws ([Attendance.controller.js:277](server/Entities/Attendance/Attendance.controller.js:277)). |
| P2: educational cleanup removes existing membership before planning | **Fixed** | Cleanup receives only IDs added by the successful write, calculated against its actual previous roster, including retries ([educationalLesson.js:67](server/services/educationalLesson.js:67)). |
| P2: consent undo deletes evidence another request accepted | **Fixed** | Undo is skipped when the current `consentAt` matches the evidence’s `signedAt` ([InviteToken.controller.js:209](server/Entities/InviteToken/InviteToken.controller.js:209)). |
| P2: historical save bypasses scope for a missing/unreadable lesson | **Fixed** | The history exception requires an existing lesson; existing unauthorized lessons are rejected earlier ([Attendance.controller.js:333](server/Entities/Attendance/Attendance.controller.js:333), [307](server/Entities/Attendance/Attendance.controller.js:307)). |
| P2: raced saves outside the plan delete human marks | **Fixed** | Human-saved rows outside `plannedLessons` are retained ([conversionAttendance.js:88](server/utils/conversionAttendance.js:88)). |

**New defect:**

- **P2 — Retained out-of-plan marks can double-count the converted person.** The new preservation branch keeps the student row without reconciling a staff row ([conversionAttendance.js:88](server/utils/conversionAttendance.js:88)). Scenario: a future-date save races removal from the program and conversion; its row is retained outside the plan. The person subsequently joins that program as staff. Opening that date creates a staff row ([Attendance.controller.js:194](server/Entities/Attendance/Attendance.controller.js:194)). Reproduced: the administrator’s export contains **both student and staff marks for the same person, program and date** ([616](server/Entities/Attendance/Attendance.controller.js:616)).

96 focused tests passed; isolated in-memory probes reproduced both outstanding scenarios. No files edited. `npm run verify` was not run because synchronization/build steps write files.