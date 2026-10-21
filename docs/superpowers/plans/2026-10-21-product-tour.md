# Product Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First-sign-in welcome tour, per-screen tours on first visit, prompts for newly granted sections/abilities, a "what's new" modal, a "?" help center, and a tour status on the user page — all stored per user on the server.

**Architecture:** The server keeps three new user fields behind a small DI router at `/api/tours` (same factory pattern as `server/routes/ai.routes.js`). The client keeps tour content as code (`client/src/tours/`), pure decision logic in one tested module, and one `TourProvider` that drives `driver.js` and decides what to show at sign-in and on navigation. Screens only gain `data-tour` attributes and listen to two window events.

**Tech Stack:** Node/Express + `node:test`; React 18 (CRA 5) + Jest (pure utils only); `driver.js` pinned to `1.3.1`.

**Spec:** `docs/superpowers/specs/2026-10-21-product-tour-design.md` (Arabic). Read it.

## Global Constraints

- No real action can run during a tour: driver.js `disableActiveInteraction: true`, overlay blocks the page; navigation only through popover buttons.
- A step whose target is missing or whose `requires` the user lacks is dropped before start; a tour with zero steps left is not shown and not recorded.
- Three languages for every user-facing string (ar/he/en); RTL follows `useI18n().dir`. Tone: professional and friendly, a title + at most two short sentences per step.
- The repo is public: no real TZs, emails, names or passwords in code, tests, docs or fixtures.
- Owner files — `client/src/Components/Header/Header.jsx`, `Profile/Profile.jsx`, `Student/EditStudent.jsx`, `User/EditUser.jsx`, `User/ViewAllUser.jsx`, `client/src/utils/session.js` — are touched ONLY in Task 6, and only after `git status --short` shows them clean (owner committed). If not clean, the controller stops and tells the owner.
- Commits: no Co-Authored-By trailer; never push.
- The system account never appears in tour status UI; `/api/tours/reset/:tz` answers 404 for it.
- Server stores; client decides. The server only validates shape and permissions.

## Review Focus

1. **User whose permissions shrink** (key in `knownKeys` no longer held) — no prompt, no badge, no crash; Task 3 test `newAccess ignores keys the user lost`.
2. **Brand-new deploy, existing users** (`knownKeys` null) — they see the welcome once but never fake "new section" prompts or old "what's new" entries; Task 3 test `first run seeds instead of prompting`.
3. **Detail route `/students/new`** — no detail tour; Task 3 test `tourForPath skips new records`.
4. **Hostile POST bodies** (`__proto__` id, 10k ids, non-string keys, status "admin") — 400 or silently filtered, never stored; Task 2 tests.
5. **Server down / `/api/tours` 500** — the app works with no tours, no error toasts; Task 4 step pins `loadTourState` returning `null` on any error and the provider showing nothing.

---

### Task 1: Tour state rules (server, pure)

**Files:**
- Create: `server/utils/tourState.js`
- Modify: `server/Entities/User/User.model.js` (fields), `server/Entities/User/User.controller.js` (`SERVER_OWNED_FIELDS`, `sanitize` output, `getOneU`)
- Test: `server/test/tour-state.test.js`

**Interfaces:**
- Produces (all pure, from `server/utils/tourState.js`):
  - `TOUR_ID_RE = /^[a-z][a-zA-Z0-9-]{0,39}$/`
  - `parseTourUpdate(body) -> { id, status, version } | null` — `status` ∈ `"done" | "skipped"`, `version` integer 1..1000.
  - `mergeKnownKeys(current: string[]|null, incoming: unknown, held: Set<string>) -> string[]` — keeps only strings in `held`, union with `current`, sorted, unique.
  - `mergeSeenReleases(current: string[], incoming: unknown) -> string[] | null` — `null` when incoming is not an array or has > 50 items; ids must match `TOUR_ID_RE`-like `/^[a-z0-9][a-z0-9-]{0,59}$/`; union; keeps the newest 500.
  - `tourSummary(tours: object) -> { welcome: "done"|"skipped"|"none", done: number, skipped: number }` (counts exclude `welcome`).
  - `MAX_TOURS = 100` — `applyTour(tours, update) -> object|null` returns the new map with `{ status, version, at: Date }` at `update.id`, null when adding a new id would exceed `MAX_TOURS`. Built with `Object.create(null)`-safe copying (no prototype keys).

- [ ] **Step 1: Write failing tests** in `server/test/tour-state.test.js`:
  - `parseTourUpdate` accepts `{id:"students", status:"done", version:1}` (id from caller), rejects `id:"__proto__"`, `"Students"`, 41-char id, `status:"admin"`, `version:0`, `1.5`, `"1"`.
  - `mergeKnownKeys(null, ["students.view","users.view",7], new Set(["students.view"]))` → `["students.view"]`; `mergeKnownKeys(["a.b"], "x", held)` → `["a.b"]`.
  - `mergeSeenReleases([], new Array(51).fill("a"))` → `null`; dedupes; drops `"Bad Id"`.
  - `tourSummary({})` → `{welcome:"none",done:0,skipped:0}`; `{welcome:{status:"skipped"}, students:{status:"done"}}` → `{welcome:"skipped",done:1,skipped:0}`.
  - `applyTour` returns null at 101st distinct id; overwriting an existing id at the cap still works.
- [ ] **Step 2: Run** `cd server && node --test test/tour-state.test.js` → FAIL (module missing).
- [ ] **Step 3: Implement** `server/utils/tourState.js`.
- [ ] **Step 4: Model + controller.** Add to `UserModelDef.fields`: `tours: { type: 'object', required: false, default: {} }`, `knownKeys: { type: 'array', required: false, default: null }` (null = never seeded), `seenReleases: { type: 'array', required: false, default: [] }`. Add `"tours", "knownKeys", "seenReleases"` to `SERVER_OWNED_FIELDS`. `sanitize` drops these three raw fields from every user response. In `getOneU`, when `req.actor` can `users.edit`, `canManageTarget(req.actor, found)` is true and the user is not the system account, add `user.tourSummary = tourSummary(found.tours || {})`. Add a test (same file or `user-profile-authorization.test.js` style) that `putU` ignores a `tours` field in the body.
- [ ] **Step 5: Run** `cd server && npm test` → all PASS.
- [ ] **Step 6: Commit** `git commit -m "Store per-user tour progress on the server"`.

### Task 2: `/api/tours` router

**Files:**
- Create: `server/routes/tours.routes.js`
- Modify: `server/server.js` (mount next to `/api/alerts`)
- Test: `server/test/tours-routes.test.js` (uses `test/helpers/actors.js`, `auditStub.js` patterns; start an express app on port 0 like `ai-feature.test.js`)

**Interfaces:**
- Consumes: Task 1 functions.
- Produces: `createToursRouter({ requireAuth, loadActor, requirePermission, users, audit, canManageTarget, isSystemTz }) -> express.Router`, default export wired with real deps. `users` is the `UserModelDef`-shaped object (`get`, `update`).
- Endpoints (all after `requireAuth, loadActor`; the actor's own record is `req.actor.user`):
  - `GET /` → `{ ok:true, tours, knownKeys, seenReleases }` (`knownKeys` may be `null`).
  - `POST /item/:id` body `{status, version}` → 200 `{ok:true, tours}`; 400 `{ok:false, code:"BAD_INPUT"}`; 409 `{ok:false, code:"TOO_MANY"}` when `applyTour` returns null.
  - `POST /known-keys` body `{keys}` → `{ok:true, knownKeys}`; `held` = `req.actor.permissions` (Set of effective keys).
  - `POST /releases/seen` body `{ids}` → `{ok:true, seenReleases}`; 400 BAD_INPUT on null merge.
  - `POST /reset/:tz` → `requirePermission("users.edit")`; target looked up in active room; missing or `isSystemTz` → 404; `!canManageTarget` → 403 `{code:"FORBIDDEN"}`; sets `tours: {}` only (never `knownKeys`/`seenReleases`); `audit.record(req, { action: "tours_reset", entity: "user", ... })` following `recordUser`'s shape in `User.controller.js`; → `{ok:true}`.
- Ruling vs spec: spec wrote `/api/user/me/tours…`; `/api/user/:tz` routes would shadow `me`, so tours live at `/api/tours`. Same behaviour.

- [ ] **Step 1: Failing tests** — one per endpoint happy path, plus: 401 without auth; `POST /item/__proto__` → 400 and `Object.prototype` untouched; `known-keys` with a key the actor lacks stores nothing new; `reset` by an actor without `users.edit` → 403; reset of system tz → 404; reset of a higher-ranked target → 403; reset clears `tours` but keeps `knownKeys` and `seenReleases`; audit stub received `tours_reset`.
- [ ] **Step 2: Run** `cd server && node --test test/tours-routes.test.js` → FAIL.
- [ ] **Step 3: Implement** router + mount `app.use('/api/tours', require('./routes/tours.routes'))`.
- [ ] **Step 4: Run** `cd server && npm test` → all PASS (including `route-guards.test.js`; if it enumerates routers, register the new one the way it expects).
- [ ] **Step 5: Commit** `git commit -m "Add the tours API: progress, known permissions, seen releases, reset"`.

### Task 3: Tour content model and decision logic (client, pure)

**Files:**
- Create: `client/src/tours/logic.js`, `client/src/tours/sections.js`, `client/src/tours/registry.js`, `client/src/tours/releases.js`
- Test: `client/src/tours/logic.test.js`, `client/src/tours/registry.test.js`

**Interfaces:**
- Tour definition shape (registry.js exports `TOURS: Tour[]`):
  `{ id, version, route: RegExp|null, detail: boolean, requires: string|null, steps: Step[] }`;
  `Step = { target: string|null /* data-tour value; null = centered */, requires?: string, menu?: true /* inside the mobile side menu */, tab?: string, title: {ar,he,en}, body: {ar,he,en} }`.
- `releases.js` exports `RELEASES: { id, date: "YYYY-MM-DD", requires: string|null, tourId: string|null, title:{ar,he,en}, body:{ar,he,en} }[]` — newest first; start with one entry `2026-10-21-product-tour` announcing the help center (`tourId: null`).
- `sections.js` exports `SECTION_OF: Record<module, section|null>` and `SECTIONS: Record<section, { path, tourId }>`:
  - sections with a screen: `dashboard→/dashboard`, `calendar→/calendar` (module `attendance` also maps to `calendar`), `students→/students`, `lessons→/lessons`, `reports→/reports`, `vehicles→/vehicles`, `files→/files`, `notices→/notices`, `users→/users`, `audit→/audit`.
  - `permissions` module maps to section `users` (abilities only, never a "new section").
  - `ai`, `systemRecovery`, `sports`, `finance` map to `null`.
- `logic.js` exports:
  - `can(permissions: string[], key: string|null) -> boolean` (null = true; delegates to `hasPermission` from `utils/permissionKeys`).
  - `usableSteps(tour, { permissions, exists: (target) => boolean }) -> Step[]` — drops steps failing `requires` or whose non-null target doesn't exist; `menu` steps count as existing when `exists` is true for them after the menu is opened (caller passes an `exists` that knows this).
  - `tourForPath(pathname) -> Tour|null` — first tour whose `route` matches; for `detail` tours, null when the last segment is `new`.
  - `newAccess(knownKeys: string[]|null, permissions: string[]) -> { seed: boolean, sections: string[], abilities: string[] }` — `seed` true when `knownKeys` is null (then lists are empty). New keys = held − known. A section is "new" when none of the known keys maps to it; otherwise it lands in `abilities`. `null`-mapped modules ignored. Sorted, unique.
  - `unseenReleases(seen: string[], permissions) -> Release[]`.
  - `startupQueue({ state, permissions, deferred: Set<string> }) -> ("welcome"|"access"|"releases")[]` — welcome when `state.tours.welcome` missing and `"welcome"` not deferred; access when `newAccess` lists are non-empty and `"access"` not deferred; releases when `unseenReleases` non-empty and `!seed`. Seed runs produce no "access"/"releases".
  - `pickText(text: {ar,he,en}, language) -> string` (fallback ar).
- Registry in this task: `welcome` only, with steps whose targets live in non-owner files: centered intro (`target:null`), `"assistant-button"` (FloatingAIButton, `requires:"ai.use"`), `"help-button"`. Task 6 inserts menu steps.

- [ ] **Step 1: Failing tests** in `logic.test.js`: `tourForPath("/students/new")` null, `"/students/abc"` the student tour (use a fake registry passed via an optional second arg `tours = TOURS`); `newAccess(null, [...])` → `{seed:true, sections:[], abilities:[]}` ("first run seeds instead of prompting"); `newAccess(["students.view"], ["students.view","students.delete","vehicles.view"])` → sections `["vehicles"]`, abilities `["students"]`; `newAccess(["students.view","vehicles.view"], ["students.view"])` → empty lists ("ignores keys the user lost"); `ai.use` new → nothing; `permissions.manage` new with `users.view` known → abilities `["users"]`; `usableSteps` drops a step with missing target and one with unmet `requires`; `startupQueue` orders welcome→access→releases and respects `deferred`.
  `registry.test.js`: ids unique and match `/^[a-z][a-zA-Z0-9-]{0,39}$/`; every title/body has non-empty ar, he, en; every body ≤ 220 chars; every `SECTIONS[*].tourId` exists in `TOURS` or is listed in an explicit `PENDING_TOURS` array exported from `registry.js` (emptied by Task 6); release ids unique, dates valid, `tourId` null or existing.
- [ ] **Step 2: Run** `cd client && npx react-scripts test --watchAll=false src/tours` → FAIL.
- [ ] **Step 3: Implement** the four files.
- [ ] **Step 4: Run** same command → PASS.
- [ ] **Step 5: Commit** `git commit -m "Add tour content model and the rules for what to show"`.

### Task 4: Tour engine, startup flow and help center

**Files:**
- Create: `client/src/WebServer/services/tours/functionsTours.jsx`, `client/src/tours/TourProvider.jsx`, `client/src/tours/runTour.js`, `client/src/tours/HelpCenter.jsx`, `client/src/tours/Tours.module.css`, `client/src/i18n/tourStrings.js`
- Modify: `client/package.json` (`"driver.js": "1.3.1"` exact), `client/src/i18n/I18nContext.jsx` (merge as `tour`), `client/src/Components/Routes/Routes.jsx` (wrap `ProtectedLayout` content in `<TourProvider>`), `client/src/Components/AI/FloatingAIButton.jsx` (`data-tour="assistant-button"` on the launcher only)

**Interfaces:**
- Consumes: Task 2 endpoints, Task 3 logic.
- Produces:
  - Service: `loadTourState() -> {tours, knownKeys, seenReleases} | null` (null on ANY error), `saveTour(id, status, version)`, `saveKnownKeys(keys)`, `saveSeenReleases(ids)`, `resetUserTours(tz) -> {ok:boolean}`; saves swallow errors (log once to console).
  - `runTour(tour, { language, dir, t, onFinish(status: "done"|"skipped"|"later") }) -> () => void` (destroy). driver.js with `disableActiveInteraction: true`, `allowClose: true`, `overlayClickBehavior: "nothing"` (or the 1.3.1 equivalent), popover buttons next/prev/done plus injected "later" and "skip" buttons via `onPopoverRender`. Esc/close = `"later"`. Sets `dir` on the popover. Before a step with `menu: true` dispatches `window` event `tamheed:tour-menu` `{detail:{open:true}}` and `{open:false}` after; a step with `tab` dispatches `tamheed:tour-tab` `{detail:{tab}}`.
  - `useTour()` context: `{ startTour(id), openHelp(), openWhatsNew(), state }`.
  - `HelpCenter` modal: "explain this screen" (disabled when `tourForPath` is null), "general tour" (`welcome`), "what's new" (all permitted releases, unseen first, each with "show me" when `tourId`), and the list of every permitted tour that has a route the user can open (`canAccessPath`) — starting a tour for another screen navigates there first, then starts.
  - Fixed "?" button `data-tour="help-button"` (opposite corner from FloatingAIButton, above it on mobile).
- Behaviour pinned here:
  - On mount: `loadTourState()`; null → render children only. If `knownKeys` null → `saveKnownKeys(permissions)` and `saveSeenReleases(RELEASES.map(r=>r.id))` silently (seed).
  - `deferred` lives in `sessionStorage` key `tamheed_tours_deferred` (try/catch) — "later" adds the id; the next sign-in (new session) shows it again.
  - Startup queue (Task 3) runs one item at a time: welcome modal (centered intro step + rest of tour) → access prompt (small non-blocking card: "فُتح لك قسم X — أريك إياه؟" per section, "أُضيفت لك إمكانيات في X" per ability, buttons "show me"/"not now"; "show me" navigates to `SECTIONS[s].path`; for abilities it also starts that section tour even if already done; "not now" defers `"access"`) → what's new modal (marks shown ids seen on close).
  - Visiting a section path: post `saveKnownKeys` with the user's held keys of that section's modules (clears the "new" state).
  - Auto section tour on navigation: `tourForPath(location.pathname)`, not in `state.tours`, not deferred, no element matching `[role="dialog"][aria-modal="true"]` open, startup queue idle; wait up to 5000 ms (poll 250 ms) for the first targeted step's element, then `usableSteps`; zero steps → do nothing.
  - On finish: `done`/`skipped` → `saveTour(id, status, tour.version)` and update local state; `later` → defer.

- [ ] **Step 1: Install** `cd client && npm install driver.js@1.3.1 --save-exact`.
- [ ] **Step 2: Write strings** (`tourStrings.js` in the `accessStrings.js` style; ar/he/en for every button and HelpCenter/prompt label, plus the welcome tour's centered intro).
- [ ] **Step 3: Implement** service, `runTour`, provider, HelpCenter, CSS; mount in `Routes.jsx`.
- [ ] **Step 4: Run** `cd client && npm test` and `npm run build` → PASS / builds without new warnings.
- [ ] **Step 5: Browser check** (controller, preview): sign in as a seeded test user, see welcome, press "later", reload same tab → not shown; new tab sign-in → shown; "skip" → recorded; "?" opens help center; while a step is shown, clicking the highlighted button does nothing.
- [ ] **Step 6: Commit** `git commit -m "Add the tour engine, sign-in welcome, new-access prompts, what's new and help center"`.

### Task 5: Screen tours for non-owner screens

**Files:**
- Modify (add `data-tour` attributes only — no behaviour change): `Dashboard`, `ViewAllStudent`, `ViewAllLesson`, `EditLesson`, `AttendancePage`, `ViewAllReport`, `EditReport`, `ViewAllVehicle`, `EditVehicle`, `FilesPage`, `NoticesBoard`, `AuditPage` components (find each via `Routes.jsx` imports), `FloatingAIButton.jsx` (alerts tab)
- Modify: `client/src/tours/registry.js`

**Interfaces:**
- Produces tours `dashboard`, `students`, `lessons`, `lesson` (detail), `calendar`, `reports`, `report` (detail), `vehicles`, `vehicle` (detail), `files`, `notices`, `audit`, `assistant` (alerts; chat step `requires:"ai.use"` and only when its target exists). `data-tour` values: `<tourId>-<thing>` kebab-case, e.g. `students-add`, `students-search`, `vehicle-documents`. 4–8 steps per tour; destructive buttons (delete, archive) get a step that explains them and their permission.
- Each action button's step carries the `requires` key that shows that button (read the component's own `canStored(...)` checks).

- [ ] **Step 1:** Add attributes and tour definitions; remove these ids from `PENDING_TOURS`.
- [ ] **Step 2: Run** `cd client && npm test` (registry test enforces languages/length) and `npm run build` → PASS.
- [ ] **Step 3: Browser check** (controller): open three screens as an admin and as a guide test user; tours start once, skip missing buttons, never fire on `/lessons/new`.
- [ ] **Step 4: Commit** `git commit -m "Add guided tours for every section screen"`.

### Task 6: Owner-file screens, menu badges and the user page status

**Gate:** `git status --short client/src/Components/Header client/src/Components/Profile client/src/Components/Student/EditStudent.jsx client/src/Components/User client/src/utils/session.js` prints nothing. Otherwise stop.

**Files:**
- Modify: `Header.jsx` (menu `data-tour` per link `menu-<section>`, `menu-toggle`, `notice-bell`; a "new" badge from `useTour().newSections`; listen to `tamheed:tour-menu` to open/close the mobile menu), `ViewAllUser.jsx` (`users` tour anchors), `EditUser.jsx` (`user` detail tour anchors incl. the permissions tab; listen to `tamheed:tour-tab`; "Guided tour" section showing `user.tourSummary` with "show again at next sign-in" → `resetUserTours(tz)`, rendered only when `user.tourSummary` exists), `EditStudent.jsx` (`student` detail tour), `Profile.jsx` (`profile` tour), `client/src/tours/registry.js` (menu steps into `welcome` with `menu: true`; new tours; empty `PENDING_TOURS`), `TourProvider.jsx` (expose `newSections: string[]` from `newAccess`).
- Strings: summary labels "أنهى الجولة / تخطّى / لم يرها بعد" + button text in `tourStrings.js` (ar/he/en).

- [ ] **Step 1:** Implement; keep each owner-file diff minimal (attributes, one listener, one small section).
- [ ] **Step 2: Run** `npm test` (root: server + client) and `cd client && npm run build` → PASS.
- [ ] **Step 3: Browser check** (controller): grant a test guide `vehicles.view` from the permissions tab → that user's next sign-in shows the prompt and a "new" badge on Vehicles until visited; grant `students.delete` → abilities prompt, no badge; reset from the user page → welcome shows again; mobile width: menu steps open the side menu.
- [ ] **Step 4: Commit** `git commit -m "Tour the menu, users, students and profile; new badges; tour status on the user page"`.

### Task 7: Docs

- [ ] Append an entry to `docs/AI_REVIEW_LOG.md` (files changed, Codex handoff pending), and a short "how to add a tour / a what's-new entry" section to the top comment of `client/src/tours/registry.js`. Commit `git commit -m "Document how to add tours and what's-new entries"`.
