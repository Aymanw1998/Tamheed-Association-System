# Administrator powers, hidden IT users and passkeys in System — design

Status: draft for the owner's approval, 2026-11-04.

Changes `2026-11-03-it-site-design.md`. Where the two disagree, this document
wins; update that document's table and notes when this is built.

## Intent

The system is new and must be easy to run. Today every small access change
goes through IT. The owner wants administrators to run the staff themselves
for now: one administrator is in practice responsible for adding staff and
approving people who register alone.

The owner also wants IT users with no everyday role to work inside System with
full power and stay unseen: other users see their actions as done by
«النظام». Their sign-in there must be stronger than a password alone.

## Goals

1. Every administrator adds administrators, guides and assistants, and approves
   self-registered users into any of those roles.
2. Every administrator changes the permissions of users ranked below them.
3. An IT user with no everyday role works in System with every everyday
   permission, unseen, acting as «النظام».
4. The real person behind each such action stays in the audit log on the IT
   site.
5. System offers passkey sign-in; a hidden IT user otherwise needs password
   plus email code.
6. IT can switch the new administrator powers off.

## Non-goals

- A username. The ID number remains the sign-in name.
- A separate PIN for the site. The device's own lock covers this.
- A native store app.
- Changing Sport.

## Anti-goals (a failure even if it works)

- An administrator touches another administrator's existing account, an IT user
  or 000000000, or gives an IT key.
- An everyday user can discover a hidden IT user: name, ID number, list row,
  alert text, lock holder, or an error that differs because of them.
- An action by a hidden IT user reaches the audit log without the real person.
- An IT email code opens System or a System code opens the IT site.
- A wrong password reveals whether the account is IT.

## Part A: administrator powers (owner's answers)

Applies to every administrator, while the switch is on.

| Action | Rule |
|---|---|
| Create a user as ادارة / مرشد / مساعد | Allowed |
| Approve a waiting user into any of the three roles | Allowed |
| Promote an existing lower-ranked user to ادارة | Allowed (Claude's call) |
| Disable, delete, reset password or demote another ادارة | No: IT site only |
| Change permissions of a lower-ranked user | Allowed, only keys the administrator holds, plus `sports.*` |
| Change own permissions | No |
| Touch an IT user, 000000000 or an IT key | No |

`sports.*` is an explicit exception: the owner wants administrators to give it,
but it is grant-only, so administrators do not hold it by default.

Adding a user:

- Required: first and last name, ID number, phone, role, temporary password.
- Email is optional. The form notes that without one, "forgot password" cannot
  reach the person and an administrator must reset it.
- A created user gets `mustChangePassword: true`. The server flag and
  `ForcedPasswordChange` already exist.

Self-registration stays open and grants nothing until approved. A rejected
request is deleted, so the person may register again.

Request alerts: the IT site marks which users receive `user_waiting`. If nobody
is marked, every holder of `users.approve` receives it, so no request is lost.
Marking a user never changes who may approve.

On the IT site:

- A switch turns Part A off; the rules then return to today's. Stored like the
  other IT settings.
- Adding an administrator or changing permissions writes the audit log and
  alerts IT.

The permissions editor is added to the System user page. The editable keys come
from the server (`grantable`), not the client.

## Part B: hidden IT users

A hidden IT user is one with `isIT`, no `itBlockedAt` and no everyday role.
000000000 follows the same sign-in and audit rules. The state is computed on
each request, so gaining a role ends it at once and the person appears by name
from then on. Records made while hidden stay as «النظام».

A blocked IT user with no role is refused sign-in to System.

Behaviour in System:

- Holds every everyday key, including `sports.*`. IT keys stay on the IT site.
- May work on administrators. Same limits on IT users as today.
- Stored actor fields and displays read `system` / «النظام»
  (`actorRef`, `actorDisplayName`).
- Missing from every everyday user list, picker and profile lookup (as the
  system account is via `isSystemUser`); cannot be a lesson's guide or helper.
- On the IT site they stay fully visible and manageable as today.
- `system_login_failures` alerts stay for 000000000 only.
- Gets the site switch button both ways. Going to IT still asks the email code;
  coming from IT does not. `hasBothSides` in `sitePass.js` and `showIt` in
  `Header.jsx` change accordingly.

Audit: `audit.record` keeps `actor: "system"` and adds the real ID number and
name in separate fields. Only the IT site's audit API returns them, and its
screen shows and searches them.

## Part C: sign-in to System

Passkey: offered to every System user (owner: «תתן את ה-System גם passkey»).
Registered while signed in, used from the login page. Stored apart from
`itPasskeys`, with its own site (new `SYSTEM_HOST` environment value). Reuse
`It.passkey.js` / `SportPortal.passkey.js` patterns. A passkey is a full
sign-in, including for a hidden IT user.

Password sign-in for a hidden IT user or 000000000:

1. ID number and password, with the same refusal as anyone on a wrong password.
2. Only after a correct password: a code to their email (000000000: the system
   mailbox), then a screen for the code.
3. A forced password change comes before the session, as today.

No real email means no code: the person is told to use a passkey. Codes carry a
purpose so IT and System codes never cross. Rate limits and lockout as on IT.

Everyone else keeps ID number and password.

## Left to the builder

- Whether hidden IT is `actor.isSystem` or a new flag. `isSystem` is read in
  about 47 places, some of which must stay 000000000-only (`isSystemTz`,
  recovery, failure alerts). Check each one.
- A sweep for leaks: locks, notifications, alert text, file storage folders,
  live presence, exports and assistant tools. Skip creating a storage folder
  for a hidden user if it would show their name.
- How the administrator's new permission key survives a stored `ادارة`
  role-default override that predates it.

## Verification

Behavioural server tests for every rule and anti-goal above, written first;
client tests for the forms, the editor and the code step; `npm run verify`.
Tests stay isolated from real data.

Not provable locally: real passkeys, email delivery, and moving between
installed apps on a phone. Those need a check on the server after deployment,
which also needs `SYSTEM_HOST` (`deploy/DEPLOY.md`).

Codex review is requested on implementation and stays pending until it answers.
