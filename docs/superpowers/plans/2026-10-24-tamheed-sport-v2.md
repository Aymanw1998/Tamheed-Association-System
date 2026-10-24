# Tamheed Sport v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the phase-1 multi-sport teams and trainings with football only:
- weekly sport lessons that show read-only in the system's lesson schedule;
- sport attendance;
- coach-adjusted stats;
- a stadium-night student site with a flip player card.

**Architecture:**
- Sport lessons and sport attendance live in their own collections (`SportLessons`, `SportAttendance`). Nothing in the student file, reports, assistant or alerts sees them.
- The lesson schedule reads them through one read-only endpoint. The lesson conflict check covers both kinds in both directions.
- The staff API at `/api/sports` and the portal at `/api/sport-portal/me` are rewritten on top of these collections. Login, session and host serving are unchanged.

**Tech Stack:**
- server: Express, Mongoose through `server/Entities/api.js`, `node:test` with the vm/stub helpers in `server/test/helpers`;
- client: CRA React 18 with CSS modules and Jest;
- `sport/`: Vite 5.4.11, React 18.3.1, Vitest 2.1.8.

**Spec:** `docs/superpowers/specs/2026-10-24-tamheed-sport-v2-design.md` (Arabic, approved). The phase-1 spec `2026-10-24-tamheed-sport-design.md` still governs login, session and host serving.

## Global Constraints

- **Language:** all UI text is professional Arabic, RTL. The only non-Arabic text is `TAMHEED SPORT` on the card.
- **Public repo:** no real ID numbers, emails, names or secrets in code, tests or docs. Use `@example.com` and made-up IDs.
- **Commits:** commit on master after each task with the given message. No Co-Authored-By trailer. Never push.
- **Football:**
  - one `Sport` document named «كرة القدم» with icon «⚽»;
  - the server creates it on first use if it is missing (`ensureFootball()`);
  - stats: at most 4, each `{ key, label }`.
- **Rooms:** sport lessons use room `"9"` («التدريب الخارجي»).
- **Days:** `date.day` is 1–7 with 1 = الأحد, exactly like `Lesson.date.day`. `startMin` and `endMin` are minutes from midnight.
- **Attendance:**
  - statuses are exactly «حاضر», «غائب», «متأخر»;
  - dates are `"YYYY-MM-DD"` strings in Israel local time;
  - "today" comes from `israelToday(now)`, defined in Task 1.
- **Attendance rate:** (حاضر + متأخر) ÷ recorded sessions. It counts sessions in every lesson the player is in, each lesson only from that player's `joinedAt`. With no sessions it is `null`, and the UI shows «—».
- **Permissions:**
  - reads need any of `sports.view`, `sports.coach`, `sports.manage`;
  - attendance, players and stat changes need `sports.coach` or `sports.manage`;
  - lessons and stat settings need `sports.manage`.
- **Removed:** `SportTeams`, `SportTrainings`, multi-sport UI, the «فريقي» tab.

## Review Focus

1. **Recording attendance on a date the lesson does not fall on, or in the future:** the server answers 400 «لا يمكن تسجيل الحضور في هذا التاريخ». Test in Task 3.
2. **A player joins a second lesson later:** earlier sessions of that lesson do not count against them. Test in Task 1.
3. **A sport lesson and a regular room-9 lesson at overlapping times:** both directions answer 409 «يوجد تعارض». Tests in Task 3 and Task 4.
4. **Pressing − on a stat at 0:** the value stays 0. A stat deleted in settings disappears from players and from the card. Tests in Task 2.
5. **`GET /api/lesson` never returns sport lessons:** they live in another collection. Only `/api/lesson/sport-schedule` returns them. Test in Task 4.

---

### Task 1: Data layer: sport lesson and attendance models, card maths

**Files:**
- Create:
  - `server/Entities/Sport/SportLesson.model.js` (collection `SportLessons`);
  - `server/Entities/Sport/SportAttendance.model.js` (collection `SportAttendance`, unique index `{ sportLessonId: 1, studentId: 1, date: 1 }` with an `ensureSportAttendanceIndexes` export like `SportLoginCode.model.js`).
  - Both follow the `SportLoginCode.model.js` pattern: get, create, update, updateExisting, delete.
- Delete: `server/Entities/Sport/SportTeam.model.js` and `SportTraining.model.js`. Remove their requires and index calls wherever `server.js` or other code uses them. Task 2 removes the controller code that uses them.
- Rewrite: `server/utils/sportCards.js`
- Modify: `server.js` to call `ensureSportAttendanceIndexes` where the other sport indexes are ensured.
- Test: `server/test/sport-cards.test.js`, rewritten.

**Interfaces (Produces):**
- **SportLesson fields:** `{ sportId: string, name: string, date: { day: 1..7, startMin, endMin }, room: "9", players: [{ studentId: string, joinedAt: Date }], createdAt, updatedAt }`
- **SportAttendance fields:** `{ sportLessonId: string, studentId: string, date: "YYYY-MM-DD", status, createdAt, updatedAt }`
- **`sportCards.js` exports:**
  - `ageOn(birthDate, at)`: keep the current version, including null for future dates.
  - `israelToday(now: Date) -> "YYYY-MM-DD"`: uses `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" })`.
  - `dayOfDate(date: "YYYY-MM-DD") -> 1..7`: computed as `new Date(date + "T00:00:00Z").getUTCDay() + 1`.
  - `attendanceSummary({ studentId, lessons, records }) -> { rate: number|null, present, absent, late }`:
    - `rate` is rounded to an integer;
    - a record counts only if its lesson currently lists the student and `record.date >= israelToday(joinedAt)` for that lesson;
    - records of lessons the student has left do not count.
  - `nextLesson(lessons, now) -> { name, day, startMin, endMin } | null`: the next weekly occurrence after `now` in Israel time. A lesson later today counts.
  - `buildCard({ player, sport, lessons, records }) -> { jerseyNumber, position, statDefs: sport.stats, values: { [key]: number }, attendance: attendanceSummary(...) }`:
    - `values` contains only keys present in `sport.stats`;
    - a missing value is 0.

- [ ] **Step 1: Write the failing tests in `server/test/sport-cards.test.js`:**
  - `israelToday(new Date("2026-10-24T22:30:00Z")) === "2026-10-25"`, because Israel is UTC+3 in October.
  - `dayOfDate("2026-10-25") === 1` (a Sunday).
  - **attendanceSummary:**
    - two lessons A and B; joined A on 2026-10-01 and B on 2026-10-20;
    - records: A 2026-10-04 حاضر, A 2026-10-11 متأخر, A 2026-10-18 غائب, B 2026-10-13 غائب (before joining B, ignored), B 2026-10-22 حاضر;
    - expected: `{ rate: 75, present: 2, absent: 1, late: 1 }`.
  - A record of a lesson that no longer lists the student is ignored.
  - With no records, `rate` is `null`.
  - **nextLesson:**
    - with `now` = Sunday 2026-10-25 16:00 Israel and lessons Sun 17:00 and Wed 17:00, it returns the Sunday lesson;
    - with `now` = Sunday 18:00, it returns the Wednesday lesson.
  - **buildCard:** `sport.stats = [{key:"g",label:"أهداف"}]` and `player.stats = { g: 3, old: 9 }` give `values: { g: 3 }`. A missing key gives 0.
  - **ageOn:** keep the existing tests.
- [ ] **Step 2:** Run `node --test server/test/sport-cards.test.js`. Expected: FAIL (functions not defined).
- [ ] **Step 3:** Implement the models and `sportCards.js`.
- [ ] **Step 4:** Run `node --test server/test/sport-cards.test.js`. Expected: PASS. Other sport tests may fail until Task 2; note which.
- [ ] **Step 5:** Commit: `Add sport lessons and sport attendance, and rebuild the card calculations`

### Task 2: Staff API: football, players, stats and stat settings

**Files:**
- Rewrite: `server/Entities/Sport/Sport.controller.js` (players, stats and settings part). Remove all team, training and multi-sport handlers.
- Rewrite: `server/Entities/Sport/Sport.route.js`
- Modify: `server/Entities/Sport/SportPlayer.model.js` to add the field `stats: { type: "object", default: {} }`.
- Test: `server/test/sport-staff.test.js`, rewritten for the new routes. Keep its stub/vm style.

**Interfaces:**
- **Consumes:** `buildCard` and `attendanceSummary` from Task 1.
- **Produces** (all under `/api/sports`, JSON `{ ok, ... }`, Arabic error messages):

| Method & path | Permission | Body / query | Response |
| --- | --- | --- | --- |
| `GET /` | read | — | `{ ok, sport: { _id, name, icon, stats } }` (calls `ensureFootball()`) |
| `PUT /stats` | manage | `{ stats: [{ key?, label }] }` (≤4, non-blank labels, keys kept for existing, new keys `s_<hex>`) | `{ ok, sport }`; values of removed keys are `$unset` from all players |
| `GET /players` | read | — | `{ ok, players: [{ studentId, firstname, lastname, age, gender, layer, school, jerseyNumber, position, lessons: [{ _id, name, day, startMin }], values, attendance }] }` |
| `GET /students/search` | coach | `q` (≥2 chars, name only), optional `layer`, `gender`, `school` | `{ ok, students: [{ _id, firstname, lastname, age, gender, layer, school, isPlayer }] }`; never `tz` |
| `PUT /players/:studentId` | coach | `{ jerseyNumber: 1..99|null, position, lessonIds: [] }` | `{ ok, player }`; joins listed lessons (new `joinedAt` = now), leaves unlisted ones |
| `DELETE /players/:studentId` | coach | — | `{ ok }`; removes the player and their rows in every lesson's `players` |
| `POST /players/:studentId/stats` | coach | `{ key, delta: 1 | -1 }` | `{ ok, value }`; key must be in `sport.stats`; value floors at 0 |

  - "read" means `requirePermission("sports.view", "sports.coach", "sports.manage")`. "coach" means `("sports.coach", "sports.manage")`. "manage" means `("sports.manage")`.

- [ ] **Step 1: Write the failing tests:**
  - `GET /` creates football once (two calls leave one Sport).
  - `PUT /stats` with 5 stats or a blank label gives 400.
  - Removing a stat key `$unset`s it from players, and `GET /players` no longer shows it.
  - `POST .../stats` with `delta -1` at 0 returns `value: 0`. An unknown key gives 400.
  - A `sports.view`-only actor gets 403 on `POST .../stats`.
  - A `sports.coach`-only actor reads `GET /players` with 200.
  - Search matches by name only. A tz fragment returns no result, and no result has `tz`. The filters narrow by `layer` and `gender`.
  - `PUT /players/:id` with `jerseyNumber: 100` gives 400. With `lessonIds: [A]` the player is added to lesson A with `joinedAt`, and a second save keeps the original `joinedAt`.
  - `DELETE` removes the player from lesson `players`, and keeps `SportAttendance` rows.
- [ ] **Step 2:** Run `node --test server/test/sport-staff.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. Keep the existing `handle`, `record` (audit) and `fail` helpers.
- [ ] **Step 4:** Run `npm test --prefix server`. Expected: all pass, except portal tests that Task 5 rewrites. If any fail, mark them `todo` with a pointer to Task 5 and list them in the report.
- [ ] **Step 5:** Commit: `Rebuild the staff sports API for football: players, stats and stat settings`

### Task 3: Staff API: sport lessons and attendance

**Files:**
- Modify: `server/Entities/Sport/Sport.controller.js` and `Sport.route.js`
- Create: `server/utils/lessonConflict.js` with `overlaps(a, b) -> boolean` (same `date.day` and overlapping minutes) and `conflictsInRoom9(candidate, { lessons, sportLessons, ignoreId }) -> boolean`.
  - `candidate` and `ignoreId` have the shapes used by Task 4 as well.
  - Regular lessons conflict when they are in room 9, or share a teacher or helper with the candidate. Sport lessons have neither.
- Test: `server/test/sport-lessons.test.js`

**Interfaces (Produces, under `/api/sports`):**

| Method & path | Permission | Body / query | Response |
| --- | --- | --- | --- |
| `GET /lessons` | read | — | `{ ok, lessons: [{ _id, name, date, room, players: [{ studentId, firstname, lastname, joinedAt }] }] }` |
| `POST /lessons` | manage | `{ name, date: { day, startMin, endMin }, studentIds: [] }` | 201 `{ ok, lesson }`; 409 «يوجد تعارض» on conflict with any room-9 lesson or sport lesson |
| `PUT /lessons/:id` | manage | same | `{ ok, lesson }`; keeps `joinedAt` of staying players |
| `DELETE /lessons/:id` | manage | — | `{ ok }`; deletes its `SportAttendance` rows |
| `GET /lessons/:id/attendance` | read | `date` (default `israelToday`) | `{ ok, date, players: [{ studentId, firstname, lastname, status|null }] }` |
| `PUT /lessons/:id/attendance` | coach | `{ date, marks: [{ studentId, status }] }` | `{ ok }`; upsert per (lesson, student, date) |
| `GET /attendance/today` | read | — | `{ ok, date, lessons: [{ _id, name, date }] }` lessons whose `date.day === dayOfDate(today)`, by start time |

  - **Validation:**
    - `name` is required.
    - `startMin < endMin`, both in 0–1440.
    - `studentIds` must be current players.
    - **Attendance `date`:** must be `"YYYY-MM-DD"`, ≤ today, and `dayOfDate(date) === lesson.date.day`. Otherwise 400 «لا يمكن تسجيل الحضور في هذا التاريخ».
    - **Attendance marks:** only students currently in the lesson, and a valid status. Otherwise 400.

- [ ] **Step 1: Write the failing tests:**
  - Create, then list.
  - Overlap with a regular `Lesson` in room 9 gives 409. A regular lesson in room 3 at the same time does not conflict.
  - Two overlapping sport lessons give 409.
  - **Attendance:**
    - a future date gives 400;
    - a date on the wrong weekday gives 400;
    - saving twice for the same date updates, and does not duplicate;
    - a mark for a non-member gives 400.
  - `DELETE` of a lesson removes its attendance.
  - `GET /attendance/today` with a stubbed clock returns only today's lessons.
  - Unit tests for `overlaps` and `conflictsInRoom9`.
- [ ] **Step 2:** Run `node --test server/test/sport-lessons.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. Inject the clock through the controller factory the same way the portal controller receives `now`, or follow the existing pattern in the file.
- [ ] **Step 4:** Run `npm test --prefix server`. Expected: PASS, apart from the Task 5 todos.
- [ ] **Step 5:** Commit: `Add football lessons and attendance to the staff sports API`

### Task 4: Lesson schedule integration (server)

**Files:**
- Modify:
  - `server/Entities/Lesson/Lesson.controller.js`: `postOne` and `putOne` also load `SportLessonModelDef.get({ "date.day": day })` and refuse with the existing 409 when `conflictsInRoom9` says so. Add `getSportSchedule`.
  - `server/Entities/Lesson/Lesson.route.js`: `router.get('/sport-schedule', requirePermission('lessons.view'), getSportSchedule)`, declared before `'/:id'`.
- Test: `server/test/lesson-sport-schedule.test.js`

**Interfaces (Produces):**
- `GET /api/lesson/sport-schedule` → `{ ok, lessons: [{ _id, name, date, room: "9", teacher: null, readOnly: true, kind: "sport", playersCount }] }`. No student ids or names.

- [ ] **Step 1: Write the failing tests:**
  - `POST /api/lesson` in room 9 overlapping a sport lesson gives 409. The same lesson in room 2 gives 201.
  - `PUT` moving a lesson into room 9 at an overlapping time gives 409.
  - `GET /api/lesson` does not include sport lessons.
  - `GET /sport-schedule` returns the shape above, without `players`.
- [ ] **Step 2:** Run `node --test server/test/lesson-sport-schedule.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test --prefix server`. Expected: PASS (Task 5 todos aside).
- [ ] **Step 5:** Commit: `Show football lessons in the lesson schedule and check room conflicts both ways`

### Task 5: Student portal data

**Files:**
- Modify: `server/Entities/SportPortal/SportPortal.controller.js` (`me`), and `SportPortal.auth.js` only where it read teams. A student is a sport student if a `SportPlayer` row exists, as before.
- Test: `server/test/sport-portal-data.test.js`, rewritten. Also resolve the todos left by Task 2.

**Interfaces (Produces):** `GET /api/sport-portal/me` →
```
{ ok, student: { firstname, lastname, age, birthDate: "YYYY-MM-DD"|null, hasPhoto },
  card: { sport: { name, icon }, jerseyNumber, position, statDefs: [{ key, label }], values, attendance: { rate, present, absent, late } },
  lessons: [{ name, day, startMin, endMin }],
  nextLesson: { name, day, startMin, endMin } | null,
  history: [{ date, lessonName, status }] }   // newest first, at most 60
```
- No teammates, coaches, other students or ids.

- [ ] **Step 1: Write the failing tests:**
  - The shape above for a player in two lessons.
  - `history` holds only this student's records, newest first.
  - A student whose `SportPlayer` was deleted gets 401 (session check).
  - No other student's name appears anywhere in the response.
- [ ] **Step 2:** Run `node --test server/test/sport-portal-data.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement with `buildCard`, `nextLesson` and `attendanceSummary`.
- [ ] **Step 4:** Run `npm test --prefix server`. Expected: all pass, with no todos left.
- [ ] **Step 5:** Commit: `Serve the student's card, lessons and attendance history to the sport site`

### Task 6: «الرياضة» in the system: players and stat settings tabs

**Files:**
- Rewrite:
  - `client/src/WebServer/services/sport/functionsSport.jsx`: one export per route of Tasks 2 and 3;
  - `client/src/Components/Sport/SportPage.jsx`: title «⚽ الرياضة · كرة القدم» and tabs «اللاعبون», «مواعيد الدروس», «الحضور والغياب», «إعدادات الإحصائيات» (the last only with `sports.manage`). Tasks 6 and 7 fill the tabs.
- Create:
  - `client/src/Components/Sport/PlayersTab.jsx` (rewrite);
  - `client/src/Components/Sport/AddPlayerDialog.jsx`;
  - `client/src/Components/Sport/StatsSettingsTab.jsx`.
- Delete: `SportsTab.jsx`, `TeamsTab.jsx` and `TrainingsTab.jsx`.
- Modify:
  - `client/src/i18n/sportStrings.js`: new copy, and drop the unused strings;
  - `client/src/Components/Sport/sportForm.js`: keep `validateJersey`; replace `validateSport` with `validateStats(stats) -> { [index|"list"]: message }` (at most 4, no blank labels).
- Modify: `client/src/utils/routeAccess.js` and `Header.jsx` so that any of `sports.view`, `sports.coach` or `sports.manage` opens `/sports` and shows the menu link.
- Test: `client/src/Components/Sport/sportForm.test.js`, and `client/src/utils/routeAccess.test.js` (`canAccessPath("/sports", ["sports.coach"]) === true`).

**Screen behaviour (match `Components/Student/ViewAllStudent` look: `.table`, toolbar, summary line, `Button`):**
- **«اللاعبون»:**
  - toolbar with a name search and filters for the lesson, «العمر» and «الجنس», plus «+ إضافة لاعب من الطلاب» (coach);
  - summary «<n> لاعبًا»;
  - table columns: الاسم، العمر، الدروس، القميص، المركز، الحضور (rate% and «غياب n · تأخير n»), then one column per stat with − value + buttons (coach);
  - «تعديل» and «إزالة» with `useConfirm`.
- **AddPlayerDialog:**
  - search students (≥2 characters) with filters الطبقة / الجنس / المدرسة;
  - students who are already players are shown disabled;
  - after picking, fields for القميص, المركز and الدروس (checkboxes of the sport lessons).
- **«إعدادات الإحصائيات»:** an ordered list of up to 4 labels with add, rename, ↑/↓ and delete (confirm «سيتم حذف قيم هذه الإحصائية من كل اللاعبين»). «حفظ» calls `PUT /stats`.

- [ ] **Step 1:** Write the tests:
  - `validateStats` rejects 5 stats and a blank label, and accepts 0–4 non-blank;
  - `validateJersey` keeps its cases;
  - the routeAccess case above.
- [ ] **Step 2:** Run `npm test --prefix client -- --watchAll=false`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test --prefix client -- --watchAll=false`, then `CI=false npm run build --prefix client`. Expected: PASS and a clean build.
- [ ] **Step 5:** Commit: `Rebuild the sports section: players with stats and stat settings`

### Task 7: «الرياضة» in the system: lesson schedule and attendance tabs, plus the general schedule

**Files:**
- Create:
  - `client/src/Components/Sport/LessonsTab.jsx`: a weekly grid in the `ViewAllLesson` timeline style, reusing `client/src/utils/lessonSchedule.js` helpers and the `ViewAllLesson.module.css` look. It has «+ إضافة موعد» (manage) opening a form with name, day, start and end time, and players (checkbox list of players), plus edit and delete.
  - `client/src/Components/Sport/AttendanceTab.jsx`, in the `Components/Attendance/AttendancePage` look:
    - it loads `GET /attendance/today` and opens the first lesson by start time;
    - there is a lesson switcher and a date picker that allows only past or today dates on the lesson's weekday;
    - with no lesson today it shows «لا يوجد درس اليوم»;
    - each row has حاضر / غائب / متأخر, then «حفظ الحضور».
- Modify:
  - `client/src/WebServer/services/lesson/functionsLesson.jsx`: `getSportSchedule()`.
  - `client/src/Components/Lesson/ViewAllLesson.jsx`: merge `getSportSchedule()` lessons into `lessons`.
    - For `l.readOnly`: not draggable, teacher label «النظام», and a ⚽ before the name.
    - A click opens a small read-only details box (name, day and time, «التدريب الخارجي», player count) with the link «إدارة من قسم الرياضة» (to `/sports`, only with a sports permission). It must not navigate to `/lessons/:id`.
  - `MobileLessonList.jsx`: the same read-only handling.
- Test: `client/src/utils/sportSchedule.test.js` for a new pure helper `client/src/utils/sportSchedule.js`:
  - `mergeSchedule(lessons, sportLessons) -> lessons[]`: sport items get `readOnly: true`;
  - `attendanceDateAllowed(date, lessonDay, today) -> boolean`.

- [ ] **Step 1: Write the tests:**
  - **mergeSchedule:** keeps regular lessons untouched and marks sport ones.
  - **attendanceDateAllowed** (Sunday lesson, today 2026-10-28):
    - `("2026-10-25", 1, "2026-10-28")` is true;
    - `("2026-10-26", 1, …)` is false (a Monday);
    - `("2026-11-01", 1, …)` is false (future).
- [ ] **Step 2:** Run `npm test --prefix client -- --watchAll=false`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test --prefix client -- --watchAll=false`, then `CI=false npm run build --prefix client`. Expected: PASS and a clean build.
- [ ] **Step 5:** Commit: `Add football lessons and attendance tabs, and show sport lessons read-only in the schedule`

### Task 8: The student site redesign (`sport/`)

**Files:**
- Rewrite:
  - `sport/src/HomePage.jsx`;
  - `sport/src/PlayerCard.jsx`, which becomes `FlipCard` with `FifaFace` and `IdFace` in the same file or split;
  - `sport/src/styles.css`;
  - `sport/src/BottomTabs.jsx` («الرئيسية», «دروسي»).
- Create: `sport/src/LessonsPage.jsx`
- Delete: `sport/src/TeamsPage.jsx`
- Modify: `sport/src/App.jsx` and `sport/src/format.js`.

**Look:** follow the approved mockups in `.superpowers/brainstorm/2526-1792833364/content/`: `sport-site-style.html` option «أ» and `player-card-options.html` option 3.
- **Header:** «الملعب الليلي». Floodlight radial glows on a dark navy-to-grass gradient, a pitch arc, the logo in a white circle with an orange `#f7941d` ring, and a ball illustration as inline SVG.
- **Flip card:** tap or Enter flips it with CSS 3D, `aria-pressed`, and the hint «اضغط لقلب البطاقة».
  - **Front (FIFA shield):**
    - jersey number large top-right, or «—», with the position under it;
    - the logo and ⚽;
    - the photo (`/api/sport-portal/photo` when `hasPhoto`, else a silhouette);
    - the name with an orange underline;
    - up to 6 cells in this order: الحضور % (or —), التأخير, then the stats in `statDefs` order;
    - the footer `TAMHEED SPORT`.
  - **Back (horizontal official card):**
    - an orange bar «تمهيد سبورت · كرة القدم» with the logo;
    - the photo, the name, «المركز · القميص», «الدروس: الأحد، الأربعاء», «تاريخ الميلاد: DD/MM/YYYY», «الحضور: n%»;
    - the faded jersey number.
- Under the card: «الدرس القادم», or «لا يوجد درس قادم».
- **«دروسي»:**
  - weekly lessons («الأحد 17:00–18:30»);
  - summary chips: الحضور %, غياب, تأخير;
  - history rows «الأحد 25/10 · حاضر» with status colours.
- **Mobile:** phone-first, max width 480px, no horizontal scroll at 360px.

**Interfaces (Produces, `format.js`):**
- `lessonTime({ day, startMin, endMin }) -> "الأحد 17:00–18:30"`
- `historyLabel({ date, status }) -> "الأحد 25/10 · حاضر"`
- `cardCells(card) -> [{ label, value }]`, at most 6, in the order above.
- `formatTrainingDate` becomes `nextLessonLabel(lesson, now)`, which gives «اليوم 17:00», «غدًا 17:00» or «الأربعاء 17:00».

- [ ] **Step 1: Write the tests in `sport/src/format.test.js`:**
  - **lessonTime:** day 1 with 1020–1110 gives «الأحد 17:00–18:30».
  - **historyLabel:** for "2026-10-25" with حاضر.
  - **cardCells:**
    - with 4 stats it returns 6 cells, the first «الحضور»;
    - with a `rate` of `null` the value is «—».
  - **nextLessonLabel:** the today, tomorrow and later cases.
- [ ] **Step 2:** Run `npm test --prefix sport`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test --prefix sport` and `npm run build --prefix sport`. Expected: PASS and `sport/dist/index.html`.
- [ ] **Step 5:** Commit: `Redesign the sport site: stadium theme, flip player card and my lessons`

### Task 9: Demo data, docs and review log

**Files:**
- Rewrite: `server/scripts/seedSportDemo.js` for the new model. It adds:
  - football with stats أهداف, تمريرات حاسمة, مباريات;
  - 16 demo students with the same markers;
  - 3 lessons (الأحد 17:00–18:30 «أشبال الأحد», الثلاثاء 18:00–19:00 «نجوم الثلاثاء», الأربعاء 17:00–18:30 «أشبال الأربعاء»);
  - each student in 1–2 lessons;
  - 6 past weeks of attendance with all three statuses;
  - random stat values.
  
  `--remove` deletes the demo lessons and their attendance, the demo players and the demo students. It does not delete football itself, but it does clear the demo stat values.
- Modify:
  - `deploy/DEPLOY.md` («موقع الرياضة»): one line on `node scripts/seedSportDemo.js`;
  - `docs/AI_REVIEW_LOG.md`: a new entry with the changed files and a pending Codex review request.
- Verify (no unit test, consistent with the other scripts): run against a local MongoDB with `MONGO_URI=mongodb://127.0.0.1:27017 DB_NAME=<scratch>`:
  - seed;
  - check that `/me`-equivalent data builds via `buildCard`;
  - `--remove`;
  - confirm that nothing without the markers is deleted.
  
  Remember that `Students` always live in `tamheed_db`.

- [ ] **Step 1:** Rewrite the script.
- [ ] **Step 2:** Run the local check above. Expected: the counts print, remove leaves 0 demo docs, and non-demo docs survive.
- [ ] **Step 3:** Run `npm test --prefix server`, `npm test --prefix client -- --watchAll=false` and `npm test --prefix sport`. Expected: all pass.
- [ ] **Step 4:** Commit: `Update the sport demo data for football lessons and log the work`
