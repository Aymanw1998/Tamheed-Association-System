# Linked Student, Guide and Lesson Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read-only view pages with tabs for a student, a user (guide) and a lesson, linked to each other, with the guide's own Profile gaining the same tabs.

**Architecture:** One shared `RecordPage` layout (side card + tabs, stacked on a phone) and pure helpers that pick a student's lessons, a guide's students and a guide's lessons out of the lists the client already loads (`GET /lesson`, `GET /students`). The server adds only the guide's name and phone (plus `tz` for `users.view` holders) to the single-student and single-lesson answers. The list rows open the new view pages; the edit forms move to `/<entity>/:id/edit` unchanged.

**Tech Stack:** React 18 + react-router-dom 7 (CRA, Jest), CSS Modules; Node/Express server with `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-31-student-lesson-guide-links-design.md`

## Global Constraints

- Arabic, `dir="rtl"`; colours, radius and font from `client/src/index.css` tokens (`--color-primary-600`, `--color-border`, `--radius-lg`, `--font-sans`); no hard-coded hex in new CSS.
- Uncluttered: exactly one tab's content shown at a time.
- Phone (≤768px): photo card on top with buttons side by side, tabs card below. Desktop: fixed side column (photo, name, buttons stacked) and tabs beside it.
- Student page: all three tabs always; empty texts exactly «لا يوجد دروس بعد» and «لا يوجد مرشد مسؤول بعد».
- User page and Profile: a tab with nothing in it is not shown; with no students and no lessons, no tab bar at all.
- Guide full name and phone go to anyone who can see the student or lesson; nothing else of the guide's record. The name is a link to `/users/<tz>` only when the answer carries `tz` (server sends it only to `users.view` holders) or it is the viewer themself (link to `/profile`).
- Edit buttons: `students.edit`, `users.edit`, `lessons.edit`. Print file: `students.view` (as the list's «ملف الطالب» today). Roster add/remove: `lessons.roster`, with a confirmation before removing.
- Photos through `passportSrc` at `PASSPORT_PREVIEW` proportions (35:45).
- Repo is public: test data uses made-up names and IDs only.
- No commit without the owner's go-ahead; commit messages carry no co-author trailer. Each task ends with a Codex read-only review recorded in `docs/AI_REVIEW_LOG.md`.

## Review Focus

1. A student with a stored guide who was deleted or is inactive: the guide tab shows «لا يوجد مرشد مسؤول بعد», not an error or a blank name (Task 1 test, Task 4 test).
2. A guide with `students.view` but not `users.view` opening a student: name and phone show, no link, and the answer has no `tz`, email or other guide fields (Task 1 test).
3. An old bookmark or an alert/assistant link to `/students/<tz>` lands on the view page and the form is still one click away; `/students/new` and `/register-student/:token` still open the form (Task 4 route test).
4. A lesson whose roster holds students the viewer cannot see (`hiddenCount`): the students tab shows the visible ones plus "+N" and removing one never touches the hidden ones (Task 5 test).
5. Removing a student while another user holds the lesson lock: the 423 message is shown and the list is reloaded unchanged (Task 5 test).

---

### Task 1: Guide contact on the student and lesson answers (server)

**Files:**
- Create: `server/utils/guideContact.js`
- Modify: `server/Entities/Student/Student.controller.js` (`getOneS`), `server/Entities/Lesson/Lesson.controller.js` (`getOne`)
- Modify: `server/test/helpers/liveStubs.js` (add the real `../../utils/guideContact` to `deps`, like the other shared modules)
- Test: `server/test/guide-contact.test.js`

**Interfaces:**
- Produces: `guideContact(user, actor) -> { name: string, phone: string, tz?: string } | null` — `null` for a missing user or the system account (`isSystemTz`); `name` is `firstname + " " + lastname` trimmed; `tz` only when `can(actor, "users.view")`.
- Produces: `GET /api/students/:tz` answer gains `student.guide` (contact or `null`) for `main_teacher`, looked up among active users (`UserModelDef.get({ _id }, "active")`).
- Produces: `GET /api/lesson/:id` answer gains `lesson.teacherContact` and `lesson.helperContact` (contact or `null`).

- [ ] **Step 1: Write the failing tests** in `server/test/guide-contact.test.js` (load the controllers the way `student-scope-routes.test.js` does):
  - `guideContact` returns `{ name: "سامي علي", phone: "050-1111111" }` with no `tz` for a guide actor, and adds `tz: "990000010"` for an admin actor.
  - `guideContact(null, actor)` and a system-account user give `null`.
  - `getOneS` for a guide who is responsible for the student answers `student.guide` with name and phone only (assert `Object.keys` equals `["name", "phone"]`).
  - `getOneS` when `main_teacher` names an inactive or deleted user answers `student.guide === null`.
  - `getOne` (lesson) answers `teacherContact` for the teacher and `helperContact: null` when there is no helper.
- [ ] **Step 2: Run** `cd server && node --test test/guide-contact.test.js` — expect FAIL (module not found).
- [ ] **Step 3: Implement** `guideContact` and wire it into both handlers (one user lookup per id; never send the user document itself).
- [ ] **Step 4: Run** `cd server && npm test` — expect all pass (previous count + new tests).
- [ ] **Step 5: Codex review, log entry, commit** (message: `Send the guide's name and phone with a student and a lesson`).

### Task 2: Record helpers and the roster remove call (client)

**Files:**
- Create: `client/src/utils/recordLinks.js`, `client/src/utils/recordLinks.test.js`
- Create: `client/src/i18n/recordStrings.js` (merged in `I18nContext.jsx` as `dictionary.record`, like `rosterStrings`)
- Modify: `client/src/WebServer/services/lesson/functionsLesson.jsx` (`removeFromList`)

**Interfaces:**
- Produces (all pure, ids compared as strings):
  - `studentLessons(lessons, studentId) -> lesson[]` — lessons whose `list_students` holds the id, sorted by `date.day` then `date.startMin`.
  - `guideLessons(lessons, userId) -> lesson[]` — `teacher` or `helper` equals the id, same sort.
  - `guideStudents(students, userId) -> student[]` — `main_teacher` equals the id, sorted by first then last name.
  - `lessonWhen(lesson) -> string` — `"<day name> HH:MM"` using the day names in `ViewAllLesson.jsx` (`الأحد`…`السبت`, day 1..7).
  - `guideLink(contact, viewerId, guideId) -> string | null` — `"/profile"` when `guideId` is the viewer, `"/users/<tz>"` when `contact.tz` is set, else `null`.
- Produces: `record` strings: `noLessons: "لا يوجد دروس بعد"`, `noGuide: "لا يوجد مرشد مسؤول بعد"`, tab labels `personal: "التفاصيل الشخصية"`, `lessons: "الدروس"`, `guide: "المرشد المسؤول"`, `students: "قائمة الطلاب"`, `lessonDetails: "تفاصيل الدرس"`, `myStudents: "طلابي"`, `myLessons: "دروسي"`, `myDetails: "تفاصيلي"`, `theirStudents: "طلابه"`, `theirLessons: "دروسه"`, buttons `edit: "تعديل"`, `print: "طباعة الملف"`, `removeConfirm: "إزالة {name} من الدرس؟"`.
- Produces: `removeFromList(lessonId, studentIds)` posts to `/lesson/removeFromList/<id>` with `{ list_students: studentIds }` and returns `{ ok, updatedAt }` like `addToList` (today it posts to a path without the id and a field the server ignores; nothing calls it yet).

- [ ] **Step 1: Write the failing tests** in `recordLinks.test.js`: one per helper above, including string/ObjectId-like id mixes (`"a1"` vs `{ toString: () => "a1" }`), lessons out of order coming back sorted, `lessonWhen({ date: { day: 1, startMin: 960 } }) === "الأحد 16:00"`, and the three `guideLink` cases. Add a test for `removeFromList` with the `api` module mocked: called with `("/lesson/removeFromList/L1", { list_students: ["s1"] })`.
- [ ] **Step 2: Run** `cd client && CI=true npx react-scripts test --watchAll=false src/utils/recordLinks` — expect FAIL.
- [ ] **Step 3: Implement** the helpers, the strings module and the `removeFromList` fix.
- [ ] **Step 4: Run** the same command — expect PASS.
- [ ] **Step 5: Codex review, log entry, commit** (`Add helpers that link students, guides and lessons`).

### Task 3: Shared view-page layout

**Files:**
- Create: `client/src/Components/UI/RecordPage.jsx`, `client/src/Components/UI/RecordPage.module.css`, `client/src/Components/UI/RecordPage.test.js`

**Interfaces:**
- Produces: `<RecordPage photo title subtitle actions tabs loading error />`
  - `photo`: stored link or empty (shown through `passportSrc`, placeholder icon when empty).
  - `actions`: array of `{ label, onClick, variant }` already filtered by permission; empty array shows no button row.
  - `tabs`: array of `{ id, label, content }`; the first is active; with exactly one tab, its content shows with no tab bar.
  - `loading`: shows the system's loading text; `error`: shows the message instead of the page.
  - Remembers the active tab in the URL query `?tab=<id>` so back-navigation returns to it.

- [ ] **Step 1: Write the failing tests** (render with `createRoot`/`act` like `ChangeOwnPassword.test.js`, wrapped in a `MemoryRouter`): only the first tab's content is in the DOM; clicking the second tab label swaps it; `?tab=<id>` opens that tab; one tab renders no `role="tablist"`; an empty `actions` renders no buttons; the tab bar has `role="tablist"` and each tab `role="tab"` with `aria-selected`.
- [ ] **Step 2: Run** `CI=true npx react-scripts test --watchAll=false src/Components/UI/RecordPage` — expect FAIL.
- [ ] **Step 3: Implement** the component and CSS (desktop: two columns, side card ~220px; `@media (max-width: 768px)`: stacked, buttons in one row).
- [ ] **Step 4: Run** the same command — expect PASS.
- [ ] **Step 5: Codex review, log entry, commit** (`Add a shared page layout with a photo card and tabs`).

### Task 4: Student page

**Files:**
- Create: `client/src/Components/Student/StudentView.jsx`, `client/src/Components/Student/StudentView.test.js`
- Modify: `client/src/Components/Routes/Routes.jsx` (`/students/:id` → `StudentView`, add `/students/:id/edit` → `EditStudent`; keep `/students/new` → `EditStudent` declared so it is not taken by `:id`)
- Modify: `client/src/Components/Student/ViewAllStudent.jsx`, `client/src/Components/Student/MobileStudentList.jsx` (row/`onOpen` → view page; the «تعديل» button → `/students/<tz>/edit`)
- Modify: `client/src/utils/routeAccess.test.js` (`/students/<tz>/edit` keeps `students.view`)

**Interfaces:**
- Consumes: `RecordPage` (Task 3); `studentLessons`, `lessonWhen`, `guideLink`, `record` strings (Task 2); `student.guide` (Task 1); `getOne` from `functionsStudent.jsx`; `getAllLesson`; `exportStudentPdf(student, teacherName)`.
- Produces: route `/students/:id` (id = tz) showing the student page.

Tabs: **personal** — every field `EditStudent` shows, read-only, grouped as the form's fieldsets (personal, study, parents, health/notes); empty values shown as «—». **lessons** — `studentLessons(...)`, each row name + `lessonWhen` (+ room on desktop), click → `/lessons/<_id>`; empty → `record.noLessons`. **guide** — `student.guide` name and phone (phone as a `tel:` link), name linked by `guideLink`; `null` → `record.noGuide`. Actions: «تعديل» if `canStored("students.edit")` → `/students/<tz>/edit`; «طباعة الملف» if `canStored("students.view")` → `exportStudentPdf(student, student.guide?.name || "")`.

- [ ] **Step 1: Write the failing tests** (mock the services as `EditStudent.lock.test.js` does): all three tab labels present; personal tab shows a parent phone; lessons tab lists only the lessons that hold the student, sorted; a student with no lessons shows «لا يوجد دروس بعد»; `guide: null` shows «لا يوجد مرشد مسؤول بعد»; a guide without `tz` renders the name as text (no `<a>` to `/users/`); with `canStored` false for `students.edit` no «تعديل» button; a route test that `/students/123` renders `StudentView`, `/students/123/edit` and `/students/new` render `EditStudent`.
- [ ] **Step 2: Run** `CI=true npx react-scripts test --watchAll=false src/Components/Student` — expect FAIL.
- [ ] **Step 3: Implement** `StudentView`, the routes and the list changes.
- [ ] **Step 4: Run** the full client suite and `CI=false npm run build` — expect all pass, build compiles.
- [ ] **Step 5: Check in the browser** (client preview, signed in on a local test account from the project's seed files): open a student from the list on desktop and at 375px width; screenshot both.
- [ ] **Step 6: Codex review, log entry, commit** (`Open a student on a read-only page with lessons and guide tabs`).

### Task 5: Lesson page

**Files:**
- Create: `client/src/Components/Lesson/LessonView.jsx`, `client/src/Components/Lesson/LessonView.test.js`
- Modify: `Routes.jsx` (`/lessons/:id` → `LessonView`, add `/lessons/:id/edit` → `EditLesson`, keep `/lessons/new`)
- Modify: `client/src/Components/Lesson/ViewAllLesson.jsx` and `MobileLessonList.jsx` (opening a lesson → view page for every `lessons.view` holder; the mobile `onOpen` is no longer limited to `canEditLessons`)

**Interfaces:**
- Consumes: `RecordPage`, `lessonWhen`, `guideLink`, `record` strings, `removeFromList` (Task 2); `teacherContact`/`helperContact` (Task 1); `getOneLesson`, `addToList`, `getAllLesson`; student `getAll`; `LessonRoster` (unchanged); `ask` from `confirmBus`.
- Produces: route `/lessons/:id`.

Tabs: **lessonDetails** — name, `lessonWhen`, room, teacher and helper (name + phone, linked by `guideLink`); «تعديل» action if `canStored("lessons.edit")` → `/lessons/<id>/edit`. **students** — `LessonRoster` with `canEdit = canStored("lessons.roster")`, `hiddenCount` from the lesson; its `onChange(ids)` is diffed against the current list: added ids → `addToList(id, { list_students })`, each removed id → `ask(record.removeConfirm)` then `removeFromList(id, [sid])`; `onLookupAdd` → `addToList(id, { list_tz: [tz] })`; after each call reload the lesson; a failed call shows the server message with `toast.warn` and reloads. Each student name links to `/students/<tz>`.

- [ ] **Step 1: Write the failing tests:** details tab shows the teacher's name and phone; the students tab lists names linking to `/students/<tz>`; without `lessons.roster` no add/remove controls; removing asks first and, on yes, calls `removeFromList("L1", ["s1"])` once; a 423 answer shows the lock message and reloads; with `hiddenCount: 2` the tab shows the "+2" line and removing a visible student sends only that id.
- [ ] **Step 2: Run** `CI=true npx react-scripts test --watchAll=false src/Components/Lesson` — expect FAIL.
- [ ] **Step 3: Implement** `LessonView`, the routes and the list changes.
- [ ] **Step 4: Run** the full client suite and the build — expect pass.
- [ ] **Step 5: Check in the browser** at desktop and 375px: open a lesson, add then remove a student on a local test lesson.
- [ ] **Step 6: Codex review, log entry, commit** (`Open a lesson on a page with its details and its students`).

### Task 6: User (guide) page

**Files:**
- Create: `client/src/Components/User/UserView.jsx`, `client/src/Components/User/UserView.test.js`
- Modify: `Routes.jsx` (`/users/:id` → `UserView`, add `/users/:id/edit` → `EditUser`, keep `/users/new`)
- Modify: `client/src/Components/User/ViewAllUser.jsx`, `MobileUserList.jsx` (row/`onOpen` → view page; «تعديل» → `/users/<tz>/edit`)

**Interfaces:**
- Consumes: `RecordPage`, `guideStudents`, `guideLessons`, `lessonWhen`, `record` strings; `getUserById(tz)`; student `getAll`; `getAllLesson`.
- Produces: route `/users/:id` (reached under the existing `users.view` route rule).

Tabs: **personal** (always: name, role, phone, email, city/street); **theirStudents** (`guideStudents`, click → `/students/<tz>`) only if non-empty; **theirLessons** (`guideLessons`, click → `/lessons/<_id>`) only if non-empty. With only personal, `RecordPage` shows no tab bar. Action «تعديل» if `canStored("users.edit")`.

- [ ] **Step 1: Write the failing tests:** a user with students and lessons shows three tabs; with lessons only, two (no students tab); with neither, no `role="tablist"`; student rows link to `/students/<tz>`; no «تعديل» without `users.edit`.
- [ ] **Step 2: Run** `CI=true npx react-scripts test --watchAll=false src/Components/User` — expect FAIL.
- [ ] **Step 3: Implement** `UserView`, the routes and the list changes.
- [ ] **Step 4: Run** the full client suite and the build — expect pass.
- [ ] **Step 5: Codex review, log entry, commit** (`Open a user on a page with their students and lessons`).

### Task 7: Profile tabs

**Files:**
- Modify: `client/src/Components/Profile/Profile.jsx`
- Test: `client/src/Components/Profile/Profile.tabs.test.js`

**Interfaces:**
- Consumes: `RecordPage`, `guideStudents`, `guideLessons`, `lessonWhen`, `record` strings; `getStoredUserId()`; student `getAll` (skipped without `students.view`); `getAllLesson` (skipped without `lessons.view`).

The existing Profile form (with `ChangeOwnPassword`) becomes the **myDetails** tab content unchanged; **myStudents** and **myLessons** appear only when non-empty, rows linking to the student and lesson view pages. No action buttons (the form is in the first tab).

- [ ] **Step 1: Write the failing tests:** a guide with students sees «طلابي» and its rows link to `/students/<tz>`; a user with no students and no lessons sees the form and no `role="tablist"`; a failed students load hides that tab without breaking the form.
- [ ] **Step 2: Run** `CI=true npx react-scripts test --watchAll=false src/Components/Profile` — expect FAIL.
- [ ] **Step 3: Implement** the tabs around the existing form.
- [ ] **Step 4: Run** the full client suite and the build — expect pass; check the profile in the browser at desktop and 375px.
- [ ] **Step 5: Codex review, log entry, commit** (`Show a guide's students and lessons in their profile`).

### Task 8: Whole-change check

- [ ] **Step 1: Run** `cd server && npm test`, `cd client && CI=true npx react-scripts test --watchAll=false`, `CI=false npm run build` — all pass, build compiles (remove `client/build` after).
- [ ] **Step 2: Browser walk-through** on local test data: student → lesson → student → guide (as admin), and the same as a guide account (no guide link, name and phone shown). Screenshots at desktop and 375px.
- [ ] **Step 3: Codex review of the whole change** against the spec; log the result and what was not verified.
