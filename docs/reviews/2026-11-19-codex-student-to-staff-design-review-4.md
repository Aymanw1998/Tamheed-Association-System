# Codex review 4: student to staff design, revision 4 (2026-11-19)

Actual run: `codex exec --sandbox read-only`, against `1ff124e`.

Reviewed revision 4 against current code at `1ff124e`. **All seven specific review-3 points are answered at the design level**, but two new design problems remain.

| Review-3 point | Status | Assessment |
|---|---|---|
| New 1: roster movement and recovery journal | **Answered** | Fixed `plannedLessons` preserves intent; lesson state determines completion independently of progress writes. Versioned, idempotent moves address retries. |
| New 2: unprocessed programs treated as staff-only | **Answered** | Attendance uses planned membership from `prepared`, rather than movement progress. |
| New 3: history from former programs disappears | **Answered** | Existing student rows are explicitly preserved even outside `plannedLessons`. |
| New 4: conversion removes the caller’s resume scope | **Answered** | Resume explicitly accepts the caller’s current relationship to a planned program. |
| Previously partly answered: concurrent conversion requests | **Answered** | Initial and resumed calls acquire the claim; fixed account identity and versioned moves provide recovery across separate writes. |
| Previously partly answered: conversion-day attendance | **Answered** | Next-day cutover preserves conversion-day marks, including programs not yet moved. |
| Previously partly answered: invented historical membership | **Answered** | Planned membership distinguishes conversion programs from staff-only programs; former programs retain their stored history. |

Only **new concrete problems** follow:

1. **P2 — The membership snapshot is frozen too late to guarantee completeness.**  
   [Spec:176](../../docs/superpowers/specs/2026-11-19-student-to-staff-design.md:176) gathers `plannedLessons` and starts refusing roster additions when `prepared` is written. Those cannot be one atomic operation across the student and lesson collections: [api.js:126](../../server/Entities/api.js:126) updates one document. Current additions validate the student separately, then condition their write only on the lesson version ([Lesson.controller.js:509](../../server/Entities/Lesson/Lesson.controller.js:509), [Lesson.controller.js:517](../../server/Entities/Lesson/Lesson.controller.js:517)).

   An addition can finish after the conversion’s roster scan but before `prepared`, or already be in flight when preparation commits. That program is absent from the immutable plan; conversion archives the student without creating their staff membership there. **Define a preparation barrier shared with roster writers before capturing membership, or an equivalent transactional protocol.** Refusing additions only after storing the snapshot cannot establish the promised invariant.

2. **P2 — Existing attendance after the cutover contradicts the preservation and single-row rules.**  
   [Spec:230](../../docs/superpowers/specs/2026-11-19-student-to-staff-design.md:230) preserves every stored student row, while [spec:238](../../docs/superpowers/specs/2026-11-19-student-to-staff-design.md:238) requires staff-only attendance from cutover onward. The current sheet endpoint accepts future dates and creates student rows for them ([Attendance.controller.js:128](../../server/Entities/Attendance/Attendance.controller.js:128), [Attendance.controller.js:177](../../server/Entities/Attendance/Attendance.controller.js:177)); I reproduced this in memory.

   If tomorrow’s student row exists before today’s conversion, preserving it and creating tomorrow’s staff row produces both identities. Exports retain both ([Attendance.controller.js:515](../../server/Entities/Attendance/Attendance.controller.js:515)). **Specify how conversion handles existing marks on or after the proposed cutover**—for example, refusing conversion pending resolution or defining explicit reconciliation. “Nothing has to be merged” does not cover supported existing data.

**Verification:** 41 focused existing tests passed; the future-date reproduction passed using the real controller with in-memory dependencies. No files changed. Full `npm run verify` was not run because its build writes files.