# Tamheed Apps (Phase 1, PWA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the staff system (`client/`) and the sport site (`sport/`) into two installable apps. Each gets offline reading, offline attendance recording that syncs later, and phone push notifications.

**Architecture:**
- **Both CRA apps:** each gets an Arabic `manifest.json`, generated icons and a CRA 5 `src/service-worker.js` (Workbox InjectManifest).
  - API `GET`s are network-first with a cache fallback.
  - Attendance saves that fail offline go into an IndexedDB queue keyed by user, which is replayed when the app is back online.
- **Server:** Web Push (VAPID) through a new `PushSubscriptions` collection and one `utils/push.js` sender. It is triggered by:
  - the existing alert engine (no-attendance alerts);
  - notice publishing;
  - a new 5-minute reminder job;
  - sport stat and attendance changes.

**Tech Stack:**
- server: Express, Mongoose via `server/Entities/api.js`, `node:test` with vm/stub helpers, `node-cron`, and new `web-push@3.6.7`;
- client and sport: CRA 5 (`react-scripts` 5.0.1), Jest, and new `workbox-core`/`workbox-precaching`/`workbox-routing`/`workbox-strategies`/`workbox-expiration` all at `6.6.0`.

**Spec:** `docs/superpowers/specs/2026-10-24-tamheed-apps-design.md` (Arabic, approved). The section «قرارات المصمّم بعد مراجعة المنفّذ» is binding.

## Global Constraints

- **App names:** «تمهيد» (system) and «تمهيد - رياضة» (sport). Both use `lang: "ar"`, `dir: "rtl"` and `display: "standalone"`.
- **Theme colours:** system `#1e6580`, sport `#0b2a3a`. Icons are made from `client/src/images/logo.png` on those backgrounds: 192, 512, and 512 maskable.
- **UI text:**
  - All UI text is professional Arabic. The only Latin text is `TAMHEED SPORT` on the card.
  - Offline bar: «لا يوجد اتصال – البيانات من آخر تحديث».
  - Save disabled offline: «يتطلب اتصالًا بالإنترنت».
  - Update bar: «يوجد تحديث – إعادة التحميل».
  - Install button: «تثبيت التطبيق».
- **Push content:** no ID numbers or student names.
  - Player card change: «تم تحديث بطاقتك».
  - Training reminder: «تدريبك اليوم الساعة HH:MM».
  - Staff no-attendance alert: «درس <الاسم> انتهى دون تسجيل حضور».
  - Staff notice: the notice title.
- **Attendance conflict message:** «تم تحديث حضور سجّله شخص آخر».
- **Never cached by the service worker:** `/api/auth/*`, `/api/sport-portal/request-code`, `/api/sport-portal/verify`, `/api/sport-portal/photo`, `/api/storage/*`, and anything not `GET`.
- **Logout:** clears the API cache and the user's queue. If queued attendance exists, the user is asked first.
- **VAPID keys:** come only from `.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). They are empty in `.env.example`, and none are in the repo. Push is a no-op when they are unset.
- **Rules unchanged:** no change to login rules, permissions or `PASSWORD_ENC_KEY_HEX`.
- **Commits:** commit after each task on master. No Co-Authored-By trailer, never push.

## Review Focus

1. **Offline attendance saved, then the session expires:** the queue waits, and it is sent after the SAME user signs in again. Test in Task 6.
2. **A push endpoint that answers 404 or 410:** its subscription is deleted, and other subscriptions still get the push. Test in Task 1.
3. **The reminder job runs twice in the same 5-minute window, or two windows overlap:** each player gets one reminder per lesson per day. Test in Task 3.
4. **Logout:** the cached API responses and that user's queue are gone. Test in Task 5 (cache) and Task 6 (queue).
5. **A notice is published:** its author gets no push, and users without `notices.view` get none. Test in Task 2.

---

### Task 1: Push core (server)

**Files:**
- Create:
  - `server/Entities/Push/PushSubscription.model.js`: collection `PushSubscriptions`, with the unique index `{ endpoint: 1 }` and an `ensurePushSubscriptionIndexes` export (same pattern as `SportLoginCode.model.js`).
  - `server/utils/push.js`
  - `server/Entities/Push/Push.route.js`
- Modify:
  - `server/server.js`: mount `/api/push`, and ensure the indexes.
  - `server/Entities/SportPortal/SportPortal.route.js`: add the sport subscribe routes.
  - `server/package.json`: add `"web-push": "3.6.7"`.
  - `server/config/.env.example`: add `VAPID_PUBLIC_KEY=`, `VAPID_PRIVATE_KEY=`, `VAPID_SUBJECT=`.
- Test: `server/test/push.test.js`

**Interfaces:**
- **Produces:** `PushSubscription` fields: `{ kind: "staff"|"sport", tz?: string, studentId?: string, endpoint: string, keys: { p256dh, auth }, createdAt }`.
- **Produces** (`utils/push.js`): `createPush({ webpush, subscriptions, env })`, which returns:
  - `publicKey() -> string|null`;
  - `sendToStaff(tzs: string[], payload: { title, body, url }) -> Promise<{ sent, removed }>`;
  - `sendToStudents(studentIds: string[], payload) -> Promise<{ sent, removed }>`.
  
  Also a default instance `push`. With no VAPID keys every send returns `{ sent: 0, removed: 0 }`.
- **Routes:**
  - `GET /api/push/key` is public and returns `{ ok, key }`.
  - `POST /api/push/subscribe` and `DELETE /api/push/subscribe` need staff auth (`requireAuth` + `loadActor`). The body is `{ subscription }`. Upsert by endpoint, with `kind: "staff"` and `tz` = actor tz.
  - `POST /api/sport-portal/push/subscribe` and `DELETE` need `requireSportStudent`, with `kind: "sport"` and `studentId`.

- [ ] **Step 1: Write the failing tests (stub webpush and subscriptions):**
  - `sendToStaff(["111"])` sends only to staff subscriptions with that tz, and only to all of that user's devices.
  - A webpush rejection with `statusCode` 410 or 404 deletes that subscription. The other one still gets the push, and the result is `{ sent: 1, removed: 1 }`.
  - With empty env, the result is `{ sent: 0, removed: 0 }` and webpush is never called.
  - Subscribing twice with the same endpoint keeps one row.
  - The staff subscribe route without a token gives 401. The sport subscribe route without the sport cookie gives 401.
  - `GET /api/push/key` returns the env public key.
  - Add the new public route to `PUBLIC_ROUTES` in `route-guards.test.js`.
- [ ] **Step 2:** Run `node --test server/test/push.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. Sends run in parallel with `Promise.allSettled`, and the payload is `JSON.stringify(payload)`.
- [ ] **Step 4:** Run `npm test --prefix server`. Expected: all pass.
- [ ] **Step 5:** Commit: `Add web push subscriptions and a sender`

### Task 2: Staff pushes: no-attendance alerts and new notices (server)

**Files:**
- Modify:
  - `server/services/alertEngine.js`: after `raise` writes alerts of type `lesson_no_attendance` or `sport_lesson_no_attendance`, call `push.sendToStaff(recipientTzs, { title: "تمهيد", body: <rendered text>, url: link || "/" })`. Errors are logged, never thrown.
  - `server/services/alertJob.js`:
    - add `sport_lesson_no_attendance`: a sport lesson whose `date.day` is today and whose `endMin` has passed, with no `SportAttendance` rows for today's date;
    - recipients are `recipientsFor({ permission: ["sports.coach", "sports.manage"] })`, or the engine's equivalent for "any of";
    - `dedupKey` is `sport_no_att:<lessonId>:<YYYY-MM-DD>`;
    - it runs in the existing 15-minute slot.
  - `server/services/alertTemplates.js` and `server/services/alertAccess.js`: the new type. The text is «درس {name} انتهى دون تسجيل حضور», for sports staff.
  - `server/Entities/Notice/Notice.controller.js` `create`: after publishing, push the title to `recipientsFor({ permission: "notices.view" })` minus the author, with `url: "/notices"`.
- Test: `server/test/alert-push.test.js`, plus additions in `alert-job.test.js` and `notice-controller.test.js`.

**Interfaces:**
- **Consumes:** `push.sendToStaff` (Task 1); `SportLessonModelDef` and `SportAttendanceModelDef`; `israelToday` and `dayOfDate` from `server/utils/sportCards.js`.

- [ ] **Step 1: Write the failing tests:**
  - **Alert pushes:**
    - raising `lesson_no_attendance` for tz `["A","B"]` calls `sendToStaff(["A","B"], …)` with the rendered text;
    - raising another type (for example `absence_streak`) sends no push;
    - a push failure does not fail `raise`.
  - **Sport alert:** the job with a stubbed clock (Sunday 19:00 Israel) and a Sunday 17:00–18:30 sport lesson with no attendance raises `sport_lesson_no_attendance` once. A second run in the same day raises nothing (dedup). With attendance saved for today it raises nothing.
  - **Notices:** a notice created by user X pushes to every `notices.view` holder except X.
- [ ] **Step 2:** Run the three test files. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test --prefix server`. Expected: all pass.
- [ ] **Step 5:** Commit: `Push no-attendance alerts and new notices to staff phones`

### Task 3: Player pushes: training reminder and card changes (server)

**Files:**
- Create: `server/services/sportPushJob.js`
  - `runReminderSlot(deps, now)`: once per 5-minute slot under a JobRuns lock (reuse `acquireLock` from `alertJob.js`, exported if needed). It finds sport lessons on today's weekday that start 55–60 minutes from `now`, Israel time. For each, it sends `sendToStudents(playerIds, { title: "تمهيد - رياضة", body: "تدريبك اليوم الساعة HH:MM", url: "/" })`.
  - **Dedup:** a JobRuns lock key `sport-reminder:<lessonId>:<YYYY-MM-DD>`.
  - `startSportPushJob()`: cron `*/5 * * * *` with `Asia/Jerusalem`, started from `server.js` beside the alert job.
- Create: `server/utils/cardPush.js`, with `notifyCardChanged(studentIds, now)`. It pushes «تم تحديث بطاقتك» at most once per 10 minutes per student. The last-sent time is stored on `SportPlayer.lastCardPushAt`.
- Modify:
  - `server/Entities/Sport/Sport.controller.js`: after a successful `POST /players/:studentId/stats`, and after `PUT /lessons/:id/attendance` (for the students whose mark was saved), call `notifyCardChanged` without awaiting the result's errors.
  - `server/Entities/Sport/SportPlayer.model.js`: add `lastCardPushAt: date|null`.
- Test: `server/test/sport-push.test.js`

**Interfaces:**
- **Consumes:** `push.sendToStudents` (Task 1).
- **Produces:** `runReminderSlot(deps, now) -> Promise<{ sent: number, skipped?: string }>` and `notifyCardChanged(studentIds: string[], now?: Date) -> Promise<number>`.

- [ ] **Step 1: Write the failing tests:**
  - **Reminder:**
    - `now` = Sunday 16:03 Israel and a Sunday 17:00 lesson with players p1 and p2 give one send to `["p1","p2"]`, with body «تدريبك اليوم الساعة 17:00»;
    - running again at 16:03, and again at 16:05 (inside the window), sends nothing more;
    - a 17:30 lesson at 16:03 is not sent;
    - a Monday lesson is not sent.
  - **Card push:**
    - two calls 3 minutes apart for p1 send once;
    - a third call 11 minutes after the first sends again;
    - `POST /players/p1/stats` triggers it, and so does saving attendance for p1.
- [ ] **Step 2:** Run `node --test server/test/sport-push.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test --prefix server`. Expected: all pass.
- [ ] **Step 5:** Commit: `Remind players before training and tell them when their card changes`

### Task 4: Attendance conflict signal (server)

**Files:**
- Modify:
  - `server/Entities/Attendance/Attendance.controller.js` `bulkSave`: store `updatedBy: String(req.actor.id)` on each saved row. The response adds `overwritten: string[]`, the studentIds whose previous row exists, has a different `status`, and has `updatedBy` set and different from the actor.
  - `server/Entities/Sport/Sport.controller.js` saveAttendance (`PUT /lessons/:id/attendance`): the same rule. Store `updatedBy`, and return `overwritten`.
- Test: additions in `server/test/lesson-attendance-audit.test.js` (or the existing bulk-save test file) and `server/test/sport-lessons.test.js`.

**Interfaces:**
- **Produces:** both save responses include `overwritten: string[]`. It is `[]` when nothing was overwritten.

- [ ] **Step 1: Write the failing tests**, for both routes:
  - user A saves «حاضر» for s1, then user B saves «غائب» for s1 on the same day: B's response has `overwritten: ["s1"]`;
  - B saving «حاضر» over A's «حاضر» gives `[]`;
  - A re-saving its own row gives `[]`;
  - an auto (nightly) row with no `updatedBy` gives `[]`;
  - saving twice keeps a single row (idempotent).
- [ ] **Step 2:** Run the two test files. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test --prefix server`. Expected: all pass.
- [ ] **Step 5:** Commit: `Tell the client when an attendance save replaced someone else's mark`

### Task 5: System app shell: manifest, icons, service worker, install, offline and update bars (client)

**Files:**
- Create:
  - `client/public/manifest.json` (rewrite), with name «تمهيد», short_name «تمهيد», `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `dir: "rtl"`, `lang: "ar"`, `theme_color` and `background_color` `#1e6580`, and the icons;
  - `client/public/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, generated once from the logo on `#1e6580` with a one-off script outside the repo. Commit only the PNGs.
  - `client/src/service-worker.js`:
    - Workbox `precacheAndRoute(self.__WB_MANIFEST)`;
    - an SPA navigation fallback to `/index.html`;
    - `GET /api/*` is `NetworkFirst` (cache name `tamheed-api`, timeout 4s, expiration 7 days and 300 entries), EXCEPT the never-cache list in Global Constraints;
    - a `push` listener showing `payload.title` and `payload.body` (with the dir and lang above), and a `notificationclick` that opens or focuses `payload.url`;
    - a `message` listener for `{type:"SKIP_WAITING"}` and for `{type:"CLEAR_API_CACHE"}`.
  - `client/src/serviceWorkerRegistration.js`: registers only in production builds, and exposes `onUpdate(cb)`.
  - `client/src/pwa/shouldCache.js`: `shouldCache(url: string, method: string) -> boolean`. The service worker imports it.
  - `client/src/pwa/AppChrome.jsx`, which renders:
    - the offline bar (from `navigator.onLine` plus the online and offline events);
    - the update bar;
    - the install button. It captures `beforeinstallprompt`. On iOS Safari (no prompt, not standalone) it shows a one-time card «للتثبيت: اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية»», which can be dismissed and is remembered in localStorage.
- Modify:
  - `client/src/index.js`: register the service worker and mount `AppChrome`.
  - `client/public/index.html`: manifest link, theme-color `#1e6580`, `apple-touch-icon` pointing at icon-192.
  - `client/src/WebServer/services/auth/fuctionsAuth.jsx` `logout()`: post `CLEAR_API_CACHE` to the controller, and also call `caches.delete("tamheed-api")` when `caches` exists.
  - `client/package.json`: the workbox deps at 6.6.0.
- Test: `client/src/pwa/shouldCache.test.js`, and `client/src/pwa/AppChrome.test.js` (offline bar text appears on an `offline` event and hides on `online`).

**Interfaces:**
- **Produces:** `shouldCache(url, method)`, and the cache name `tamheed-api`, which Task 6's logout relies on.

- [ ] **Step 1: Write the failing tests:**
  - **shouldCache returns true for:** `GET /api/lesson`, `GET /api/sports/players`.
  - **shouldCache returns false for:**
    - `POST /api/attendance/bulk-save`;
    - `GET /api/auth/refresh`;
    - `GET /api/storage/file/1`;
    - `GET /api/sport-portal/photo`;
    - a non-API `GET /static/x.js`, which the precache handles.
  - **AppChrome:** the offline text shows after `window.dispatchEvent(new Event("offline"))` and disappears after `online`.
- [ ] **Step 2:** Run `npm test --prefix client -- --watchAll=false`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test --prefix client -- --watchAll=false`, then `CI=false npm run build --prefix client`. Expected: PASS, and `client/build/service-worker.js` exists.
- [ ] **Step 5:** Commit: `Make the system an installable app with offline reading`

### Task 6: Offline attendance queue and push opt-in (client)

**Files:**
- Create:
  - `client/src/pwa/attendanceQueue.js`: a small IndexedDB store `tamheed-queue`, injectable for tests. Exports:
    - `enqueue(userTz, item)`, where `item = { kind: "general"|"sport", url, body, label, queuedAt }`;
    - `pending(userTz)`;
    - `flush(userTz, send)`: sends items in order and returns `{ sent, failed: [{item, message}], overwritten: string[] }`;
    - `othersPending(userTz)`: the count belonging to other users;
    - `clear(userTz)`.
  - `client/src/pwa/QueueStatus.jsx`:
    - the chip «بانتظار الإرسال: n»;
    - a failed list with «إعادة المحاولة»;
    - a notice when another user's items exist on the device («يوجد حضور معلّق لمستخدم آخر على هذا الجهاز»), with a confirm-to-delete;
    - it shows «تم تحديث حضور سجّله شخص آخر» when `overwritten` is not empty.
  - `client/src/pwa/pushOptIn.js`, with `subscribeStaff()` and `unsubscribeStaff()`. They use `GET /api/push/key` and `POST`/`DELETE /api/push/subscribe`. Add a toggle «إشعارات الهاتف» in `client/src/Components/Profile/Profile.jsx`. It is hidden when `PushManager` is not available.
- Modify:
  - `client/src/Components/Attendance/AttendancePage.jsx` and `client/src/Components/Sport/AttendanceTab.jsx`: when save fails with no response (network error) or `navigator.onLine === false`, enqueue the request for the current user tz. Then show «حُفظ على الجهاز وسيُرسل عند عودة الاتصال».
  - On app start, the `online` event and login, call `flush` for the current user only.
  - Other save buttons stay as they are. They are disabled offline with «يتطلب اتصالًا بالإنترنت» only where the form already has a single save handler; the attendance screens are the required ones.
  - `logout()`: if `pending(tz).length > 0`, confirm «لديك حضور لم يُرسل بعد. هل تريد حذفه والخروج؟». Cancel aborts the logout, and OK clears the queue.
- Test: `client/src/pwa/attendanceQueue.test.js` with an in-memory backend.

**Interfaces:**
- **Consumes:** the `overwritten` response field (Task 4), `/api/push/*` (Task 1) and the cache name (Task 5).

- [ ] **Step 1: Write the failing tests:**
  - `enqueue("A", x)` then `pending("B")` gives `[]`.
  - `flush("A", send)` sends A's items in `queuedAt` order and removes the sent ones.
  - A `send` that returns 401 keeps the item and stops the flush. This is the session-expired case. A later `flush("A")` after a successful send empties the queue.
  - A `send` that returns 400 moves the item to `failed` and continues.
  - `flush` collects `overwritten` from the responses.
  - `othersPending("B")` counts A's items.
  - `clear("A")` empties only A's items.
- [ ] **Step 2:** Run `npm test --prefix client -- --watchAll=false`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test --prefix client -- --watchAll=false`, then `CI=false npm run build --prefix client`. Expected: PASS and a clean build.
- [ ] **Step 5:** Commit: `Record attendance offline and sync it later, and let staff turn on phone notifications`

### Task 7: Sport app shell (sport)

**Files:**
- `sport/public/manifest.json` (rewrite): name «تمهيد - رياضة», `theme_color` and `background_color` `#0b2a3a`, plus the RTL and standalone fields above.
- `sport/public/icons/*`: generated the same way on `#0b2a3a`.
- `sport/src/service-worker.js`, `sport/src/serviceWorkerRegistration.js`, `sport/src/pwa/shouldCache.js` and `sport/src/pwa/AppChrome.jsx`: same behaviour as Task 5, with the cache name `tamheed-sport-api`.
  - Only `GET /api/sport-portal/me` is cached, network-first. The photo, request-code and verify routes are never cached.
  - `sport/src/pwa/shouldCache.js` is copied from Task 5's file with the cache name changed; it is not imported across apps.
- `sport/src/pwa/pushOptIn.js`, with `subscribeSport()` and `unsubscribeSport()` against `/api/push/key` and `/api/sport-portal/push/subscribe`.
- A button «فعّل التذكير بالتدريبات» on HomePage under the next-lesson box. It shows only when `PushManager` exists and permission is not granted or denied. On iOS it shows only when the app is standalone.
- Logout clears `tamheed-sport-api`.
- `sport/public/index.html`: manifest link, theme-color, apple-touch-icon.
- `sport/package.json`: workbox deps at 6.6.0.
- Tests:
  - `sport/src/pwa/shouldCache.test.js`: `/api/sport-portal/me` gives true; `/photo`, `/verify` and `/request-code` give false.
  - The AppChrome offline-bar test, as in Task 5.

- [ ] **Step 1:** Write the tests above.
- [ ] **Step 2:** Run `npm test --prefix sport`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test --prefix sport` and `CI=true npm run build --prefix sport`. Expected: PASS, and `sport/build/service-worker.js` exists.
- [ ] **Step 5:** Commit: `Make the sport site an installable app with offline card and training reminders`

### Task 8: Deploy docs and review log

**Files:**
- Modify:
  - `deploy/DEPLOY.md`: a section «אפליקציות והתראות» in Hebrew, matching the file. It covers:
    - generating the VAPID keys with `npx web-push generate-vapid-keys`;
    - adding the 3 keys to `server/config/.env`, with `VAPID_SUBJECT=mailto:you@example.com`;
    - running `pm2 restart tamheed --update-env`;
    - that HTTPS is required (already in place);
    - the iPhone note (Add to Home Screen, iOS 16.4+).
  - `docs/AI_REVIEW_LOG.md`: a new entry listing the changed files, verification and open notes. It ends with "**Requesting Codex review.** No live Codex connection; this entry is the handoff." and "**Delivery state:** committed with the owner's approval; not pushed."
- [ ] **Step 1:** Make the edits.
- [ ] **Step 2:** Run `npm test --prefix server`, `npm test --prefix client -- --watchAll=false` and `npm test --prefix sport`. Expected: all pass.
- [ ] **Step 3:** Commit: `Document app installation and push keys`
