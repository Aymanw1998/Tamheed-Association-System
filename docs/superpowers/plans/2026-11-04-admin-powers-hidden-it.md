# Administrator powers, hidden IT and System passkeys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Administrators run the staff themselves, IT users with no role work unseen in System as «النظام», and System gets passkey sign-in.

**Architecture:** One switchable rule set in `permissionRules.js`. Hidden IT is computed per request in `loadActor` and reuses the system account's existing «النظام» handling, with the real person added to the audit row. New System sign-in pieces follow `It.auth.js` and `It.passkey.js`.

**Tech Stack:** Node/Express, MongoDB through `Entities/api`, `node --test`; React (react-scripts) with Jest; `@simplewebauthn/server` 13.3.3 and `@simplewebauthn/browser` 13.3.0.

**Spec:** `docs/superpowers/specs/2026-11-04-admin-powers-hidden-it-design.md`

## Global Constraints

- Every server rule is enforced on the server; client checks are only for display.
- IT keys (`IT_KEYS`) never reach an everyday actor.
- No test touches a real database, email or external service. No seed, migration or clearing commands.
- All new visible text goes through the app's Arabic strings and follows `docs/arabic-style-guide.md`; System also needs its he/en entries where `i18n` requires them.
- No secrets, test passwords or staff names in the repo: it is public.
- The owner commits on request. Do not commit during tasks; propose a message at each part's end, with no Claude co-author line.
- Regression command: `npm run verify`. Also run `npm test --prefix apps/it` and `npm test --prefix apps/sport` when those change.

## Review Focus

- An IT user gets a role during a session: the next request acts under their own name, and they appear in lists.
- The switch goes off while permissions an administrator gave are in place: those stay; only further changes are refused.
- A hidden IT user with no real email and no passkey: a clear message, no session, no account lock.
- An assistant answer or search by a hidden user's ID number or name finds nothing.
- 000000000 signing in to System with email not configured: a clear refusal, and the IT site's existing recovery path is unchanged.

---

### Task 1: Administrator rules and the switch on the server

**Files:**
- Modify: `server/utils/permissionRules.js`, `server/Entities/User/User.controller.js`, `server/Entities/User/User.route.js`, `server/Entities/User/Auth.route.js`, `server/Entities/It/It.route.js`, `server/server.js`
- Create: `server/Entities/It/ItSetting.model.js`, `server/Entities/It/AdminPowers.controller.js`
- Test: `server/test/admin-powers.test.js`

**Interfaces:**
- Produces: `setAdminPowers(on: boolean)`, `adminPowersOn(): boolean` (default `true`), `isAdminWithPowers(actor): boolean` in `permissionRules.js`; `GET|PUT /api/it/admin-powers` body/answer `{ enabled: boolean }` under `requireIt` + `permissions.manage`; `adminPowers: boolean` in the System login and `/me` answers; `GET|PUT /api/user/:tz/permissions` for administrators.

No new permission key: the gate is the role `ادارة` plus the switch. This settles the spec's open point about stored role-default overrides.

- [ ] **Step 1: Write failing tests in `admin-powers.test.js`**

Assert, with the switch on, an `ادارة` actor holding default keys:
`canAssignRole(admin, {}, "ادارة") === true`; `canAssignRole(admin, {role:"مرشد"}, "ادارة") === true`; `canAssignRole(admin, {role:"ادارة",tz:"2"}, "مرشد") === false`; `canManageTarget(admin, {role:"ادارة",tz:"2"}) === false`.
`validatePermissionChange(admin, guide, {grants:["vehicles.edit"]}).ok === true`; `{grants:["sports.coach"]}` ok; `{grants:["finance.view"]}` code `NOT_GRANTABLE`; `{grants:["audit.view"]}` code `NOT_GRANTABLE`; an administrator with `vehicles.edit` revoked gets `NOT_GRANTABLE` for it; target `ادارة`, an IT user, or self are refused.
A `مرشد` actor with `users.create` still gets `canAssignRole(guide, {}, "ادارة") === false`.
With `setAdminPowers(false)`: `canAssignRole(admin, {}, "ادارة") === false` and every `validatePermissionChange` by an administrator is `FORBIDDEN`; stored grants on a guide still count in `effectivePermissions`.
HTTP: `POST /api/user` with `role:"ادارة"` by an administrator gives 201 and stores `mustChangePassword: true`; missing first name, last name, phone or role gives 400 `MISSING_FIELDS`; no email is accepted. Approving a waiting user as `ادارة` succeeds. Deleting from the waiting room succeeds, and registering again with that ID number succeeds. Follow `user-permissions-api.test.js` for the harness.

- [ ] **Step 2: Run to confirm failure**

Run: `cd server && node --test test/admin-powers.test.js`
Expected: FAIL (`setAdminPowers` is not a function).

- [ ] **Step 3: Implement the rules**

In `permissionRules.js`: `isAdminWithPowers(actor)` is `adminPowersOn() && !isItActor(actor) && resolveRole(actor) === "ادارة"`. `canAssignRole` permits an equal rank only for `ادارة` on such an actor. `grantableBy(actor)` returns held keys minus `IT_KEYS`, plus every `sports.*` leaf, for such an actor. `validatePermissionChange` lets such an actor pass the `isItActor` gate, keeping the self and `canManageTarget` refusals.

- [ ] **Step 4: Implement storage, routes and creation fields**

`ItSetting.model.js` follows `RoleDefaults.model.js`: collection `ItSettings`, one row per `key`. `AdminPowers.controller.js` follows `RoleDefaults.controller.js`: loads at start, saves, audits `admin_powers_change`. In `User.route.js` add both permissions routes behind a `requireAdminPowers` guard answering 403 when `isAdminWithPowers(req.actor)` is false. In `postU` require the four fields for `MISSING_FIELDS` and set `mustChangePassword: true`. Update any existing test that creates users without these fields.

- [ ] **Step 5: Run to confirm passing**

Run: `npm test --prefix server`
Expected: all pass, with no change to existing rule tests other than those asserting the old administrator limits.

### Task 2: Request alerts and alerting IT

**Files:**
- Modify: `server/services/alertEvents.js`, `server/services/alertEngine.js`, `server/services/alertTemplates.js`, `server/services/alertAccess.js`, `server/Entities/User/User.model.js`, `server/Entities/User/User.controller.js`, `server/Entities/It/It.route.js`
- Test: `server/test/request-alerts.test.js`

**Interfaces:**
- Consumes: `isAdminWithPowers` from Task 1.
- Produces: user field `receivesRequestAlerts: boolean`, in `SERVER_OWNED_FIELDS`; `PUT /api/it/users/:tz/request-alerts` `{ enabled }`; rule selector `{ requestAlerts: true }`; alert event `adminAdded(user, { actorTz })`.

- [ ] **Step 1: Write failing tests**

`userWaiting` goes only to marked users holding `users.approve`; with none marked, to every `users.approve` holder; a marked user without `users.approve` does not count as marked; marking grants no approval right. Creating, approving or promoting to `ادارة` raises `admin_added` for `{ it: true }`; a `PUT /api/user/:tz` body with `receivesRequestAlerts` stores nothing.

- [ ] **Step 2: Run to confirm failure**

Run: `cd server && node --test test/request-alerts.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add the selector and the fallback in `userWaiting`; add the `admin_added` template in ar, he and en and its `alertAccess` entry (IT or system); raise it from `postU`, `changeRoom` and `putRole` when the new role is `ادارة`.

- [ ] **Step 4: Run to confirm passing**

Run: `npm test --prefix server`
Expected: all pass.

### Task 3: System screens for administrators

**Files:**
- Create: `apps/system/src/Components/User/PermissionsEditor.jsx`, `apps/system/src/Components/User/permissionTree.js` (from `apps/it/src/ui/`, using `/api/user`)
- Modify: `apps/system/src/Components/User/UserView.jsx`, `EditUser.jsx`, `RolePickerDialog.jsx`, `apps/system/src/utils/roles.js`, `utils/session.js`, `apps/system/src/WebServer/services/auth/fuctionsAuth.jsx`, `i18n` strings
- Test: `apps/system/src/Components/User/PermissionsEditor.test.js`, `apps/system/src/utils/roles.test.js`

**Interfaces:**
- Consumes: `adminPowers` from login and `/me`; `GET|PUT /api/user/:tz/permissions`.
- Produces: `assignableRoles({ role, isSystem, adminPowers })`.

- [ ] **Step 1: Write failing tests**

`assignableRoles({role:"ادارة",adminPowers:true})` includes `ادارة`; with `adminPowers:false` it does not. The editor disables keys missing from `grantable`, and is absent from the user page when `grantable` is empty. The add form blocks on an empty phone or role, allows an empty email, and shows the note that "forgot password" needs an email.

- [ ] **Step 2: Run to confirm failure**

Run: `cd apps/system && CI=true npx react-scripts test --watchAll=false PermissionsEditor roles`
Expected: FAIL.

- [ ] **Step 3: Implement, keeping the existing `PermissionsTab.module.css` styles**

- [ ] **Step 4: Run to confirm passing**

Run: `npm run test --prefix apps/system`
Expected: all pass.

Part A ends here. Propose: `Administrators add administrators and change permissions below them, with an IT switch`.

### Task 4: Hidden IT actor and the real person in the audit log

**Files:**
- Modify: `server/utils/permissions.js`, `server/middleware/permissionMiddleware.js`, `server/services/alertAccess.js`, `server/Entities/User/User.controller.js`, `server/Entities/Audit/Audit.route.js`, `server/Entities/Audit/Audit.model.js`
- Modify: `apps/it/src/screens/Audit.jsx`
- Test: `server/test/hidden-it.test.js`, `apps/it/src/screens/Audit.test.js`

**Interfaces:**
- Produces: `isHiddenIt(user): boolean` (`isIT`, no `itBlockedAt`, no everyday role, not the system tz) and `isHiddenUser(user): boolean` (system tz or `isHiddenIt`) in `permissions.js`; `req.actor.isSystem === true` and `req.actor.hidden === true` for a hidden IT user in System; audit fields `realActor`, `realActorName`.

`actor.isSystem` is reused so the existing «النظام» code applies. These must keep using the real 000000000 test (`isSystemTz(actor.tz)`) instead: `isLocked` in `loadActor`, `system_login_failures` in `alertAccess.js`, and the recovery code near `User.controller.js:1873`. `requireIt` computes its own actor and is unchanged.

- [ ] **Step 1: Write failing tests**

`loadActor` for `{isIT:true,role:null}` gives `isSystem:true`, `hidden:true`, every non-IT key, and no IT key. The same user with a role, or with `itBlockedAt`, is not hidden. A locked hidden user gets 423. `canSeeAlertType(hiddenActor, "system_login_failures") === false`. A report and a notice they create store `system` / «النظام». `audit.record` stores `actor:"system"`, `actorName:"النظام"`, `realActor:<tz>`, `realActorName:<name>`; 000000000 stores `realActor` too; a normal actor stores neither. The IT audit API returns and searches the real fields. The IT audit screen shows them.

- [ ] **Step 2: Run to confirm failure**

Run: `cd server && node --test test/hidden-it.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement as in Interfaces; the audit identity is built at `permissionMiddleware.js:103`**

- [ ] **Step 4: Run to confirm passing**

Run: `npm test --prefix server && npm test --prefix apps/it`
Expected: all pass.

### Task 5: Hide them everywhere in System

**Files:**
- Modify: `server/Entities/User/User.controller.js`, `Lesson/Lesson.controller.js`, `Notice/Notice.service.js`, `Storage/Storage.controller.js`, `Student/Student.controller.js`, `Vehicle/Vehicle.controller.js`, `Attendance/Attendance.controller.js`, `server/routes/tours.routes.js`, `server/utils/guideContact.js`, `server/services/storageRecipients.js`, `server/services/assistant/toolRegistry.js`, `server/services/assistant/actionRunner.js`, `server/services/assistant/tools/navigate.js`, `pending_items.js`, `apps/system/src/Components/Header/Header.jsx`, `server/Entities/It/sitePass.js`, `apps/it/src/App.jsx`
- Test: `server/test/hidden-it-sweep.test.js`, `server/test/site-pass.test.js`, `apps/system/src/Components/Header/Header.test.js`, `apps/it/src/App.test.js`

**Interfaces:**
- Consumes: `isHiddenUser`.
- Produces: in `User.controller.js`, `hiddenFrom(req, user)`: `isSystemUser(user) || (req.actor?.it !== true && isHiddenIt(user) && !isSelfTz(req, user.tz))`.

- [ ] **Step 1: Write failing tests**

For an everyday administrator: a hidden IT user is missing from `GET /api/user`, gives 404 on `GET`, `PUT`, `DELETE`, role, status and permissions routes, and is refused as a lesson's guide or helper. The same user on `/api/it/users` is listed and manageable. They get no notice digest or storage permission rows. The assistant's list and name lookups drop them. Both site passes are issued for a hidden IT user and for 000000000; a blocked one is refused. The header shows the IT button for them.

- [ ] **Step 2: Run to confirm failure**

Run: `cd server && node --test test/hidden-it-sweep.test.js test/site-pass.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `User.controller.js` use `hiddenFrom` wherever `isSystemUser` hides a row or answers 404. Elsewhere, replace `isSystemTz(user.tz)` with `isHiddenUser(user)` where a whole user record is at hand. Where only an ID number is at hand (`toolRegistry.js:71`), compare against the actor's current list of hidden ID numbers. `hasBothSides` becomes `mayUseIt`. Skip the storage folder for a hidden user. Check `liveAudience.js`, `liveHub.js` and exports, and record what was found in the review log.

- [ ] **Step 4: Run to confirm passing**

Run: `npm run verify`
Expected: all pass, and the build succeeds.

Part B ends here. Propose: `IT users with no role work in System as «النظام»; the audit log keeps the real person`.

### Task 6: Email code for System sign-in

**Files:**
- Create: `server/Entities/User/SystemLoginCode.model.js`, `server/Entities/User/SystemCode.auth.js`
- Modify: `server/Entities/User/User.controller.js`, `server/Entities/User/Auth.route.js`, `server/utils/sendEmail.js`
- Modify: `apps/system/src/Components/Auth/LoginPage/LoginPage.jsx`, `apps/system/src/WebServer/services/auth/fuctionsAuth.jsx`
- Test: `server/test/system-code.test.js`, `apps/system/src/Components/Auth/LoginPage/LoginPage.code.test.js`

**Interfaces:**
- Produces: `POST /api/auth/login` answer `{ ok:true, codeRequired:true, tz }`, or 403 with code `IT_BLOCKED` or `USE_PASSKEY`; `POST /api/auth/login-code { tz, code }` answering as a normal login (`finishSignIn`).

The separate collection is what keeps IT and System codes from crossing. Same limits as `It.auth.js`: 6 digits, 10 minutes, single use, 5 tries, a wrong code counts as a failed sign-in.

- [ ] **Step 1: Write failing tests**

A wrong password gives the normal refusal for an IT user and an ordinary one, byte for byte. A correct password for a hidden IT user sends a code and sets no cookie. 000000000's code goes to `SYSTEM_ADMIN_EMAIL`. A correct code signs in; a reused code fails; a sixth try fails. A code from `ItLoginCode` is refused here, and the reverse. `mustChangePassword` still answers first. No real email gives `USE_PASSKEY`. A blocked IT user with no role gives `IT_BLOCKED` only after a correct password. An ordinary user gets no code step. Client: the code screen appears on `codeRequired` and `USE_PASSKEY` shows its message.

- [ ] **Step 2: Run to confirm failure**

Run: `cd server && node --test test/system-code.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `createSystemCode(deps)` with the shape of `createItAuth`, call it from `login` before `finishSignIn`, add `sendSystemLoginCodeEmail`**

- [ ] **Step 4: Run to confirm passing**

Run: `npm run verify`
Expected: all pass.

### Task 7: Passkeys in System

**Files:**
- Create: `server/Entities/User/User.passkey.js`, `apps/system/src/utils/passkey.js`, `apps/system/src/Components/Auth/PasskeyOffer.jsx`
- Modify: `server/Entities/User/User.model.js`, `User.controller.js`, `Auth.route.js`, `server/config/.env.example`, `deploy/DEPLOY.md`, `apps/system/package.json`, `apps/system/package-lock.json`, `LoginPage.jsx`, `apps/system/src/Components/Profile/Profile.jsx`
- Test: `server/test/system-passkey.test.js`, `apps/system/src/utils/passkey.test.js`, `apps/system/src/Components/Auth/LoginPage/LoginPage.passkey.test.js`

**Interfaces:**
- Produces: `POST /api/auth/passkey/login-options|login` (open, rate limited), `POST /api/auth/passkey/register-options|register` (`requireAuth`, `loadActor`); user field `systemPasskeys` in `SERVER_OWNED_FIELDS` and removed by `sanitize`; environment value `SYSTEM_HOST`.

- [ ] **Step 1: Write failing tests, following `it-passkey.test.js`**

Registers while signed in and stores under `systemPasskeys`, never `itPasskeys`. A credential stored only in `itPasskeys` cannot sign in here. Sign-in ends in `finishSignIn`, with no code step for a hidden IT user. A locked account or a blocked IT user with no role is refused. A bad signature or expired challenge fails. `sanitize` removes the field. The login button is hidden where the browser has no passkey support; the offer appears after a normal sign-in and not once one is registered or dismissed.

- [ ] **Step 2: Run to confirm failure**

Run: `cd server && node --test test/system-passkey.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement from `It.passkey.js`, with `{ rpID: SYSTEM_HOST, origin: "https://" + SYSTEM_HOST }` and a `localhost` fallback for development; add `@simplewebauthn/browser` `13.3.0`; document `SYSTEM_HOST` in both deploy files**

- [ ] **Step 4: Run to confirm passing**

Run: `npm run verify`
Expected: all pass.

### Task 8: IT site controls, spec update and review handoff

**Files:**
- Modify: `apps/it/src/screens/Settings.jsx`, `apps/it/src/screens/UserPage.jsx`, `apps/it/src/api.js`, `apps/it/src/strings.js`, `docs/superpowers/specs/2026-11-03-it-site-design.md`, `docs/AI_REVIEW_LOG.md`
- Test: `apps/it/src/screens/Settings.test.js`, `apps/it/src/screens/UserPage.test.js`

**Interfaces:**
- Consumes: `/api/it/admin-powers` from Task 1; `/api/it/users/:tz/request-alerts` from Task 2.

- [ ] **Step 1: Write failing tests**

The Settings switch reads and saves `enabled` and shows a toast. The user page toggle saves `enabled`, and shows only for a user holding `users.approve`.

- [ ] **Step 2: Run to confirm failure**

Run: `npm test --prefix apps/it`
Expected: FAIL.

- [ ] **Step 3: Implement like the push switch in `Settings.jsx`; update the old spec's table and notes; log every task with Codex review pending**

- [ ] **Step 4: Run the full check**

Run: `npm run verify && npm test --prefix apps/it && npm test --prefix apps/sport`
Expected: all pass, and the build succeeds.

Part C ends here. Propose: `Passkeys and the email code in System; IT site controls`. After deployment the owner sets `SYSTEM_HOST` and checks a real passkey and email code on a phone.
