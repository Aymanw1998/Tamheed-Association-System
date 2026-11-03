# IT site (it.tamheed-ramla.org) — design

Status: draft for the owner's approval, 2026-11-03.

## Intent

Today one hidden account, the system account (`SYSTEM_ADMIN_TZ`, 000000000),
is stored as an administrator and does everything sensitive from inside the
everyday app: it hands out permissions, sees passwords, reads the audit log,
connects Google Drive. The owner wants the people who run the system (IT,
developers) to be a group of their own, above everyone, working from a site
of their own, while 000000000 becomes a secret emergency account that is
rarely opened.

The owner's words, summarised:

- IT is a layer on top of the everyday role, not a fourth role. A user has at
  most one everyday role (ادارة / مرشد / مساعد) and may also be IT; an IT
  user may also have no everyday role at all.
- Several IT users may change the roles and permissions of every everyday
  user. No IT user may touch another IT user.
- Only 000000000 adds, removes or blocks IT users. It is the "father of
  everyone", secret, used only for that and for emergencies. Its role is IT
  from the start (no longer ادارة).
- Administrators no longer change permissions at all.

## Goals

1. A separate site at `it.tamheed-ramla.org`, in `apps/it`, served by the same
   server and database (like the sport site), where IT users do every
   sensitive action.
2. An IT membership flag, independent of the everyday role, enforced by the
   server.
3. 000000000 as the only account that manages IT users, with an alert on
   every sign-in.
4. The everyday app keeps only what administrators should do.
5. Profile photos in every list of students and users (everyday app and IT
   site), on desktop and phone.

## Non-goals

- No second server process and no second database (decided: one server,
  one database; the in-memory state and scheduled jobs assume one process).
- No server control (files, commands) and no own file storage in this
  project. Those are later, separate projects (`file.`, `storage.`), and
  would use existing tools (e.g. Cockpit, code-server, File Browser) rather
  than our code.
- No passkey / fingerprint / face sign-in in this project. The owner wants
  it for the everyday app, like the sport site has; it is the next project,
  after this one.
- No self-registration on the IT site.

## Anti-goals (a failure even if it works)

- An IT user can change, reset, block or demote another IT user.
- Signing in to the everyday app opens the IT site, or the reverse.
- The IT site is the only check: the server must refuse an IT action that
  does not come from a signed-in IT user, whatever the address it came from.
- An administrator can still reach a sensitive action through the everyday
  app's API.
- The system ends up with nobody able to manage IT and no way back other
  than editing the database by hand.

## Who may do what (decided by the owner)

| Action | ادارة (everyday app) | IT (IT site) | 000000000 (IT site) |
|---|:-:|:-:|:-:|
| Add / edit / view students, lessons, attendance, reports, vehicles, files, notices, users (as today) | yes | — | — |
| See every user's files (`files.manageAll`, as today) | yes | — | — |
| Change the role of a user of lower rank (مرشد ↔ مساعد) | yes, by default | any everyday user | — |
| Reset (set a new) password of a user of lower rank | yes, by default | any everyday user | — |
| Change permissions (grants / revokes) | no, never | any everyday user | — |
| See whether a user has a password (never its value; owner, 2026-11-03: «להשאיר ככה») | no | yes | — |
| Unlock a locked user | no | yes | — |
| Audit log | no | yes | — |
| Connect / change the Google Drive account | no | yes | yes |
| Add / remove / block IT users | no | no | yes |
| Set each role's default permissions («صلاحيات الأدوار», owner 2026-11-03; never an IT key or a grant-only module) | no | yes | yes |
| Disable / re-enable / approve / delete an everyday user (owner, 2026-11-03) | yes (as today, lower rank) | any everyday user | — |

000000000 does everything IT does, on any user, and in addition manages the
IT users (owner, 2026-11-03: «האב של IT מלבד שמנהל IT גם עושה הכל»). The
"—" cells of the 000000000 column above mean "yes, as IT".

Calls made while writing (the owner may correct them while reading):

- Block stops only the IT site sign-in; remove takes the user out of IT. The
  everyday account is unchanged by either.
- 000000000's email code goes to `SYSTEM_ADMIN_EMAIL`. When 000000000 marks a
  user as IT it also checks that user has a real email (not the model's
  `test@test.com` default); without one the user cannot be made IT.
- Force-releasing a stuck lock and the push settings go to a «الإعدادات»
  screen on the IT site. A forgotten lock still frees itself after its short
  lifetime, as today.
- IT may view a user's signed-in devices and sign any of them out.
- Profile photos: the everyday app's lists and the IT site's lists; not the
  sport site.

Notes:

- "IT does X" means on the IT site only. In the everyday app an IT user works
  by his everyday role; with no everyday role he sees nothing there.
- An IT user may give himself an everyday role (and change or remove it).
- An IT user is protected from administrators too (owner, 2026-11-03): in
  the everyday app an administrator may still work with him through students,
  lessons and reports (make him a student's responsible guide, put him on a
  lesson, edit a report of his), but never touch his account: no edit of his
  details or email, no password reset, no role change, no room move, no
  delete. Only 000000000 does those, on the IT site.
- Rank rules for administrators stay as today: never oneself, never another
  administrator, never upward to ادارة.
- Today's dangerous keys (`server/utils/permissions.js` `DANGEROUS_KEYS`) are
  what moves to IT: `permissions.manage`, `users.passwords`, `users.unlock`,
  `audit.view`, `storage.drive`, `systemRecovery.reset`. `users.changeRole`
  stops being dangerous and joins the ادارة defaults.
- `users.passwords` today covers both setting another user's password and
  viewing it (`User.controller.js` putU and `viewPassword`). It splits:
  setting a password of a lower-rank user becomes an ادارة default; viewing
  stays IT only.
- Other places that use `permissions.manage` today (force-releasing a lock,
  `Lock.route.js`; push settings, `Push.route.js`) become IT actions.

## Sign-in

- No sign-up on the IT site. IT users exist only because 000000000 marked an
  existing user as IT; 000000000 itself is created by the server at start
  from `SYSTEM_ADMIN_TZ` / `SYSTEM_ADMIN_PASSWORD`, as today
  (`scripts/ensureSystemAdmin.js`), but stored with no everyday role and as IT.
- Sign-in: ID number and the same password as in the everyday app, then a
  one-time code sent to the user's email (the server already sends email:
  `utils/sendEmail.js`, `utils/otp.js`). An IT user without a usable email
  cannot sign in to the IT site.
- The IT session is separate from the everyday one: its own secret
  (`IT_SESSION_SECRET`) and its own cookie/token, valid only on `IT_HOST`.
  Signing in to one never signs in to the other.
- Every 000000000 sign-in (successful, not only failed) sends an alert to
  `SYSTEM_ADMIN_EMAIL` and is recorded in the audit log.
- Recovery when nobody can sign in as 000000000 stays on the server only
  (`scripts/systemRecover.js`, already there).
- One password for both sites (owner, 2026-11-03): no separate IT password;
  the email code is the IT site's extra protection.

### Moving between the sites (owner, 2026-11-03)

- A user who is IT and has an everyday role sees a button in each site that
  opens the other one already signed in, without typing the ID number and
  password again: «النظام» on the IT site opens the everyday app; on the
  everyday app the button «قسم الIT» opens the IT site. A user
  without the other side (not IT, or IT with no everyday role) sees no
  button.
- The password never travels between the sites. The server issues a
  one-time pass for the signed-in user: random, valid 60 seconds, usable
  once, bound to that user and to the direction. The other site exchanges it
  with the server for its own session; the two sessions stay separate.
- Everyday → IT: the pass replaces the password step only; the email code is
  still asked (a stolen everyday session must not open the IT site).
- IT → everyday: the pass is enough; no code.
- The pass is handed over outside the address's query string (e.g. the URL
  fragment, then removed from the address bar), so it is not written to
  server or proxy logs.

## Screens of the IT site

1. Sign-in: ID number + password, then the email code.
2. Users: every user in every room (active, waiting, inactive), with search
   and a «فلتر» window like the everyday app, and the profile photo.
3. User page: everyday role and changing it; permissions and editing them
   (today's permissions screen moves here); reset password, view password;
   unlock; the user's signed-in devices.
4. IT users: shown only to 000000000; add (mark an existing user as IT),
   remove, block.
5. Audit log: today's screen moves here. Actions are recorded under the real
   person's name (IT users are named; only 000000000 shows as «النظام»).
6. Storage: today's Google Drive connection (the «معلومات التخزين» window's
   Drive card) moves here.
7. Settings («الإعدادات»): force-release a stuck lock; push notification
   settings.

The everyday app loses: the permissions editor, the audit log, view
password, unlock, and the Drive card. It keeps role change and password
reset for administrators (lower rank only).

## Profile photos in lists

- Every list of students and of users, in the everyday app and the IT site,
  shows a small round photo beside the name, on desktop and phone.
- No photo: a circle with the name's first letter.
- Photos load only when the row is on screen (lazy), so a long list does not
  fetch every photo from Drive at once.
- This part does not depend on IT and may be built first, on its own.

## Constraints

- One server (`server/`), one database. The IT site is a build served by the
  server for `IT_HOST`, the same way `utils/sportHost.js` serves the sport
  site for `SPORT_HOST`. New env: `IT_HOST`, `IT_SESSION_SECRET`.
- Sensitive routes check on the server: the request carries a valid IT
  session, the user is IT and not blocked, and the request came for
  `IT_HOST`.
- The repository is public: no secrets, no real ID numbers or passwords in
  code, tests, docs or the review log.
- Folder: `apps/it` (the owner chose `apps/system`, `apps/sport`, `apps/it`).
- Deploy keeps working with `bash deploy/update.sh` (it must also build
  `apps/it`), plus a DNS record, an nginx server block and a certificate for
  `it.` (documented in `deploy/DEPLOY.md`, like the sport site).
- UI text is Arabic, like the other sites.
- Existing data: today the system account may have granted dangerous keys to
  some users. Those grants must not silently keep working in the everyday
  app after the change (see "Left to the builder" for how).

## Left to the builder

- The data shape of the IT flag and of "blocked IT user", and how
  `effectivePermissions` / `req.actor` learn about IT.
- How the server tells an IT request from an everyday one (host check,
  session check), as long as both are enforced server-side.
- The email code's length, lifetime and retry limits, and the IT session's
  lifetime (reasonable defaults, at most as long as today's everyday ones).
- The IT site's stack: follow `apps/sport` (React) unless there is a reason
  not to; share code with `apps/system` only where it is cheap.
- The migration of existing users who hold dangerous grants (drop them, or
  list them for 000000000 to decide), and of 000000000's stored role.
- The order of the work, as long as each step ships working on its own.
