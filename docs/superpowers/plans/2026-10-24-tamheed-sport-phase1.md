# Tamheed Sport, Phase 1, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship phase 1 of «تمهيد سبورت».
- **In the existing system:** a new «الرياضة» section where sport staff define sports, teams, players (jersey and position), trainings and training attendance.
- **At `sport.tamheed-ramla.org`:** a phone-first, view-only site. A student signs in with their ID number and a 6-digit code sent to their stored email, then sees their player card(s), their next training and their teams.

**Architecture:**
- **One Express process** (pm2 `tamheed`) serves both sites.
- **Staff management API:** `/api/sports`, behind the existing Bearer auth and `loadActor`.
- **Student API:** `/api/sport-portal`, a separate surface:
  - its own JWT secret;
  - its own host-only, httpOnly cookie;
  - it never accepts a staff token, and no other route accepts a student session.
- **The sport web app** is a new small React app in `sport/` built with Vite. Express serves `sport/dist` when the request Host is `SPORT_HOST`, and `client/build` otherwise.

**Tech Stack:**
- **Server:** Node/Express, MongoDB through `server/Entities/api.js` model definitions, `node:test`.
- **System client:** React 18 (CRA 5), react-router 7, axios.
- **Sport app:** React 18.3.1, Vite 5.4.11, `@vitejs/plugin-react` 4.3.4, Vitest 2.1.8 (exact versions).

**Spec:** `docs/superpowers/specs/2026-10-24-tamheed-sport-design.md` (Arabic). Read all of it, including «قرارات اتخذها المصمّم». This plan covers **المرحلة 1 only**: no matches, results, leagues, badges or news.

## Global Constraints

- **Language:** all user-facing text is Arabic, RTL, following `docs/arabic-style-guide.md`. No translations and no Hebrew or English UI text.
- **Public repo:** no real ID numbers, emails, names or secrets in code, tests, fixtures or docs.
  - Test ID numbers: synthetic ones such as `"100000009"`.
  - Test emails: `@example.com` only.
- **Students are the source of truth.** Never copy name, photo, birth date, gender or email into sport collections. Always read them from `Students` (`StudentModelDef`).
- **Isolation (spec «ما يجب ألا يحدث» 1-2):**
  - **Student session:** cookie `tamheed_sport`, signed with `SPORT_SESSION_SECRET`, payload `{ sub: <student _id>, typ: "sport-student" }`.
    - Cookie options: `httpOnly`, `sameSite: "Lax"`, `secure` in production, `path: "/api/sport-portal"`, **no `domain`** (host-only), max age 30 days.
  - **Staff side:** the staff `refresh` cookie (domain `.tamheed-ramla.org`) and Bearer tokens are ignored on `/api/sport-portal`.
- **No account discovery (spec 3):**
  - `request-code` always answers `200 { ok: true, message: GENERIC_CODE_MESSAGE }`. This holds for an unknown ID, a duplicated ID, no email, not in sport, and locked.
  - `GENERIC_CODE_MESSAGE` = `"إذا كان الرقم مسجّلًا ولديه بريد، سيصله رمز. لم يصلك؟ توجّه إلى المرشد"`.
  - The email address is never echoed back.
- **Code rules (mirror `forgotPassword`/`resetPassword` in `server/Entities/User/User.controller.js`):**
  - 6 digits, stored only as `sha256` (`server/utils/jwt.js`), valid 10 minutes.
  - 5 wrong attempts lock the ID for 10 minutes.
  - No new code within 60 s of the previous one.
  - IP rate limit: `rateLimit({ windowMs: 15*60*1000, max: 8, scope: "sport-login" })`.
- **Who may sign in:** a student with exactly one `Students` record for the ID, a non-empty `email`, and at least one `SportPlayers` row. Anyone else gets the generic message and no email.
  - Duplicated ID: also `logWithSource("SportPortal.requestCode", new Error("duplicate student tz"))` with the matching `_id`s and **no tz**.
- **Card numbers in phase 1:**
  - `matches` is `0`, and every sport stat value is `0`.
  - `attendance` is a whole-number percent, or `null` when there is no recorded training (UI shows `—`).
  - No overall rating anywhere.
- **Teammates are shown by first and last name only.** No photo, tz, email or birth date of another student ever leaves the portal API.
- **Permission module `sports` stays grant-only** (in `GRANT_ONLY_MODULES`). Leaves are `["view", "coach", "manage"]`, mirrored in the client.
- **Colors:**
  - turquoise `#1e95c0`, gradient `#4cc3e6 → #1e95c0 → #0d5f80`;
  - orange `#f7941d`.
  - Logo: `client/src/images/logo.png`.
  - Card reference: option 1 in `.superpowers/brainstorm/88-1792792287/content/player-card-logo.html`, with the sport name and icon centered at the top of the shield.
- **Commits:** the owner approves commits (no `Co-Authored-By` trailer). Never push.

## Data model (collections in `tamheed_db`, all through `api.js`)

| Model file | Collection | Fields | Indexes |
| --- | --- | --- | --- |
| `server/Entities/Sport/Sport.model.js` | `Sports` | `name`, `icon` (emoji, ≤ 4 chars), `stats: [{ key, label }]` (0-4), `createdAt`, `updatedAt` | — |
| `server/Entities/Sport/SportTeam.model.js` | `SportTeams` | `name`, `sportId`, `coachIds: [userId]`, `members: [{ studentId, joinedAt }]`, timestamps | `{ sportId: 1 }`, `{ coachIds: 1 }` |
| `server/Entities/Sport/SportPlayer.model.js` | `SportPlayers` | `studentId`, `sportId`, `jerseyNumber` (1-99 or null), `position` (string ≤ 30), timestamps | `{ studentId: 1, sportId: 1 }` unique |
| `server/Entities/Sport/SportTraining.model.js` | `SportTrainings` | `teamId`, `sportId`, `startsAt` (Date), `place`, `presentIds: [studentId]`, `recorded` (bool, true once attendance is saved), timestamps | `{ teamId: 1, startsAt: 1 }` |
| `server/Entities/Sport/SportLoginCode.model.js` | `SportLoginCodes` | `studentId`, `codeHash`, `expiresAt`, `sentAt`, `attempts`, `lockedUntil` | `{ studentId: 1 }` unique |

- **"In the sport section"** means the student has at least one `SportPlayers` row.
- **A stat `key`** is generated server-side once, as `s_<8 random hex>`, and never changes. Renaming changes only `label`. Removing a stat drops it from `stats` (spec decision).
- **Each model file** follows the existing `*ModelDef` shape (`get/create/update/updateExisting/delete` over `api.js`). Each file with indexes exports an `ensure…Indexes(collection?)` function, called from `server.js` at startup like the other `ensure*Indexes`.

## Review Focus

1. **Missing student data.** A student with no `birth_date`, no `photo` or a blank `email`: the card shows no age, a silhouette, and code requests send nothing. The tests are in Tasks 2 and 4.
2. **Trainings that don't count.** Future trainings and trainings with `recorded: false` are excluded from the attendance percent. So are trainings before the student's `joinedAt`. With nothing counted the percent is `null`, not `0`. Test in Task 2.
3. **Session after removal.** A student removed from sport (all `SportPlayers` rows deleted) or deleted from `Students` while their cookie is still valid gets `401` from `/me` and `/photo`. Test in Task 5.
4. **Coach scope.** A `sports.coach` holder who is not in the team's `coachIds` cannot change that team's members or trainings (`403`). A `sports.manage` holder can. Test in Task 3.
5. **Credential mix-up.** A staff Bearer token or the staff `refresh` cookie on `/api/sport-portal/me` gets `401`. A valid `tamheed_sport` cookie on `/api/student` or `/api/sports` gets `401`. Tests in Tasks 4 and 5.

---

### Task 1: `sports` permission leaves (server and client mirror)

**Files:**
- Modify: `server/utils/permissions.js` (`PERMISSION_TREE.sports`)
- Modify: `client/src/utils/permissionKeys.js`, `client/src/utils/permissionTree.js` (`HIDDEN_MODULES`)
- Modify: `client/src/i18n/accessStrings.js` (module and leaf labels)
- Modify: `client/src/tours/sections.js` (`SECTIONS.sports`)
- Test: `server/test/permissions.test.js`, `client/src/utils/permissionTree.test.js`

**Interfaces:**
- **Produces:** the keys `sports.view`, `sports.coach`, `sports.manage`. `sports` is still in `GRANT_ONLY_MODULES`, and no role default includes any of them.

- [ ] **Step 1:** Add tests.
  - **Server:**
    - `expandKeys(["sports"])` returns the three leaves;
    - no `ROLE_DEFAULTS` entry yields a `sports.*` key;
    - `GRANT_ONLY_MODULES` still equals `["finance","sports"]` sorted.
  - **Client:**
    - `HIDDEN_MODULES` equals `["finance"]`;
    - `visibleModules()` includes `"sports"`.
- [ ] **Step 2:** Run `npm test --prefix server` and `npm test --prefix client`. Expected: the new assertions FAIL.
- [ ] **Step 3:** Set `sports: ["view", "coach", "manage"]` in both trees and remove `"sports"` from `HIDDEN_MODULES`.
  - **Labels:** module `sports: "الرياضة"`; leaves `coach: "تدريب الفرق"` and `manage: "إدارة الرياضة"`.
    - The shared leaf label `manage` is already «إدارة الصلاحيات», so give the sports leaves module-specific labels in the existing mechanism. If none exists, add a `leavesByModule.sports` override that the permissions tab reads first.
  - Set `SECTIONS.sports = { path: "/sports", chapterId: null }` and `SECTION_OF.sports = "sports"`.
  - Check every consumer of `SECTIONS[...].chapterId` (new-access card «أرني», HelpCenter). With `null` the «أرني» button is hidden and nothing throws.
- [ ] **Step 4:** Run both test suites. Expected: PASS, with no other test broken.
- [ ] **Step 5:** Commit: `Add the sports permission leaves: view, coach, manage`.

### Task 2: Sport models and card calculations

**Files:**
- Create: the five model files in the data model table above.
- Create: `server/utils/sportCards.js`
- Modify: `server/server.js` (call the new `ensure…Indexes` with the others)
- Test: `server/test/sport-cards.test.js`

**Interfaces:**
- **Produces** (`server/utils/sportCards.js`):
  - `ageOn(birthDate: Date|string|null, now: Date) -> number|null`: whole years. `null` for missing or invalid dates.
  - `attendancePercent(trainings: Training[], studentId: string, joinedAt: Date|null, now: Date) -> number|null`
    - Counts trainings with `recorded === true`, `startsAt <= now` and `startsAt >= joinedAt` (when `joinedAt` is set).
    - Returns `Math.round(100 * present / counted)`, or `null` when `counted === 0`.
  - `buildCards({ players, sports, teams, trainings, studentId, now }) -> Card[]`, one per `SportPlayers` row whose sport exists, ordered by sport name:
    ```
    Card = { sport: { id, name, icon, stats: [{ key, label }] },
             jerseyNumber, position,
             teams: [{ id, name }],
             stats: { matches: 0, attendance: number|null, values: { [key]: 0 } } }
    ```
    - Attendance is pooled across all the student's teams in that sport. Each team counts from its own member `joinedAt`.
  - `nextTraining({ teams, trainings, sports, studentId, now }) -> { teamName, sportName, sportIcon, startsAt, place } | null`
    - The earliest `startsAt > now` among teams the student belongs to.

- [ ] **Step 1:** Write `server/test/sport-cards.test.js` with synthetic data. Name each test after its case:
  - `ageOn`: `2015-06-10` on `2026-06-09` gives `10`, and on `2026-06-10` gives `11`. `null` and `"garbage"` give `null`.
  - **`attendancePercent` counts only recorded past trainings after joining:** 4 trainings.
    - one in the future, one `recorded: false`, one before `joinedAt`, one past and recorded with the student present.
    - Result: `100`.
  - **`attendancePercent` returns null when nothing counts:** an empty list gives `null`.
  - **`buildCards` makes one card per sport and pools two teams of the same sport:** 2 teams in football with 2 + 2 recorded trainings, the student present at 3.
    - Result: attendance `75`; `teams` has both names; `values` has every stat key at `0`; `matches` is `0`.
  - **`buildCards` skips a player row whose sport was deleted.**
  - **`nextTraining` picks the earliest future training of the student's teams:** it ignores other teams' trainings and returns `null` when none are in the future.
- [ ] **Step 2:** Run `node --test server/test/sport-cards.test.js`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement the model files and `server/utils/sportCards.js` as pure functions with no I/O. Wire the indexes into `server.js`.
- [ ] **Step 4:** Run `npm test --prefix server`. Expected: PASS.
- [ ] **Step 5:** Commit: `Add the sport collections and the player card calculations`.

### Task 3: Staff API `/api/sports`

**Files:**
- Create: `server/Entities/Sport/Sport.controller.js`, `server/Entities/Sport/Sport.route.js`
- Modify: `server/server.js` (`app.use('/api/sports', require('./Entities/Sport/Sport.route'))`)
- Test: `server/test/sport-staff.test.js` (load the controller through `vm` with injected `memoryModel`-style stores, like `server/test/student-scope-routes.test.js`. Use `actorFor` from `server/test/helpers/actors.js`.)

**Interfaces:**
- **Consumes:** the Task 2 models; `requireAuth`; `loadActor`, `requirePermission`; `audit.record` (`server/utils/audit.js`) with `module: "sports"`.
- **Produces** (every response is `{ ok: true, ... }`, or `{ ok: false, message }` with an Arabic message):

| Method and path | Permission | Body and result |
| --- | --- | --- |
| `GET /` | `sports.view` | `{ sports }` |
| `POST /` | `sports.manage` | `{ name, icon, stats: [{ label }] }` returns `{ sport }`. 400 if `name` is blank, there are more than 4 stats, or a label is blank |
| `PUT /:id` | `sports.manage` | Same body. Stats with an existing `key` keep it; new ones get a fresh key |
| `DELETE /:id` | `sports.manage` | 409 `{ ok:false, message:"لا يمكن حذف رياضة لها فرق أو لاعبون" }` while teams or players reference it |
| `GET /coaches` | `sports.view` | `{ coaches: [{ id, firstname, lastname }] }`: active users whose effective permissions include `sports.coach` or `sports.manage` |
| `GET /teams` | `sports.view` | `{ teams }` with `coachNames` and member names |
| `POST /teams`, `PUT /teams/:id` | `sports.manage` | `{ name, sportId, coachIds }`. Each coach must be an active user holding `sports.coach` or `sports.manage` |
| `DELETE /teams/:id` | `sports.manage` | Also deletes the team's trainings |
| `PUT /teams/:id/members` | coach of the team, or `sports.manage` | `{ studentIds }`. Each student needs a `SportPlayers` row for the team's sport (400 otherwise). Keeps `joinedAt` for existing members and sets `now` for new ones |
| `GET /players` | `sports.view` | `{ players: [{ studentId, firstname, lastname, birth_date, gender, email, photo, sportId, jerseyNumber, position }] }` |
| `GET /students/search?q=` | `sports.coach` or `sports.manage` | Up to 20 students from **all** `Students` whose first name, last name or `tz` contains `q` (minimum 2 chars). Fields `_id, firstname, lastname, tz, birth_date, gender, email` only |
| `PUT /players/:studentId/:sportId` | `sports.coach` or `sports.manage` | `{ jerseyNumber, position }`, created if missing. `jerseyNumber` is null or an integer 1-99 |
| `DELETE /players/:studentId/:sportId` | `sports.coach` or `sports.manage` | Also removes the student from that sport's teams |
| `GET /teams/:id/trainings` | `sports.view` | `{ trainings }`, newest first |
| `POST /teams/:id/trainings` | coach of the team, or `sports.manage` | `{ startsAt, place }`, with `recorded: false` and `presentIds: []` |
| `PUT /trainings/:id` | coach of the training's team, or `sports.manage` | `{ startsAt?, place?, presentIds? }`. `presentIds` must be team members, and saving them sets `recorded: true` |
| `DELETE /trainings/:id` | coach of the training's team, or `sports.manage` | — |

- **Scope:** `GET /players` never returns `health_status`, parents, notes, address or phone (spec «فريق الرياضة في الجمعية»).
- **Audit:** every write calls `audit.record` with `targetType` `sport`, `team`, `player` or `training`.

- [ ] **Step 1:** Write `server/test/sport-staff.test.js`:
  - `a guide without sports keys gets 403 on GET /api/sports`: load the real router with `permissionMiddlewareStub` and assert the route guards.
  - `creating a sport with five stats is refused`: 400.
  - `renaming a stat keeps its key`.
  - `a coach who is not on the team cannot change its trainings`: 403. `a sports.manage holder can`: 200.
  - `members must be players of the team's sport`: 400.
  - `saving attendance marks the training recorded and rejects non-members`.
  - `player list exposes only sport fields`: the response rows have exactly the documented keys, with no `health_status`, `father_phone` or `notes`.
  - `deleting a player removes them from that sport's teams`.
- [ ] **Step 2:** Run `node --test server/test/sport-staff.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement the controller and routes: `router.use(requireAuth, loadActor)`, then guard each route as in the table. "Coach of the team" means `team.coachIds` includes `req.actor.id`.
- [ ] **Step 4:** Run `npm test --prefix server`. Expected: PASS.
- [ ] **Step 5:** Commit: `Add the staff sports API: sports, teams, players and trainings`.

### Task 4: Student sign-in `/api/sport-portal`

**Files:**
- Create: `server/Entities/SportPortal/SportPortal.auth.js` (request-code, verify, logout, and the `requireSportStudent` middleware)
- Create: `server/Entities/SportPortal/SportPortal.route.js`
- Modify: `server/utils/sendEmail.js` (add `sendSportLoginCodeEmail(to, code)`)
- Modify: `server/server.js` (`app.use('/api/sport-portal', require('./Entities/SportPortal/SportPortal.route'))`)
- Modify: `server/config/.env.example` (add `SPORT_SESSION_SECRET=` with the same generate-command comment as the JWT secrets)
- Test: `server/test/sport-portal-auth.test.js`

**Interfaces:**
- **Consumes:** `StudentModelDef`; `SportPlayer` and `SportLoginCode` models; `sha256`; `rateLimit`; `logWithSource`; `generateOtp6` (move it from `User.controller.js` into a shared `server/utils/otp.js` and import it in both places).
- **Produces:**
  - `POST /request-code { tz }` returns `{ ok: true, message: GENERIC_CODE_MESSAGE }` (always 200).
  - `POST /verify { tz, code }`:
    - success: `200 { ok: true }` and sets the `tamheed_sport` cookie;
    - wrong or expired code: `400 { ok: false, message: "الرمز غير صحيح أو انتهت صلاحيته" }`;
    - locked: `429 { ok: false, message: "محاولات كثيرة. حاول بعد 10 دقائق" }`.
  - `POST /logout` clears the cookie and returns `{ ok: true }`.
  - `requireSportStudent(req, res, next)`:
    - verifies the cookie with `SPORT_SESSION_SECRET` and checks `typ === "sport-student"`;
    - re-reads the student by `_id` and requires at least one `SportPlayers` row;
    - sets `req.sportStudent = <student doc>`;
    - otherwise returns `401 { ok: false, code: "SPORT_AUTH" }`.
    - It never reads `Authorization` or the `refresh` cookie.
  - `sendSportLoginCodeEmail(to, code)`:
    - subject `"رمز الدخول إلى تمهيد سبورت: " + code`;
    - HTML in the same style as `sendResetPasswordEmail`, saying the code is valid for 10 minutes.

- [ ] **Step 1:** Write `server/test/sport-portal-auth.test.js` with injected stores and a fake mailer. Each case asserts the exact status and body:
  - `unknown, duplicated, email-less and non-sport IDs all get the generic message and no email`.
  - `duplicated ID is logged without the tz`.
  - `a valid student gets one email, and the stored code is a hash`.
  - `a second request within 60 seconds sends nothing`.
  - `five wrong codes lock the ID for 10 minutes`.
  - `an expired code is refused`.
  - `a correct code sets a host-only httpOnly cookie on /api/sport-portal`: parse `Set-Cookie`; there is no `Domain=`, and there are `HttpOnly`, `Path=/api/sport-portal` and `SameSite=Lax`.
  - `requireSportStudent refuses a staff Bearer token and a staff refresh cookie`: 401.
  - `requireSportStudent refuses a token signed with JWT_ACCESS_SECRET`: 401.
  - `a sport session cookie does not open /api/student`: load the real student router with a request carrying only the `tamheed_sport` cookie, and expect 401 `NO_TOKEN`.
- [ ] **Step 2:** Run `node --test server/test/sport-portal-auth.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. The IP rate limit wraps `request-code` and `verify`. The code is cleared on success.
- [ ] **Step 4:** Run `npm test --prefix server`. Expected: PASS, including the existing reset-password tests after the `generateOtp6` move.
- [ ] **Step 5:** Commit: `Add student sign-in for the sport site with an emailed code`.

### Task 5: Student data `/api/sport-portal/me` and `/photo`

**Files:**
- Create: `server/Entities/SportPortal/SportPortal.controller.js`
- Modify: `server/Entities/SportPortal/SportPortal.route.js`
- Test: `server/test/sport-portal-data.test.js`

**Interfaces:**
- **Consumes:** `requireSportStudent`; `buildCards`, `nextTraining`, `ageOn` (Task 2); `googleDrive.extractFileId` and `googleDrive.downloadStream` (`server/services/googleDrive.service.js`).
- **Produces:**
  - `GET /me` returns:
    ```
    { ok: true,
      student: { firstname, lastname, age: number|null, hasPhoto: boolean },
      cards: Card[],
      nextTraining: {...}|null,
      teams: [{ name, sport: { name, icon }, coachNames: [string], members: [{ firstname, lastname }] }] }
    ```
  - `GET /photo` streams the signed-in student's own photo, with `Cache-Control: private, max-age=3600`. If there is no photo or the download fails: `404 { ok: false }`. **It never redirects to the Drive URL.**

- [ ] **Step 1:** Write `server/test/sport-portal-data.test.js`:
  - `me returns only the signed-in student's own card data`: the JSON has no `tz`, `email`, `photo` URL or `birth_date` anywhere. Check by deep-scanning the serialized body for the fixture values.
  - `teammates appear by first and last name only`.
  - `a student removed from sport gets 401`; `a deleted student gets 401`.
  - `photo streams through the server, and 404 when there is none`.
- [ ] **Step 2:** Run `node --test server/test/sport-portal-data.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. Read the student's teams with `members.studentId`, then those teams' trainings and the sports involved, and pass them to the Task 2 functions.
- [ ] **Step 4:** Run `npm test --prefix server`. Expected: PASS.
- [ ] **Step 5:** Commit: `Serve the student's card, next training and teams to the sport site`.

### Task 6: Serve the sport app by host name

**Files:**
- Create: `server/utils/sportHost.js`
- Modify: `server/server.js` (inside the `SERVE_CLIENT === 'true'` block, **before** the client static)
- Modify: `server/config/.env.example` (`SPORT_HOST=` with the comment «اسم النطاق لموقع الرياضة، مثلًا sport.tamheed-ramla.org»)
- Test: `server/test/sport-host.test.js`

**Interfaces:**
- **Produces:**
  - `isSportHost(req, sportHost: string) -> boolean`:
    - compares `req.hostname` (trust proxy is already on) case-insensitively;
    - `false` when `sportHost` is empty.
  - `sportStatic(distDir, sportHost) -> express middleware`:
    - for a sport-host request, serves files from `sport/dist`;
    - answers every non-`/api` HTML GET with `sport/dist/index.html`;
    - otherwise calls `next()`.

- [ ] **Step 1:** Write the tests:
  - `isSportHost` matches `Sport.Tamheed-Ramla.org` against `sport.tamheed-ramla.org`;
  - it rejects `system.tamheed-ramla.org`;
  - it rejects everything when `SPORT_HOST` is empty;
  - `sportStatic` calls `next()` for `/api/sport-portal/me` on the sport host.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement. Mount it as `app.use(sportStatic(path.join(__dirname, '..', 'sport', 'dist'), process.env.SPORT_HOST))`.
- [ ] **Step 4:** Run `npm test --prefix server`. Expected: PASS.
- [ ] **Step 5:** Commit: `Serve the sport site from the same server by host name`.

### Task 7: «الرياضة» section in the system client

**Files:**
- Create: `client/src/WebServer/services/sport/functionsSport.jsx` (same `call()` wrapper as `functionsVehicle.jsx`, one export per Task 3 route)
- Create: `client/src/i18n/sportStrings.js`, merged in `I18nContext.jsx` as `sport` like the other strings files
- Create: `client/src/Components/Sport/SportPage.jsx` and `client/src/Components/Sport/Sport.module.css`
  - Tabs: «الرياضات» (only with `sports.manage`), «الفرق», «اللاعبون», «التدريبات».
- Create: one component per tab: `SportsTab.jsx`, `TeamsTab.jsx`, `PlayersTab.jsx`, `TrainingsTab.jsx`
- Modify: `client/src/Components/Routes/Routes.jsx` (`/sports` inside `RoleGuard`), `client/src/utils/routeAccess.js` (`/^\/sports(\/|$)/` → `sports.view`), `client/src/Components/Header/Header.jsx` (link «الرياضة» with `data-tour="menu-sports"`, shown with `canStored("sports.view")`)
- Test: `client/src/utils/routeAccess.test.js` (add the cases), and `client/src/Components/Sport/sportForm.test.js` for the pure validators below.

**Interfaces:**
- **Consumes:** the Task 3 API; `canStored`; `useConfirm` for deletes.
- **Produces:** pure helpers in `client/src/Components/Sport/sportForm.js`:
  - `validateSport({ name, icon, stats }) -> { [field]: arabicMessage }`: at most 4 stats, no blank labels, a name is required.
  - `validateJersey(value) -> string|null`: blank or an integer 1-99.

**Screen behavior:**
- **«الرياضات»:** list plus form: name, icon (emoji text field), up to 4 stat labels. Editing keeps the order.
- **«الفرق»:** list per sport, with form: name, sport, coaches. Coaches are chosen from `GET /api/sports/coaches`.
  - Each team has a members picker limited to that sport's players.
- **«اللاعبون»:** grouped by sport, showing name, jersey and position. «إضافة لاعب» searches all students (`/students/search`, minimum 2 characters), then asks for the sport, jersey and position.
- **«التدريبات»:**
  - Choose a team, see its trainings, and add one (date and time, place).
  - Open a training to tick the present members. «حفظ الحضور» saves them.
  - Trainings not yet recorded show «لم يُسجَّل الحضور».

- [ ] **Step 1:** Write the tests:
  - `canAccessPath("/sports", ["sports.view"])` is true, and `canAccessPath("/sports", [])` is false.
  - `validateSport` rejects 5 stats and blank labels.
  - `validateJersey("0")`, `"100"` and `"7.5"` are rejected; `""` and `"10"` are accepted.
- [ ] **Step 2:** Run `npm test --prefix client`. Expected: FAIL.
- [ ] **Step 3:** Implement the screens in the style of `Components/Vehicle/*` (RTL, CSS modules, the existing confirm dialog).
- [ ] **Step 4:** Run `npm test --prefix client`, then `CI=false npm run build --prefix client`. Expected: PASS and a clean build.
- [ ] **Step 5:** Commit: `Add the sports section to the system: sports, teams, players and trainings`.

### Task 8: The sport web app (`sport/`)

**Files:**
- Create:
  - `sport/package.json` (name `tamheed-sport`, private; scripts `dev`, `build`, `test` = `vitest run`; exact versions from the Tech Stack);
  - `sport/vite.config.js` (react plugin; dev proxy `/api` → `http://localhost:5000`);
  - `sport/index.html` (`lang="ar" dir="rtl"`, title `تمهيد سبورت`, theme-color `#1e95c0`);
  - `sport/src/main.jsx`, `sport/src/App.jsx`, `sport/src/api.js`, `sport/src/format.js`, `sport/src/format.test.js`;
  - `sport/src/LoginPage.jsx`, `sport/src/HomePage.jsx`, `sport/src/TeamsPage.jsx`, `sport/src/PlayerCard.jsx`, `sport/src/BottomTabs.jsx`, `sport/src/styles.css`;
  - `sport/src/logo.png` (copy of `client/src/images/logo.png`).
- Modify: root `.gitignore` (`sport/dist`, `sport/node_modules`)

**Interfaces:**
- **Consumes:** the Task 4 and Task 5 endpoints. `api.js` uses `fetch` with `credentials: "same-origin"` and JSON.
- **Produces** (`format.js`):
  - `formatTrainingDate(iso: string, now: Date) -> string`: Arabic. «اليوم 17:00», «غدًا 17:00», otherwise «السبت 2/11 · 17:00». Use `Intl.DateTimeFormat("ar", { weekday: "long" })` with Latin digits (`numberingSystem: "latn"`).
  - `attendanceLabel(value: number|null) -> string`: `"92%"`, or `"—"` for `null`.

**Screen behavior:**
- **`App`:**
  - Calls `GET /me`. A 401 shows `LoginPage`; success shows the tabs.
  - Logout calls `POST /logout` and returns to `LoginPage`.
- **`LoginPage`:**
  - Logo, «تمهيد سبورت», and the field «رقم الهوية» (digits only, 5-9) with «أرسل الرمز». The button then shows the generic message.
  - Next comes the field «الرمز» (6 digits) with «دخول». The verify error message is shown as is.
- **`BottomTabs`:** «الرئيسية» and «فريقي» only in phase 1.
- **`HomePage`:**
  - «أهلاً <firstname> 👋».
  - The cards in a horizontal scroll-snap row (one per sport) with dot indicators.
  - A «التدريب القادم» box, or «لا يوجد تدريب قادم».
- **`PlayerCard`:** the approved shield, option 1. Top center: the sport icon and name. Top right: jersey number (or `—`), position, and the logo in a white circle with an orange ring.
  - **Photo:** `<img src="/api/sport-portal/photo">` when `hasPhoto`, otherwise the silhouette SVG.
  - **Name** with an orange underline.
  - **Six stat cells:** مباريات, الحضور, then up to 4 sport stats in order, then «سنة» (age) if there is room. With fewer stats the grid stays two columns and leaves no gaps. If age is `null`, the cell is omitted.
  - Footer `TAMHEED SPORT`.
- **`TeamsPage`:** each team with its sport icon, the coaches, and member names (no photos).
- **Layout:** phone-first. Max width 480px centered on desktop. No horizontal page scroll at 360px.

- [ ] **Step 1:** Write `sport/src/format.test.js`:
  - today, tomorrow and later dates relative to a fixed `now`;
  - `attendanceLabel(null) === "—"` and `attendanceLabel(92) === "92%"`.
- [ ] **Step 2:** Run `npm install --prefix sport`, then `npm test --prefix sport`. Expected: FAIL.
- [ ] **Step 3:** Implement the app.
- [ ] **Step 4:** Run `npm test --prefix sport` and `npm run build --prefix sport`. Expected: PASS and `sport/dist/index.html` exists.
- [ ] **Step 5:** Manual check. Run the server (`npm start --prefix server`) and `npm run dev --prefix sport`, with a local test student created through Task 7's screens. Then:
  - sign in;
  - see the card;
  - check at 360px width;
  - check that the Network tab shows only `/api/sport-portal/*` calls.
- [ ] **Step 6:** Commit: `Add the sport site: sign-in, player cards, next training and teams`.

### Task 9: Deployment

**Files:**
- Modify: `deploy/update.sh` (after the client build: `npm ci --prefix sport` and `npm run build --prefix sport`)
- Modify: `deploy/nginx-tamheed.conf` (a second `server` block for `sport.example.org`, same proxy settings and `client_max_body_size 1m`, no SSE location)
- Modify: `deploy/DEPLOY.md`:
  - a new section «موقع الرياضة»: DNS `A` record for `sport`, nginx block, `certbot --nginx -d sport.<domain>`, `.env` keys `SPORT_HOST` and `SPORT_SESSION_SECRET`, and a check `curl -sI https://sport.<domain>`;
  - also replace `/opt/tamheed` with `/var/www/tamheed` throughout.
- Test: none (config). Verify with `bash -n deploy/update.sh`.

- [ ] **Step 1:** Make the edits.
- [ ] **Step 2:** Run `bash -n deploy/update.sh`. Expected: no output.
- [ ] **Step 3:** Commit: `Deploy the sport site: build step, nginx block and guide`.

---

## Final verification (after Task 9)

- [ ] `npm test --prefix server`, `npm test --prefix client`, `npm test --prefix sport`: all pass.
- [ ] `CI=false npm run build --prefix client` and `npm run build --prefix sport`: both build cleanly.
- [ ] Update `docs/AI_REVIEW_LOG.md` with the changed files and a pending Codex review request.
