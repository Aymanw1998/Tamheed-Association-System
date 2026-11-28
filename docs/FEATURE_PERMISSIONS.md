# Grantable business sections and actions

The owner requires business sections and operations to be grantable/revocable.
`shared/permissions.json` is the catalog for System, IT and the server. Names
alone do not implement authorization: every operation needs its server guard,
its UI gate, record scope checks and a behavioral grant/revoke test.

| Section | Permissions and remaining record restrictions |
| --- | --- |
| Association rules | `rules.view`, `rules.edit` (edit and publish a new version) |
| Parent signatures | `consents.view`, `consents.edit`, `consents.link`; also `students.view` and the same student scope as the student page |
| Registration link | `students.parentLink`; does not grant rules editing or signature access |
| Weekly tasks | `tasks.view`, `tasks.complete`, `tasks.viewAll`, `tasks.manage`, `tasks.create`, `tasks.edit`, `tasks.delete`, `tasks.assign`, `tasks.approve`, `tasks.greet` |
| Files | `files.use` to enter/read; separate `upload`, `createFolder`, `rename`, `delete`, `share`; per-path and sharing ACL remain additional requirements; `manageAll` does not bypass a revoked global operation |
| Main page | `dashboard.view`; each data card additionally checks its own section permission |
| Notices | `notices.view`, `notices.post`, `notices.archive`, `notices.runCheck`, `notices.delete` (to trash; purged automatically after 30 days), `notices.restore`, `notices.purge` (permanent delete from trash) |
| Students | `students.view`, `viewAll`, `create`, `edit`, `delete` (to the recycle bin), `purge` (permanent delete from the bin), `photo`, `parentLink`, `exportExcel` (with `viewAll`), `makeStaff` («تحويل طالب إلى الطاقم», with `users.create`; admin default; the student archived, recorded in the audit log, no change without the row; a student with the ID number of existing active staff is linked to that account, role and details unchanged, only when the actor may give that role; the window first reads `GET /api/students/:id/make-staff` with the same keys and scope); existing student scope stays enforced. «طلاب سابقون» (archived) only with `viewAll` |
| Programs / weekly timetable | Program records use `lessons.view`, `viewAll`, `create`, `edit`, `roster`, `staffRoster` (users as participants), `delete`, `copyMonth` (the month summary to Excel and its `exportExcel` key were removed, owner 2026-11-20; a stored grant of it grants nothing and can be cleared); the weekly timetable additionally needs `calendar.view` on its page and schedule endpoints. Ownership, scoped roster and record locks stay enforced |
| Wall display screens | `displays.manage` (list, create, rename, change layout, new link, delete; nobody's role default, granted in IT). The TV reads `POST /api/displays/feed` with no sign-in: the link secret is a capability (only its SHA-256 is stored), rate-limited, `no-store`, and returns only lesson name, day, times, room and guide name |
| Nasheed site (owner, 2026-11-27) | `nasheeds.manage` (add, edit, delete, undo, build a list for the PDF; grant-only: never in a role default, given to one person in the permissions screen; also opens «سلة المحذوفات» for nasheeds, restore and delete for good). On `NASHEED_HOST` only, with its own session (`nasheed_session`, ID number and password, no email code; never the system account). Guests read without signing in: `GET /api/nasheed/public` and `/public/:id` send only title, lines and updatedAt, rate-limited, `no-store`, `X-Robots-Tag: noindex` |
| Attendance | `attendance.view`, `attendance.record`, `attendance.exportExcel` (a program's attendance to Excel, with `view`; recorded in the audit log, no file without the row); existing group/lesson scope stays enforced. Defaults: admin and guide (module key), assistant (kept the export it had). An assistant who is «المسؤول» of a program records its attendance without `attendance.record` (with `view`; a revoke of `attendance.record` or `attendance` stops it) |
| Reports | `reports.create`, `editOwn`, `viewAll`, `editAll`, `delete`, `exportPdf`; author/record checks stay enforced |
| Vehicles | `vehicles.view`, `edit`, `compliance`, `documents`, `delete` (to the recycle bin), `purge` (permanent delete from the bin); vehicle assignment and record locks stay enforced |
| Staff | `users.view`, `create`, `edit`, `approve`, `delete` (to the recycle bin), `purge` (permanent delete from the bin), `changeRole`, `resetPassword`, `exportExcel` (with `view`); hierarchy/IT protections stay enforced |
| Sports staff | `sports.view`, `sports.coach`, `sports.manage`; sports portal students retain their separate self-only session |
| AI assistant | `ai.use`; proposed actions still recheck their underlying business operation permissions |
| IT administration | Existing IT-only gates, account membership/host checks and catalog keys remain; everyday roles cannot grant themselves IT powers |

Weekly-task management needs `tasks.manage` plus the specific create/edit/
delete/assign/greet permission. Its editor also needs `tasks.viewAll` to load
the board. Board readers can approve only with `tasks.approve`. Personal
completion still checks group ownership, helper assignment and the current week.
Revoking personal task visibility also hides task reminders in the current inbox
and live feed. Task assignment/history is retained when access is revoked.

Built-in role defaults retain previous behavior: management has the new rules,
signature and management operations; guides/helpers keep personal task reading
and completion plus their existing file operations within permitted folders.
Explicit custom role defaults and saved user grants/revokes are not migrated
or broadened. New keys in custom sets must be granted deliberately through IT.
An old explicit `students.parentLink` grant no longer includes rules/signature
administration, and `tasks.manage` alone no longer grants all task operations.

Public parent registration/signing uses scoped token capabilities and consent
validation, not employee permissions. Personal authentication, logout, password,
session management, own alert read-status, push subscription, help and edit-lock
infrastructure retain their explicit self-only/security guards. They are listed
exceptions in the route audit, not unguarded business operations. Existing
time-limited file/share capabilities keep their separate expiry/access checks.
External Google-account permissions remain controlled by Google Drive.

Unknown authenticated frontend business sections fail closed. Add a route rule
before exposing a section. The server route audit checks every non-exempt route
for an actor/permission guard and checks literal guards against the catalog.
New public/self-only exceptions require an explicit security rationale.

No data migration or deployment is performed by these source changes. After
deploying, System and IT show the same generated catalog. Verify with
`npm run verify` and the IT tests/build. See `AI_REVIEW_LOG.md` for actual results
and independent peer-review availability.
