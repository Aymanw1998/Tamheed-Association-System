# Tamheed Stage A: Live Updates and Locks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every edit anywhere shows on other open screens within 2 seconds, and every editable item can be open in only one tab at a time, with a lock screen naming who holds it.

**Architecture:**
- **Live hub:** the server is one process. A new in-memory hub fans out `change` and `lock` events to all open staff SSE streams the moment a write commits. A small sport SSE stream does the same for players. The existing LiveEvents polling stays as the backup channel for files and alerts.
- **Locks:** a `Locks` collection with one unique key per item, owned by a per-tab `clientId`, with a 20-second heartbeat. Locks expire 2 minutes after the last heartbeat.
- **Server enforcement:** every write route for a lockable item checks the lock (423) and the item's `updatedAt` (409). The client gets a `useItemLock` hook and a `LockedScreen`.

**Tech Stack:**
- server: Express, Mongoose via `server/Entities/api.js`, `node:test` with the vm/stub helpers;
- `client/` and `sport/`: CRA 5 with Jest;
- SSE, extending `server/Entities/Live/Live.route.js` and `client/src/WebServer/services/live/liveStream.js`.

**Spec:** `docs/superpowers/specs/2026-10-25-tamheed-platform-design.md`. The binding sections are decisions 1–9 under «المرحلة أ» and items 1–8 under «قرارات المصمّم بعد مراجعة المنفّذ». Excel import locking (spec item 9 / reviewer item 8) is deferred to stage D, because no import exists yet.

## Global Constraints

- **Lock keys, exactly:** `student:<id>`, `player:<studentId>`, `lesson:<id>`, `sportLesson:<id>`, `attendance:<lessonId>:<YYYY-MM-DD>`, `sportAttendance:<lessonId>:<YYYY-MM-DD>`, `report:<id>`, `user:<id>`, `vehicle:<id>`.
- **Lock owner:** the owner is a tab. Its `clientId` is a random id kept in `sessionStorage` key `tamheed-client-id`, sent as header `X-Client-Id`. The same user in another tab is blocked like anyone else.
- **Timings:**
  - heartbeat every 20 s;
  - a lock expires 120 s after the last heartbeat;
  - after 10 minutes with no keypress, click or touch, the prompt «هل ما زلت هنا؟» appears;
  - no answer within 60 s releases the lock and makes the screen read-only. Typed text stays on the screen.
- **Lock screen text:** «مفتوح الآن لدى <الاسم الكامل> (<رقم الهوية>)». The screen opens the item by itself when the lock is released. Users with `permissions.manage` also see the button «تحرير القفل».
- **Server statuses:**
  - **Locked by another tab:** 423, body `{ ok:false, code:"LOCKED", holder:{ name, tz } }`.
  - **Stale save:** 409, body `{ ok:false, code:"STALE", current }`. The client then shows «تم تعديل هذا العنصر من قِبل <الاسم> أثناء غيابك. نُسخ نصّك أدناه لتحفظه من جديد.» and keeps the draft.
- **Live latency:** a committed write reaches other open screens within 2 s.
- **Event payload privacy:** events carry only `{ entity, id }` (or `{ key }` for locks). Screens reload through their own API calls with the viewer's permissions.
- **Background jobs:** the nightly absence job, alerts and pushes take no locks. Assistant actions obey locks: if anyone holds the item, the action fails with the 423 message.
- **Commits:** Arabic-only UI. Commit after each task on master, with no Co-Authored-By trailer, and never push.

## Review Focus

1. **Two tabs press «فتح» in the same millisecond:** exactly one gets the lock. Test in Task 2, with two concurrent acquires on the real atomic path stubbed as the unique-index race.
2. **The holder's tab is closed without release** (no unload event, e.g. a killed phone app): others get in after 120 s. Test in Task 2.
3. **Stale save after the lock expired and someone else saved:** 409, and nothing is overwritten. Test in Task 3.
4. **An admin force-releases while the holder is typing:** the holder's next heartbeat learns it lost the lock, and the screen turns read-only with the draft kept. Test in Task 5.
5. **The live stream drops and reconnects:** the screen reloads once on reopen, because missed events are not replayed. Test in Task 6.

---

### Task 1: Live hub and the `change`/`lock` events on the staff stream

**Files:**
- Create: `server/services/liveHub.js`
- Modify:
  - `server/Entities/Live/Live.route.js`: on stream open, register with the hub; on close, unregister. Write hub events as `event: change` and `event: lock`.
  - Add `change` and `lock` to the allowed stream types.
- Test: `server/test/live-hub.test.js`

**Interfaces (Produces):**
- `createLiveHub()` returns:
  - `subscribe(kind: "staff"|"sport", id: string, send: (type, payload) => void) -> unsubscribe()`;
  - `broadcastStaff(type: "change"|"lock", payload)`, which goes to every staff subscriber;
  - `toStudents(studentIds: string[], type: "me", payload = {})`, which goes to matching sport subscribers.
- The default instance is `liveHub`.
- `notifyChange(entity: string, id: string)` is exported from `liveHub.js`. It calls `broadcastStaff("change", { entity, id })`.

- [ ] **Step 1: Write the failing tests:**
  - Two staff subscribers both get `change {entity:"student", id:"7"}`.
  - A sport subscriber does not get staff events.
  - `toStudents(["s1"])` reaches only the `s1` sport subscriber.
  - Unsubscribe stops delivery.
  - A subscriber whose `send` throws is removed, and the others still receive.
  - **Route:** opening the stream with a stubbed hub registers a staff subscriber. A `notifyChange` then writes `event: change\ndata: {"entity":"student","id":"7"}` to the response within the same tick.
- [ ] **Step 2:** Run `node --test server/test/live-hub.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. Keep the existing poll loop unchanged.
- [ ] **Step 4:** Run `npm test --prefix server`. Expected: all pass.
- [ ] **Step 5:** Commit: `Add an in-memory live hub for instant change and lock events`

### Task 2: Lock service, model and routes

**Files:**
- Create:
  - `server/Entities/Lock/Lock.model.js` (collection `Locks`; unique index `{ key: 1 }`; fields `key, clientId, userId, tz, name, acquiredAt, heartbeatAt, expiresAt`);
  - `server/services/locks.js`;
  - `server/Entities/Lock/Lock.route.js`, mounted at `/api/locks` behind `requireAuth` + `loadActor`.
- Modify: `server/server.js` to mount it and ensure the index.
- Test: `server/test/locks.test.js`

**Interfaces (Produces):**
- `createLocks({ model, hub, now })` returns:
  - `acquire(key, owner: { clientId, userId, tz, name }) -> { ok: true, lock } | { ok: false, holder: { name, tz } }`.
    - It is atomic: update where `key` matches and (`expiresAt < now` or `clientId` is the same), with upsert. A duplicate-key error means another tab holds it.
    - It sets `expiresAt = now + 120 s`.
  - `heartbeat(key, clientId) -> boolean`. It is false when the lock is no longer this tab's.
  - `release(key, clientId) -> void`;
  - `forceRelease(key) -> boolean`;
  - `holderOf(key, clientId) -> null | { name, tz }`. It returns null when free, expired, or held by this tab.
  - Every acquire, release and force-release calls `hub.broadcastStaff("lock", { key })`.
- **Routes** (body `{ key }`, header `X-Client-Id`):
  - `POST /api/locks/acquire` returns 200 `{ ok, lock }` or 423 LOCKED.
  - `POST /api/locks/heartbeat` returns 200 `{ ok: true }` or 410 `{ ok:false, code:"LOST" }`.
  - `POST /api/locks/release` returns 200.
  - `POST /api/locks/force-release` needs `permissions.manage` and returns 200.
  - `GET /api/locks/:key` returns 200 `{ ok, holder|null }`.
  - Keys must match the Global Constraints patterns, otherwise 400. A missing `X-Client-Id` gives 400.
  - The owner's name is the actor's `firstname lastname`, and `tz` is the actor's tz.

- [ ] **Step 1: Write the failing tests (stub model with a unique-key map):**
  - Acquire by A, then acquire by B gives holder A. B never overwrites A.
  - A re-acquire by A refreshes its own lock.
  - Two concurrent acquires (simulate both reaching upsert, so the second gets E11000) give exactly one `ok`.
  - Heartbeats keep the lock alive.
  - At `now + 121 s` without a heartbeat, B acquires.
  - Heartbeat after force-release gives false, and the route gives 410.
  - Release by a non-owner is a no-op.
  - A bad key gives 400.
  - A missing client id gives 400.
  - Force-release without `permissions.manage` gives 403.
  - Lock events are broadcast on acquire, release and force-release.
- [ ] **Step 2:** Run `node --test server/test/locks.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test --prefix server`. Expected: all pass.
- [ ] **Step 5:** Commit: `Add item locks owned by a browser tab, with heartbeat and admin release`

### Task 3: Enforce locks and versions on writes, and announce changes (students, users, vehicles, reports)

**Files:**
- Create: `server/middleware/lockGuard.js`
- Modify, on every create/update/delete/photo route of these modules:
  - `server/Entities/Student/Student.route.js` and controller;
  - `server/Entities/User/User.route.js` and controller;
  - `server/Entities/Vehicle/Vehicle.route.js` and controller;
  - `server/Entities/Report/Report.route.js` and controller.
- Test: `server/test/lock-guard.test.js`, plus one assertion per module in its existing route or controller test.

**Interfaces:**
- **Consumes:** `locks.holderOf` (Task 2) and `notifyChange` (Task 1).
- **Produces:**
  - `requireFreeOrMine(keyOf: (req) => string|Promise<string>)`: Express middleware. It gives 423 LOCKED when `holderOf(key, req.get("X-Client-Id"))` returns a holder.
  - `checkVersion(current, req) -> null | 409 body`. When `req.body.baseVersion` (ISO `updatedAt` the client opened) differs from `current.updatedAt`, it returns `{ ok:false, code:"STALE", current }`.
  - Create routes take no lock check. Update, delete and photo routes take both checks.
  - After every successful write the controller calls `notifyChange("<entity>", id)`, with entity one of `student|user|vehicle|report`.
  - `exports.assertFree(key) -> Promise<void>`: it throws a 423-shaped error if anyone holds `key`. This is for callers without a tab.

- [ ] **Step 1: Write the failing tests:**
  - **Guard:**
    - A request with the holder's client id passes.
    - Another client id gets 423 with the holder's name and tz.
    - No lock passes.
    - A stale `baseVersion` gives 409 STALE with `current`.
    - A missing `baseVersion` passes, for old clients.
  - **Per module:**
    - `PUT /api/student/:tz` while another tab holds `student:<id>` gives 423, and the model's update is never called.
    - A successful update calls `notifyChange("student", id)`. Do the same for user, vehicle and report.
  - **Photo upload:** while held by another tab it gives 423 before any Drive call.
- [ ] **Step 2:** Run `node --test server/test/lock-guard.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. Resolve each route's key from its params; the student routes use `tz`, so look up the `_id` once.
- [ ] **Step 4:** Run `npm test --prefix server`. Expected: all pass.
- [ ] **Step 5:** Commit: `Refuse writes to items locked by someone else, and announce every change`

### Task 4: The same for lessons, attendance, sport and the assistant

**Files:**
- Modify:
  - `server/Entities/Lesson/*` (lesson writes and roster);
  - `server/Entities/Attendance/*` (bulk-save, key `attendance:<lessonId>:<YYYY-MM-DD>`);
  - `server/Entities/Sport/Sport.route.js` and controller (players `player:<studentId>`, stats, sport lessons and roster `sportLesson:<id>`, sport attendance `sportAttendance:<lessonId>:<date>`);
  - `server/services/assistant/actionRunner.js`: before running a write action, call `assertFree(key)` for its target. On 423 the action result is FAILED with «مفتوح الآن لدى <الاسم الكامل> (<رقم الهوية>)».
- Also announce changes:
  - `notifyChange` with entity `lesson|attendance|player|sportLesson|sportAttendance|sport`;
  - and `liveHub.toStudents(affectedStudentIds, "me")` for every sport write that changes what a player sees on the sport site: player, stats, sport lesson, sport attendance, and student name or photo.
- Test: additions in `lesson-*`, `attendance` bulk-save, `sport-staff`, `sport-lessons` and `assistant-actions` tests.

- [ ] **Step 1: Write the failing tests:**
  - A held `attendance:L1:2026-10-25` gives 423 on bulk-save for that lesson and date, while L1 on another date is free.
  - A stats bump while another tab holds `player:s1` gives 423.
  - An assistant action on a held student gives FAILED with the holder message, and the model is unchanged.
  - A sport attendance save calls `toStudents([...marked students], "me")`.
- [ ] **Step 2:** Run the touched test files. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test --prefix server`. Expected: all pass.
- [ ] **Step 5:** Commit: `Lock lessons, attendance sheets, sport items and assistant actions, and announce their changes`

### Task 5: Client lock hook, lock screen and stale-save handling

**Files:**
- Create:
  - `client/src/locks/clientId.js`, which exports `getClientId()` (sessionStorage `tamheed-client-id`, created once per tab);
  - `client/src/locks/useItemLock.js`;
  - `client/src/locks/LockedScreen.jsx` and a CSS module;
  - `client/src/locks/StillHereDialog.jsx`;
  - `client/src/locks/staleSave.js`.
- Modify:
  - `client/src/WebServer/services/api.jsx`: an axios request interceptor adds the `X-Client-Id` header to every request.
  - `client/src/WebServer/services/live/liveStream.js`: add `onChange(payload)` and `onLock(payload)` callbacks, and export a tiny event bus `liveEvents` (`on(type, fn) -> off`) that the app-wide stream feeds.
- Test: `client/src/locks/useItemLock.test.js`, `client/src/locks/staleSave.test.js`

**Interfaces (Produces):**
- `useItemLock(key: string|null, { enabled = true } = {}) -> { status: "loading"|"held"|"blocked"|"readonly", holder: {name,tz}|null, release(), retry() }`:
  - it acquires on mount and heartbeats every 20 s;
  - a 410 makes it `readonly`;
  - it releases on unmount and on `pagehide` (with `navigator.sendBeacon` to `/api/locks/release`, carrying the client id in the body);
  - after 10 minutes without input it shows `StillHereDialog` («هل ما زلت هنا؟», buttons «نعم، ما زلت هنا»); no answer within 60 s releases and makes it `readonly`;
  - when `blocked`, it re-tries automatically on `liveEvents` `lock` for its key and every 15 s.
- `<LockedScreen holder onForceRelease? />` shows the exact Global Constraints text. The «تحرير القفل» button appears only with `canStored("permissions.manage")`.
- `handleSaveError(err, { draft, setNotice }) -> boolean`:
  - on 409 STALE it shows the stale message with the draft text in a read-only box and a «نسخ» button, then returns true;
  - on 423 it shows the holder message and returns true;
  - otherwise it returns false.
- `withBaseVersion(body, openedDoc) -> body`, which adds `baseVersion: openedDoc.updatedAt`.

- [ ] **Step 1: Write the failing tests (fake timers, stub api):**
  - **acquire:** acquire ok gives `held`. An acquire 423 gives `blocked` with the holder. A `lock` event for the key re-acquires, which gives `held`.
  - **heartbeat:** heartbeat 410 (force-released) gives `readonly`.
  - **idle:** 10 min idle shows the dialog. 60 s more gives `readonly`, and release is called.
  - **unmount:** unmount calls release.
  - **clientId:** two different sessionStorage values give different client ids.
  - **stale save:** 409 keeps the draft and shows the message.
- [ ] **Step 2:** Run `npm test --prefix client -- --watchAll=false src/locks`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test --prefix client -- --watchAll=false` and `CI=false npm run build --prefix client`. Expected: PASS.
- [ ] **Step 5:** Commit: `Add the item lock hook, lock screen and stale-save handling`

### Task 6: Use the locks in every edit screen, and live-refresh every list

**Files:**
- **Modify (locks):** wrap each edit screen with `useItemLock`. While `blocked`, render `<LockedScreen>` instead of the screen. While `readonly`, disable the inputs. Send `withBaseVersion` on save, and route save errors through `handleSaveError`.
  - `client/src/Components/Student/EditStudent.jsx` (`student:<id>`)
  - `Lesson/EditLesson.jsx` (`lesson:<id>`)
  - `Attendance/AttendancePage.jsx` (`attendance:<lessonId>:<date>`, re-locking when the lesson or date changes)
  - `Report/EditReport.jsx`, `User/EditUser.jsx`, `Vehicle/EditVehicle.jsx`
  - `Sport/AddPlayerDialog.jsx` in edit mode (`player:<studentId>`)
  - `Sport/LessonsTab.jsx` edit form and `LessonRosterDialog.jsx` (`sportLesson:<id>`)
  - `Sport/AttendanceTab.jsx` (`sportAttendance:<lessonId>:<date>`)
  - The +/− stat buttons in `PlayersTab.jsx` take `player:<studentId>` for the duration of the click, through a one-shot acquire, write and release.
- **Create:** `client/src/locks/useLiveRefresh.js`, exporting `useLiveRefresh(entities: string[], reload: () => void)`:
  - it calls `reload` when a `change` event's entity is in `entities`, debounced 300 ms;
  - it also calls it once on every stream reopen.
- **Modify (live refresh):** apply it to `ViewAllStudent`, `ViewAllLesson`, `AttendancePage`, `ViewAllReport`, `ViewAllUser`, `ViewAllVehicle`, and the four sport tabs.
- **Test:** `client/src/locks/useLiveRefresh.test.js` (debounce, entity filter, reload on reopen), plus one integration-style test that `EditStudent` renders `LockedScreen` when the acquire answers 423.

- [ ] **Step 1:** Write the tests above.
- [ ] **Step 2:** Run `npm test --prefix client -- --watchAll=false`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test --prefix client -- --watchAll=false` and `CI=false npm run build --prefix client`. Expected: PASS.
- [ ] **Step 5:** Commit: `Lock every edit screen and refresh every list live`

### Task 7: Sport site live stream, offline queue and the 423 status, docs

**Files:**
- **Server:**
  - add `GET /api/sport-portal/live` (SSE, `requireSportStudent`, Origin guard as today) in `server/Entities/SportPortal/`;
  - it subscribes `liveHub` kind `sport` with the student id and writes `event: me` on `toStudents`, with a ping every 25 s.
- **Sport:**
  - in `sport/src/App.jsx`, while signed in, open an `EventSource("/api/sport-portal/live")`;
  - on `me`, quietly reload `/me`, as the existing return-refresh does;
  - close it on logout or 401;
  - reconnect with backoff. On reopen, reload once.
- **Client queue:** in `client/src/pwa/attendanceQueue.js`, treat 423 like a transient status: keep the item and stop the flush, then retry later. Do not mark it failed.
- **Docs:**
  - `deploy/DEPLOY.md`: one line noting that nginx must not buffer SSE for `/api/sport-portal/live`, the same as the existing live stream. Check the current nginx conf, and add `proxy_buffering off` for that location if it is missing.
  - `docs/AI_REVIEW_LOG.md`: a new entry with the pending Codex request.
- **Tests:**
  - **server:** the sport live route without the cookie gives 401, and with the cookie a `toStudents(["s1"])` writes `event: me`;
  - **sport:** an App test where an `EventSource` stub emitting `me` triggers `getMe` again;
  - **client:** an `attendanceQueue` test where 423 keeps the item.

- [ ] **Step 1:** Write the tests above.
- [ ] **Step 2:** Run the three suites. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run:
  - `npm test --prefix server`
  - `npm test --prefix client -- --watchAll=false`
  - `npm test --prefix sport`
  - `CI=false npm run build --prefix client`
  - `CI=true npm run build --prefix sport`

  Expected: all pass.
- [ ] **Step 5:** Commit: `Push player changes live to the sport site and keep locked attendance queued`
