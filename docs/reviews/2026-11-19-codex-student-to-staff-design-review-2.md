# Codex re-review: student to staff design, revision 2 (2026-11-19)

Actual run: `codex exec --sandbox read-only`, against `1ff124e`.

Reviewed Revision 2 against current code at `1ff124e`. **11 earlier findings are answered; 5 are partly answered.** The design still needs changes before implementation.

“Answered” means the design now specifies the required behavior—not that it has been implemented.

| # | Earlier finding | Disposition |
|---|---|---|
| 1 | Audit ordering | **Answered.** C writes the required audit before business mutations and acknowledges partial completion afterward. |
| 2 | Retry, partial conversion, concurrency | **Partly.** Stored state helps, but the resume path skips unfinished account creation and bypasses the initial concurrency guard. |
| 3 | Independently revocable conversion/undo | **Answered.** `students.makeStaff`, both permission gates, roster-side-effect authorization and revoke tests are specified; undo is removed. |
| 4 | Historical attendance corruption | **Partly.** An effective date is defined, but existing conversion-day marks and historical program membership remain unresolved. |
| 5 | Assistant-in-charge attendance access | **Partly.** The policy is explicit, but lock authorization and module-wide revocation need changes too. |
| 6 | Server-enforced conversion eligibility | **Answered.** Student status, original TZ, allowed roles, hierarchy, active room and reverse link are specified. |
| 7 | Archive read/write inventory | **Partly.** The previously named paths are covered, but query-mode exceptions for Sport and purge protection are missing. |
| 8 | Sport identity migration | **Answered.** The owner explicitly excludes migration and requires existing Sport identity/history to remain. The query-default conflict below still needs fixing. |
| 9 | Active exclusion, history, undo | **Partly.** Historical visibility and no-undo are decided; the claim that existing rows cannot double-count is still incorrect. |
| 10 | Student responsible-guide eligibility | **Answered.** New/changed assignments are restricted, existing assistants are grandfathered, and the IT inventory is specified. |
| 11 | Educational validation and demotion | **Answered.** Validation uses the merged record, fails closed, and covers subsequent role changes. |
| 12 | Same teacher/helper | **Answered.** Explicit server rejection and mutually exclusive selectors are specified. |
| 13 | AI attendance omits staff | **Answered.** Discovery, proposals, revalidation and summaries are covered, with an explicit unsupported fallback. |
| 14 | Photo ownership | **Answered.** An independent server-side copy and nonfatal copy failure are specified. |
| 15 | Combobox accessibility | **Answered.** Naming, relationships, focus, selection, filtering and keyboard behavior are specified. |
| 16 | Labels and registration privacy | **Answered.** The missing labels are listed and generic registration success is preserved. |

The following are **new failure cases in the revised mechanisms**, including the reasons several earlier findings remain only partly answered.

1. **P1 — Resume can archive the student without creating the staff account.**  
   [Spec:154](../../docs/superpowers/specs/2026-11-19-student-to-staff-design.md:154) persists `started` **before** inserting the user, but [spec:150](../../docs/superpowers/specs/2026-11-19-student-to-staff-design.md:150) resumes directly at roster movement. A crash or insert failure between those writes leaves a conversion whose retry never creates its account. Even a preallocated `userId` only supplies an identifier; current attendance drops IDs without an active account ([lessonParticipants.js:34](../../server/utils/lessonParticipants.js:34)). Persist distinct preparation/account-created phases and idempotently create or verify the exact linked account before moving any roster.

2. **P1 — A concurrent request can enter resume while the first request is still running.**  
   The “one wins, the other gets 409” guarantee at [spec:171](../../docs/superpowers/specs/2026-11-19-student-to-staff-design.md:171) only covers requests that both reach step 4. Request B arriving after A writes `started` instead jumps straight to step 5—even while A is creating the user. Two resume requests also skip the guard entirely. Existing version checks compare individual documents; they do not own the whole conversion ([lockGuard.js:82](../../server/middleware/lockGuard.js:82)). Specify a conversion-wide claim/lease or equivalent serialization, guarded completion, and immutable completion timestamps.

3. **P2 — The conversion-day rule leaves two stored identities and can replace a real mark with default presence.**  
   A student marked absent in the morning converts that afternoon. Under [spec:195](../../docs/superpowers/specs/2026-11-19-student-to-staff-design.md:195), reopening that date creates a staff row; current missing staff rows default to present ([Attendance.controller.js:114](../../server/Entities/Attendance/Attendance.controller.js:114)). Nothing removes, aliases or reconciles the earlier student mark. Exports return both identities, and monthly summaries count them independently ([Attendance.controller.js:515](../../server/Entities/Attendance/Attendance.controller.js:515), [monthlySummaryJob.js:43](../../server/services/monthlySummaryJob.js:43)).  
   Also, moved rosters are visible before `doneAt` supplies the cutover date. Define attendance behavior during `started`, reconcile existing conversion-day marks without losing status/notes, and apply the same identity rule to the nightly writer.

4. **P2 — Historical substitution invents student membership in programs joined only as staff.**  
   [Spec:191](../../docs/superpowers/specs/2026-11-19-student-to-staff-design.md:191) substitutes any converted user in `list_users` with their student identity for earlier dates. If the person subsequently joins a different program solely as staff, opening its pre-conversion date creates a student row for a program they never attended as a student. Current sheet reads actively create missing rows ([Attendance.controller.js:177](../../server/Entities/Attendance/Attendance.controller.js:177)). Historical resolution must use per-program conversion membership, not merely `fromStudentId`; retain that provenance even after later roster removal.

5. **P2 — Conversion loses the former record-scope protection.**  
   [Spec:134](../../docs/superpowers/specs/2026-11-19-student-to-staff-design.md:134) replaces the previous `students.viewAll` requirement with grantable operation keys, but its server steps never check whether the actor may access this student. A scoped guide granted both keys could submit another guide’s student ID. Existing student mutations explicitly enforce scope ([Student.controller.js:337](../../server/Entities/Student/Student.controller.js:337)). Preserve that check on initial conversion and resume; authorizing roster side effects does not authorize arbitrary student records.

6. **P2 — The assistant attendance exception does not extend to acquiring or maintaining the edit lock.**  
   [Spec:109](../../docs/superpowers/specs/2026-11-19-student-to-staff-design.md:109) changes `bulk-save` while retaining lock checks. However, acquire **and heartbeat** still require `attendance.record` ([Lock.route.js:45](../../server/Entities/Lock/Lock.route.js:45), [Lock.route.js:137](../../server/Entities/Lock/Lock.route.js:137)); the client likewise enables locking only with that permission ([AttendancePage.jsx:94](../../apps/system/src/Components/Attendance/AttendancePage.jsx:94)). Use the same lesson-specific authorization predicate for save, lock acquisition/renewal and client editing.

7. **P2 — Literal revoke checking bypasses an `attendance` module revoke.**  
   [Spec:110](../../docs/superpowers/specs/2026-11-19-student-to-staff-design.md:110) checks whether `attendance.record` appears in `permissionRevokes`. The existing permission system also accepts module keys and expands `attendance` into its leaves ([permissions.js:59](../../server/utils/permissions.js:59), [permissions.js:128](../../server/utils/permissions.js:128)). A teacher with `permissionRevokes: ["attendance"]` passes the literal exception. Check expanded revocations and test both module and leaf revokes.

8. **P2 — Default active queries conflict with preserving Sport access.**  
   [Spec:207](../../docs/superpowers/specs/2026-11-19-student-to-staff-design.md:207) makes active mode the default for lists/jobs, without defining a Sport exception. `sportPeople` currently queries students without a mode ([sportPeople.js:36](../../server/utils/sportPeople.js:36)); Sport authentication requires the existing student identity to resolve ([SportPortal.auth.js:221](../../server/Entities/SportPortal/SportPortal.auth.js:221)). Applying active exclusion there breaks the owner’s preserved card/session behavior. Explicitly retain archived student lookup for existing Sport identities and test it.

9. **P2 — The query-mode inventory omits the purge check that protects live archived records.**  
   Section E says recycle-bin behavior remains unchanged, but purge checks student existence using an ordinary query before deleting signatures and photos ([Student.controller.js:747](../../server/Entities/Student/Student.controller.js:747)). A restored student can still have a leftover bin entry if deleting that entry failed ([recycleBin.js:61](../../server/services/recycleBin.js:61)). After conversion, an active-only lookup would falsely report absence and permit deletion of the archived student’s files. Specify `any` mode for this protection, with a restored-then-converted stale-bin regression test.

10. **P2 — Skipping a teacher/helper collision can leave the archived student on the roster.**  
    [Spec:160](../../docs/superpowers/specs/2026-11-19-student-to-staff-design.md:160) says “skip and continue” when the new user is already teacher/helper. That can happen between account creation and a resumed conversion. Skipping the program leaves its student ID in `list_students`; skipping insertion into `list_users` also means D’s historical resolver cannot find that program association. The current staff-participant restriction is legitimate ([lessonParticipants.js:23](../../server/utils/lessonParticipants.js:23)), but conversion must still remove the student membership and retain its historical mapping. Clarify that only the conflicting staff insertion is skipped.

**Verification:** 92 focused existing tests passed, plus four in-memory assertions confirming module-revoke expansion and independent student/staff counting. No files changed, including the review log. Full `npm run verify`, browser checks and database integration tests were not run during this read-only review.