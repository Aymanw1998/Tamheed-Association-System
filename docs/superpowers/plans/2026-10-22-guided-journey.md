# Guided Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the screen-by-screen tour with one illustrated journey in chapters. A drawn guide (تمهيد or إبراهيم) walks the user through every screen and dialog. The demonstrations run in a training mode whose data never reaches the server, the database or Google Drive.

**Architecture:** Training mode is a single in-memory switch.
- **Shared axios instances:** an adapter answers their requests from an in-memory demo store.
- **Every other network path:** fetch chat, the live EventSource, `window.open` and PDF save are guarded by the same switch.
- **Journey engine:** a new provider that runs chapters. Each chapter is a list of steps with a guide mood, text and an optional action (navigate, open, type, select, click). It reuses the existing tour progress API (`/api/tours`) with one id per chapter.

**Tech Stack:** React 18 (CRA 5), react-router 7, axios, driver.js 1.3.1 (existing), `@dicebear/core` + `@dicebear/collection` (new, exact versions), Jest for pure modules.

**Spec:** `docs/superpowers/specs/2026-10-22-guided-journey-design.md` (Arabic). Read it, including the two "after builder check" sections.

## Global Constraints

- **No data-writing request reaches the server while training mode is on.** Only `/tours/...`, `/auth/refresh`, `/auth/me` and logout are allowed. Logout turns training mode off first.
- **`/live/ticket` and the live stream are off** during training.
- **Training mode lives in memory only.** It never goes in localStorage or sessionStorage. A page reload always comes back in real mode.
- **Real and demo data never mix** on one screen. Screens remount when training mode turns on or off.
- **Demo data is plainly fictional Arabic.** No valid Israeli ID numbers (`client/src/utils/israeliId.js` must reject every demo ID). Phones use `050-000-00xx`.
- **Persistent orange banner** while training: «وضع التدريب — كل ما تراه بيانات تجريبية، ولا يُحفظ شيء في النظام».
- **Guide by gender:** `"ذكر"` → `ibrahim`, anything else → `tamheed`.
- **Avataaars style:**
  - تمهيد: top `hijab`, hatColor `164d63`, no facial hair.
  - إبراهيم: top `shortFlat`, hairColor `2c1b18`, facialHair `beardLight` color `2c1b18`.
  - Both: clothing `shirtCrewNeck`, clothesColor `257a97`.
  - A round white badge with the full `client/src/images/logo.png` sits over the shirt.
  - No hands are drawn. Pointing is an animated arrow from the bubble to the target. Celebrating is a happy face plus small confetti.
- **Moods:** `explain`, `point`, `warn`, `celebrate`.
- **Text:** Arabic only, following `docs/arabic-style-guide.md`. A title and at most two sentences per step, body ≤ 220 chars. The guide speaks in the first person: «سأفتح لك…», «لاحظ هنا…».
- **Permissions:** each user sees only the chapters and steps they hold permissions for.
- **Destructive actions** (delete, archive, revoke) are shown with mood `warn`. The guide opens the confirm and then presses «إلغاء», never the confirm button.
- **Progress:** one tour id per chapter (`journey-<name>`) plus `journey-intro`, stored through the existing `/api/tours` endpoints. No server change. Resume means the first chapter that is neither done nor skipped, started from its first step.
- **Commits:** no Co-Authored-By trailer (owner rule), never push. Repo is public: no personal data.

## Review Focus

1. **A write slips past the demo layer.** This covers a new service using `fetch`, an upload or `navigator.sendBeacon`. Expected: blocked, never sent. Pinned in Task 1 (`blocks unknown writes`, `chat fetch refused in demo`).
2. **Reload or logout mid-journey.** Expected: real mode, real data, no banner, and the next sign-in offers «نكمل من فصل X؟». Pinned in Task 1 (`demo flag is memory-only`) and Task 3 (`nextChapter`).
3. **A user with few permissions,** for example an assistant with no vehicles or users access. Expected: those chapters are absent, there are no empty steps, and the journey still finishes. Pinned in Task 3 (`availableChapters`).
4. **A demo fixture shaped differently from the real API.** Expected: every screen renders with demo data and no runtime error. Pinned in Task 1 (`demo responses match service shapes`) and checked per chapter in Tasks 4–5.
5. **Ending the journey while a demo dialog or form is open.** Expected: the dialog closes, screens remount on real data, and no demo row remains visible. Pinned in Task 3 (`stopJourney resets demo store and remounts`).

---

### Task 1: Training mode (demo data layer)

**Files:**
- Create: `client/src/journey/demoMode.js`, `client/src/journey/demoData.js`, `client/src/journey/demoRoutes.js`, `client/src/journey/demoAdapter.js`, `client/src/journey/TrainingBanner.jsx`
- Modify:
  - `client/src/WebServer/services/api.jsx`: install the adapter on `api` and `publicApi`;
  - `client/src/WebServer/services/ai/functionsAI.jsx`: `streamChat` returns `{ ok:false, code:"DEMO" }` in demo;
  - `client/src/WebServer/services/live/liveStream.js`: no connection in demo, and close when demo turns on;
  - `client/src/Components/Vehicle/RecordDocuments.jsx`: in demo, `window.open` is replaced by an in-page preview of a demo document;
  - the PDF export components (`Components/Report/ExportPDF.jsx`, `Components/ExportPDF/ExportPDF.jsx`): in demo, show the preview only, with no download or save;
  - `client/src/Components/Routes/Routes.jsx`: render `<TrainingBanner/>`, and key the `<Outlet/>` on the demo epoch so screens remount on toggle.
- Test: `client/src/journey/demoMode.test.js`, `demoRoutes.test.js`, `demoAdapter.test.js`, `demoData.test.js`

**Interfaces (produces):**
- `demoMode.js`:
  - `isDemo(): boolean`
  - `startDemo(): void` (creates a fresh store and bumps the epoch)
  - `stopDemo(): void` (drops the store and bumps the epoch)
  - `demoEpoch(): number`
  - `subscribeDemo(fn: (on:boolean)=>void): () => void`
  - `getDemoStore(): DemoStore | null`
  - React hook `useDemo(): { on: boolean, epoch: number }`
- `demoData.js`: `createDemoStore(): DemoStore`. It holds plain arrays and objects for users (an admin, a guide and an assistant), about 6 students in mixed statuses, this week's lessons with rosters, attendance, 2 reports, 1 vehicle with a document near expiry, files and folders, notices, audit rows and alerts.
- `demoRoutes.js`:
  - `ALLOWED_DURING_DEMO: RegExp[]`, covering `/tours`, `/auth/refresh`, `/auth/me` and `/auth/logout` (or the real logout path).
  - `handleDemoRequest({ method, url, params, data }, store): { status:number, data:any } | null`. Reads return store data in the exact shape the matching service in `client/src/WebServer/services/*` expects. Writes mutate the store and return the success shape the screen expects. It returns null for anything unknown.
- `demoAdapter.js`: `installDemoAdapter(instance)`. While `isDemo()`:
  - allowed URLs go to the real adapter;
  - a non-null `handleDemoRequest` result is returned as a normal axios response;
  - an unknown GET returns `{ ok:true, result:[] }`;
  - an unknown write is rejected with an axios-style error `{ response:{ status:409, data:{ ok:false, code:"DEMO_BLOCKED" } } }` and is never sent.

  Off demo it is a pass-through.

- [ ] **Step 1: Write failing tests**
  - **`demoMode.test.js`:**
    - start then stop toggles `isDemo` and bumps `demoEpoch` each time;
    - `subscribeDemo` is notified;
    - `demo flag is memory-only`: no `localStorage` or `sessionStorage` key is written (spy on both).
  - **`demoData.test.js`:**
    - every demo ID fails `isValidIsraeliId`;
    - all names contain Arabic letters;
    - phones match `/^050-000-00\d\d$/`.
  - **`demoRoutes.test.js`:**
    - one read and one write per entity: students, lessons, attendance, reports, vehicles, files, notices, users, audit, alerts, dashboard;
    - a POST to students adds a row that the next GET returns;
    - `demo responses match service shapes`: for each service function used by a screen, the demo response passes through the service's own unwrapping (e.g. `res.data.result`) to a non-undefined array or object;
    - an unknown URL gives null.
  - **`demoAdapter.test.js`:** with a fake underlying adapter that records calls:
    - off demo, every request is passed through;
    - in demo, a GET to `/student` never reaches the fake adapter and returns demo rows;
    - `blocks unknown writes`: a POST to `/unknown` rejects with `DEMO_BLOCKED` and the fake adapter got zero calls;
    - `/tours/item/x` and `/auth/refresh` pass through in demo.
  - **`functionsAI.test.js`:** add `chat fetch refused in demo`. `streamChat` resolves `{ ok:false, code:"DEMO" }` and global `fetch` was not called.
- [ ] **Step 2: Run** `cd client && npx react-scripts test --watchAll=false src/journey src/WebServer` → FAIL.
- [ ] **Step 3: Implement** the files and modifications above. Read each service file before writing its route so the shapes match.
- [ ] **Step 4: Run** `cd client && npm test` and `npm run build` → PASS, no new warnings.
- [ ] **Step 5: Commit** `git commit -m "Add a training mode whose data never leaves the browser"`

### Task 2: The guides (characters, badge, bubble)

**Files:**
- Modify: `client/package.json` (add `@dicebear/core` and `@dicebear/collection` at exact versions of the newest 9.x release that is at least 2 weeks old; record the license in the report); `client/src/utils/session.js` (`rememberSessionUser` also stores `gender` as `localStorage.gender`; add `getStoredGender(): string`)
- Create: `client/src/journey/characters.js`, `client/src/journey/Guide.jsx`, `client/src/journey/Guide.module.css`
- Test: `client/src/journey/characters.test.js`, and extend `client/src/utils/session.test.js`

**Interfaces (produces):**
- `characters.js`:
  - `guideFor(gender: string): "tamheed" | "ibrahim"`;
  - `GUIDE_NAMES = { tamheed: "تمهيد", ibrahim: "إبراهيم" }`;
  - `MOODS = ["explain", "point", "warn", "celebrate"]`;
  - `avatarSvg(guide, mood): string`, built offline with `createAvatar(avataaars, {...})`, memoized.
  - Mood → face mapping:

    | Mood | eyes | eyebrows | mouth |
    | --- | --- | --- | --- |
    | `explain` | `default` | `defaultNatural` | `smile` |
    | `point` | `side` | `raisedExcitedNatural` | `smile` |
    | `warn` | `squint` | `sadConcernedNatural` | `serious` |
    | `celebrate` | `happy` | `raisedExcited` | `twinkle` |

    If a value isn't valid in the installed version, pick the closest one and note it.
- `<Guide guide mood title body targetRect? onNext onPrev onPause onSkipChapter canPrev />`:
  - the avatar in the bottom-left corner with the logo badge;
  - an RTL speech bubble with the title, the body and buttons «التالي ←», «السابق», «إيقاف مؤقت», «تخطّي الفصل»;
  - an animated SVG arrow from the bubble to `targetRect` when the mood is `point`;
  - CSS confetti when the mood is `celebrate`;
  - on screens narrower than 768px the avatar is 72px and the bubble sits above it.

- [ ] **Step 1: Failing tests:**
  - `guideFor("ذكر") === "ibrahim"`;
  - `guideFor("انثى") === "tamheed"`;
  - `guideFor("") === "tamheed"`;
  - `guideFor(undefined) === "tamheed"`;
  - `avatarSvg` returns a string starting `<svg` for every guide and mood pair, and returns the same reference on a repeat call;
  - `rememberSessionUser({gender:"ذكر"})` then `getStoredGender() === "ذكر"`.
- [ ] **Step 2: Run** `npx react-scripts test --watchAll=false src/journey/characters src/utils/session` → FAIL.
- [ ] **Step 3: Install** with `npm install --save-exact` and implement.
- [ ] **Step 4: Run** `npm test`, `npm run build` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Add the illustrated guides Tamheed and Ibrahim"`

### Task 3: Journey engine

**Files:**
- Create: `client/src/journey/journeyLogic.js`, `client/src/journey/actions.js`, `client/src/journey/JourneyProvider.jsx`, `client/src/journey/chapters/index.js` (chapter list; content comes in Tasks 4–5; this task ships the `intro` chapter only, so the engine is runnable)
- Modify: `client/src/Components/Routes/Routes.jsx` (mount `JourneyProvider` inside the existing `TourProvider`)
- Test: `client/src/journey/journeyLogic.test.js`, `client/src/journey/actions.test.js`

**Interfaces:**
- **Consumes:**
  - Task 1: `startDemo`, `stopDemo`, `useDemo`;
  - Task 2: `Guide`, `guideFor`, `getStoredGender`;
  - existing: `confirmLeave` (`utils/unsavedChanges.js`), `saveTour` and `loadTourState` (`services/tours/functionsTours.jsx`), `getStoredPermissions`, `hasPermission`.
- **Produces:**
  - **Chapter shape:** `{ id: "journey-<name>", title, route, requires: string|null, steps: Step[] }`.
  - **Step shape:** `{ target: string|null, mood, title, body, requires?, action?: Action }`.
  - **Action shape:** `{ type: "navigate", path } | { type: "click", target } | { type: "type", target, value } | { type: "select", target, value } | { type: "cancelConfirm" } | { type: "wait", ms }`.
  - **`journeyLogic.js`:**
    - `availableChapters(chapters, permissions) -> Chapter[]`: drops chapters, and steps inside them, whose `requires` is not held; drops chapters left with zero steps.
    - `nextChapter(chapters, tours) -> Chapter|null`: the first chapter with no `tours[id]`.
    - `shouldOfferJourney(tours) -> boolean`: true when `tours["journey-intro"]` is missing.
    - `chapterForPath(chapters, pathname) -> Chapter|null`.
  - **`actions.js`:** `runAction(action, { navigate, find }) -> Promise<void>`.
    - `type` sets the value through the native value setter and dispatches `input` events character by character, about 40ms per character, so React sees each change.
    - `click` dispatches a synthetic click marked `__journey = true`.
    - `cancelConfirm` clicks the cancel button of the open confirm dialog (`Components/Provides/ConfirmContext.jsx`).
    - A missing target rejects with `TARGET_MISSING`; the engine then skips that step.
  - **`JourneyProvider`**, through `useJourney(): { offer, startJourney(fromChapterId?), stopJourney(), running, currentChapterId }`:
    - **Start:** `await confirmLeave()`, then `startDemo()`, then navigate to the chapter route and run its steps.
    - **Next:** runs the step's action, then shows the next step.
    - **Click blocking:** the existing capture listeners pattern, but synthetic events with `__journey` pass.
    - **Chapter end:** shows a `celebrate` step and calls `saveTour(id, "done", 1)`. «تخطّي الفصل» calls `saveTour(id, "skipped", 1)`.
    - **Pause or end:** `stopDemo()`, then navigate to `/dashboard`.
    - **Offer on sign-in:** the intro card «ابدأ الآن / لاحقًا / تخطٍّ» when `shouldOfferJourney`. Later defers for the session; skip saves `journey-intro` as skipped. If chapters are left, it offers «نكمل من فصل X؟».

- [ ] **Step 1: Failing tests:**
  - **`availableChapters`:**
    - an assistant's permissions drop the `journey-vehicles` and `journey-users` chapters;
    - a step requiring `students.delete` is dropped for a guide;
    - an emptied chapter is dropped.
  - **`nextChapter`:** given done for intro and students, it returns lessons; given all done, it returns null.
  - **`shouldOfferJourney`:** `{}` gives true, `{ "journey-intro": {status:"skipped"} }` gives false, and `{ welcome: {status:"done"} }` gives true (existing users see it once).
  - **`chapterForPath`:** `/students/abc` gives the students chapter.
  - **`actions.test.js`** (jsdom):
    - `type` on an `<input>` with an attached React-like listener receives each character;
    - `click` events carry `__journey`;
    - a missing target rejects `TARGET_MISSING`.
  - **`stopJourney resets demo store and remounts`:** after start and stop, `isDemo()` is false and `demoEpoch()` advanced twice.
- [ ] **Step 2: Run** → FAIL. **Step 3:** Implement. **Step 4:** `npm test`, `npm run build` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Add the journey engine: chapters, guide actions, progress and resume"`

### Task 4: Chapters 1–6 (intro, dashboard, students, lessons, attendance, reports)

**Files:**
- Modify: `client/src/journey/chapters/index.js` and new files `client/src/journey/chapters/{intro,dashboard,students,lessons,attendance,reports}.js`. Add `data-tour` anchors where missing, attributes only, in the matching components: dialogs `RolePickerDialog`, `ParentLinkPanel`, `LessonRoster`, the student and lesson forms, attendance marking, and report editing.
- Test: `client/src/journey/chapters.test.js`

**Content:** follow the spec's chapter list.
- **Walkthroughs:** open each dialog or form on the screen and fill it field by field with demo values, then press save. The success toast must come from demo mode.
- **Students chapter:** add a student, open the student card, open the parent link panel.
- **Lessons chapter:** create a lesson, open the roster.
- **Attendance chapter:** mark present, absent and late.
- **Reports chapter:** write a report, then export the PDF as a preview only.
- **Deletes:** `warn` plus `cancelConfirm`.

**Steps:**
- [ ] **Step 1: Failing test `chapters.test.js`**, over all chapters registered in `index.js`:
  - ids are unique and match `/^journey-[a-z-]+$/`;
  - every title and body is non-empty Arabic, with the body ≤ 220 chars;
  - every `mood` is in `MOODS`;
  - every action type is known;
  - every `requires` is a key in `PERMISSION_TREE` or a module name;
  - every step `target` exists as a `data-tour="..."` string somewhere under `client/src/Components` (read the files with `fs` in the test);
  - no step after a `warn` delete step clicks a confirm button (only `cancelConfirm`).
- [ ] **Step 2–4:** Run → FAIL. Implement. Then `npm test` and `npm run build` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Journey chapters: intro, dashboard, students, lessons, attendance, reports"`

### Task 5: Chapters 7–13 (files, vehicles, notices, users and permissions, audit, assistant, profile)

Same shape as Task 4.
- **Files chapter:** a fake upload via the files service using a synthetic `File` (`new File(["demo"], "خطة-الأسبوع.pdf")`) inside the demo store. The real file picker never opens. Also create a folder and share it.
- **Vehicles chapter:** the vehicle record, a document opened as an in-page demo preview, and the periodic test.
- **Users chapter:** approve a pending user (role picker), change a role, and the permissions tab (grant then revoke shown, saved to the demo store).
- **Profile chapter:** the change-password form is filled, and the guide then presses «إلغاء». It never submits, even in demo.
- [ ] Steps 1–5 as in Task 4, with the same test file covering the new chapters. Commit `git commit -m "Journey chapters: files, vehicles, notices, users, audit, assistant, profile"`

### Task 6: Wire it in and retire the old screen tours

**Files:**
- Modify:
  - `client/src/tours/TourProvider.jsx`: remove the welcome and auto screen-tour starts, and the startup queue item `welcome`; keep the new-access card and what's new;
  - `client/src/tours/HelpCenter.jsx`: «المسار التدريبي كاملًا», «شرح هذه الشاشة» (the `chapterForPath` chapter), the chapter list with done or skipped marks, and what's new;
  - `client/src/tours/registry.js`: delete the screen tours and keep only what the help center or releases still use;
  - `client/src/tours/logic.js`, `registry.test.js`, `logic.test.js`: update or remove what the deletions orphan;
  - the access card «أرني» and release «أرني» → `startJourney(chapterIdForSection)`;
  - `client/src/tours/releases.js`: add release `2026-10-22-guided-journey`;
  - `EditUser` tour status: count `journey-*` ids; reset also clears them (the server reset already clears all `tours`).
- Test: update the existing tour tests. Add `releaseShowMe` mapping test: every release `tourId` is a chapter id.

- [ ] **Step 1–4:** Failing tests → implement → `npm test` (root: server + client) and `cd client && npm run build` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Use the guided journey everywhere and retire the old screen tours"`

### Task 7: Docs

- [ ] Append a `docs/AI_REVIEW_LOG.md` entry: what changed, the verification counts, not checked in a browser, and that the Codex handoff is pending. Add a short "how to add a chapter or step" comment at the top of `client/src/journey/chapters/index.js`.
- [ ] Commit `git commit -m "Document the guided journey"`
