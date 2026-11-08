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
| Students | `students.view`, `viewAll`, `create`, `edit`, `delete`, `photo`, `parentLink`; existing student scope stays enforced |
| Programs / weekly timetable | Program records use `lessons.view`, `viewAll`, `create`, `edit`, `roster`, `delete`, `copyMonth`; the weekly timetable additionally needs `calendar.view` on its page and schedule endpoints. Ownership, scoped roster and record locks stay enforced |
| Attendance | `attendance.view`, `attendance.record`; existing group/lesson scope stays enforced |
| Reports | `reports.create`, `editOwn`, `viewAll`, `editAll`, `delete`, `exportPdf`; author/record checks stay enforced |
| Vehicles | `vehicles.view`, `edit`, `compliance`, `documents`, `archive`, `delete`; vehicle assignment and record locks stay enforced |
| Staff | `users.view`, `create`, `edit`, `approve`, `delete`, `changeRole`, `resetPassword`; hierarchy/IT protections stay enforced |
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
