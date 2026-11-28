# Nasheed Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A separate nasheed site (`apps/nasheed`, host `NASHEED_HOST`).
Guests read the library. A staff member holding `nasheeds.manage` adds,
edits and deletes nasheeds, and builds an ordered list exported to PDF.

**Architecture:** Same server, same database. The site works like the IT
site: a host-only static build (`hostStatic`), a host-only API under
`/api/nasheed`, and its own session cookie. Nasheeds live in one
collection behind a service with injected dependencies. A delete goes to
the existing recycle bin as a new kind, `nasheed`. The PDF is built in the
browser with `html2canvas` + `jsPDF`.

**Tech Stack:**
- Server: Node/Express, node:test.
- App: CRA React 18 with Jest (react-scripts 5), `html2canvas` and `jspdf`
  (the same versions as `apps/system`).

**Spec:** `docs/superpowers/specs/2026-11-27-nasheeds-site-design.md`

## Global Constraints

- **Language:** the UI is Arabic and RTL. Code, comments and repo docs are
  in English.
- **Commits:** the executor never commits (owner's rule). Each task ends
  with a proposed commit message, and the owner commits. No Claude
  co-author trailer.
- **Tests:**
  - Synthetic ids, names and passwords only.
  - Never run data-clearing, seed, migration or admin-creation commands
    as tests.
  - The repo is public: no secrets in docs or tests.
- **Fields:** a nasheed has `title` and `lines` only. `lines` is an array of `{kind:"verse",sadr,ajuz}`, `{kind:"center",text}` or `{kind:"break"}` (spec, "The words are lines"). "Audio, video,
  links or any field beyond title and lines" is a non-goal.
- **Lists:** they are never stored, neither on the server nor in
  `localStorage`.
- **Guests:**
  - They read only: the list, the search and the read page.
  - The public payload is exactly `{ _id, title, lines, updatedAt }`.
- **Sign-in:**
  - Tamheed ID number + password, and `nasheeds.manage` is required.
  - No email code.
  - The system account (`isSystemTz`) is refused.
  - A staff member who must change their password is refused with
    «يجب تغيير كلمة المرور أولًا في النظام الرئيسي».
- **Search engines:** `<meta name="robots" content="noindex">` in the
  app's `index.html`, and `X-Robots-Tag: noindex` on every response for
  `NASHEED_HOST`.
- **No `NASHEED_HOST`:** no nasheed site, and every `/api/nasheed` route
  answers 404.
- **Limits:**
  - `title`: 1–120 characters after trim.
  - `lines`: at most 300; each text 1–200 characters after trim, tashkeel kept; a verse needs both halves; at least one line with text; empty rows dropped.

## Review Focus

1. **A long nasheed in the PDF:** it continues onto the next page and no
   line is lost. A short one is never split across pages (spec).
2. **Search across Arabic spellings:** «انشودة» finds «أنشودة», and
   diacritics (tashkeel) are ignored. A person reading or typing on a
   phone expects that.
3. **A guest opens an edit or build URL directly:** they are sent to the
   sign-in screen, and no form is shown.
4. **The user cancels the iPhone share sheet** (`AbortError`): no error
   toast, and no download fallback.
5. **Building a list when a nasheed was deleted meanwhile:** the PDF uses
   the lines already loaded, and nothing fails.

Each line has its test in the task that owns it: 1 → Task 8,
2 → Tasks 1 and 6, 3 → Task 6, 4 → Task 8, 5 → Task 8.

---

### Task 1: Nasheed store and service

**Files:**
- Create: `server/Entities/Nasheed/Nasheed.model.js`
- Create: `server/services/nasheeds.js`
- Test: `server/test/nasheeds-service.test.js`

**Interfaces:**
- Produces:
  - **The model.** `NasheedModelDef`, the `modelFor("Nasheeds")` shape from
    `Display/DisplayScreen.model.js` (`get`, `create`, `updateExisting`,
    `delete`).
  - **The search helper.** `normalizeArabic(text): string` removes
    tashkeel and tatweel, folds `أإآ`→`ا`, `ى`→`ي` and `ة`→`ه`, then
    lower-cases. It is exported and also used by the app (copied in
    Task 5).
  - **The service.** `createNasheeds({ nasheeds, bin, audit, now })`
    returns:
    - `list(): Promise<Array<{_id,title,lines,updatedAt}>>`, sorted by
      title, Arabic locale.
    - `get(id)`, which answers 404 `NOT_FOUND` «النشيد غير موجود».
    - `create({title, lines}, req) → doc`
    - `update(id, {title, lines, updatedAt}, req) → doc`. If the stored
      `updatedAt` ≠ the given one, it answers 409 `STALE` «تغيّر النشيد في
      هذه الأثناء. أعد التحميل.».
    - `remove(id, req) → { trashId }`
    - `trashHooks = { restore(entry, req), purge(entry) }`
  - **Errors** are `Object.assign(new Error(msg), { status, code })`, as in
    `services/displayScreens.js`.
  - **Audit.** Every create, update and remove calls
    `audit.record(req, { module: "nasheeds", action, targetType: "nasheed", targetId, targetLabel: title })`.
  - **The recycle bin.** `remove` calls
    `bin.put("nasheed", { refId, label: title, data: doc, actor: req.actor })`,
    then deletes the record. `restore` re-creates it with the same `_id`,
    and answers 409 when that `_id` exists.

- [ ] **Step 1: Write the failing tests.** Use an in-memory store like the
  `store()` in `server/test/make-staff-controller.test.js`.
  - `create trims, keeps line breaks, and refuses an empty or too-long
    title or lines`: 400 `BAD_INPUT`; a 121-character title, a 201-character half, a verse missing its عجز and 301 lines
    are refused; empty rows are dropped; tashkeel is stored as typed.
  - `update refuses a stale updatedAt with 409 STALE and changes nothing`
  - `update stamps a later updatedAt and writes an audit row with the
    title`
  - `remove puts the nasheed in the bin and deletes it; restore brings back
    the same _id`
  - `restore refuses when the _id already exists`
  - `list sorts by title`
  - `normalizeArabic folds hamza, ta marbuta and alif maqsura and drops
    tashkeel`:
    `normalizeArabic("أُنشودة") === normalizeArabic("انشوده")`.
- [ ] **Step 2: Run** `npm test --prefix server -- --test-name-pattern=nasheed`.
  Expected: FAIL, because the module is not found.
- [ ] **Step 3: Implement the model and the service** with the interfaces
  above. `updatedAt` comes from `nextStamp` (`middleware/lockGuard`), as
  elsewhere. The versioned update filters on `{ _id, updatedAt }`.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Propose the commit message.** «Add the nasheed store: title
  and lines, versioned edits, audit, and delete to the recycle bin».

### Task 2: Permission key and recycle-bin kind

**Files:**
- Modify: `shared/permissions.json`: in `tree`, `"nasheeds": ["manage"]`;
  in `labels.ar`, module «الأناشيد» and leaf «إدارة الأناشيد».
- Modify: `server/Entities/Trash/Trash.model.js`: add `"nasheed"` to
  `KINDS`.
- Modify: `server/Entities/Trash/Trash.controller.js`: `KEY_OF`,
  `PURGE_KEY_OF` (both `"nasheeds.manage"`), `MODULE_OF` (`"nasheeds"`),
  and `HOOKS.nasheed`.
- Modify: `server/services/recycleBin.js`: `DEFAULT_HOOKS.nasheed`, which
  points at Task 1's `trashHooks`.
- Modify: `apps/system/src/Components/Trash/*.jsx`: in `KIND_TEXT`,
  `nasheed: "نشيد"`.
- Modify: `scripts/syncShared.js`: add `"nasheed"` to the apps that get
  `permissions.json`, `dateFormat.js` and `tokens.css`. Check
  `scripts/syncPermissions.js` for its own app list too.
- Test: the existing trash tests in `server/test/`, plus one new case.

**Interfaces:**
- Consumes: `trashHooks` from Task 1.
- Produces: the key `nasheeds.manage`, which is in no role's defaults
  (`ROLE_DEFAULTS` is unchanged).

- [ ] **Step 1: Write the failing tests.**
  - `nasheeds.manage is in no role's defaults` (`roleDefaults` of each
    role).
  - `the trash lists and restores a nasheed only for a nasheeds.manage
    holder`
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Make the changes above.** Then run `node scripts/syncShared.js`.
- [ ] **Step 4: Run** `npm run verify`. Expected: all pass, and the build
  compiles. The System permissions screen shows «الأناشيد».
- [ ] **Step 5: Propose the commit message.**

### Task 3: Nasheed session and sign-in

**Files:**
- Create: `server/middleware/requireNasheed.js`
- Create: `server/Entities/Nasheed/Nasheed.auth.js`
- Test: `server/test/nasheed-auth.test.js`

**Interfaces:**
- Consumes:
  - `verifyPasswordAndMaybeUpgrade` and `countFailedSignIn` from
    `User.controller`;
  - `isLocked` and `afterSuccess` from `utils/loginLockout`;
  - `mustChangePassword` and `tokenIsStale` from `utils/systemPassword`;
  - `effectivePermissions`, `can` and `isSystemTz` from
    `utils/permissions`;
  - `isSportHost` from `utils/sportHost`.
- Produces:
  - **Session constants.**
    - `NASHEED_COOKIE = "nasheed_session"`
    - `NASHEED_COOKIE_PATH = "/api/nasheed"`
    - typ `"nasheed"`
    - 12 h
    - secret `process.env.NASHEED_SESSION_SECRET`, which fails closed when
      missing.
    - The cookie options are those of `itCookieOptions`, with the path
      above.
  - **Host check.** `isNasheedHost(req)` and
    `requireNasheedHost(req, res, next)` (404 elsewhere).
  - **Session check.** `createRequireNasheed({ users, systemTz })` returns
    middleware that sets `req.actor = { id, tz, name, permissions, user }`.
    It answers 401 `NASHEED_SIGNED_OUT` «انتهت الجلسة، سجّل الدخول من
    جديد» when:
    - there is no cookie, or the token is bad or stale;
    - the user is not in the active room, is locked, or is the system
      account;
    - the user does not hold `nasheeds.manage`.
  - **Sign-in.** `createNasheedAuth({ users, verifyPassword, countFailure,
    clearFailures, audit, systemTz, now })` returns
    `{ login, logout, me }`:
    - `login` takes the body `{ tz, password }`. It answers 200
      `{ ok, user: { name } }` and sets the cookie, or one of the
      refusals below.
    - `me` answers `{ ok, user: { name } }`.
    - `logout` clears the cookie.
  - **Refusals:**
    - `BAD_LOGIN` 401 «رقم الهوية أو كلمة المرور غير صحيحة»
    - `LOCKED` 423, with the IT text
    - `NO_ACCESS` 403 «ليس لديك صلاحية إدارة الأناشيد»
    - `PASSWORD_CHANGE` 403 «يجب تغيير كلمة المرور أولًا في النظام
      الرئيسي»
  - **The system account** gets `BAD_LOGIN`, so the site does not reveal
    it.

- [ ] **Step 1: Write the failing tests.** Follow the style of
  `server/test/it-auth.test.js`.
  - `a staff member with nasheeds.manage signs in and gets the cookie`
  - `a wrong password counts a failure and answers BAD_LOGIN`
  - `no nasheeds.manage answers NO_ACCESS`
  - `a locked, waiting or suspended account cannot sign in`
  - `the system account is refused as BAD_LOGIN`
  - `mustChangePassword answers PASSWORD_CHANGE`
  - `requireNasheed refuses another host with 404, a token older than a
    password change with 401, and a user whose key was revoked after
    sign-in with 401`
  - `without NASHEED_SESSION_SECRET every request answers 500 and logs
    once`
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement**, following `It.auth.js` and `requireIt.js`
  without the email-code step.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Propose the commit message.**

### Task 4: API routes and server wiring

**Files:**
- Create: `server/Entities/Nasheed/Nasheed.route.js`
- Modify: `server/server.js`:
  - add `hostStatic(apps/nasheed/build, process.env.NASHEED_HOST)` next to
    the IT one;
  - add `app.use('/api/nasheed', …)`;
  - add a middleware that sets `X-Robots-Tag: noindex` when
    `isNasheedHost(req)`.
- Modify: `server/config/.env.example`: `NASHEED_HOST=` and
  `NASHEED_SESSION_SECRET=`, each with a one-line comment.
- Test: `server/test/nasheed-route.test.js`

**Interfaces:**
- Consumes: Tasks 1 and 3, and `rateLimit`.
- Produces these routes (the app uses them). Every route goes through
  `requireNasheedHost` first, and every answer has `Cache-Control:
  no-store`.

  **Public:**
  - `GET /public`: `{ ok, nasheeds: [{_id,title,lines,updatedAt}] }`,
    limited to 120 a minute per IP (scope `nasheed-public`).
  - `GET /public/:id`: `{ ok, nasheed }`, or 404.

  **Sign-in:**
  - `POST /login` (20 per 15 minutes, scope `nasheed-login`)
  - `POST /logout`
  - `GET /me`

  **Managed** (requireNasheed):
  - `POST /`: `{ nasheed }`
  - `PUT /:id`: `{ nasheed }`
  - `DELETE /:id`: `{ trashId }`
  - `POST /restore/:trashId`: the 8-second undo. It refuses an entry
    whose kind is not `nasheed`.

- [ ] **Step 1: Write the failing tests**, in the style of
  `server/test/display-route.test.js`.
  - `every route answers 404 on another host and without NASHEED_HOST`
  - `the public read sends exactly _id, title, lines and updatedAt, and
    never a nasheed in the bin`
  - `every write answers 401 without a session`
  - `restore refuses another kind's trash entry`
  - `responses on the nasheed host carry X-Robots-Tag: noindex`
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Handlers use the `handle(work)` pattern from
  `Display.route.js`.
- [ ] **Step 4: Run** `npm test --prefix server`. Expected: everything
  passes.
- [ ] **Step 5: Propose the commit message.**

### Task 5: The nasheed app shell

**Files:**
- Create `apps/nasheed/` from `apps/it`'s skeleton:
  - `package.json`: name `tamheed-nasheed`, the same pre-scripts, and
    `html2canvas` + `jspdf` at the `apps/system` versions.
  - `public/index.html`: `lang="ar" dir="rtl"`, the noindex meta, title
    «الأناشيد».
  - `public/manifest.json`, `public/service-worker.js` and `src/pwa/`,
    copied from `apps/it`. This makes the site installable like IT (spec).
  - `src/index.js`, `src/setupProxy.js` (`/api` → the server), and
    `src/api.js` (fetch with `credentials: "include"`).
  - `src/session.js`: a `useSession()` hook that returns
    `{ user|null, loading, signIn(tz,password), signOut() }` from
    `GET /me`. A 401 means guest.
  - `src/router.jsx`, with these routes:
    - `/`: the list
    - `/n/:id`: read
    - `/login`
    - `/new`, staff only
    - `/n/:id/edit`, staff only
    - `/build`, staff only
  - `src/arabic.js`: a copy of `normalizeArabic`.
  - `src/strings.js` and `src/styles.css`, which use
    `generated/tokens.css`.
- Modify: root `package.json`: the script `"nasheed": "cd apps/nasheed && npm start"`,
  and `npm run build --prefix apps/nasheed` appended to `build`.
- Test: `apps/nasheed/src/App.test.js`

**Interfaces:**
- Consumes: the routes from Task 4.
- Produces:
  - `useSession()` and `<StaffOnly>`, a wrapper that sends a guest to
    `/login?next=<path>`;
  - `api.get/post/put/del(path, body) → { ok, status, data }`.

- [ ] **Step 1: Write the failing tests.**
  - `a guest sees the list and a «دخول» link`
  - `a guest opening /new, /n/1/edit or /build is sent to /login with next`
  - `after sign-in the user returns to next`
  - `a NO_ACCESS or PASSWORD_CHANGE answer shows its message`
- [ ] **Step 2: Run** `npm install --prefix apps/nasheed`, then
  `npm test --prefix apps/nasheed`. Expected: FAIL.
- [ ] **Step 3: Implement the shell and the sign-in screen.** The
  sign-in form has `noValidate` (the iPhone lesson of 2026-11-26).
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Propose the commit message.**

### Task 6: Library list and read page

**Files:**
- Create: `apps/nasheed/src/screens/Library.jsx`, `Read.jsx`
- Create: `apps/nasheed/src/ui/NasheedLines.jsx`
- Test: `apps/nasheed/src/screens/Library.test.js`, `Read.test.js`,
  `ui/NasheedLines.test.js`

**Interfaces:**
- Consumes: `api`, `useSession` and `normalizeArabic`.
- Produces:
  - **`<NasheedLines lines size />`**, which both the read page and the
    PDF (Task 8) use. It renders lines as follows:
    - A verse is one row: a CSS grid with two equal columns, the صدر in
      the right column and the عجز in the left. A half too long for its
      column wraps inside that column.
    - A centered line is centered.
    - A break shows `***`.
  - **Links** to `/n/:id`. For staff, the list also shows the «إضافة نشيد»
    and «بناء قائمة» buttons.

- [ ] **Step 1: Write the failing tests.**
  - `the list shows titles sorted, and an empty library says «لا توجد
    أناشيد بعد»`
  - `search matches the title or any text in the lines across spellings ("انشوده" finds
    "أنشودة") and ignores tashkeel`
  - `NasheedLines draws a verse as one row with the صدر first (right) and
    the عجز second (left), a centered line centered, and a break as ***;
    tashkeel is shown as stored`
  - `on a 360px-wide screen a verse stays one row and a long half wraps
    inside its own column` (the grid has two columns at every width)
  - `the read page uses a reading size ≥ 18px`
  - `a guest sees no edit or delete on the read page; staff do`
  - `an unknown id shows «النشيد غير موجود» with a link back`
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** The list loads `GET /public` once, and
  search filters on the client.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Propose the commit message.**

### Task 7: Create, edit and delete

**Files:**
- Create: `apps/nasheed/src/screens/Edit.jsx`, which serves both `/new`
  and `/n/:id/edit`.
- Create: `apps/nasheed/src/ui/undoToast.jsx`
- Test: `apps/nasheed/src/screens/Edit.test.js`

**Interfaces:**
- Consumes the routes `POST /`, `PUT /:id` (sent with the loaded
  `updatedAt`), `DELETE /:id` and `POST /restore/:trashId`.

- [ ] **Step 1: Write the failing tests.**
  - `the form has one row per line: a verse row with two fields (صدر on the
    right, عجز on the left), a centered row with one field, and a break row
    showing ***; «بيت», «سطر في الوسط» and «فاصل» add a row at the end; each
    row moves up or down or is removed; the fields have labels for screen
    readers` (for example «صدر البيت 3»)
  - `editing loads the stored lines into rows in order`
  - `an empty title, no line with text, or a verse missing a half shows the
    field error, focuses that field, and sends nothing`
  - `save sends the trimmed title and lines (empty rows dropped) with the loaded updatedAt and opens
    the read page`
  - `a STALE answer shows «تغيّر النشيد في هذه الأثناء. أعد التحميل.» and
    keeps the typed text`
  - `delete asks first, then goes to the list with «تراجع» for 8 seconds;
    تراجع restores and opens the nasheed`
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Propose the commit message.**

### Task 8: Build a list and the PDF

**Files:**
- Create: `apps/nasheed/src/screens/Build.jsx`
- Create: `apps/nasheed/src/pdf.js`
- Test: `apps/nasheed/src/screens/Build.test.js`, `apps/nasheed/src/pdf.test.js`

**Interfaces:**
- `layoutPages(blocks: Array<{height:number}>, pageHeight:number): number[][]`
  is pure and returns the block indexes per page:
  - A block that fits on the current page goes there.
  - A block that fits on an empty page but not on the current one starts a
    new page.
  - A block taller than a page starts a new page and is split by
    `html2canvas` slices across as many pages as it needs.
- `buildNasheedPdf({ heading, nasheeds: [{title, lines}] }) → Promise<Blob>`:
  - The pages are A4, drawn from a hidden RTL DOM in the shared font.
  - Each block shows its number, its title and its lines: a verse is one row (صدر right, عجز left, equal halves), a centered line is centered, a break is `***`. The same `NasheedLines` component as the read page renders it.
  - The heading comes first, if one was given.
- `sharePdf(blob, filename) → Promise<"shared"|"downloaded"|"cancelled">`:
  - When `navigator.canShare?.({ files })` is true, it calls
    `navigator.share`. An `AbortError` answers `"cancelled"`.
  - Otherwise it downloads the file.
  - The filename is `أناشيد-<heading or date>.pdf`.

- [ ] **Step 1: Write the failing tests.**
  - `layoutPages keeps a block that fits whole on one page, moves it to the
    next page when it does not fit, and lets a block taller than a page
    span pages without dropping any`
  - `build: pick from the library with search, move up/down, remove; the
    PDF button is disabled while the list is empty`
  - `the PDF receives the nasheeds in the chosen order and the typed
    heading`
  - `a nasheed deleted meanwhile still prints from the loaded lines`
  - `share cancelled (AbortError) shows nothing and does not download;
    no share support downloads`
  - `leaving the screen and coming back starts an empty list (nothing
    stored)`
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Mock `html2canvas` and `jspdf` in the tests,
  the way the System `ExportPDF` tests do. Add a print button that opens
  the PDF blob URL.
- [ ] **Step 4: Run** `npm test --prefix apps/nasheed`, then
  `npm run build --prefix apps/nasheed`. Expected: the tests pass and the
  build compiles.
- [ ] **Step 5: Propose the commit message.**

### Task 9: Deploy and docs

**Files:**
- Modify: `deploy/nginx-tamheed.conf`: a `nasheed.example.org` server
  block like the IT block, with `client_max_body_size 1m`.
- Modify: `deploy/update.sh`: build `apps/nasheed` with the other apps.
  Read how it builds IT, and do the same.
- Modify: `deploy/DEPLOY.md`: a «موقع الأناشيد» section (Hebrew, like the
  file), covering:
  - DNS;
  - certbot;
  - the two env lines, with `openssl rand -hex 32` for the secret;
  - granting `nasheeds.manage` from the permissions screen;
  - the noindex note.
- Modify: `docs/FEATURE_PERMISSIONS.md`: add a row for `nasheeds.manage`,
  and a line saying guests read without signing in.
- Modify: `docs/AI_REVIEW_LOG.md`: add an entry, and create
  `docs/reviews/2026-11-27-nasheed-site-codex-request.md` (the owner
  triggers the review).

- [ ] **Step 1: Make the changes.**
- [ ] **Step 2: Run** `npm run verify`, `npm test --prefix apps/nasheed` and
  `npm run build --prefix apps/nasheed`. Expected: everything passes.
- [ ] **Step 3: Propose the commit message** and list what was not checked:
  - a real host and DNS;
  - the iPhone share sheet;
  - Arabic glyphs in a real PDF.
