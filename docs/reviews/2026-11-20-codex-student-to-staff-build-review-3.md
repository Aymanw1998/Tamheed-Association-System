# Codex review 3 of the student-to-staff build fixes (2026-11-20)

Read-only Codex review of the fixes for docs/reviews/2026-11-20-codex-student-to-staff-build-review-2.md. Verbatim output below (local absolute links shortened to repo paths).

**6 fixed; 1 partly fixed. Five new regressions found.** “Fixed” below refers to the original reported scenario.

| Point | Status | Evidence |
|---|---|---|
| #2 — Conversion version/delete race | **Fixed** | `writeHeld` checks claim ownership and the freshly read version, then advances it with `nextStamp`; conflicts retry. [staffConversion.js:70](server/services/staffConversion.js:70) |
| #3 — Save recreates reconciled student row | **Partly fixed** | Post-save reconciliation handles successful reads. If its student lookup fails after the upsert, the forbidden row remains. Retrying excludes that student from `studentItems`, so cleanup receives no IDs and returns 200 without repairing it. Reproduced. [Attendance.controller.js:267](server/Entities/Attendance/Attendance.controller.js:267), [383](server/Entities/Attendance/Attendance.controller.js:383) |
| #4 — Late programs skipped on resume | **Fixed** | Reconciliation runs against the final plan before leaving `account`, including on resume. [staffConversion.js:218](server/services/staffConversion.js:218) |
| #6 — Former-program history omitted | **Fixed** | Sheet and scoped export use stored rows plus `historyRowOf`, independently of plan membership/current staff participation. [Attendance.controller.js:206](server/Entities/Attendance/Attendance.controller.js:206), [600](server/Entities/Attendance/Attendance.controller.js:600) |
| #7 — Educational retry re-adds converted student | **Fixed** | Post-write checking includes every candidate ID, including initial roster members. [educationalLesson.js:68](server/services/educationalLesson.js:68) |
| #10 — Signing completes after archival | **Fixed** | The marker requires an unfrozen student; a miss invokes evidence rollback and returns 409. [InviteToken.controller.js:207](server/Entities/InviteToken/InviteToken.controller.js:207) |
| Previous new P2 — Historical edits silently discarded | **Fixed** | Existing historical rows now qualify for saving without current participation. [Attendance.controller.js:319](server/Entities/Attendance/Attendance.controller.js:319) |

New defects, ranked by severity:

1. **P1 — Rejected conversion can again corrupt attendance.** `settleRacedRows` accepts phase `prepared`, before account creation succeeds. An in-flight future-date save can therefore re-key its mark to the proposed user; subsequent `TZ_EXISTS` clears conversion but leaves attendance referencing a nonexistent user. [Attendance.controller.js:271](server/Entities/Attendance/Attendance.controller.js:271), [staffConversion.js:187](server/services/staffConversion.js:187).

2. **P2 — Educational cleanup can erase legitimate membership before planning.** `enrolAll` now checks existing members even when `change` did nothing. If conversion writes `preparing` between the initial student lookup and cleanup, cleanup removes that existing member before conversion scans lessons. Conversion finishes successfully with neither student nor staff membership. Reproduced with an empty conversion plan. [educationalLesson.js:63](server/services/educationalLesson.js:63), [48](server/services/educationalLesson.js:48).

3. **P2 — Consent undo deletes an already accepted signature.** Request A creates evidence; B adopts it through the repair path, writes `consentAt`, and returns 200. Conversion starts; A’s marker fails and its undo deletes the unchanged evidence revision. Reproduced: B returned 200, A returned 409, `consentAt` remained but consent evidence disappeared. [InviteToken.controller.js:178](server/Entities/InviteToken/InviteToken.controller.js:178), [200](server/Entities/InviteToken/InviteToken.controller.js:200).

4. **P2 — History-save exception bypasses scope when the lesson is missing/unreadable.** The lesson guard only rejects an existing unauthorized lesson. The new history exception then authorizes stored converted-student rows independently of student scope. A guide with `attendance.record` can modify another program’s retained attendance after that program is deleted. Reproduced with HTTP 200. [Attendance.controller.js:298](server/Entities/Attendance/Attendance.controller.js:298), [322](server/Entities/Attendance/Attendance.controller.js:322).

5. **P2 — Raced saves outside the plan lose human marks.** A future-date save passes validation, the student leaves that program before conversion snapshots it, and the save lands afterward. Cleanup deletes the saved row because the program is absent from `plannedLessons`, then reports success. This violates preservation of stored attendance outside planned programs. [conversionAttendance.js:86](server/utils/conversionAttendance.js:86).

**Verification:** 139 focused tests passed; additional isolated in-memory probes reproduced the failures above. No files edited. `npm run verify` was not run because synchronization/build steps write files. No real database testing.