# Codex review: student to staff build (2026-11-19)

Actual run: `codex exec --sandbox read-only`, uncommitted changes on `1ff124e`.

Found **2 P1, 11 P2, and 2 P3 findings**. No files changed.

1. **P1 — A rejected conversion can permanently alter attendance.**  
   [staffConversion.js:163](../../server/services/staffConversion.js:163) settles future rows **before** account creation checks for an existing tz. On `TZ_EXISTS`, line 167 clears the conversion without restoring those rows. Synthetic reproduction returned 409 with the student active, but its saved attendance now referenced a nonexistent user. Unsaved rows are deleted outright. Validate/reserve the account before destructive reconciliation, and test rejection with existing attendance.

2. **P1 — An in-flight delete can remove the newly archived student.**  
   [staffConversion.js:66](../../server/services/staffConversion.js:66) changes conversion/archive fields without advancing `updatedAt`; the conversion route also bypasses the ordinary student lock. A delete that passed the initial freeze check still matches [Student.controller.js:492](../../server/Entities/Student/Student.controller.js:492)’s version predicate after conversion finishes. I reproduced a 200 delete removing the archived record. Conditional mutations must include the unfrozen state, with conversion participating in version/lock coordination.

3. **P2 — Future-row reconciliation can delete a concurrent human save.**  
   [staffConversion.js:92](../../server/services/staffConversion.js:92) classifies a snapshot as unsaved, then deletes solely by `_id`. A teacher saving that row between read and delete loses the saved mark; reproduced synthetically. Reconciliation neither uses attendance locks nor fences each write against the conversion claim. The re-key uses an upserting `attendance.update`, which can also recreate a concurrently deleted row with incomplete fields. Use conditional, non-upserting reconciliation coordinated with attendance writers.

4. **P2 — Programs discovered by the final scan never have their future rows reconciled.**  
   [staffConversion.js:187](../../server/services/staffConversion.js:187) extends `plannedLessons` in phase `account`, but `settleFutureRows` only runs in `prepared`. I reproduced a successful conversion whose newly discovered program retained a post-cutover student row. Opening its sheet subsequently creates the staff row too, causing duplicate export/monthly counts. Reconcile every newly planned program before completion.

5. **P2 — An unrestricted attendance save bypasses the cutover restriction.**  
   [Attendance.controller.js:276](../../server/Entities/Attendance/Attendance.controller.js:276) computes exclusions from current roster students. After conversion removes the student, its ID is absent from `skipStudents`; with `students.viewAll`, the additional filter at line 279 is skipped. A stale client can therefore submit that archived `studentId` after cutover. I reproduced a 200 response creating the forbidden student row. Validate submitted identities independently of current roster membership.

6. **P2 — Historical attendance still depends on current membership and scope.**  
   [conversionAttendance.js:50](../../server/utils/conversionAttendance.js:50) discovers former students only through current active staff participants, while [Attendance.controller.js:199](../../server/Entities/Attendance/Attendance.controller.js:199) renders only the resulting student list. Saved rows disappear from sheets for programs left before conversion, or after the new user leaves/is suspended. Separately, [Attendance.controller.js:538](../../server/Entities/Attendance/Attendance.controller.js:538) drops historical rows from scoped exports once conversion removes current student scope—even for the program’s teacher. Both contradict sections D/E. Historical rows need visibility based on authorized programs, independent of current rosters.

7. **P2 — Educational enrolment does not implement the required post-write barrier check.**  
   [educationalLesson.js:44](../../server/services/educationalLesson.js:44) and [educationalLesson.js:58](../../server/services/educationalLesson.js:58) check conversion state only before writing. A delayed write can add the student after the conversion’s final scan/archive; reproduced synthetically. The controller’s `takeBack` does not cover students added internally by these routines. Additionally, [rosterGuard.js:39](../../server/utils/rosterGuard.js:39) treats exhausted rollback retries as completed, and exceptions return an empty result. The final scan cannot repair writes arriving after it.

8. **P2 — Resume skips role authorization and required account-field validation.**  
   [staffConversion.js:138](../../server/services/staffConversion.js:138) places both checks inside `if (!conv)`. An actor permitted to resume can create the stored role despite no longer being allowed to assign it; a prepared conversion can also resume with `{}`. I reproduced success with `mayGiveRole: () => false`, and verified that [User.controller.js:729](../../server/Entities/User/User.controller.js:729) accepts an empty password. Revalidate the stored role and required fields whenever account creation remains necessary.

9. **P2 — A scoped actor can lose the page needed to resume.**  
   The POST’s planned-program scope fallback at [StaffConversion.controller.js:41](../../server/Entities/Student/StaffConversion.controller.js:41) is absent from [Student.controller.js:211](../../server/Entities/Student/Student.controller.js:211). If conversion moves the student off the actor’s last roster and then fails before archiving, reopening the student page returns 404 unless `main_teacher` independently grants access. I reproduced this in phase `account`. The API may permit resume, but the promised recovery UI becomes unreachable.

10. **P2 — Archived student consent remains editable.**  
    Only public consent links receive the archive check. [InviteToken.controller.js:204](../../server/Entities/InviteToken/InviteToken.controller.js:204) still accepts staff-assisted signing, and [line 197](../../server/Entities/InviteToken/InviteToken.controller.js:197) updates the archived student’s `consentAt`. [StudentView.jsx:153](../../apps/system/src/Components/Student/StudentView.jsx:153) mounts the ordinary editable `ConsentView` on the supposedly read-only archive page. Freeze these writes and hide signing/link controls for archived or converting students.

11. **P2 — Automatic responsible-guide assignment still permits new assistants.**  
    [Student.controller.js:271](../../server/Entities/Student/Student.controller.js:271) assigns a scoped creator as `main_teacher`, while role validation at line 287 runs only for explicit assignments by `viewAll` holders. Approval repeats the bypass at [line 392](../../server/Entities/Student/Student.controller.js:392). An assistant granted `students.create` can create a student with themselves as responsible guide; reproduced with a 201 response. Validate the final assigned value, including server-generated assignments.

12. **P2 — The AI attendance summary leaks staff counts outside lesson scope.**  
    [attendance_summary.js:81](../../server/services/assistant/tools/attendance_summary.js:81) increments `staffRows` before applying any lesson/student scope checks. A scoped actor can obtain organization-wide staff attendance counts or query another program’s count. Synthetic reproduction returned `staffRows: 1` for a lesson outside the actor’s scope. Apply lesson authorization before counting staff rows.

13. **P2 — Nightly absence creation fails open when conversion lookup fails.**  
    [Attendance.controller.js:450](../../server/Entities/Attendance/Attendance.controller.js:450) catches lookup errors and continues with unfiltered student/user IDs. On conversion day, a transient lookup failure can create a staff absence alongside the preserved student mark; during an incomplete conversion it can create post-cutover student absences. The comment says failure skips the person, but the implementation does the opposite. Skip affected writes and test transient lookup failures.

14. **P3 — Existing programs bypass the spec’s merged-record teacher validation.**  
    [lessonInCharge.js:47](../../server/utils/lessonInCharge.js:47) returns early when teacher/kind remain unchanged. Existing educational programs with an assistant teacher, or programs with inactive teachers, can therefore be saved unchanged in that respect. This is deliberate in the tests but differs from section A’s stated validation rule. Either enforce the rule or explicitly approve/document grandfathering in the spec.

15. **P3 — The specified conversion-user unique index is missing.**  
    [Student.model.js:125](../../server/Entities/Student/Student.model.js:125) registers only the tz index. Section C specifies a unique sparse index on `staffConversion.userId`. The database currently lacks that invariant, and the conversion test store accepts duplicate IDs. Add index coverage; clearing conversion with `null` must remain compatible with the chosen index definition.

**Mongo/test assessment:** I found no standalone defect in the `$or`/`$lt` claim expression, dotted `$set`, or supplied user `_id`. The installed Mongoose schema preserves those filters/updates and retains the supplied ID. Mongo supports [dotted `$set`](https://www.mongodb.com/docs/manual/reference/operator/update/set/); its [`$lt` comparison is type-sensitive](https://www.mongodb.com/docs/manual/reference/operator/query/lt/), unlike the test store’s date coercion. These checks did **not** exercise a real Mongo server.

**Verification:** 230 focused server tests passed. Additional read-only synthetic probes reproduced the failures noted above. Missing coverage includes actual concurrent conversion calls/lease takeover, the real account-creation helper, conversion versus attendance/student writers, late-plan reconciliation, scoped history/resume, and consent archive guards. I did not run `npm run verify` because its synchronization/build steps write files, contrary to this review’s read-only scope.