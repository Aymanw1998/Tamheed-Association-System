# Hybrid Permissions, System Account, Login Lockout & Audit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace role-only access with "role defaults + per-account grants/revokes", hide and harden the system account, lock accounts after 5 failed logins, and record every change in an audit log.

**Architecture:** One pure rules module (`server/utils/permissions.js`) defines the permission tree, role defaults and effective-permission math; a second (`server/utils/permissionRules.js`) decides who may change whom. A `loadActor` middleware reads the user from MongoDB on every request (not from the JWT), so revocations apply at once; routes guard with `requirePermission(key)`. Audit writes go through one `audit.record()` helper. The client receives the effective permission list from `/api/auth/me` and only uses it to hide UI.

**Tech Stack:** Node 20+/Express 4, MongoDB through the generic model layer (`server/Entities/api.js`, `XModelDef.get/create/update/delete`, users split across rooms `active|waiting|noActive`), `node:test` with the `vm` controller-loader pattern (`server/test/report-authorization.test.js`); React 18 (CRA 5), Jest for pure utils only.

**Spec:** `docs/superpowers/specs/2026-10-17-hybrid-permissions-design.md` (approved by the owner 2026-10-17). It is in Arabic; section names below quote it ("الجزء N").

## Global Constraints

- Roles (canonical): `ادارة` (rank 3), `مرشد` (rank 2), `مساعد` (rank 1). Spellings `إدارة`, `الادارة`, `الإدارة` and misencoded text (`repairMisencodedText`) normalize to `ادارة`; `مرشدة`, `المرشد`, `المرشدة` → `مرشد`.
- Permission keys are `module` or `module.action`; holding a module = holding all its actions. Revoking a module removes all its actions even if one was granted.
- `effective = (roleDefaults ∪ grants) − revokes`; system account = every key, always.
- Dangerous keys (never from a role, granted only by the system): `users.changeRole`, `users.passwords`, `users.unlock`, `permissions.manage`, `audit.view`, `systemRecovery.reset`. Grant-only (never from a role, anyone with `permissions.manage` may grant if they hold it): `sports`, `finance` (reserved, hidden in UI until built).
- System account = `process.env.SYSTEM_ADMIN_TZ`; unset/blank matches nobody. It is hidden from every list/API, its actions are stored/shown as actor `"system"` / name `"النظام"`, and it is **never locked**.
- Lockout: 5 consecutive failures → locked (HTTP `423`, `code: "ACCOUNT_LOCKED"`), message exactly: `تم حظر الحساب بسبب محاولات دخول فاشلة متكررة. يرجى التوجه إلى قسم تكنولوجيا المعلومات في الجمعية.` Locked accounts get the same message from forgot/reset password and no email is sent.
- System password must change every 30 days. Recovery by `systemRecovery.reset` only when the system account's `failedLoginCount >= 3`; the temporary password is emailed to `SYSTEM_ADMIN_EMAIL` only and never returned.
- Forbidden response everywhere: `403 { code: "FORBIDDEN", message: "لا توجد صلاحية" }`. Out-of-scope or system targets: `404`.
- Audit never stores `password`, `refreshHash`, `resetOtpHash`, any `*token*`/`*Token*` field, or OTPs — replace values with `"***"`. Audit is append-only (no update/delete route).
- Client strings exist in Arabic, Hebrew and English (`client/src/i18n/I18nContext.jsx`).
- Owner workflow: **never run `git commit`**; each task ends by proposing a commit message; no Claude co-author trailer. Repo is public: no real emails, TZs or passwords in code, tests, docs or the review log (the owner's real `SYSTEM_ADMIN_EMAIL` goes only in the server's env file).
- Phases ship separately (spec "الترتيب المقترح"). At the end of each phase: `npm run verify` from the repo root, add an entry to `docs/AI_REVIEW_LOG.md` with changed files and results, request Codex review, propose the commit message.

## Review Focus

1. **Stored role spellings vary** (`الإدارة`, misencoded Arabic, `["مرشد","ادارة"]`): `normalizeRole`/migration must map them so no admin loses access on deploy. Tests in Tasks 3 and 5.
2. **A user whose permission was revoked (or who was moved to `noActive`) keeps a valid 1-day JWT**: the next request must be refused. Tests in Task 4.
3. **A permission manager sends a crafted body** granting a parent module when he holds only one child, or a dangerous key, or targets himself/a peer manager/the system: rejected. Tests in Task 10.
4. **A guide saves a lesson whose student list the server filtered for him**: hidden students must survive the save. Tests in Task 16.
5. **`SYSTEM_ADMIN_TZ` unset or blank**: nobody is "system", nothing crashes, `""` tz never matches. Tests in Tasks 3 and 13.

---

## Phase 1 — Security fixes and lockout (spec: "مشاكل أمنية", الجزء 7)

### Task 1: Remove login backdoors and password exposure

**Files:**
- Modify: `server/Entities/User/User.controller.js` (`login` ~line 601, `viewPassword` ~line 1044)
- Modify: `server/Entities/User/User.route.js:31,37` (photo routes)
- Test: `server/test/login-security.test.js` (new; reuse the `vm` loader from `user-profile-authorization.test.js`)

**Interfaces:**
- Produces: `login` accepts only `verifyPasswordAndMaybeUpgrade(...).ok`. `viewPassword` responds `{ ok, hasPassword: boolean }` and nothing else.

- [ ] **Step 1: Write failing tests**
  - `login rejects the Tamheed_Pass master password` — env `Tamheed_Pass="master-x"`, stored bcrypt hash of `"real-pass"`, body password `"master-x"` → `401 INVALID_CREDENTIALS`.
  - `login rejects the stored hash sent as the password` — body password equal to the stored hash string → `401`.
  - `viewPassword never returns the stored value` — response JSON stringified does not contain the stored hash; `hasPassword === true`.
  - `photo upload for another user needs admin` — route-level: non-admin `req.user.tz="1"` posting `/upload-photo/2` → `403`; own tz → passes to handler.
- [ ] **Step 2: Run `npm test --prefix server` — the new tests fail**
- [ ] **Step 3: Implement**: delete the `extraOk` fallback (use `ok`); reduce `viewPassword` to `{ ok: true, hasPassword }`; guard both photo routes with `protectSelfOrRole('tz', 'ادارة')` (replaced by permissions in Task 6). Remove the client's "encrypted password" display if `EditUser.jsx` reads `canViewEncrypted`.
- [ ] **Step 4: Run `npm test --prefix server` — all pass**
- [ ] **Step 5: Propose commit message** ("Close the master-password and stored-hash login paths")

### Task 2: Lock accounts after 5 failed logins

**Files:**
- Create: `server/utils/loginLockout.js`
- Modify: `server/Entities/User/User.model.js` (fields `failedLoginCount: number default 0`, `lockedAt: date default null`), `User.controller.js` (`login`, `forgotPassword`, `resetPassword`)
- Modify: client login page (wherever `INVALID_CREDENTIALS` is shown) to show the server `message` for `423`
- Test: `server/test/login-lockout.test.js`

**Interfaces:**
- Produces (`loginLockout.js`):
  - `LOCK_THRESHOLD = 5`, `SYSTEM_ALERT_EVERY = 5`, `LOCKED_MESSAGE` (exact string from Global Constraints)
  - `isLocked(user, { isSystem }) -> boolean` — always `false` for system
  - `afterFailure(user, { isSystem, now }) -> { failedLoginCount, lockedAt, alertSystem: boolean }` — `lockedAt` set when the count reaches 5 (never for system); `alertSystem` true for system when `count % 5 === 0`
  - `afterSuccess() -> { failedLoginCount: 0, lockedAt: null }`

- [ ] **Step 1: Write failing tests**
  - unit: 4 failures → not locked; 5th → `lockedAt === now`; system at 5, 10 → not locked, `alertSystem === true`; at 6 → `false`.
  - `a locked account is refused even with the right password` → `423`, `body.code === "ACCOUNT_LOCKED"`, `body.message === LOCKED_MESSAGE`.
  - `a successful login resets the counter` → update called with `{ failedLoginCount: 0, lockedAt: null }`.
  - `unknown tz does not write anything` → no `UserModelDef.update` call, `401`.
  - `forgot-password on a locked account sends no email` → `423`, send-email stub not called; same for `reset-password`.
- [ ] **Step 2: Run — fail**
- [ ] **Step 3: Implement** the module and wire it: check `isLocked` before verifying the password; on failure persist `afterFailure` result to the user's room; on success persist `afterSuccess`. `isSystem` comes from `isSystemTz` (Task 3 defines it; until then inline `tz === process.env.SYSTEM_ADMIN_TZ` with blank guard and replace in Task 3). The system alert email is wired in Task 14.
- [ ] **Step 4: Run — pass**
- [ ] **Step 5: Phase gate** (verify, review log, Codex request) and propose commit message ("Lock an account after five failed sign-ins")

---

## Phase 2 — Permission engine, migration, guards (spec: الجزء 1–3, 9)

### Task 3: Permission tree and effective permissions

**Files:**
- Create: `server/utils/permissions.js`
- Test: `server/test/permissions.test.js`

**Interfaces:**
- Produces:
  - `PERMISSION_TREE: { [module]: string[] }`, `ROLE_RANK`, `ROLE_DEFAULTS`, `DANGEROUS_KEYS: Set`, `GRANT_ONLY_MODULES: Set`, `ALL_KEYS: string[]` (leaf keys)
  - `normalizeRole(raw) -> "ادارة"|"مرشد"|"مساعد"|null`
  - `expandKeys(keys: string[]) -> Set<string>` (module → its leaves; unknown keys dropped)
  - `effectivePermissions(user, { isSystem }) -> Set<string>` reading `user.role` (fallback: highest of `normalizeRole(user.roles[i])`), `user.permissionGrants`, `user.permissionRevokes`
  - `can(actorOrSet, key) -> boolean` (`key` may be a module = holds every leaf)
  - `isSystemTz(tz, systemTz = process.env.SYSTEM_ADMIN_TZ) -> boolean` (trim both; blank → false). Replace `isSystemAccount` in `GoogleDrive.route.js` with it.

Tree and defaults are spec values — copy exactly:

```js
const PERMISSION_TREE = {
  dashboard: ["view"], calendar: ["view"],
  students: ["view", "viewAll", "create", "edit", "delete", "photo", "parentLink"],
  lessons: ["view", "create", "edit", "roster", "delete", "copyMonth"],
  attendance: ["view", "record"],
  reports: ["create", "editOwn", "viewAll", "editAll", "delete", "exportPdf"],
  vehicles: ["view", "edit", "compliance", "documents", "archive"],
  files: ["use", "manageAll"],
  notices: ["view", "post", "runCheck"],
  users: ["view", "create", "edit", "approve", "delete", "changeRole", "passwords", "unlock"],
  ai: ["use"], permissions: ["manage"], audit: ["view"], systemRecovery: ["reset"],
  sports: ["view"], finance: ["view"], // reserved
};
const ROLE_DEFAULTS = {
  "ادارة": ["dashboard", "calendar", "students", "lessons", "attendance", "reports", "vehicles",
            "files", "notices", "users.view", "users.create", "users.edit", "users.approve",
            "users.delete", "ai"],
  "مرشد": ["dashboard", "calendar", "students.view", "students.edit", "students.photo",
           "lessons.view", "lessons.create", "lessons.edit", "lessons.roster",
           "attendance", "reports.create", "reports.editOwn", "reports.exportPdf",
           "files.use", "ai"],
  "مساعد": ["dashboard", "calendar", "students.view", "lessons.view", "attendance.view",
            "reports.create", "reports.editOwn", "reports.exportPdf", "files.use", "ai"],
};
```

- [ ] **Step 1: Write failing tests**
  - `normalizeRole` maps `"الإدارة"`, `" إدارة "`, a misencoded `ادارة` sample (take one from `server/test` fixtures or encode via `Buffer.from("ادارة","utf8").toString("latin1")`), `"المرشدة"` → canonical; `"x"` → `null`.
  - admin defaults include `students.viewAll`, `files.manageAll`, `users.delete`; exclude every `DANGEROUS_KEYS` member and `sports.view`, `finance.view`.
  - guide defaults: `students.view` yes, `students.viewAll` no, `lessons.delete` no, `attendance.record` yes.
  - grant `sports` + revoke `students.edit` on a guide → has `sports.view`, lacks `students.edit`.
  - revoke `students` beats grant `students.photo` → no `students.*`.
  - `effectivePermissions(anyUser, { isSystem: true }).size === ALL_KEYS.length`.
  - `user.roles = ["مرشد", "الادارة"]` with no `role` → admin defaults.
  - `isSystemTz("", "")`, `isSystemTz(" ", undefined)`, `isSystemTz("123", "")` → `false`; `isSystemTz(" 123", "123 ")` → `true`.
- [ ] **Step 2: Run — fail**
- [ ] **Step 3: Implement** (pure, no I/O)
- [ ] **Step 4: Run — pass**
- [ ] **Step 5: Propose commit message**

### Task 4: `loadActor` and `requirePermission` middleware

**Files:**
- Create: `server/middleware/permissionMiddleware.js`
- Test: `server/test/permission-middleware.test.js` (express app on port 0, like `drive-connect.test.js`)

**Interfaces:**
- Consumes: Task 3 exports.
- Produces:
  - `createLoadActor({ findActiveUserByTz, systemTz }) -> (req,res,next)` — runs after `requireAuth`; loads the user from the **active** room by `req.user.tz`; missing → `401 { code: "NO_ACTIVE" }`; sets `req.actor = { tz, name, role, grants, revokes, permissions: Set, isSystem, user }`.
  - `loadActor` — default instance bound to `UserModelDef` (active room) and env.
  - `requirePermission(...keys)` — passes if `can(req.actor, k)` for any `k`; else 403 (Global Constraints body).
  - `actorLabel(actor) -> { actor: string, actorName: string }` — system → `{ actor: "system", actorName: "النظام" }`.

- [ ] **Step 1: Write failing tests**
  - DB user revoked `students.edit` after token issue → `requirePermission("students.edit")` → `403` on the next request.
  - user moved to `noActive` → `401 NO_ACTIVE`.
  - system tz → passes any key.
  - `requirePermission("reports.viewAll", "reports.editOwn")` passes with only `editOwn`.
- [ ] **Step 2–4: fail → implement → pass**
- [ ] **Step 5: Propose commit message**

### Task 5: User fields and migration script

**Files:**
- Modify: `server/Entities/User/User.model.js` — `role: string default null`, `permissionGrants: array default []`, `permissionRevokes: array default []`, `permissionsUpdatedAt: date`, `permissionsUpdatedBy: string`, `passwordChangedAt: date default null`
- Create: `server/scripts/migratePermissions.js` (+ root-of-server npm script `"permissions:migrate": "node scripts/migratePermissions.js"`)
- Test: `server/test/permissions-migration.test.js`

**Interfaces:**
- Produces: `planUserMigration(user) -> { role, roles, permissionGrants, permissionRevokes, warnings: string[] }` — `role` = highest normalized of `roles`; `roles = [role]`; non-admin `vehiclePermissions` → grants `vehicles.<p>`; warnings for >1 role, unknown role, no role. Script: dry-run by default (prints table: tz, old roles, new role, added grants, effective-permission count before (legacy role access) and after, warnings; any difference other than the guide/assistant `students.viewAll` change is flagged as an error), `--apply` writes all three rooms. Never touches the system account's fields except `role = "ادارة"`.

- [ ] **Step 1: Failing tests**: `["مرشد","الإدارة"]` → `role "ادارة"` + warning; guide with `vehiclePermissions ["view","edit","bogus"]` → grants `["vehicles.view","vehicles.edit"]`; admin with `vehiclePermissions` → no grants; `[]` → `role null` + warning; already-migrated user → unchanged output (idempotent).
- [ ] **Step 2–4: fail → implement → pass**
- [ ] **Step 5: Propose commit message**

### Task 6: Replace every role check with permissions (no behaviour change)

**Files:**
- Modify: all of `server/Entities/*/*.route.js`, `server/Entities/Report/Report.controller.js` (`isAdminUser`), `server/Entities/Storage/Storage.controller.js` (`isAdminUser` → `can(actor,"files.manageAll")`; `PATCH /:tz/storage-permissions` → `files.manageAll`), `server/utils/vehicleRules.js` (`hasVehiclePermission` → `can(effectivePermissions(user), "vehicles."+p)` keeping "nothing without view"), `server/Entities/Notice/Notice.controller.js` (`requireAdmin` → `notices.view`; posting → `notices.post`; vehicle check → `notices.runCheck`; notice/email audience = active users whose effective permissions include `notices.view`), `server/middleware/authMiddleware.js` (delete `requireRole`, `requireSelfOrRole`, `ADMIN_ROLES` after the last use), `User.controller.js` `getme` (add `role`, `permissions: [...set]`)
- Test: `server/test/route-guards.test.js` (new) + update `report-authorization`, `vehicle-rules`, `notice-controller`, `user-*` tests to the new names

Route → key map (every route gets `requireAuth, loadActor` first):

| Route | Key |
| --- | --- |
| `GET /students`, `GET /students/:tz` | `students.view` |
| `POST /students` / `PUT /:tz` / `DELETE /:tz` | `students.create` / `students.edit` / `students.delete` |
| student photo upload/delete | `students.photo` |
| invite `GET /link`, `POST /link/rotate` | `students.parentLink` |
| `GET /lessons*` | `lessons.view` |
| `POST /lessons` / `PUT /:id` / `DELETE /:id` | `lessons.create` / `lessons.edit` / `lessons.delete` |
| `addToList`, `removeFromList` | `lessons.roster` |
| `copy-month`, `delete-perMonth` | `lessons.copyMonth` |
| attendance `GET` / `bulk-save` | `attendance.view` / `attendance.record` |
| reports `POST` / `PUT` / `DELETE` | `reports.create` / `reports.editOwn`+`reports.editAll` / `reports.delete` |
| report list/one of others | controller: `reports.viewAll` |
| `GET /users` | `users.view` |
| `GET /users/:tz`, `PUT /users/:tz` | self, else `users.view` / `users.edit` |
| `POST /users` / `changeStatus` / `DELETE` | `users.create` / `users.approve` / `users.delete` |
| user photo | self, else `users.edit` |
| `GET /viewPassword/:tz` | `users.passwords` |
| `/auth/admin/ping` | `users.view` |
| notices | as above |
| vehicles | existing `can(...)` via `vehicleRules` |
| AI chat (if enabled) | `ai.use` |
| storage routes | `files.use` (+ existing per-path checks; global scope = `files.manageAll`) |

- [ ] **Step 1: Write `route-guards.test.js`**: reads every `*.route.js`, asserts no `requireRole(`, `protectRole(`, `requireSelfOrRole(` remain; asserts each `router.(post|put|patch|delete)` line (excluding public auth/invite-submit/Drive-callback routes listed in the test) contains `requirePermission(` or a self-check helper.
- [ ] **Step 2: Run — fail**
- [ ] **Step 3: Implement the map**; update the existing tests' stubs (`req.user.roles` → a stubbed `req.actor`) without weakening assertions.
- [ ] **Step 4: `npm test --prefix server` — all pass**
- [ ] **Step 5: Propose commit message**

### Task 7: Client reads permissions instead of roles

**Files:**
- Modify: `client/src/utils/session.js` (`rememberSessionUser` stores `permissions` and `role`; add `getStoredPermissions()`, `canStored(key)` with module = all leaves, matching server `can`), `client/src/utils/routeAccess.js` (rules by key: `/users` → `users.view`, `/notices` → `notices.view`, `/students/new` → `students.create`, `/students` → `students.view`, `/lessons/new` → `lessons.create`, `/vehicles` → `vehicles.view`, `/audit` → `audit.view`), every `isStoredAdmin()`/`ADMIN_ROLES` use listed by `grep -rn "isStoredAdmin\|ADMIN_ROLES\|hasAnyRole" client/src` → the matching key from the Task 6 map
- Test: `client/src/utils/session.test.js`, `routeAccess.test.js`

- [ ] **Step 1: Failing tests**: `canStored("students")` true only when all student leaves stored; `canAccessPath("/users", perms)` false without `users.view`; legacy storage with roles only and no permissions → `canAccessPath` denies restricted pages until `/auth/me` refreshes (no crash).
- [ ] **Step 2–4: fail → implement → pass** (`npm test --prefix client`)
- [ ] **Step 5: Phase gate** (run `npm run permissions:migrate` dry-run against the dev DB if reachable and paste the summary — counts only, no TZs — into the review log), propose commit message

---

## Phase 3 — Audit log (spec: الجزء 8)

### Task 8: Audit model, recorder and query API

**Files:**
- Create: `server/Entities/Audit/Audit.model.js` (collection `AuditLog`; fields `at, actor, actorName, module, action, targetType, targetId, targetLabel, changes, ip`), `server/utils/audit.js`, `server/Entities/Audit/Audit.route.js` (mount at `/api/audit`)
- Test: `server/test/audit.test.js`

**Interfaces:**
- Produces:
  - `diffChanges(before, after) -> { [field]: { before, after } }` (shallow; redacted per Global Constraints; unchanged fields omitted; ignores `updatedAt`)
  - `createAudit({ model, now = () => new Date() }) -> { record(req, { module, action, targetType, targetId, targetLabel, before, after }) }` — actor from `actorLabel(req.actor)`; `ip` from `req.ip`; never throws (logs via `logWithSource`).
  - `audit` — default instance. `action ∈ create|update|delete|rename|upload|share|unshare|role_change|permission_change|lock|unlock|system_recovery|drive_connect|approve`.
  - `GET /api/audit?from&to&module&actor&action&targetId&q&page` → `{ ok, items, total }`, 50 per page, newest first, `audit.view`. No other methods.
- [ ] **Step 1: Failing tests**: password/refreshHash/resetOtpHash/`inviteToken` values become `"***"`; system actor stored as `"system"`/`"النظام"`; recorder swallows a model error; `GET` without `audit.view` → 403; `DELETE /api/audit/x` → 404.
- [ ] **Step 2–4: fail → implement → pass**
- [ ] **Step 5: Propose commit message**

### Task 9: Record changes in every module

**Files:** Student, User, Report, Lesson, Attendance, Notice, Vehicle, Storage controllers; `GoogleDrive.route.js` callback.
- Events: student/user/report/lesson/notice create-update-delete; attendance `bulk-save` (one row per save: lesson + date + count changed); vehicle writes (keep the vehicle's own audit too); storage upload, delete, rename (file and folder), folder create, share, unshare; Drive connect; user approve (`changeStatus`).
- Test: extend existing controller tests — one assertion per controller that `record` was called with the right `module`/`action`/`targetId` (stub `../../utils/audit`). Storage: rename test asserts `changes.name.before/after`.
- [ ] **Step 1: Failing tests** · **Step 2: fail** · **Step 3: implement** (capture `before` by reading the doc before update/delete) · **Step 4: pass** · **Step 5: propose commit message**

The client audit page ships in Task 12 together with the other admin screens.

---

## Phase 4 — Permission rules, endpoints and screens (spec: الجزء 3, 5)

### Task 10: Who may change whom

**Files:**
- Create: `server/utils/permissionRules.js`
- Test: `server/test/permission-rules.test.js`

**Interfaces:**
- Consumes: Task 3.
- Produces (all pure; `actor` = `req.actor`, `target` = user doc, `isSystemTarget` passed in):
  - `holdsDangerous(user) -> boolean` (effective set ∩ `DANGEROUS_KEYS`)
  - `isPermissionManager(user) -> boolean`
  - `canManageTarget(actor, target, { isSystemTarget }) -> boolean` — false if target is system or self; system actor → true; target holds a dangerous key → false (system only); else requires rank(actor) > rank(target)
  - `grantableBy(actor) -> Set<string>` — system: all; holder of `permissions.manage`: own effective set minus `DANGEROUS_KEYS`; else empty
  - `validatePermissionChange(actor, target, { grants, revokes }, ctx) -> { ok: true } | { ok: false, code }` — codes `FORBIDDEN`, `NOT_GRANTABLE` (any key whose expanded leaves are not all in `grantableBy`), `SELF`, `UNKNOWN_KEY`; also requires `canManageTarget` and, for a non-system actor, that the target is not a permission manager
  - `canAssignRole(actor, target, newRole, ctx) -> boolean` — needs `users.changeRole` (or system), `canManageTarget`, not self, and actor holds every leaf of `ROLE_DEFAULTS[newRole]`
  - `applyRoleChange(target, newRole) -> { role, roles, permissionGrants, permissionRevokes, demoted }` — promotion/same rank keeps grants/revokes; demotion clears both
- [ ] **Step 1: Failing tests**
  - admin (no dangerous keys) editing a guide → `canManageTarget` true; editing another admin → false; editing self → false; editing system → false.
  - admin editing a guide who holds `audit.view` → false.
  - permission manager holding `students.view` only tries grant `students` → `NOT_GRANTABLE`; grant `students.view` → ok; grant `audit.view` → `NOT_GRANTABLE`; target another permission manager → `FORBIDDEN`.
  - system actor grants `permissions.manage` → ok.
  - `applyRoleChange(admin with grants ["sports"], "مرشد")` → grants `[]`, `demoted: true`; `applyRoleChange(guide with grants ["sports"], "ادارة")` → grants `["sports"]`, `demoted: false`.
  - `canAssignRole(changeRole-holder guide-rank, target, "ادارة")` → false (doesn't hold admin defaults).
- [ ] **Step 2–4: fail → implement → pass**
- [ ] **Step 5: Propose commit message**

### Task 11: Permission and role endpoints; close role writes elsewhere

**Files:**
- Modify: `server/Entities/User/User.route.js`, `User.controller.js` (`putU`, `register`, `changeRoom`, `deleteU`, new handlers), `client/src/Components/Auth/RegisterPage/RegisterPage.jsx` (drop role field)
- Test: `server/test/user-permissions-api.test.js`

**Interfaces:**
- Produces:
  - `GET /api/user/:tz/permissions` (`permissions.manage`) → `{ ok, role, grants, revokes, effective, defaults, grantable, updatedAt, updatedBy }`; system target → 404
  - `PUT /api/user/:tz/permissions` body `{ grants, revokes }` → validate (Task 10) → save + `permissionsUpdatedAt/By` → audit `permission_change` with before/after
  - `PUT /api/user/:tz/role` body `{ role }` → `canAssignRole` → `applyRoleChange` → audit `role_change` → `{ ok, demoted }`
  - `putU` strips `role`, `roles`, `permissionGrants`, `permissionRevokes`, `vehiclePermissions`, `failedLoginCount`, `lockedAt`, `passwordChangedAt`; non-self edits require `users.edit` + `canManageTarget`
  - `deleteU`, `changeRoom`: require `canManageTarget`
  - `changeRoom` to `active` from `waiting` requires body `role` and `canAssignRole`
  - `register` ignores any submitted role (`roles: []`, `role: null`)
  - `POST /api/user/:tz/unlock` (`users.unlock` + `canManageTarget`) → `afterSuccess()` fields, audit `unlock`
- [ ] **Step 1: Failing tests**: each rule above as one test (403 vs 200), including `register` with `roles:["ادارة"]` → stored `roles: []`; approving without role → 400.
- [ ] **Step 2–4: fail → implement → pass**
- [ ] **Step 5: Propose commit message**

### Task 12: Client permissions tab, role dialog, audit page

**Files:**
- Create: `client/src/utils/permissionTree.js`, `client/src/Components/User/PermissionsTab.jsx` (+ `.module.css`), `client/src/Components/Audit/AuditPage.jsx` (+ css), service calls in `client/src/WebServer/services/user/functionsUser.jsx` and a new `.../audit/functionsAudit.jsx`
- Modify: `EditUser.jsx` (tabs; role select calls `PUT /role`; demotion warning; after save "add permissions now / later" dialog → now opens the tab, later leaves after confirm), `Profile.jsx` (read-only "صلاحياتي" list), `ViewAllUser.jsx` (approve flow asks for a role; "unlock" button for locked users when `users.unlock`), `Routes.jsx` (`/audit`), `Header.jsx` menu item, `I18nContext.jsx` (ar/he/en strings)
- Test: `client/src/utils/permissionTree.test.js`

**Interfaces:**
- Produces (`permissionTree.js`): `moduleState(module, effective) -> "all"|"some"|"none"`; `sourceOf(key, { defaults, grants, revokes }) -> "role"|"granted"|"revoked"|"none"`; `toggleModule(state, module, on) -> { grants, revokes }`; `toggleKey(state, key, on) -> { grants, revokes }` (removes contradicting entries; turning on a default key just removes its revoke); `diffSummary(before, after) -> { added: string[], removed: string[] }`. Hide `sports`/`finance` via `HIDDEN_MODULES`.
- UI requirements from the spec (الجزء 5): header shows role + `updatedBy`/`updatedAt`; source badge per key; rows the current user can't grant are disabled with tooltip "لا تملك هذه الصلاحية"; "إرجاع إلى صلاحيات الدور" sends `{ grants: [], revokes: [] }` after confirm; "حفظ" shows `diffSummary` and confirms. `AuditPage` filters: date range, module, actor, action, free text; `EditUser.jsx` and `EditStudent.jsx` show the last 10 audit rows for that target when the viewer has `audit.view` (`GET /api/audit?targetId=`; add `targetId` to Task 8's filters).
- [ ] **Step 1: Failing tests**: tri-state; toggling a default key off adds a revoke, on again removes it (no grant added); module off writes one module revoke and drops child grants; `diffSummary` lists exact keys.
- [ ] **Step 2–4: fail → implement → pass**
- [ ] **Step 5: Manual check in the browser preview**: as an admin seed user the tab is hidden; as the system user grant `permissions.manage` to a test admin, sign in as that admin and confirm non-grantable rows are disabled. Screenshot for the review log.
- [ ] **Step 6: Phase gate**, propose commit message

---

## Phase 5 — System account (spec: الجزء 6)

### Task 13: Hide the system account and label its actions

**Files:** `User.controller.js` (`getAllU`, `getOneU`, `getme` unaffected), any user picker endpoints (teacher/helper lists, `GET /api/vehicle/responsibles`), `Notice` audience builder, Dashboard counts endpoint (if server-side), every `createdBy` write (reports, notices, vehicle audit) → `actorLabel(req.actor).actor`
- Test: `server/test/system-account.test.js`
- [ ] **Step 1: Failing tests**: `getAllU` result excludes system tz in every room; `GET /users/<systemTz>` by an admin → 404; with `SYSTEM_ADMIN_TZ=""` a user with `tz:""`-like blank never filtered/matched and nothing throws; report created by system stores `createdBy: "system"`; notice audience excludes system.
- [ ] **Step 2–4: fail → implement → pass** · **Step 5: propose commit message**

### Task 14: Monthly password change, recovery, IT script, alert email

**Files:**
- Create: `server/utils/systemPassword.js`, `server/scripts/systemRecover.js` (+ npm script `"system:recover"`)
- Modify: `User.controller.js` (`login`, new `changePassword`, new `recoverSystem`), `Auth.route.js`, `server/utils/jwt.js` (scope claim), `permissionMiddleware.js` (`loadActor` rejects `scope:"password-change"` tokens with `403 { code: "PASSWORD_CHANGE_REQUIRED" }` except on the change route), `server/scripts/ensureSystemAdmin.js` (warn when `SYSTEM_ADMIN_EMAIL` is blank or ends with `.local`; set `passwordChangedAt` if missing), `server/config/.env.example` (comment: real mailbox required), client login flow (forced change screen on `mustChangePassword`)
- Test: `server/test/system-password.test.js`

**Interfaces:**
- Produces:
  - `PASSWORD_MAX_AGE_DAYS = 30`; `mustChangePassword(user, { isSystem, now }) -> boolean` (system only; missing date → true)
  - `generateTempPassword() -> string` (16 chars, `crypto.randomInt` over letters+digits+symbols)
  - login for system with expired password → `200 { ok, mustChangePassword: true, accessToken }` where the token has `scope: "password-change"`; no refresh cookie
  - `POST /api/auth/change-password` `{ currentPassword, newPassword }` (any signed-in user; validates via existing `CheckPasswordisGood` rules) → sets `passwordChangedAt = now`, audit `update` with `changes.password: "***"`
  - `POST /api/user/system/recover` (`systemRecovery.reset`) → 409 unless system `failedLoginCount >= 3`; sets temp password hash, `passwordChangedAt = new Date(0)`, `failedLoginCount: 0`; emails `SYSTEM_ADMIN_EMAIL`; response `{ ok: true }` only; audit `system_recovery`
  - lockout alert: when `afterFailure(...).alertSystem`, email `SYSTEM_ADMIN_EMAIL` ("5 failed sign-in attempts on the system account")
  - `node scripts/systemRecover.js` → same reset without the 3-failure condition, emails the temp password, audit actor `"it-server"` / name `"IT (خادم)"`; prints only "sent to <masked email>". Changing the mailbox = edit `SYSTEM_ADMIN_EMAIL` in the server env and restart (ensureSystemAdmin syncs it).
- [ ] **Step 1: Failing tests**: 29 days → no change required, 31 → required; scoped token refused on `GET /api/students` with `PASSWORD_CHANGE_REQUIRED`, accepted on change-password; recover with count 2 → 409, with 3 → 200 and response body has no password and email stub received it; 5th system failure triggers alert email stub, 6th does not.
- [ ] **Step 2–4: fail → implement → pass**
- [ ] **Step 5: Phase gate** — note in the review log that the owner must set the real `SYSTEM_ADMIN_EMAIL` in the server env (not in the repo) before deploying; propose commit message

---

## Phase 6 — Student scope for guides (spec: الجزء 4)

### Task 15: Scope rules

**Files:**
- Create: `server/utils/studentScope.js`
- Modify: `server/Entities/Student/Student.model.js` (`responsibleInstructor: string default null`)
- Test: `server/test/student-scope.test.js`

**Interfaces:**
- Produces:
  - `createStudentScope({ lessonModel }) -> { visibleStudentIds(actor) -> Promise<null | Set<string>> }` — `null` when `can(actor,"students.viewAll")`; otherwise ids of students with `responsibleInstructor === actor.tz` plus every id in `list_students` of lessons where `teacher === actor.tz || helper === actor.tz` (all dates)
  - `mergeRoster(existing: string[], submitted: string[], visible: Set|null) -> string[]` — keeps every existing id not in `visible`; within `visible`, result follows `submitted`
- [ ] **Step 1: Failing tests**: viewAll → `null`; guide sees responsible + lesson students only; `mergeRoster(["a","b","h"], ["a","c"], new Set(["a","b","c"]))` → `["a","c","h"]` (order: kept hidden ids preserved, then submitted); `mergeRoster` with `null` → submitted.
- [ ] **Step 2–4: fail → implement → pass** · **Step 5: propose commit message**

### Task 16: Apply the scope on the server

**Files:** `Student.controller.js` (`getAllS` filter; `getOneS`/`putS`/photo → 404 out of scope; `postS` accepts `responsibleInstructor` validated as an active non-system user), new `GET /api/students/lookup/:tz` (`lessons.roster`; exact tz only; returns `{ tz, firstname, lastname }`), `Lesson.controller.js` (`getOne` returns only visible ids in `list_students` + `hiddenCount`; `putOne` uses `mergeRoster`; `addToList`/`removeFromList` accept visible ids plus ids resolved via lookup for add; remove only visible), `Attendance.controller.js` (`getSheet` rows for visible students; `bulkSave` ignores rows for hidden students)
- Test: `server/test/student-scope-routes.test.js`
- [ ] **Step 1: Failing tests**: guide `GET /students` lists 2 of 5; guide `GET /students/<hidden>` → 404; guide `PUT /lessons/:id` with filtered list keeps hidden ids in DB; guide `removeFromList` with a hidden id → unchanged; attendance save with a hidden student row → that row not written; lookup with partial tz → 404.
- [ ] **Step 2–4: fail → implement → pass** · **Step 5: propose commit message**

### Task 17: Client — responsible guide, hidden count, lookup

**Files:** `EditStudent.jsx` (select "المرشد المسؤول" from users list, system excluded server-side), `LessonRoster.jsx` (show "طلاب آخرون: N" from `hiddenCount`; add-by-ID input calling lookup), `client/src/utils/lessonRoster.js` (+ test), `I18nContext.jsx`
- [ ] **Step 1: Failing test** in `lessonRoster.test.js`: `rosterSummary({ visible: 3, hiddenCount: 2 })` → `{ shown: 3, others: 2 }`; `isFullTz("12345678")` false, `"123456782"` true (reuse the existing Israeli-ID checker if present in `client/src/utils`).
- [ ] **Step 2–4: fail → implement → pass**
- [ ] **Step 5: Browser check** as a guide seed account: roster shows only own students + others count; add by full ID works.
- [ ] **Step 6: Phase gate**, propose commit message

---

## Out of scope (spec: "ليس ضمن هذا العمل")

Chat, groups, sending reports to people/groups; building the sports and finance modules; temporary permissions; changes to per-path `storagePermissions`. Sensitive non-finance sub-permissions (parents' phones, photos, notes) stay an open question — the tree accepts new leaves later without schema changes.
