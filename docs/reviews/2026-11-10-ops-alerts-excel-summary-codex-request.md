# Independent Codex review request: server-down alerts, Excel export, monthly summary, attendance grace (2026-11-10)

Actual Claude Code is the sole implementer. You are the independent Codex
reviewer. Review only the uncommitted working-tree changes (`git diff` plus the
untracked new files). Do not edit files, run seed/migration/admin/data-clearing
commands, touch `.env`, or start another reviewer. The repository is public;
this request contains no credentials or real records.

## Owner request (2026-11-10)

1. Be told when the server goes down. The address lives in `.env`
   (`OPS_ALERT_EMAIL`), never in the repository. No new backup work: there is
   already `deploy/mongo-backup.sh`.
2. Export to Excel. Default rule: whoever sees the data may export what he
   sees, nothing more.
3. A monthly summary email to management (role «ادارة»).
4. A reminder to the guide 30 minutes after a lesson ends without attendance.

## What was built

- **`server/services/opsAlerts.js` (new):**
  - Crash note: the crash handlers in `server.js` write a note to a file;
    the next start emails it once.
  - Database watchdog: mongoose `disconnected` for more than 2 minutes
    sends an email, and the return sends another.
  - Throttle: at most one email per kind per 30 minutes, kept in a file so
    that a restart loop does not flood the inbox.
  - `/api/health` answers 503 while the database is down.
  - `deploy/DEPLOY.md` explains the UptimeRobot setup.
- **`GET /api/attendance/export?lessonId&from&to` (`attendance.view`):**
  - Only for a lesson that `mayOpenLesson` allows.
  - Student rows are cut to `visibleStudentIds`.
  - Names only, no ID numbers.
  - At most 366 days.
- **System Excel export:**
  - `utils/excelExport.js` uses `exceljs@4.4.0`, loaded only when a file is
    made, in its own chunk; the main bundle grows by 5 B.
  - The lesson page has «تصدير الحضور إلى Excel», which opens a window
    with a period and gives a detail sheet plus a per-person summary.
  - The students list and the sport players list each have «تصدير Excel»,
    which exports the rows as filtered on screen.
- **`server/services/monthlySummaryJob.js` (new):**
  - From 08:00 on the 1st, Israel time; checked hourly; one JobRuns row per
    month. The first month summarised is 11/2026.
  - Contents: attendance per program, students with 3 or more absences,
    and meetings with only automatic absences (attendance never taken).
  - Sent as right-to-left HTML to active non-hidden admins with a real email.
- **`alertJob`:**
  - `lesson_no_attendance` waits `ATTENDANCE_GRACE_MIN` (30) minutes after
    the lesson ends.
  - A lesson whose only participants are staff now counts too.

## Verification

- Server: 1,654 tests pass.
- System: 1,208 tests (141 suites) pass, and the CI build passes.
- `git diff --check` passes.
- A real exceljs round trip (write, then read back) keeps the Arabic text
  and the right-to-left layout.

## Look for

- Whether the monthly email to admins' mailboxes may carry students' names
  (minors). This is the writer's call: names of students with 3 or more
  absences only.
- Crash-note file location (`OPS_STATE_DIR`, default: the OS temp dir) and
  what the error message may contain.
- Export scope: user rows are always included for a lesson the actor can
  open. Former users' names are read from `UsersNoActive`.
- Excel formula injection: cells that start with `=`, `+`, `-` or `@` in
  names or notes.

State explicitly if you have no findings. A request is not approval.
