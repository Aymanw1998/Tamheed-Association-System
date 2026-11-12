# Display Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A wall TV opens a secret link and shows the weekly lesson program in one of three layouts, with no sign-in; managers create and control screens from the System.

**Architecture:** A `DisplayScreens` collection holds each screen (name, layout, SHA-256 of its link secret). A factory service (`createDisplayScreens`, same style as `services/weeklyTasks.js`) does management and builds the public feed; a router at `/api/displays` guards management with `displays.manage` and exposes one public, rate-limited `POST /feed`. In the System app, `index.js` short-circuits `/display` to a bare `DisplayPage` (no App shell), and a management tab «شاشات العرض» sits in `LessonsHub`.

**Tech Stack:** Node/Express, Mongo through `Entities/api.js`, `node:test`; React 18 (CRA), Jest + Testing Library. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-11-display-screen-design.md`

## Global Constraints

- Layout keys exactly `week` | `today` | `rotate`; Arabic labels «كل الأسبوع», «اليوم بالتفصيل», «يومًا بعد يوم».
- Permission `displays.manage`; `labels.ar.modules.displays` = «شاشات العرض», `labels.ar.leavesByModule.displays.manage` = «إدارة شاشات العرض». No role default (not in `ROLE_DEFAULTS`).
- Link secret: `crypto.randomBytes(32).toString("base64url")` (43 chars, `/^[A-Za-z0-9_-]{43}$/`); only `sha256(secret)` hex is stored; the secret never goes in a server path or query: page URL is `/display#<secret>`, sent in a POST body. No expiry, not one-use.
- Feed is exactly `{ name, layout, serverTime, lessons: [{ name, day, startMin, endMin, room, guide, kind }] }`; `guide` is a string or `null`; `kind` is `"lesson"` or `"sport"`; nothing else (no ids, students, helper, phones, counts).
- Closed link: HTTP 410 `{ ok:false, code:"LINK_CLOSED" }` for malformed, unknown or revoked secret. Page message: «رابط هذه الشاشة لم يعد صالحًا. اطلبوا رابطًا جديدًا من الجمعية.»
- Time zone `Asia/Jerusalem` for today/now; clock from server time + offset.
- Refresh every 60 s; stale note «آخر تحديث HH:MM» after 5 min without success; `rotate` shows each day 15 s; stored copy key `tamheed_display_feed_v1`, ignored after 7 days, wiped on 410.
- Week layout: Sunday–Thursday always; Friday/Saturday only if they have lessons.
- Display page code must run on Android TV WebView: no `structuredClone`, `Array.prototype.at`, `Object.hasOwn` or other post-2021 APIs in display files.
- The owner commits. Each task ends by proposing a commit message; never commit, never add a co-author trailer.
- After the last task: independent Codex review per `AGENTS.md`, logged in `docs/AI_REVIEW_LOG.md`.

## Review Focus

1. **TV clock wrong or set to another zone** → today and «الآن» still follow Israel time from the server. Test in Task 4 (`israelDayMinute` with offset).
2. **Page left open across midnight** → the day changes on the next tick without a reload. Test in Task 5 (`DisplayPage` with fake timers crossing 00:00).
3. **A day with many lessons (12+)** → every lesson is in the DOM, none cut silently. Test in Task 5 (each layout).
4. **Server restart, 500 or 429** → keeps showing the last program and is not treated as a closed link; only 410 closes. Test in Task 5.
5. **Teacher deleted, inactive or a hidden IT user** → lesson shows with no guide line. Test in Task 2.

---

### Task 1: The `displays.manage` permission

**Files:**
- Modify: `shared/permissions.json` (tree, `labels.ar.modules`, `labels.ar.leavesByModule`)
- Generated: `apps/system/src/generated/permissions.json`, `apps/it/src/generated/permissions.json` via `node scripts/syncPermissions.js`
- Modify: `apps/system/src/utils/routeAccess.js` (rule before every `/lessons` rule)
- Test: `server/test/permission-catalog.test.js`, `apps/system/src/utils/routeAccess.test.js` (create if absent)

**Interfaces:**
- Produces: permission key `displays.manage`; client path `/lessons/displays` gated by it.

- [ ] **Step 1: Write the failing tests**

```js
// server/test/permission-catalog.test.js
test("displays.manage exists with its labels and is nobody's default", () => {
  assert.deepEqual(catalog.tree.displays, ["manage"]);
  assert.equal(catalog.labels.ar.modules.displays, "شاشات العرض");
  assert.equal(catalog.labels.ar.leavesByModule.displays.manage, "إدارة شاشات العرض");
  for (const role of ["ادارة", "مرشد", "مساعد"]) assert.ok(!can(effectivePermissions({ role }), "displays.manage"));
  assert.ok(can(effectivePermissions({ role: "مرشد", permissionGrants: ["displays.manage"] }), "displays.manage"));
  assert.ok(can(effectivePermissions({}, { isSystem: true }), "displays.manage"));
});
```

```js
// apps/system/src/utils/routeAccess.test.js
test("/lessons/displays needs displays.manage only", () => {
  expect(canAccessPath("/lessons/displays", ["displays.manage"])).toBe(true);
  expect(canAccessPath("/lessons/displays", ["lessons.view", "calendar.view"])).toBe(false);
});
```

- [ ] **Step 2: Run, expect FAIL** — `node --test server/test/permission-catalog.test.js`; `npm test --prefix apps/system -- routeAccess`
- [ ] **Step 3: Add the catalog entries, run `node scripts/syncPermissions.js`, add `{ pattern: /^\/lessons\/displays$/, key: "displays.manage" }` as the first `/lessons` rule in `RESTRICTED`.**
- [ ] **Step 4: Run both again, expect PASS** (also `npm test --prefix apps/system -- permissionKeys` stays green).
- [ ] **Step 5: Propose commit message** «Add the displays.manage permission for wall display screens».

---

### Task 2: Screens store and feed service

**Files:**
- Create: `server/Entities/Display/DisplayScreen.model.js` (collection `DisplayScreens`, `modelFor` pattern from `Entities/WeeklyTask/WeeklyTask.model.js`: `get`, `create`, `updateExisting`, `delete`; unique index on `tokenHash` via `utils/ensureIndexes.js`)
- Create: `server/services/displayScreens.js`
- Test: `server/test/display-screens.test.js`

**Interfaces:**
- Consumes: `findActive`/`fullName` logic from `server/utils/lessonParticipants.js` (export `findActive` if needed), `isHiddenUser`.
- Produces:
  - `LAYOUTS = ["week","today","rotate"]`
  - `createDisplayScreens({ screens, lessons, sportLessons, users, audit, now = () => new Date(), randomSecret = () => crypto.randomBytes(32).toString("base64url") })` returning:
    - `list() → Promise<[{ id, name, layout, createdAt }]>` (never `tokenHash`)
    - `create({ name, layout }, req) → Promise<{ screen, secret }>`
    - `update(id, { name?, layout? }, req) → Promise<{ screen }>`
    - `rotate(id, req) → Promise<{ secret }>`
    - `remove(id, req) → Promise<{}>`
    - `feed(secret) → Promise<{ name, layout, serverTime, lessons }>`
  - Errors thrown as `Object.assign(new Error(msg), { status, code })`: 400 `BAD_INPUT` (name trimmed 1–60 chars, layout not in `LAYOUTS`), 404 `NOT_FOUND`, 410 `LINK_CLOSED`.
  - `displayScreens()` singleton wired to the real models (as `weeklyTasks()`), `audit` = `require("../utils/audit").audit`.

- [ ] **Step 1: Write the failing tests** (in-memory stores as in `server/test/lesson-sport-schedule.test.js`; `auditStub` for audit)

```js
test("create stores only the digest and returns the secret once", async () => {
  const { svc, screens } = setup();
  const { screen, secret } = await svc.create({ name: " المدخل ", layout: "today" }, req());
  assert.match(secret, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(screen.name, "المدخل");
  assert.equal(screens.all()[0].tokenHash, sha256(secret));
  assert.ok(!JSON.stringify(screens.all()).includes(secret));
  assert.ok(!("tokenHash" in (await svc.list())[0]));
});
test("bad name or layout is BAD_INPUT", ...);                 // "", 61 chars, "grid"
test("feed: lessons with guide, sport without guide, nothing else", async () => {
  // lesson {name:"رياضيات", teacher:T, helper:H, list_students:[...], list_users:[...], room:"1", date:{day:3,startMin:840,endMin:900}}
  // sport {name:"كرة قدم", date:{day:3,startMin:960,endMin:1050}, players:[...]}
  const feed = await svc.feed(secret);
  assert.deepEqual(Object.keys(feed).sort(), ["layout","lessons","name","serverTime"]);
  assert.deepEqual(feed.lessons[0], { name:"رياضيات", day:3, startMin:840, endMin:900, room:"1", guide:"سامي حداد", kind:"lesson" });
  assert.deepEqual(feed.lessons[1], { name:"كرة قدم", day:3, startMin:960, endMin:1050, room:"9", guide:null, kind:"sport" });
});
test("teacher missing, inactive or hidden IT user → guide null", ...);   // Review Focus 5
test("lesson with day outside 1..7 is left out", ...);
test("malformed, unknown, rotated and removed secrets are LINK_CLOSED", async () => {
  // "x", 43 random chars, old secret after rotate, secret after remove → each rejects { status:410, code:"LINK_CLOSED" }
});
test("layout change is in the next feed", ...);
test("create, rotate and remove are audited without the secret", ...);  // audit.calls has 3 rows, none contains secret
```

- [ ] **Step 2: Run, expect FAIL** — `node --test server/test/display-screens.test.js`
- [ ] **Step 3: Implement the model and service.** Guide lookup: one `findActive` per distinct teacher id, name via `fullName`. Feed order: by day, then `startMin`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Propose commit message** «Store display screens and build their public program feed».

---

### Task 3: `/api/displays` router

**Files:**
- Create: `server/Entities/Display/Display.route.js`
- Modify: `server/server.js` (mount `app.use('/api/displays', require('./Entities/Display/Display.route'))` beside the other entity routes)
- Modify: `server/test/route-guards.test.js` (`PUBLIC_ROUTES["Display/Display.route.js"] = ["POST /feed"]` with a comment: secret capability checked in the service, rate-limited)
- Test: `server/test/display-route.test.js`

**Interfaces:**
- Consumes: `displayScreens()` from Task 2.
- Produces (all JSON `{ ok, ... }`):
  - `POST /feed` body `{ token }` → 200 `{ ok:true, feed }` | 410 `{ ok:false, code:"LINK_CLOSED" }`; always `Cache-Control: no-store`; `rateLimit({ windowMs: 60_000, max: 30, scope: "display-feed" })`. Declared **before** `router.use(requireAuth, loadActor)`.
  - `GET /` → `{ ok:true, screens }`; `POST /` body `{ name, layout }` → `{ ok:true, screen, token }`; `PUT /:id` → `{ ok:true, screen }`; `POST /:id/rotate` → `{ ok:true, token }`; `DELETE /:id` → `{ ok:true }`. All `requirePermission("displays.manage")`; `/:id` through `objectIdParam`; responses carrying `token` also `no-store`.

- [ ] **Step 1: Write the failing tests** — load the router with stubbed `displayScreens`, `requireAuth`, `loadActor` (actor with/without `displays.manage`); assert: each management route answers 403 without the key and 200 with it; `/feed` works with no auth header; 410 passes through; `Cache-Control` is `no-store` on `/feed`, create and rotate; the 31st `/feed` call in a minute from one IP is 429.
- [ ] **Step 2: Run, expect FAIL** — `node --test server/test/display-route.test.js server/test/route-guards.test.js`
- [ ] **Step 3: Implement the router** (error mapping as `WeeklyTask.route.js`'s `handle`), mount it, update `PUBLIC_ROUTES`.
- [ ] **Step 4: Run, expect PASS**, then `npm test --prefix server`.
- [ ] **Step 5: Propose commit message** «Add the display screens API with a public, rate-limited feed».

---

### Task 4: Board logic (pure functions)

**Files:**
- Create: `apps/system/src/Components/Display/displayBoard.js`
- Test: `apps/system/src/Components/Display/displayBoard.test.js`

**Interfaces:**
- Produces:
  - `clockOffset(serverTimeIso: string, localNowMs: number) → number`
  - `israelDayMinute(ms: number) → { day: 1..7, minute: 0..1439, date: "DD/MM/YYYY", time: "HH:MM" }` (Sunday = 1; `Intl.DateTimeFormat` with `timeZone: "Asia/Jerusalem"`, `hourCycle: "h23"`)
  - `byDay(lessons) → { 1:[],...,7:[] }` sorted by `startMin`
  - `markDay(dayLessons, minute) → lessons with state: "past" | "now" | "next" | "later"` — `now`: `startMin <= minute < endMin`; `next`: not started and `startMin` equals the earliest start still to come; `past`: `endMin <= minute`.
  - `weekDays(grouped) → number[]` (1–5 always, 6/7 only if non-empty)
  - `comingDays(grouped, today) → [{ day, lessons }]` (from tomorrow, wrapping, non-empty, excluding today)
  - `rotationDays(grouped, today) → number[]` (non-empty days, starting at today or the next non-empty one)
  - `saveFeed(feed, nowMs)`, `loadFeed(nowMs) → feed | null` (null after 7 days or on bad JSON or throwing storage), `clearFeed()`; key `tamheed_display_feed_v1`; every storage call in try/catch.
  - `DAY_NAMES = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"]`

- [ ] **Step 1: Write the failing tests** — include:
  - `israelDayMinute(Date.parse("2026-11-10T14:20:00Z"))` → `{ day: 3, minute: 980, time: "16:20" }` (Tuesday, UTC+2).
  - TV clock 3 h fast: `offset = clockOffset("2026-11-10T14:20:00Z", Date.parse("2026-11-10T17:20:00Z"))`, then `israelDayMinute(localNow + offset).minute === 980` (Review Focus 1).
  - `2026-11-10T22:05:00Z` → day 4, minute 5 (midnight in Israel).
  - Overlap: two lessons 960–1050 at minute 980 → both `now`; two lessons starting 1050 → both `next`; one starting 1110 → `later`.
  - `weekDays` with a Saturday lesson → `[1,2,3,4,5,7]`.
  - `loadFeed` returns null for a copy saved 8 days ago, and when `localStorage.getItem` throws.
- [ ] **Step 2: Run, expect FAIL** — `npm test --prefix apps/system -- displayBoard`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Propose commit message** «Add the time and grouping logic for the display board».

---

### Task 5: The display page and its three layouts

**Files:**
- Create: `apps/system/src/WebServer/services/display/functionsDisplay.jsx` (`fetchDisplayFeed`; management calls are added in Task 6)
- Create: `apps/system/src/Components/Display/DisplayPage.jsx`, `WeekLayout.jsx`, `TodayLayout.jsx`, `RotateLayout.jsx`, `Display.module.css`
- Modify: `apps/system/src/index.js` (bare render for `/display`)
- Modify: `apps/system/src/pwa/AppChrome.jsx` `canApplySystemUpdate` (stays true on `/display`; confirm no form selector blocks it)
- Test: `apps/system/src/Components/Display/DisplayPage.test.js`, `apps/system/src/Components/Display/layouts.test.js`

**Interfaces:**
- Consumes: Task 4 functions; `roomLabel` from `utils/rooms.js` (room `"0"`/empty → show nothing, not «بدون غرفة»); feed shape from Task 3.
- Produces:
  - `fetchDisplayFeed(token) → Promise<{ ok:true, feed } | { ok:false, closed:true } | { ok:false }>` via `publicApi.post("/displays/feed", { token })`; `closed` only for HTTP 410.
  - `DisplayPage` (default export): token from `window.location.hash.slice(1)`; shows `loadFeed()` at once if present; fetches at mount and every 60 s; ticks the clock every 15 s; stale note after 5 min; on `closed` → `clearFeed()` and the closed message; on success → `saveFeed`. Picks `WeekLayout` / `TodayLayout` / `RotateLayout` by `feed.layout` (unknown → `week`). A first load with no copy and no network shows «جارٍ تحميل البرنامج…», never blank.
  - Layout props: `{ lessons, today, minute }`. Top bar «تمهيد · برنامج الأسبوع» (`today` layout: «برنامج اليوم»), date, clock. Each lesson: name, `HH:MM–HH:MM`, room label if any, guide line only when `guide` is non-null. `rotate`: 15 s per day, progress bar, day-name row.
  - `index.js`: when `/^\/display\/?$/.test(location.pathname)`, mount `<AppErrorBoundary><DisplayPage/></AppErrorBoundary>` only (no `App`, `AppChrome`, `ReportProblem`, `QueueStatus`, `StatusBadge`, `ToastProvider`); `startFreshApp` and `serviceWorkerRegistration.register()` still run.
  - Visual target: the mockups in `.superpowers/brainstorm/display-screen-layouts-v2.html` (dark board, 16:9, RTL); readable at 1920×1080 from ~3 m.

- [ ] **Step 1: Write the failing tests** (mock `fetchDisplayFeed`, Jest fake timers, `jest.setSystemTime`):
  - renders lesson name, time, room label and guide; no guide line when `guide: null`.
  - 410 → closed message shown, `localStorage` copy removed.
  - stored copy + fetch `{ ok:false }` (500) → program shown; same for 429 shape; no closed message (Review Focus 4).
  - after 5 min of failures the stale note «آخر تحديث» appears; it goes after a success.
  - layout switches when a later fetch returns another `layout`.
  - system time 23:59:50 Tuesday → advance 30 s → Wednesday is today (Review Focus 2).
  - each layout with 14 lessons on one day renders all 14 names (Review Focus 3).
  - `rotate` moves to the next day after 15 s.
- [ ] **Step 2: Run, expect FAIL** — `npm test --prefix apps/system -- Display`
- [ ] **Step 3: Implement the service call, page, layouts, CSS and the `index.js` branch.**
- [ ] **Step 4: Run, expect PASS**, then `npm test --prefix apps/system`.
- [ ] **Step 5: Propose commit message** «Add the wall display page with week, today and day-by-day layouts».

---

### Task 6: Managing screens in the System

**Files:**
- Modify: `apps/system/src/WebServer/services/display/functionsDisplay.jsx` (add management calls)
- Create: `apps/system/src/Components/Display/DisplayScreensPage.jsx` (+ `.module.css` if needed)
- Modify: `apps/system/src/Components/Lesson/LessonsHub.jsx` (`TABS` += `{ key: "displays", path: "/lessons/displays", label: "شاشات العرض" }`)
- Modify: `apps/system/src/Components/Routes/Routes.jsx` (`<Route path="/lessons/displays" element={<LessonsHub active="displays"><DisplayScreensPage/></LessonsHub>} />` above `/lessons/:id`)
- Modify: `apps/system/src/pwa/shouldCache.js` (`NEVER` += `/^\/api\/displays(\/|$)/i`)
- Test: `apps/system/src/Components/Display/DisplayScreensPage.test.js`, `apps/system/src/pwa/shouldCache.test.js`

**Interfaces:**
- Consumes: Task 3 endpoints.
- Produces: `listDisplays()`, `createDisplay({ name, layout })`, `updateDisplay(id, patch)`, `rotateDisplayLink(id)`, `deleteDisplay(id)` → server JSON; `displayLink(token) = \`${window.location.origin}/display#${token}\``.
- Page behaviour: list (name, layout label, created date); «إضافة شاشة» form (name + layout select with the three Arabic labels); per row: change layout (saves at once), rename, «رابط جديد» and «حذف» each behind `useConfirm` (texts state the old link stops working). After create or new link, a dialog shows the full link with a copy button and «احفظ الرابط الآن — لن يظهر مرة أخرى.»

- [ ] **Step 1: Write the failing tests** — list renders; create shows the link dialog with `/display#<token>`; closing it and reopening the page never shows the token again; rotate and delete call the API only after confirm; `shouldCache("/api/displays", "GET") === false`; `LessonsHub` shows the tab only with `displays.manage`.
- [ ] **Step 2: Run, expect FAIL** — `npm test --prefix apps/system -- DisplayScreensPage shouldCache LessonsHub`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Propose commit message** «Let managers create screens, choose their layout and reissue their links».

---

### Task 7: Docs, full verification, review request

**Files:**
- Modify: `deploy/DEPLOY.md` (new Hebrew section «מסך תצוגה בטלוויזיה»: TV + Google TV stick + Fully Kiosk Browser — start on boot, keep screen on, reload on error, exit PIN, hide the remote; alternative: Samsung/LG signage URL launcher; not the TV's own browser; where the link comes from and how to reissue it)
- Modify: `docs/FEATURE_PERMISSIONS.md` (row for display screens / `displays.manage`, public `/api/displays/feed`)
- Modify: `docs/AI_REVIEW_LOG.md`; Create: `docs/reviews/2026-11-12-display-screen-codex-request.md`

- [ ] **Step 1: Write the docs.**
- [ ] **Step 2: `npm run verify`** — expect all server and System tests pass and the build succeeds.
- [ ] **Step 3: Browser check** — start the dev servers, create a screen, open its link at 1920×1080, switch the layout from the management page and see the TV page follow within a minute; screenshot each layout; with the server stopped, reload `/display#…` and confirm the stored program shows (production build + service worker, `npm run build --prefix apps/system` served by the server).
- [ ] **Step 4: Codex request + log entry** (changed files, verification, open points; no secrets).
- [ ] **Step 5: Propose the final commit message(s)** to the owner.
