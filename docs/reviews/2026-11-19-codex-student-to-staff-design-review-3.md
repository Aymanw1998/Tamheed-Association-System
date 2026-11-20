# Codex review 3: student to staff design, revision 3 (2026-11-19)

Actual run: `codex exec --sandbox read-only`, against `1ff124e`.

Reviewed revision 3 against current code at `1ff124e`. **7 answered, 3 partly answered.** “Answered” refers to the design, not implementation.

| Review-2 point | Status | Assessment |
|---|---|---|
| 1. Resume skips account creation | **Answered** | Fixed user ID and separate preparation/account phases address this. |
| 2. Concurrent requests enter resume | **Partly** | Claim acquisition is specified; enforcing it across student, user and lesson writes remains unresolved. |
| 3. Conversion-day attendance corruption | **Partly** | Next-day cutover preserves that day’s marks, but unfinished conversions still have an identity-resolution gap. |
| 4. Invented historical student membership | **Partly** | Provenance distinguishes moved programs from staff-only programs, but overlooks former student programs. |
| 5. Missing student scope check | **Answered** | Explicit checks on initial conversion and every resume. |
| 6. Attendance lock authorization | **Answered** | Shared predicate covers save, acquisition, heartbeat and client editing. |
| 7. Module revoke bypass | **Answered** | Expanded module and leaf revocations are explicit. |
| 8. Sport archive lookup | **Answered** | Explicit `any` mode and preservation test. |
| 9. Purge protection lookup | **Answered** | Explicit `any` mode and stale-bin test. |
| 10. Teacher/helper collision skips removal | **Answered** | Only staff insertion is skipped; removal and provenance remain required. |

The following are **new concrete problems**:

1. **P1 — Roster movement and its recovery journal cannot be one ordinary versioned update.**  
   [Spec:180](../../docs/superpowers/specs/2026-11-19-student-to-staff-design.md:180) combines lesson roster changes with `staffConversion.lessons`, stored on the student. These use separate collections, and [api.js:126](../../server/Entities/api.js:126) updates one document. If the lesson write succeeds and the provenance write fails, resume’s `list_students` scan no longer finds that lesson. Conversion can finish permanently missing its historical association. Likewise, a lesson update cannot directly enforce a claim field held on the student. Specify a transaction or durable per-lesson intent/completion protocol, including how expired claim holders are prevented from writing.

2. **P2 — Unprocessed programs become “staff-only” during an incomplete conversion.**  
   Provenance is populated only as programs move ([spec:180](../../docs/superpowers/specs/2026-11-19-student-to-staff-design.md:180)), but the attendance rule applies before completion and treats programs absent from that list as staff-only ([spec:220](../../docs/superpowers/specs/2026-11-19-student-to-staff-design.md:220)). After preparation—or after moving only the first program—the remaining student programs therefore lose their valid pre-cutover student rows under the prescribed rule. This affects sheet reads, saves and nightly processing; current sheet reads actively create missing rows ([Attendance.controller.js:177](../../server/Entities/Attendance/Attendance.controller.js:177)). Persist the intended conversion membership before applying the identity rule, separately from movement progress.

3. **P2 — Absence from conversion provenance does not prove a program was joined only as staff.**  
   A student may leave program A before conversion while retaining attendance there. Step 5 records only programs containing the student at conversion time, so A is absent. Applying D’s “staff rows only, never before cutover” rule to exports/monthly summaries then suppresses legitimate historical student marks. Current exports retrieve stored marks independently of current roster membership ([Attendance.controller.js:515](../../server/Entities/Attendance/Attendance.controller.js:515)). Preserve existing historical student rows for former programs; distinguish those from programs genuinely joined only as staff.

4. **P2 — Conversion can revoke its own caller’s ability to resume.**  
   The mandatory scope check on every resume ([spec:141](../../docs/superpowers/specs/2026-11-19-student-to-staff-design.md:141)) uses scope derived from current student rosters or `main_teacher` ([studentScope.js:18](../../server/utils/studentScope.js:18)). A permitted guide who sees the student through a program, but is not their responsible guide, loses that scope when conversion removes the student from the roster. A failure before archival then leaves that caller unable to resume. Define conversion-aware resume scope that preserves the relevant program relationship while still checking current permissions and access.

**Verification:** 40 focused existing tests passed; an in-memory check using the real scope helper reproduced finding 4. No files changed, including the review log. Full `npm run verify` and database integration checks were not run during this read-only review.