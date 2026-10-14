# Vehicle Document Reading, Nightly Expiry Check & Admin Notices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read vehicle licences and insurance policies from an uploaded image/PDF with Claude, check every vehicle nightly at 01:00 Israel time, and deliver new expiry alerts to all administrators through a notices board and a daily digest email.

**Architecture:** Pure, tested rule modules (`vehicleRules.js`, new `vehicleNotices.js`, `sanitizeExtraction`) hold all decisions; thin services/controllers wire them to MongoDB (through `Entities/api.js`), Claude (`@anthropic-ai/sdk`), SMTP (`nodemailer`) and `node-cron`. A new `Notice` entity stores board items for the `ادارة` role; the client gets a bell + `/notices` page and a "read document" helper inside existing vehicle forms. Nothing extracted is saved without the user's approval.

**Tech Stack:** Node 20+/Express 4, MongoDB via mongoose (generic schema in `Entities/api.js`), `node-cron` 4, `@anthropic-ai/sdk` 0.125, `nodemailer` 7, `node:test`; React 18 (CRA 5), axios, Jest (pure util tests only — no Testing Library in the repo).

**Spec:** `docs/superpowers/specs/2026-10-14-vehicle-docs-expiry-notices-design.md`

## Global Constraints

- Model: `claude-opus-5-5`, called via `client.beta.messages.create` with `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`; structured output through `output_config: { format: { type: "json_schema", schema } }`; `output_config.effort: "medium"`; `max_tokens: 4000`; check `stop_reason === "refusal"` before reading content. No `thinking` param (Opus 5.5 always thinks; `disabled` is a 400).
- Accepted uploads: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`, max 10MB — detected by content via existing `inspectDocument` (`server/utils/vehicleFiles.js`).
- Dates are `"YYYY-MM-DD"` text; "today" is `todayInJerusalem()`; never `new Date(dateString)` for document dates.
- Alert thresholds: `DEFAULT_ALERT_DAYS = [60, 30, 14, 7, 0]`. `due0` = "ends today" (still valid that day); `expired` starts the day after the end date.
- Notice severity: `due60` → `info`; `due30`, `due14`, `missing` → `important`; `due7`, `due0`, `expired` → `critical`.
- Repeat rule: one notice per stage; `expired` repeats once per 7 days (`w<n>` suffix) until renewal changes the due date.
- Cron: `"0 1 * * *"`, `{ timezone: "Asia/Jerusalem" }`. Catch-up on boot if no `JobRuns` row for today and Jerusalem time ≥ 01:00.
- Audience: users whose roles include one of `ادارة`, `إدارة`, `الادارة`, `الإدارة` (use `rules.isAdminUser` after `repairMisencodedText`).
- Notice text limits: `title` 1–120 chars, `body` ≤ 2000 chars, `severity` ∈ `critical|important|info`, `category` ∈ `vehicle|system|manual`.
- Client strings exist in Arabic, Hebrew and English.
- Owner workflow (`MEMORY`): **never run `git commit`** — each task ends by proposing a commit message to the owner; never add a Claude co-author trailer. Repo is public: no secrets or test passwords in docs or the review log.
- After implementation: record changed files and request Codex review in `docs/AI_REVIEW_LOG.md` (per `CLAUDE.md`).

## Review Focus

1. **A vehicle with an expired policy and a newer valid policy** — must produce no insurance alert (the active one wins); `insuranceSummary` changes must not regress this. Test in Task 1.
2. **Server restarted twice on the same day after 01:00** — catch-up must not run twice or duplicate notices (JobRuns check + unique `dedupKey`). Test in Task 4.
3. **Claude returns a plausible but invalid date (`2026-02-30`) or swapped start/end** — must arrive as `null` + warning, never as a pre-filled form value. Test in Task 5.
4. **SMTP not configured / one admin has no or invalid email** — notices are still created and other admins still get mail. Test in Task 4.
5. **Non-admin with vehicle `compliance` permission** — may use document extraction but must get 403 on every `/api/notices` route. Tests in Tasks 3 and 6.

---

## File Structure

**Server — create**
- `server/Entities/Notice/Notice.model.js` — `NoticeModelDef` + `JobRunModelDef` over `api.js`; `ensureNoticeIndexes()`.
- `server/Entities/Notice/Notice.service.js` — `publishNotice`, `listNotices`, `countUnread`, `markRead`, `markAllRead`, `archiveNotice`, `existingDedupKeys`, `listAdmins`.
- `server/Entities/Notice/Notice.controller.js` — HTTP handlers + `requireAdmin` guard.
- `server/Entities/Notice/Notice.route.js` — `/api/notices` routes.
- `server/utils/vehicleNotices.js` — pure: `noticeSeverity`, `dedupKeyFor`, `planVehicleNotices`, `noticeFromAlert`, `buildDigest`.
- `server/services/vehicleExpiryJob.js` — `runVehicleExpiryCheck`, `startVehicleExpiryJob`, `catchUpVehicleExpiryCheck` (deps injectable).
- `server/services/vehicleDocExtract.service.js` — `EXTRACTION_SCHEMA`, `sanitizeExtraction`, `extractVehicleDocument`.
- `server/Entities/Vehicle/VehicleExtract.controller.js` — `extractDocument` handler.
- Tests: `server/test/vehicle-notices.test.js`, `server/test/notice-controller.test.js`, `server/test/vehicle-expiry-job.test.js`, `server/test/vehicle-doc-extract.test.js`.

**Server — modify**
- `server/utils/vehicleRules.js` — thresholds, expired insurance end date.
- `server/Entities/Vehicle/Vehicle.controller.js:852` — `SEVERITY` map.
- `server/Entities/Vehicle/Vehicle.route.js` — `POST /extract`.
- `server/utils/sendEmail.js` — `sendNoticeDigestEmail`.
- `server/server.js` — mount `/api/notices`, start job + catch-up, ensure indexes.
- `server/config/.env.example` — document `ANTHROPIC_API_KEY` use for extraction.
- `server/test/vehicle-rules.test.js` — new threshold expectations.

**Client — create**
- `client/src/WebServer/services/notice/functionsNotice.jsx` — API calls.
- `client/src/i18n/noticeStrings.js` — ar/he/en text.
- `client/src/Components/Notice/NoticesBoard.jsx` + `Notice.module.css` — page.
- `client/src/Components/Notice/NoticeBell.jsx` — header bell.
- `client/src/utils/vehicleScan.js` + `vehicleScan.test.js` — pure mapping of extraction → form draft.
- `client/src/Components/Vehicle/DocumentScan.jsx` — upload + proposal UI.

**Client — modify**
- `client/src/i18n/I18nContext.jsx` — merge `noticeStrings`.
- `client/src/i18n/vehicleStrings.js` — `due60`, `due0` levels + scan texts.
- `client/src/Components/Vehicle/VehicleAlerts.jsx:12` — `LEVEL_TONE`.
- `client/src/WebServer/services/vehicle/functionsVehicle.jsx` — `extractVehicleDocument`.
- `client/src/Components/Vehicle/VehicleRecords.jsx` — scan in licence/policy add forms.
- `client/src/Components/Vehicle/EditVehicle.jsx` — scan for new vehicle basics.
- `client/src/Components/Routes/Routes.jsx`, `client/src/utils/routeAccess.js` (+ test) — `/notices`.
- `client/src/Components/Header/Header.jsx` — bell + nav link.

---

### Task 1: New alert thresholds and expired-insurance end date

**Files:**
- Modify: `server/utils/vehicleRules.js:21` (`DEFAULT_ALERT_DAYS`), `insuranceSummary` (~line 137), `summarizeVehicle` (lines 196-202), `buildAlerts` (lines 237-243)
- Modify: `server/Entities/Vehicle/Vehicle.controller.js:852`
- Modify: `client/src/Components/Vehicle/VehicleAlerts.jsx:12`, `client/src/i18n/vehicleStrings.js` (`alertLevel` in ar/he/en)
- Test: `server/test/vehicle-rules.test.js`

**Interfaces:**
- Produces: alert `level` ∈ `expired|due0|due7|due14|due30|due60|missing`; for expired insurance, `alert.dueDate` = latest expired policy `endDate` and `alert.daysLeft` = negative days.

- [ ] **Step 1: Write the failing tests** (append to `server/test/vehicle-rules.test.js`)

```js
test("alert thresholds start 60 days ahead and mark the end day as due0", () => {
  const status = (due) => rules.expiryStatus(due, "2026-10-14");
  assert.deepEqual(rules.DEFAULT_ALERT_DAYS, [60, 30, 14, 7, 0]);
  assert.equal(status("2026-12-20").state, "ok"); // 67 days
  assert.equal(status("2026-12-13").bucket, 60); // 60 days
  assert.equal(status("2026-11-13").bucket, 30); // 30 days
  assert.equal(status("2026-10-21").bucket, 7);
  assert.equal(status("2026-10-14").bucket, 0); // ends today, still valid
  assert.equal(status("2026-10-13").state, "expired");
});

test("an expired insurance alert carries the latest expired end date", () => {
  const vehicle = {
    _id: "v1", plate: "1234567", status: "active",
    policies: [
      { startDate: "2025-01-01", endDate: "2025-12-31" },
      { startDate: "2026-01-01", endDate: "2026-09-30" },
    ],
  };
  const alert = rules.buildAlerts(vehicle, "2026-10-14").find((a) => a.kind === "insurance");
  assert.equal(alert.level, "expired");
  assert.equal(alert.dueDate, "2026-09-30");
  assert.equal(alert.daysLeft, -14);
});

test("an expired policy next to an active one produces no insurance alert", () => {
  const vehicle = {
    _id: "v2", plate: "7654321", status: "active",
    policies: [
      { startDate: "2025-01-01", endDate: "2025-12-31" },
      { startDate: "2026-01-01", endDate: "2027-06-30" },
    ],
  };
  const kinds = rules.buildAlerts(vehicle, "2026-10-14").map((a) => a.kind);
  assert.ok(!kinds.includes("insurance"));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test --prefix server`
Expected: FAIL — `DEFAULT_ALERT_DAYS` deepEqual and `dueDate` `""` vs `"2026-09-30"`.

- [ ] **Step 3: Implement**

In `vehicleRules.js`:

```js
// Alert lead times in days (0 = the last valid day). The app has no settings
// store yet, so these are a constant; every function that uses them also
// accepts an override.
const DEFAULT_ALERT_DAYS = [60, 30, 14, 7, 0];
```

In `insuranceSummary`, replace the `expired` line:

```js
  if (has("expired")) {
    const latest = withStatus
      .filter((item) => item.status === "expired")
      .reduce((best, item) => (item.policy.endDate > best.policy.endDate ? item : best));
    return { status: "expired", policy: latest.policy, endDate: latest.policy.endDate };
  }
```

In `summarizeVehicle`, the `insurance` block:

```js
    insurance: {
      status: insurance.status,
      endDate: insurance.endDate || "",
      ...(insurance.status === "active"
        ? expiryStatus(insurance.endDate, today, alertDays)
        : insurance.status === "expired"
          ? { state: "expired", daysLeft: daysBetween(today, insurance.endDate), bucket: null }
          : { state: "unknown", daysLeft: null, bucket: null }),
    },
```

In `buildAlerts`, replace the insurance branch:

```js
  if (summary.insurance.status === "active" || summary.insurance.status === "expired") {
    push("insurance", summary.insurance.endDate, summary.insurance);
  } else {
    push("insurance", "", { state: "unknown", daysLeft: null });
  }
```

`Vehicle.controller.js:852`:

```js
const SEVERITY = { expired: 0, due0: 1, due7: 2, due14: 3, due30: 4, due60: 5, missing: 6 };
```

`VehicleAlerts.jsx:12`:

```js
const LEVEL_TONE = { expired: "danger", due0: "danger", due7: "danger", due14: "warning", due30: "warning", due60: "neutral", missing: "neutral" };
```

`vehicleStrings.js` — in each `alertLevel` add (ar / he / en):

```js
      due0: "تنتهي اليوم",        // he: "מסתיים היום"          en: "Ends today"
      due60: "خلال 60 يومًا",      // he: "תוך 60 ימים"           en: "Within 60 days"
```

- [ ] **Step 4: Run tests**

Run: `npm test --prefix server`
Expected: PASS. If older tests asserted `state: "ok"` for 31–60 days or `daysLeft: null` for expired insurance, update those expectations to the new rules (the spec changed them deliberately) and note each one in the commit message.

- [ ] **Step 5: Propose commit (do not run)**

`feat(vehicles): alert from 60 days ahead, flag the end day, date expired insurance`

---

### Task 2: Pure notice planning (`vehicleNotices.js`)

**Files:**
- Create: `server/utils/vehicleNotices.js`
- Test: `server/test/vehicle-notices.test.js`

**Interfaces:**
- Consumes: alerts from `rules.buildAlerts` (`{ vehicleId, plate, nickname, kind, level, dueDate, daysLeft }`).
- Produces:
  - `noticeSeverity(level) → "critical"|"important"|"info"`
  - `dedupKeyFor(alert) → string`
  - `noticeFromAlert(alert) → { title, body, category: "vehicle", severity, link, dedupKey }`
  - `planVehicleNotices(alerts, existingKeys: Set<string>) → notice[]` (new only, critical first)
  - `buildDigest(notices) → { subject, html, text }`

- [ ] **Step 1: Write the failing tests**

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const notices = require("../utils/vehicleNotices");

const alert = (extra = {}) => ({
  vehicleId: "v1", plate: "1234567", nickname: "باص", kind: "insurance",
  level: "due30", dueDate: "2026-11-13", daysLeft: 30, ...extra,
});

test("severity follows the agreed table", () => {
  assert.equal(notices.noticeSeverity("due60"), "info");
  for (const level of ["due30", "due14", "missing"]) assert.equal(notices.noticeSeverity(level), "important");
  for (const level of ["due7", "due0", "expired"]) assert.equal(notices.noticeSeverity(level), "critical");
});

test("each stage is announced once", () => {
  const first = notices.planVehicleNotices([alert()], new Set());
  assert.equal(first.length, 1);
  const again = notices.planVehicleNotices([alert()], new Set([first[0].dedupKey]));
  assert.equal(again.length, 0);
});

test("an expired document repeats once a week", () => {
  const day = (daysLeft) => alert({ level: "expired", dueDate: "2026-09-30", daysLeft });
  const k1 = notices.dedupKeyFor(day(-1));
  assert.equal(notices.dedupKeyFor(day(-6)), k1);
  assert.notEqual(notices.dedupKeyFor(day(-7)), k1);
  assert.equal(notices.dedupKeyFor(day(-7)), notices.dedupKeyFor(day(-13)));
});

test("renewal changes the key so old reminders stop", () => {
  assert.notEqual(notices.dedupKeyFor(alert()), notices.dedupKeyFor(alert({ dueDate: "2027-11-13" })));
});

test("notices link to the vehicle and sort critical first", () => {
  const planned = notices.planVehicleNotices(
    [alert({ level: "due60", daysLeft: 60 }), alert({ kind: "license", level: "expired", dueDate: "2026-10-01", daysLeft: -13 })],
    new Set()
  );
  assert.deepEqual(planned.map((n) => n.severity), ["critical", "info"]);
  assert.equal(planned[0].link, "/vehicles/v1");
  assert.equal(planned[0].category, "vehicle");
  assert.match(planned[0].title, /1234567/);
});

test("digest lists every notice and escapes HTML", () => {
  const planned = notices.planVehicleNotices([alert({ nickname: "<b>x</b>" })], new Set());
  const digest = notices.buildDigest(planned);
  assert.match(digest.subject, /1/);
  assert.ok(!digest.html.includes("<b>x</b>"));
  assert.ok(digest.text.includes("1234567"));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test server/test/vehicle-notices.test.js`
Expected: FAIL — `Cannot find module '../utils/vehicleNotices'`.

- [ ] **Step 3: Implement `server/utils/vehicleNotices.js`**

```js
// Pure rules that turn vehicle alerts (vehicleRules.buildAlerts) into notices
// for the administrators' board: one notice per stage, a weekly reminder once
// a document has expired, and the nightly digest email. No database here.

const SEVERITY_BY_LEVEL = {
  due60: "info",
  due30: "important",
  due14: "important",
  missing: "important",
  due7: "critical",
  due0: "critical",
  expired: "critical",
};
const SEVERITY_ORDER = { critical: 0, important: 1, info: 2 };

const KIND_LABEL = { license: "الرخصة", test: "الفحص (التست)", insurance: "التأمين" };

const noticeSeverity = (level) => SEVERITY_BY_LEVEL[level] || "info";

// Stages repeat never; an expired document gets one key per 7 days since it
// expired. A renewal moves dueDate, which changes every key.
function dedupKeyFor(alert = {}) {
  const base = `vehicle:${alert.vehicleId}:${alert.kind}:${alert.level}:${alert.dueDate || "none"}`;
  if (alert.level !== "expired") return base;
  const daysExpired = Math.max(1, -Number(alert.daysLeft || 0));
  return `${base}:w${Math.floor(daysExpired / 7)}`;
}

function describeLevel(alert) {
  if (alert.level === "missing") return "غير مسجّل في النظام";
  if (alert.level === "expired") {
    const days = -Number(alert.daysLeft || 0);
    return days > 0 ? `منتهٍ منذ ${days} يومًا (${alert.dueDate})` : `منتهٍ (${alert.dueDate || "—"})`;
  }
  if (alert.level === "due0") return `ينتهي اليوم (${alert.dueDate})`;
  return `ينتهي خلال ${alert.daysLeft} يومًا (${alert.dueDate})`;
}

function noticeFromAlert(alert) {
  const vehicleName = [alert.plate, alert.nickname].filter(Boolean).join(" — ");
  const kind = KIND_LABEL[alert.kind] || alert.kind;
  return {
    title: `${kind}: ${vehicleName}`.slice(0, 120),
    body: `${kind} للمركبة ${vehicleName} ${describeLevel(alert)}.`,
    category: "vehicle",
    severity: noticeSeverity(alert.level),
    link: `/vehicles/${alert.vehicleId}`,
    dedupKey: dedupKeyFor(alert),
  };
}

function planVehicleNotices(alerts = [], existingKeys = new Set()) {
  return alerts
    .map(noticeFromAlert)
    .filter((notice) => !existingKeys.has(notice.dedupKey))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

function buildDigest(notices = []) {
  const subject = `تمهيد: ${notices.length} تنبيهات جديدة للمركبات`;
  const text = notices.map((n) => `- ${n.body}`).join("\n");
  const rows = notices.map((n) => `<li>${escapeHtml(n.body)}</li>`).join("");
  const html = `<div dir="rtl" style="font-family:Arial;line-height:1.6"><h2>${escapeHtml(subject)}</h2><ul>${rows}</ul><p>التفاصيل في لوحة الإعلانات في النظام.</p></div>`;
  return { subject, html, text };
}

module.exports = { noticeSeverity, dedupKeyFor, noticeFromAlert, planVehicleNotices, buildDigest };
```

- [ ] **Step 4: Run tests**

Run: `node --test server/test/vehicle-notices.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Propose commit (do not run)**

`feat(notices): plan vehicle expiry notices with stage and weekly dedup keys`

---

### Task 3: Notice storage, service, API (admins only)

**Files:**
- Create: `server/Entities/Notice/Notice.model.js`, `Notice.service.js`, `Notice.controller.js`, `Notice.route.js`
- Modify: `server/server.js` (mount route after `/api/vehicle`)
- Test: `server/test/notice-controller.test.js`

**Interfaces:**
- Consumes: `api.read/create/update` (`Entities/api.js`), `UserModelDef.get`, `rules.isAdminUser`, `repairMisencodedText`.
- Produces (service, all async):
  - `publishNotice({ title, body, category, severity, link = "", dedupKey = null, createdBy = "system", createdByName = "" }) → { created: boolean, notice }` — duplicate `dedupKey` (existing row or `E11000`) → `{ created: false }`.
  - `existingDedupKeys(prefix = "vehicle:") → Set<string>`
  - `listNotices({ userId, status = "all", category, severity }) → notice[]` (each with `read: boolean`, newest first, ≤ 200, not archived)
  - `countUnread(userId) → number`
  - `markRead(id, userId)`, `markAllRead(userId)`, `archiveNotice(id, actor)`
  - `listAdmins() → [{ id, name, email }]`
- Controller exports: `requireAdmin`, `list`, `unreadCount`, `create`, `read`, `readAll`, `archive`, `runVehicleCheck` (wired in Task 4).

- [ ] **Step 1: Write the failing tests** (`server/test/notice-controller.test.js`, same in-memory `vm` pattern as `vehicle-controller.test.js`)

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ADMIN = { _id: "a".repeat(24), tz: "111111118", firstname: "Ad", lastname: "Min", roles: ["ادارة"], email: "admin@example.com" };
const GUIDE = { _id: "b".repeat(24), tz: "222222226", firstname: "Gu", lastname: "Ide", roles: ["مرشد"], vehiclePermissions: ["view", "compliance"] };

function load(file, dependencies) {
  const filename = path.join(__dirname, "../Entities/Notice", file);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, process, Date,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return module.exports;
}

function setup() {
  const rows = [];
  let next = 1;
  const matches = (doc, filter) => Object.entries(filter).every(([k, v]) =>
    v && typeof v === "object" && "$regex" in v ? new RegExp(v.$regex).test(doc[k] || "")
      : v && typeof v === "object" && "$exists" in v ? (doc[k] !== undefined && doc[k] !== null) === v.$exists
      : String(doc[k]) === String(v));
  const NoticeModelDef = {
    async get(filter = {}) { return { result: rows.filter((r) => matches(r, filter)).map((r) => structuredClone(r)) }; },
    async create(data) {
      if (data.dedupKey && rows.some((r) => r.dedupKey === data.dedupKey)) { const e = new Error("dup"); e.code = 11000; throw e; }
      const doc = { _id: String(next++).padStart(24, "0"), ...structuredClone(data) }; rows.push(doc); return { result: structuredClone(doc) };
    },
    async update(filter, patch) { rows.forEach((r, i) => { if (matches(r, filter)) rows[i] = { ...r, ...structuredClone(patch) }; }); return { result: null }; },
  };
  const users = [ADMIN, GUIDE];
  const common = {
    "../User/User.model.js": { UserModelDef: { async get(f = {}) { return { result: users.filter((u) => !f.tz || u.tz === f.tz) }; } } },
    "../../utils/vehicleRules.js": require("../utils/vehicleRules"),
    "../../utils/textEncoding.js": require("../utils/textEncoding"),
    "../../middleware/logger.js": { logWithSource() {} },
  };
  const service = load("Notice.service.js", { ...common, "./Notice.model.js": { NoticeModelDef } });
  const controller = load("Notice.controller.js", {
    ...common,
    "./Notice.service.js": service,
    "../../services/vehicleExpiryJob.js": { async runVehicleExpiryCheck() { return { created: 0, emailed: 0 }; } },
  });
  return { service, controller, rows };
}

const res = () => ({ statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });
const as = (user, extra = {}) => ({ user: { id: user._id, tz: user.tz, roles: user.roles }, params: {}, query: {}, body: {}, ...extra });

async function guarded(controller, user, handler, req = {}) {
  const r = res();
  const request = as(user, req);
  let passed = false;
  await controller.requireAdmin(request, r, () => { passed = true; });
  if (!passed) return r;
  await controller[handler](request, r);
  return r;
}

test("non-admins get 403 on every notice route, even with vehicle permissions", async () => {
  const { controller } = setup();
  for (const handler of ["list", "unreadCount", "create", "read", "readAll", "archive", "runVehicleCheck"]) {
    const r = await guarded(controller, GUIDE, handler);
    assert.equal(r.statusCode, 403, handler);
  }
});

test("an admin posts a manual notice and it is unread for others", async () => {
  const { controller } = setup();
  const created = await guarded(controller, ADMIN, "create", { body: { title: "اجتماع", body: "غدًا 10:00", severity: "important" } });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.notice.category, "manual");
  const list = await guarded(controller, ADMIN, "list");
  assert.equal(list.body.notices.length, 1);
  assert.equal(list.body.notices[0].read, true); // the author has read their own notice
});

test("manual notice validation", async () => {
  const { controller } = setup();
  const bad = await guarded(controller, ADMIN, "create", { body: { title: "", body: "x".repeat(2001), severity: "loud" } });
  assert.equal(bad.statusCode, 400);
  assert.ok(bad.body.errors.title && bad.body.errors.body && bad.body.errors.severity);
});

test("publishNotice ignores a duplicate dedupKey", async () => {
  const { service, rows } = setup();
  const n = { title: "t", body: "b", category: "vehicle", severity: "info", dedupKey: "vehicle:1:license:due60:2026-12-13" };
  assert.equal((await service.publishNotice(n)).created, true);
  assert.equal((await service.publishNotice(n)).created, false);
  assert.equal(rows.length, 1);
});

test("mark read, unread count and archive", async () => {
  const { service, controller } = setup();
  const { notice } = await service.publishNotice({ title: "t", body: "b", category: "system", severity: "info" });
  assert.equal((await guarded(controller, ADMIN, "unreadCount")).body.count, 1);
  await guarded(controller, ADMIN, "read", { params: { id: notice._id } });
  assert.equal((await guarded(controller, ADMIN, "unreadCount")).body.count, 0);
  await guarded(controller, ADMIN, "archive", { params: { id: notice._id } });
  assert.equal((await guarded(controller, ADMIN, "list")).body.notices.length, 0);
});

test("listAdmins returns admins with a valid email only", async () => {
  const { service } = setup();
  const admins = await service.listAdmins();
  // JSON round-trip: arrays from the vm context have a different prototype.
  assert.deepEqual(JSON.parse(JSON.stringify(admins.map((a) => a.email))), ["admin@example.com"]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test server/test/notice-controller.test.js`
Expected: FAIL — `ENOENT ... Notice.service.js`.

- [ ] **Step 3: Implement the model** (`server/Entities/Notice/Notice.model.js`)

```js
const mongoose = require("mongoose");
const api = require("../api");

// Board items for the administrators. Shape:
//   title, body, category ("vehicle"|"system"|"manual"),
//   severity ("critical"|"important"|"info"), link, dedupKey (unique when set),
//   createdBy ("system"|userId), createdByName, createdAt, readBy[], archivedAt, archivedBy
const dbName = process.env.DB_NAME || "tamheed_db";

const NoticeModelDef = { dbName, collection: "Notices" };
NoticeModelDef.get = async function (filter = {}) {
  return await api.read({ dbName: this.dbName, collection: this.collection, filter });
};
NoticeModelDef.create = async function (data) {
  return await api.create({ dbName: this.dbName, collection: this.collection, data });
};
// api.update upserts, so callers must have loaded the notice first.
NoticeModelDef.update = async function (filter, newData) {
  return await api.update({ dbName: this.dbName, collection: this.collection, filter, newData });
};

// One row per scheduled-job run: { job, date ("YYYY-MM-DD"), trigger, created, emailed, error, finishedAt }.
const JobRunModelDef = { dbName, collection: "JobRuns" };
JobRunModelDef.get = async function (filter = {}) {
  return await api.read({ dbName: this.dbName, collection: this.collection, filter });
};
JobRunModelDef.create = async function (data) {
  return await api.create({ dbName: this.dbName, collection: this.collection, data });
};

// api.js never creates indexes; this makes a repeated dedupKey impossible even
// if two checks race. Manual notices have no dedupKey, hence the partial filter.
async function ensureNoticeIndexes() {
  await mongoose.connection
    .useDb(dbName, { useCache: true })
    .collection(NoticeModelDef.collection)
    .createIndex({ dedupKey: 1 }, { unique: true, partialFilterExpression: { dedupKey: { $type: "string" } } });
}

module.exports = { NoticeModelDef, JobRunModelDef, ensureNoticeIndexes };
```

- [ ] **Step 4: Implement the service** (`server/Entities/Notice/Notice.service.js`)

```js
const { NoticeModelDef } = require("./Notice.model.js");
const { UserModelDef } = require("../User/User.model.js");
const rules = require("../../utils/vehicleRules.js");
const { repairMisencodedText } = require("../../utils/textEncoding.js");

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LIST = 200;

const isDuplicate = (err) => err && (err.code === 11000 || /E11000/.test(String(err.message)));

async function publishNotice({ title, body, category, severity, link = "", dedupKey = null, createdBy = "system", createdByName = "" }) {
  if (dedupKey) {
    const found = await NoticeModelDef.get({ dedupKey });
    if (found?.result?.length) return { created: false, notice: found.result[0] };
  }
  const data = {
    title, body, category, severity, link, createdBy, createdByName,
    createdAt: new Date().toISOString(),
    readBy: createdBy === "system" ? [] : [String(createdBy)],
    archivedAt: null, archivedBy: null,
  };
  if (dedupKey) data.dedupKey = dedupKey;
  try {
    const created = await NoticeModelDef.create(data);
    return { created: true, notice: created.result };
  } catch (err) {
    if (isDuplicate(err)) return { created: false, notice: null };
    throw err;
  }
}

async function existingDedupKeys(prefix = "vehicle:") {
  const found = await NoticeModelDef.get({ dedupKey: { $regex: `^${prefix}` } });
  return new Set((found?.result || []).map((row) => row.dedupKey));
}

const withRead = (row, userId) => ({ ...row, read: (row.readBy || []).includes(String(userId)) });

async function activeNotices() {
  const found = await NoticeModelDef.get({});
  return (found?.result || [])
    .filter((row) => !row.archivedAt)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function listNotices({ userId, status = "all", category = "", severity = "" }) {
  return (await activeNotices())
    .map((row) => withRead(row, userId))
    .filter((row) => (status === "unread" ? !row.read : true))
    .filter((row) => (category ? row.category === category : true))
    .filter((row) => (severity ? row.severity === severity : true))
    .slice(0, MAX_LIST);
}

async function countUnread(userId) {
  return (await activeNotices()).filter((row) => !(row.readBy || []).includes(String(userId))).length;
}

async function findNotice(id) {
  if (!OBJECT_ID.test(String(id || ""))) return null;
  const found = await NoticeModelDef.get({ _id: String(id) });
  return found?.result?.[0] || null;
}

async function markRead(id, userId) {
  const notice = await findNotice(id);
  if (!notice) return null;
  const readBy = Array.from(new Set([...(notice.readBy || []), String(userId)]));
  await NoticeModelDef.update({ _id: notice._id }, { readBy });
  return { ...notice, readBy };
}

async function markAllRead(userId) {
  const unread = (await activeNotices()).filter((row) => !(row.readBy || []).includes(String(userId)));
  for (const row of unread) await markRead(row._id, userId);
  return unread.length;
}

async function archiveNotice(id, actor) {
  const notice = await findNotice(id);
  if (!notice || notice.archivedAt) return null;
  const patch = { archivedAt: new Date().toISOString(), archivedBy: String(actor.id) };
  await NoticeModelDef.update({ _id: notice._id }, patch);
  return { ...notice, ...patch };
}

async function listAdmins() {
  const found = await UserModelDef.get({});
  return (found?.result || [])
    .map((user) => ({
      id: String(user._id),
      name: [user.firstname, user.lastname].filter(Boolean).join(" ").trim(),
      email: String(user.email || "").trim(),
      roles: (Array.isArray(user.roles) ? user.roles : []).map((r) => repairMisencodedText(String(r).trim())),
    }))
    .filter((user) => rules.isAdminUser(user) && EMAIL.test(user.email) && user.email !== "test@test.com")
    .map(({ id, name, email }) => ({ id, name, email }));
}

module.exports = { publishNotice, existingDedupKeys, listNotices, countUnread, markRead, markAllRead, archiveNotice, listAdmins };
```

> `test@test.com` is the `User.model.js` default email (placeholder), so it is excluded.

- [ ] **Step 5: Implement the controller** (`server/Entities/Notice/Notice.controller.js`)

```js
const service = require("./Notice.service.js");
const { UserModelDef } = require("../User/User.model.js");
const rules = require("../../utils/vehicleRules.js");
const { repairMisencodedText } = require("../../utils/textEncoding.js");
const { logWithSource } = require("../../middleware/logger.js");
const { runVehicleExpiryCheck } = require("../../services/vehicleExpiryJob.js");

const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";
const SEVERITIES = ["critical", "important", "info"];
const CATEGORIES = ["vehicle", "system", "manual"];
const fail = (res, status, message, extra = {}) => res.status(status).json({ ok: false, message, ...extra });

// Roles are re-read from the database: the token may be stale.
async function requireAdmin(req, res, next) {
  try {
    const tz = String(req.user?.tz || "").trim();
    const found = tz ? await UserModelDef.get({ tz }) : null;
    const user = found?.result?.[0];
    const actor = user && {
      id: String(user._id),
      name: [user.firstname, user.lastname].filter(Boolean).join(" ").trim(),
      roles: (Array.isArray(user.roles) ? user.roles : []).map((r) => repairMisencodedText(String(r).trim())),
    };
    if (!actor || !rules.isAdminUser(actor)) return fail(res, 403, "لا توجد صلاحية", { code: "FORBIDDEN" });
    req.actor = actor;
    return next();
  } catch (err) {
    logWithSource("Notice.requireAdmin", err);
    return fail(res, 500, SERVER_ERROR);
  }
}

const handle = (name, fn) => async (req, res) => {
  try {
    return await fn(req, res);
  } catch (err) {
    logWithSource(`Notice.${name}`, err);
    return fail(res, 500, SERVER_ERROR);
  }
};

const list = handle("list", async (req, res) => {
  const { status = "all", category = "", severity = "" } = req.query || {};
  const notices = await service.listNotices({
    userId: req.actor.id,
    status: status === "unread" ? "unread" : "all",
    category: CATEGORIES.includes(category) ? category : "",
    severity: SEVERITIES.includes(severity) ? severity : "",
  });
  return res.status(200).json({ ok: true, notices });
});

const unreadCount = handle("unreadCount", async (req, res) =>
  res.status(200).json({ ok: true, count: await service.countUnread(req.actor.id) })
);

const create = handle("create", async (req, res) => {
  const title = String(req.body?.title ?? "").trim();
  const body = String(req.body?.body ?? "").trim();
  const severity = String(req.body?.severity ?? "info");
  const errors = {};
  if (!title || title.length > 120) errors.title = "العنوان مطلوب (حتى 120 حرفًا)";
  if (body.length > 2000) errors.body = "النص طويل جدًا (حتى 2000 حرف)";
  if (!SEVERITIES.includes(severity)) errors.severity = "درجة الأهمية غير صحيحة";
  if (Object.keys(errors).length) return fail(res, 400, "يرجى تصحيح الحقول", { errors });
  const { notice } = await service.publishNotice({
    title, body, severity, category: "manual", createdBy: req.actor.id, createdByName: req.actor.name,
  });
  return res.status(201).json({ ok: true, notice });
});

const read = handle("read", async (req, res) => {
  const notice = await service.markRead(req.params?.id, req.actor.id);
  if (!notice) return fail(res, 404, "الإعلان غير موجود");
  return res.status(200).json({ ok: true });
});

const readAll = handle("readAll", async (req, res) =>
  res.status(200).json({ ok: true, updated: await service.markAllRead(req.actor.id) })
);

const archive = handle("archive", async (req, res) => {
  const notice = await service.archiveNotice(req.params?.id, req.actor);
  if (!notice) return fail(res, 404, "الإعلان غير موجود");
  return res.status(200).json({ ok: true });
});

const runVehicleCheck = handle("runVehicleCheck", async (req, res) => {
  const result = await runVehicleExpiryCheck({ trigger: `manual:${req.actor.id}` });
  return res.status(200).json({ ok: true, ...result });
});

module.exports = { requireAdmin, list, unreadCount, create, read, readAll, archive, runVehicleCheck };
```

- [ ] **Step 6: Implement routes and mount**

`server/Entities/Notice/Notice.route.js`:

```js
const express = require("express");
const controller = require("./Notice.controller");
const { requireAuth } = require("../../middleware/authMiddleware");
const { rateLimit } = require("../../middleware/rateLimit");

const router = express.Router();
const checkRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, scope: "notice-run-check" });

// Administrators only; the role is checked against the database on every call.
router.use(requireAuth, controller.requireAdmin);

router.get("/", controller.list);
router.get("/unread-count", controller.unreadCount);
router.post("/", controller.create);
router.post("/read-all", controller.readAll);
router.post("/run-vehicle-check", checkRateLimit, controller.runVehicleCheck);
router.post("/:id/read", controller.read);
router.post("/:id/archive", controller.archive);

module.exports = router;
```

`server/server.js`, after the `/api/vehicle` line:

```js
app.use('/api/notices', require('./Entities/Notice/Notice.route'));
```

The controller requires `services/vehicleExpiryJob.js`, created in Task 4. Until then, create a stub so the server boots:

```js
// server/services/vehicleExpiryJob.js (replaced in Task 4)
module.exports = { async runVehicleExpiryCheck() { return { created: 0, emailed: 0 }; } };
```

- [ ] **Step 7: Run tests**

Run: `npm test --prefix server`
Expected: PASS, including the 6 new notice tests.

- [ ] **Step 8: Propose commit (do not run)**

`feat(notices): administrators' notice board API with dedup, read state and archive`

---

### Task 4: Nightly 01:00 check, digest email and catch-up

**Files:**
- Replace: `server/services/vehicleExpiryJob.js`
- Modify: `server/utils/sendEmail.js` (add `sendNoticeDigestEmail`), `server/server.js` (start job, catch-up, indexes)
- Test: `server/test/vehicle-expiry-job.test.js`

**Interfaces:**
- Consumes: `rules.buildAlerts`, `rules.todayInJerusalem`, `planVehicleNotices`, `buildDigest`, `service.publishNotice/existingDedupKeys/listAdmins`, `JobRunModelDef`, `sendNoticeDigestEmail(to, { subject, html, text })`.
- Produces:
  - `runVehicleExpiryCheck({ now = new Date(), trigger = "cron", deps } = {}) → { skipped?: "running", today, created, emailed, emailErrors, error? }`
  - `catchUpVehicleExpiryCheck({ now = new Date(), deps } = {}) → result | null`
  - `startVehicleExpiryJob()`
  - `createDeps()` — real dependencies (exported for tests to override parts).

- [ ] **Step 1: Write the failing tests**

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const job = require("../services/vehicleExpiryJob");

const NOW = new Date("2026-10-13T22:30:00Z"); // 01:30 on 2026-10-14 in Jerusalem

function fakeDeps({ vehicles = [], admins = [{ id: "a", name: "A", email: "a@x.org" }], smtp = true, failEmailFor = "" } = {}) {
  const notices = [];
  const runs = [];
  const mails = [];
  return {
    notices, runs, mails,
    async loadVehicles() { return vehicles; },
    async existingDedupKeys() { return new Set(notices.map((n) => n.dedupKey)); },
    async publishNotice(n) {
      if (notices.some((x) => x.dedupKey === n.dedupKey)) return { created: false };
      notices.push(n); return { created: true, notice: n };
    },
    async listAdmins() { return admins; },
    smtpConfigured: () => smtp,
    async sendDigest(to, digest) { if (to === failEmailFor) throw new Error("smtp down"); mails.push({ to, digest }); },
    async findRun(jobName, date) { return runs.find((r) => r.job === jobName && r.date === date) || null; },
    async saveRun(row) { runs.push(row); },
    log() {},
  };
}

const vehicle = { _id: "v1", plate: "1234567", status: "active", licenses: [{ validUntil: "2026-11-13" }], nextTestDate: "2027-05-01", policies: [{ startDate: "2026-01-01", endDate: "2026-12-10" }] }; // licence 30 days, insurance 57 days

test("creates notices for new alerts and mails each admin once", async () => {
  const deps = fakeDeps({ vehicles: [vehicle], admins: [{ id: "a", email: "a@x.org" }, { id: "b", email: "b@x.org" }] });
  const result = await job.runVehicleExpiryCheck({ now: NOW, deps });
  assert.equal(result.today, "2026-10-14");
  assert.equal(result.created, 2); // licence due30 + insurance due60 (test date is > 60 days away)
  assert.equal(result.emailed, 2);
  assert.equal(deps.runs.length, 1);
});

test("a second run the same day creates nothing and sends no mail", async () => {
  const deps = fakeDeps({ vehicles: [vehicle] });
  await job.runVehicleExpiryCheck({ now: NOW, deps });
  const second = await job.runVehicleExpiryCheck({ now: NOW, deps });
  assert.equal(second.created, 0);
  assert.equal(deps.mails.length, 1);
});

test("without SMTP or with a failing address, notices still land and other admins get mail", async () => {
  const noSmtp = fakeDeps({ vehicles: [vehicle], smtp: false });
  const r1 = await job.runVehicleExpiryCheck({ now: NOW, deps: noSmtp });
  assert.equal(r1.created, 2);
  assert.equal(r1.emailed, 0);

  const partial = fakeDeps({ vehicles: [vehicle], admins: [{ id: "a", email: "bad@x.org" }, { id: "b", email: "b@x.org" }], failEmailFor: "bad@x.org" });
  const r2 = await job.runVehicleExpiryCheck({ now: NOW, deps: partial });
  assert.equal(r2.emailed, 1);
  assert.equal(r2.emailErrors, 1);
});

test("catch-up runs once after 01:00 and never twice on the same day", async () => {
  const deps = fakeDeps({ vehicles: [vehicle] });
  const before = await job.catchUpVehicleExpiryCheck({ now: new Date("2026-10-13T21:30:00Z"), deps }); // 00:30 local
  assert.equal(before, null);
  const first = await job.catchUpVehicleExpiryCheck({ now: NOW, deps });
  assert.equal(first.trigger, "catch-up");
  const second = await job.catchUpVehicleExpiryCheck({ now: NOW, deps });
  assert.equal(second, null);
});

test("a failing vehicle query records the error and publishes a system notice", async () => {
  const deps = fakeDeps();
  deps.loadVehicles = async () => { throw new Error("db down"); };
  const result = await job.runVehicleExpiryCheck({ now: NOW, deps });
  assert.match(result.error, /db down/);
  assert.equal(deps.notices[0].category, "system");
  assert.equal(deps.notices[0].dedupKey, "system:vehicleExpiry:failed:2026-10-14");
});

test("concurrent runs: the second one is skipped", async () => {
  const deps = fakeDeps({ vehicles: [vehicle] });
  const [a, b] = await Promise.all([
    job.runVehicleExpiryCheck({ now: NOW, deps }),
    job.runVehicleExpiryCheck({ now: NOW, deps }),
  ]);
  assert.deepEqual([a.skipped, b.skipped].filter(Boolean), ["running"]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test server/test/vehicle-expiry-job.test.js`
Expected: FAIL — stub has no `catchUpVehicleExpiryCheck` / returns wrong counts.

- [ ] **Step 3: Add the digest mailer** (`server/utils/sendEmail.js`, before `module.exports`)

```js
const smtpConfigured = () => Boolean(process.env.SMTP_SERVER && process.env.SMTP_PORT && process.env.SMTP_FROM);

const sendNoticeDigestEmail = async (to, { subject, html, text }) => {
    const transporter = createTransporter();
    await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, html, text });
};
```

and export them:

```js
module.exports = {
    sendResetPasswordEmail,
    sendNoticeDigestEmail,
    smtpConfigured,
};
```

- [ ] **Step 4: Implement `server/services/vehicleExpiryJob.js`**

```js
// Nightly check (01:00 Asia/Jerusalem): every non-archived vehicle's licence,
// test and insurance. New stages become notices for the administrators and
// one digest email each. Dependencies are injectable for tests.
const cron = require("node-cron");
const rules = require("../utils/vehicleRules");
const { planVehicleNotices, buildDigest } = require("../utils/vehicleNotices");

const JOB = "vehicleExpiry";
const TIME_ZONE = "Asia/Jerusalem";
let running = false;

function createDeps() {
  const { VehicleModelDef } = require("../Entities/Vehicle/Vehicle.model");
  const { JobRunModelDef } = require("../Entities/Notice/Notice.model");
  const notices = require("../Entities/Notice/Notice.service");
  const mail = require("../utils/sendEmail");
  const { logWithSource } = require("../middleware/logger");
  return {
    async loadVehicles() {
      const found = await VehicleModelDef.get({});
      return (found?.result || []).filter((v) => v.status !== "archived");
    },
    existingDedupKeys: () => notices.existingDedupKeys("vehicle:"),
    publishNotice: (n) => notices.publishNotice(n),
    listAdmins: () => notices.listAdmins(),
    smtpConfigured: mail.smtpConfigured,
    sendDigest: (to, digest) => mail.sendNoticeDigestEmail(to, digest),
    async findRun(job, date) {
      const found = await JobRunModelDef.get({ job, date });
      return found?.result?.[0] || null;
    },
    saveRun: (row) => JobRunModelDef.create(row),
    log: (...args) => logWithSource("[vehicleExpiry]", ...args),
  };
}

function jerusalemHour(now) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(now));
}

async function runVehicleExpiryCheck({ now = new Date(), trigger = "cron", deps = createDeps() } = {}) {
  if (running) return { skipped: "running" };
  running = true;
  const today = rules.todayInJerusalem(now);
  const result = { today, trigger, created: 0, emailed: 0, emailErrors: 0 };
  try {
    const vehicles = await deps.loadVehicles();
    const alerts = [];
    for (const vehicle of vehicles) {
      try {
        alerts.push(...rules.buildAlerts(vehicle, today));
      } catch (err) {
        deps.log("vehicle failed", vehicle?._id, err);
      }
    }
    const planned = planVehicleNotices(alerts, await deps.existingDedupKeys());
    const fresh = [];
    for (const notice of planned) {
      const { created } = await deps.publishNotice(notice);
      if (created) fresh.push(notice);
    }
    result.created = fresh.length;

    if (fresh.length && deps.smtpConfigured()) {
      const digest = buildDigest(fresh);
      for (const admin of await deps.listAdmins()) {
        try {
          await deps.sendDigest(admin.email, digest);
          result.emailed += 1;
        } catch (err) {
          result.emailErrors += 1;
          deps.log("email failed", admin.id, err?.message);
        }
      }
    }
  } catch (err) {
    result.error = String(err?.message || err);
    deps.log("run failed", err);
    await deps
      .publishNotice({
        title: "فشل الفحص الليلي للمركبات",
        body: `لم يكتمل فحص المركبات بتاريخ ${today}. السبب: ${result.error}`.slice(0, 2000),
        category: "system",
        severity: "critical",
        dedupKey: `system:${JOB}:failed:${today}`,
      })
      .catch(() => null);
  } finally {
    running = false;
  }
  await deps
    .saveRun({ job: JOB, date: today, trigger, created: result.created, emailed: result.emailed, error: result.error || null, finishedAt: new Date().toISOString() })
    .catch((err) => deps.log("saveRun failed", err));
  return result;
}

// After a restart: run once if 01:00 has passed today and nothing ran yet.
async function catchUpVehicleExpiryCheck({ now = new Date(), deps = createDeps() } = {}) {
  if (jerusalemHour(now) < 1) return null;
  const today = rules.todayInJerusalem(now);
  if (await deps.findRun(JOB, today)) return null;
  return runVehicleExpiryCheck({ now, trigger: "catch-up", deps });
}

function startVehicleExpiryJob() {
  cron.schedule("0 1 * * *", () => runVehicleExpiryCheck().catch(() => null), { timezone: TIME_ZONE });
}

module.exports = { runVehicleExpiryCheck, catchUpVehicleExpiryCheck, startVehicleExpiryJob, createDeps };
```

> Note on "a second run the same day creates nothing": `findRun` is only used by catch-up. A manual run after the cron run is allowed and simply creates nothing new because of the dedup keys.

- [ ] **Step 5: Wire into `server/server.js`**

Next to `startDailyAbsenceJob();`:

```js
const { startVehicleExpiryJob, catchUpVehicleExpiryCheck } = require('./services/vehicleExpiryJob');
startVehicleExpiryJob();
```

Inside `StartServer`, after `await ensureSystemAdmin();`:

```js
    await require('./Entities/Notice/Notice.model').ensureNoticeIndexes()
      .catch((err) => console.error('Notice index:', err.message));
    catchUpVehicleExpiryCheck().catch((err) => console.error('Vehicle expiry catch-up:', err.message));
```

- [ ] **Step 6: Run tests**

Run: `npm test --prefix server`
Expected: PASS (6 new job tests + all earlier).

- [ ] **Step 7: Propose commit (do not run)**

`feat(vehicles): nightly 01:00 expiry check with notices, digest email and catch-up`

---

### Task 5: Claude document extraction service

**Files:**
- Create: `server/services/vehicleDocExtract.service.js`
- Test: `server/test/vehicle-doc-extract.test.js`

**Interfaces:**
- Consumes: `rules.isValidDateOnly`, `rules.normalizePlate`, `rules.validatePlate`, `rules.POLICY_TYPES` (already exported).
- Produces:
  - `EXTRACTION_SCHEMA` (JSON schema object)
  - `sanitizeExtraction(raw, { expectedPlate = "" } = {}) → { documentType, proposed: { plate, vehicle: {make, model, year, color, chassisNumber}, license: {validFrom, validUntil, feeAmount}, policy: {insurer, policyNumber, type, startDate, endDate, cost} }, warnings: string[] }`
  - `extractVehicleDocument({ buffer, mime, expected = "any", expectedPlate = "", client }) → { available: true, documentType, proposed, warnings, source: { model, extractedAt } } | { available: false, reason }` where `reason` ∈ `not_configured|refused|unreadable|rate_limited|failed`.

- [ ] **Step 1: Write the failing tests**

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const ex = require("../services/vehicleDocExtract.service");

const raw = (extra = {}) => ({
  documentType: "policy", plate: "12-345-67",
  vehicle: { make: "Ford", model: "Transit", year: 2019, color: null, chassisNumber: null },
  license: { validFrom: null, validUntil: null, feeAmount: null },
  policy: { insurer: "הראל", policyNumber: "A1", type: "mandatory", startDate: "2026-01-01", endDate: "2026-12-31", cost: 1800 },
  notes: null, ...extra,
});

test("valid fields pass through, plate normalised", () => {
  const out = ex.sanitizeExtraction(raw());
  assert.equal(out.documentType, "policy");
  assert.equal(out.proposed.plate, "1234567");
  assert.equal(out.proposed.policy.endDate, "2026-12-31");
  assert.deepEqual(out.warnings, []);
});

test("impossible dates become null with a warning", () => {
  const out = ex.sanitizeExtraction(raw({ policy: { ...raw().policy, endDate: "2026-02-30" } }));
  assert.equal(out.proposed.policy.endDate, null);
  assert.ok(out.warnings.includes("invalid_date:policy.endDate"));
});

test("swapped start/end dates are flagged", () => {
  const out = ex.sanitizeExtraction(raw({ policy: { ...raw().policy, startDate: "2027-01-01", endDate: "2026-12-31" } }));
  assert.ok(out.warnings.includes("dates_reversed:policy"));
});

test("unknown policy type falls back to other; plate mismatch is flagged", () => {
  const out = ex.sanitizeExtraction(raw({ policy: { ...raw().policy, type: "super" } }), { expectedPlate: "7654321" });
  assert.equal(out.proposed.policy.type, "other");
  assert.ok(out.warnings.includes("plate_mismatch"));
});

test("no API key means not configured, no throw", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const out = await ex.extractVehicleDocument({ buffer: Buffer.from("x"), mime: "image/png" });
  assert.deepEqual(out, { available: false, reason: "not_configured" });
  if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
});

test("sends a document block for PDFs and parses the JSON reply", async () => {
  let sent;
  const client = { beta: { messages: { async create(params) { sent = params; return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(raw()) }] }; } } } };
  const out = await ex.extractVehicleDocument({ buffer: Buffer.from("%PDF-1.4"), mime: "application/pdf", client });
  assert.equal(out.available, true);
  assert.equal(out.proposed.policy.insurer, "הראל");
  assert.equal(sent.model, "claude-opus-5-5");
  assert.equal(sent.messages[0].content[0].type, "document");
  assert.equal(sent.fallbacks, "default");
  assert.equal(sent.output_config.format.type, "json_schema");
});

test("a refusal is reported, not parsed", async () => {
  const client = { beta: { messages: { async create() { return { stop_reason: "refusal", content: [] }; } } } };
  const out = await ex.extractVehicleDocument({ buffer: Buffer.from("x"), mime: "image/jpeg", client });
  assert.deepEqual(out, { available: false, reason: "refused" });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test server/test/vehicle-doc-extract.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/services/vehicleDocExtract.service.js`**

```js
// Reads an Israeli vehicle licence (רישיון רכב) or insurance policy from an
// image/PDF with Claude and returns a PROPOSAL. Nothing is saved here; every
// value is re-validated, and anything doubtful comes back null with a warning.
const Anthropic = require("@anthropic-ai/sdk");
const rules = require("../utils/vehicleRules");

const MODEL = "claude-opus-5-5";
const TIMEOUT_MS = 60 * 1000;

const nullable = (type) => ({ type: [type, "null"] });
const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["documentType", "plate", "vehicle", "license", "policy", "notes"],
  properties: {
    documentType: { type: "string", enum: ["license", "policy", "unknown"] },
    plate: nullable("string"),
    vehicle: {
      type: "object", additionalProperties: false,
      required: ["make", "model", "year", "color", "chassisNumber"],
      properties: { make: nullable("string"), model: nullable("string"), year: nullable("integer"), color: nullable("string"), chassisNumber: nullable("string") },
    },
    license: {
      type: "object", additionalProperties: false,
      required: ["validFrom", "validUntil", "feeAmount"],
      properties: { validFrom: nullable("string"), validUntil: nullable("string"), feeAmount: nullable("number") },
    },
    policy: {
      type: "object", additionalProperties: false,
      required: ["insurer", "policyNumber", "type", "startDate", "endDate", "cost"],
      properties: {
        insurer: nullable("string"), policyNumber: nullable("string"),
        type: { type: ["string", "null"], enum: ["mandatory", "third_party", "comprehensive", "other", null] },
        startDate: nullable("string"), endDate: nullable("string"), cost: nullable("number"),
      },
    },
    notes: nullable("string"),
  },
};

const SYSTEM_PROMPT =
  "You read Israeli vehicle documents: vehicle licences (רישיון רכב) and insurance policies " +
  "(ביטוח חובה, צד ג', מקיף). Documents may be in Hebrew or Arabic. Return only what is printed " +
  "on the document. Dates must be YYYY-MM-DD (Israeli documents print DD/MM/YYYY). If a value is " +
  "missing, unclear or you are not sure, return null for it - never guess. Policy type: mandatory " +
  "(חובה), third_party (צד ג'), comprehensive (מקיף), other. Amounts are plain numbers in shekels.";

const text = (value, max = 120) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
const amount = (value) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);

function sanitizeExtraction(raw = {}, { expectedPlate = "" } = {}) {
  const warnings = [];
  const date = (value, field) => {
    if (value === null || value === undefined || value === "") return null;
    if (rules.isValidDateOnly(value)) return value;
    warnings.push(`invalid_date:${field}`);
    return null;
  };

  let plate = raw.plate ? rules.normalizePlate(raw.plate) : null;
  if (plate && rules.validatePlate(plate)) {
    warnings.push("invalid_plate");
    plate = null;
  }
  if (plate && expectedPlate && plate !== rules.normalizePlate(expectedPlate)) warnings.push("plate_mismatch");

  const v = raw.vehicle || {};
  const year = Number.isInteger(v.year) && v.year >= 1950 && v.year <= 2100 ? v.year : null;
  const l = raw.license || {};
  const p = raw.policy || {};
  const license = { validFrom: date(l.validFrom, "license.validFrom"), validUntil: date(l.validUntil, "license.validUntil"), feeAmount: amount(l.feeAmount) };
  const policy = {
    insurer: text(p.insurer), policyNumber: text(p.policyNumber, 60),
    type: p.type ? (rules.POLICY_TYPES.includes(p.type) ? p.type : "other") : null,
    startDate: date(p.startDate, "policy.startDate"), endDate: date(p.endDate, "policy.endDate"), cost: amount(p.cost),
  };
  if (license.validFrom && license.validUntil && license.validUntil < license.validFrom) warnings.push("dates_reversed:license");
  if (policy.startDate && policy.endDate && policy.endDate < policy.startDate) warnings.push("dates_reversed:policy");

  return {
    documentType: ["license", "policy"].includes(raw.documentType) ? raw.documentType : "unknown",
    proposed: {
      plate,
      vehicle: { make: text(v.make, 60), model: text(v.model, 60), year, color: text(v.color, 40), chassisNumber: text(v.chassisNumber, 40) },
      license,
      policy,
    },
    warnings,
  };
}

function contentBlock(buffer, mime) {
  const data = buffer.toString("base64");
  return mime === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: mime, data } };
}

let sharedClient = null;
function defaultClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!sharedClient) sharedClient = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  return sharedClient;
}

async function extractVehicleDocument({ buffer, mime, expected = "any", expectedPlate = "", client } = {}) {
  const anthropic = client || defaultClient();
  if (!anthropic) return { available: false, reason: "not_configured" };
  const hint = expected === "license" ? "The user expects a vehicle licence." : expected === "policy" ? "The user expects an insurance policy." : "";
  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: { effort: "medium", format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
      messages: [{ role: "user", content: [contentBlock(buffer, mime), { type: "text", text: `Extract the fields. ${hint}`.trim() }] }],
    });
    if (response.stop_reason === "refusal") return { available: false, reason: "refused" };
    const body = (response.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    let raw;
    try {
      raw = JSON.parse(body);
    } catch {
      return { available: false, reason: "unreadable" };
    }
    return { available: true, ...sanitizeExtraction(raw, { expectedPlate }), source: { model: MODEL, extractedAt: new Date().toISOString() } };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return { available: false, reason: "rate_limited" };
    if (err instanceof Anthropic.AuthenticationError) console.error("[vehicleDocExtract] invalid ANTHROPIC_API_KEY");
    else console.error("[vehicleDocExtract]", err?.status || "", err?.message || err);
    return { available: false, reason: "failed" };
  }
}

module.exports = { EXTRACTION_SCHEMA, sanitizeExtraction, extractVehicleDocument, MODEL };
```


- [ ] **Step 4: Run tests**

Run: `npm test --prefix server`
Expected: PASS (7 new).

- [ ] **Step 5: One live smoke check (owner's key, costs ~1–3 cents)** — only with the owner's OK and a non-sensitive sample document:

```bash
node -e "require('dotenv').config({path:'server/config/.env'});const fs=require('fs');require('./server/services/vehicleDocExtract.service').extractVehicleDocument({buffer:fs.readFileSync(process.argv[1]),mime:'application/pdf'}).then(r=>console.log(JSON.stringify(r,null,2)))" path/to/sample.pdf
```

Expected: `available: true` with plausible fields. If the API rejects a parameter (`400`), fix the request shape against the claude-api skill docs before continuing.

- [ ] **Step 6: Propose commit (do not run)**

`feat(vehicles): read licences and insurance policies with Claude as a reviewed proposal`

---

### Task 6: `POST /api/vehicle/extract` endpoint

**Files:**
- Create: `server/Entities/Vehicle/VehicleExtract.controller.js`
- Modify: `server/Entities/Vehicle/Vehicle.route.js`
- Test: append to `server/test/vehicle-doc-extract.test.js`

**Interfaces:**
- Consumes: `inspectDocument(buffer)`, `extractVehicleDocument(...)`, `VehicleModelDef.get`, `requirePermission("compliance")`, `uploadOne`.
- Produces: `extractDocument(req, res)` — 400 bad/missing file, 503 `{ available:false, reason }` when not configured, 200 `{ ok, available, documentType, proposed, warnings, source }`; `createExtractController({ extract, findVehicle })` factory for tests.

- [ ] **Step 1: Write the failing tests** (append)

```js
const { createExtractController } = require("../Entities/Vehicle/VehicleExtract.controller");
const res = () => ({ statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

test("extract endpoint rejects a missing or disallowed file", async () => {
  const { extractDocument } = createExtractController({ extract: async () => ({ available: true }), findVehicle: async () => null });
  const r1 = res(); await extractDocument({ body: {} }, r1);
  assert.equal(r1.statusCode, 400);
  const r2 = res(); await extractDocument({ body: {}, file: { buffer: Buffer.from("hello") } }, r2);
  assert.equal(r2.statusCode, 400);
});

test("extract endpoint passes the vehicle plate and returns the proposal", async () => {
  let args;
  const { extractDocument } = createExtractController({
    extract: async (a) => { args = a; return { available: true, documentType: "license", proposed: {}, warnings: [], source: {} }; },
    findVehicle: async (id) => (id === "v".repeat(24) ? { plate: "1234567" } : null),
  });
  const r = res();
  await extractDocument({ body: { vehicleId: "v".repeat(24), expected: "license" }, file: { buffer: PNG } }, r);
  assert.equal(r.statusCode, 200);
  assert.equal(args.expectedPlate, "1234567");
  assert.equal(args.mime, "image/png");
  assert.equal(args.expected, "license");
});

test("extract endpoint reports 503 when not configured", async () => {
  const { extractDocument } = createExtractController({ extract: async () => ({ available: false, reason: "not_configured" }), findVehicle: async () => null });
  const r = res(); await extractDocument({ body: {}, file: { buffer: PNG } }, r);
  assert.equal(r.statusCode, 503);
  assert.equal(r.body.reason, "not_configured");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test server/test/vehicle-doc-extract.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/Entities/Vehicle/VehicleExtract.controller.js`**

```js
const { inspectDocument } = require("../../utils/vehicleFiles.js");
const { logWithSource } = require("../../middleware/logger.js");

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const MESSAGES = {
  not_configured: "قراءة المستندات غير مفعّلة على الخادم",
  refused: "تعذّر قراءة هذا المستند، يرجى إدخال البيانات يدويًا",
  unreadable: "لم نتمكن من قراءة المستند بوضوح، يرجى إدخال البيانات يدويًا",
  rate_limited: "الخدمة مشغولة الآن، حاول بعد قليل",
  failed: "تعذّرت قراءة المستند، يرجى المحاولة مرة أخرى أو الإدخال يدويًا",
};

function createExtractController({ extract, findVehicle }) {
  async function extractDocument(req, res) {
    try {
      if (!req.file?.buffer) return res.status(400).json({ ok: false, message: "يرجى اختيار ملف" });
      const checked = inspectDocument(req.file.buffer);
      if (!checked.ok) return res.status(400).json({ ok: false, message: checked.message });

      const vehicleId = String(req.body?.vehicleId || "");
      const vehicle = OBJECT_ID.test(vehicleId) ? await findVehicle(vehicleId) : null;
      const expected = ["license", "policy"].includes(req.body?.expected) ? req.body.expected : "any";

      const result = await extract({ buffer: req.file.buffer, mime: checked.mime, expected, expectedPlate: vehicle?.plate || "" });
      if (!result.available) {
        const status = result.reason === "not_configured" ? 503 : result.reason === "rate_limited" ? 429 : 422;
        return res.status(status).json({ ok: false, available: false, reason: result.reason, message: MESSAGES[result.reason] || MESSAGES.failed });
      }
      return res.status(200).json({ ok: true, ...result });
    } catch (err) {
      logWithSource("Vehicle.extractDocument", err);
      return res.status(500).json({ ok: false, message: MESSAGES.failed });
    }
  }
  return { extractDocument };
}

function defaultController() {
  const { extractVehicleDocument } = require("../../services/vehicleDocExtract.service.js");
  const { VehicleModelDef } = require("./Vehicle.model.js");
  return createExtractController({
    extract: extractVehicleDocument,
    async findVehicle(id) {
      const found = await VehicleModelDef.get({ _id: id });
      return found?.result?.[0] || null;
    },
  });
}

module.exports = { createExtractController, defaultController };
```

- [ ] **Step 4: Add the route** (`server/Entities/Vehicle/Vehicle.route.js`)

After the `uploadRateLimit` line:

```js
// Each extraction is a paid Claude call; keep it modest.
const extractRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, scope: "vehicle-extract" });
const { extractDocument } = require("./VehicleExtract.controller").defaultController();
```

After the `official-lookup` route (must stay above `/:id` routes):

```js
router.post("/extract", can("compliance"), extractRateLimit, uploadOne, extractDocument);
```

- [ ] **Step 5: Run tests**

Run: `npm test --prefix server`
Expected: PASS.

- [ ] **Step 6: Propose commit (do not run)**

`feat(vehicles): document extraction endpoint for licence and policy forms`

---

### Task 7: Client — notices board, bell and route

**Files:**
- Create: `client/src/WebServer/services/notice/functionsNotice.jsx`, `client/src/i18n/noticeStrings.js`, `client/src/Components/Notice/NoticesBoard.jsx`, `client/src/Components/Notice/Notice.module.css`, `client/src/Components/Notice/NoticeBell.jsx`
- Modify: `client/src/i18n/I18nContext.jsx`, `client/src/utils/routeAccess.js` (+ `routeAccess.test.js`), `client/src/Components/Routes/Routes.jsx`, `client/src/Components/Header/Header.jsx`

**Interfaces:**
- Consumes: `/api/notices` routes from Task 3.
- Produces: `getNotices({status, category, severity})`, `getUnreadCount()`, `createNotice({title, body, severity})`, `markNoticeRead(id)`, `markAllNoticesRead()`, `archiveNotice(id)`, `runVehicleCheck()` — each `→ { ok, ...data } | { ok:false, message, errors, status }`.

- [ ] **Step 1: Write the failing route test** (`client/src/utils/routeAccess.test.js`, add rows to the `test.each` table)

```js
  ["/notices", true, false, false],
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test --prefix client -- routeAccess`
Expected: FAIL — `/notices` guide/assistant expected `false`, got `true`.

- [ ] **Step 3: Restrict the page** (`client/src/utils/routeAccess.js`, add to `RESTRICTED`)

```js
  { pattern: /^\/notices(\/|$)/, roles: ADMIN_ROLES },
```

Run: `npm test --prefix client -- routeAccess` → PASS.

- [ ] **Step 4: API functions** (`client/src/WebServer/services/notice/functionsNotice.jsx`)

```js
import api from "../api";

const namespace = "/notices";

// Same contract as functionsVehicle: never throws.
const call = async (request) => {
  try {
    const { data } = await request();
    return { ok: true, ...(data || {}) };
  } catch (err) {
    const body = err.response?.data || {};
    return { ok: false, status: err.response?.status || 0, message: body.message || err.message || "يوجد خلل في العملية", errors: body.errors || {} };
  }
};

export const getNotices = (params = {}) => call(() => api.get(namespace, { params }));
export const getUnreadCount = () => call(() => api.get(`${namespace}/unread-count`));
export const createNotice = (payload) => call(() => api.post(namespace, payload));
export const markNoticeRead = (id) => call(() => api.post(`${namespace}/${encodeURIComponent(id)}/read`, {}));
export const markAllNoticesRead = () => call(() => api.post(`${namespace}/read-all`, {}));
export const archiveNotice = (id) => call(() => api.post(`${namespace}/${encodeURIComponent(id)}/archive`, {}));
export const runVehicleCheck = () => call(() => api.post(`${namespace}/run-vehicle-check`, {}, { timeout: 120000 }));
```

- [ ] **Step 5: Strings** (`client/src/i18n/noticeStrings.js`) and merge

```js
// Text for the administrators' notices board. Merged in I18nContext.
export const noticeStrings = {
  ar: {
    navTitle: "لوحة الإعلانات", title: "لوحة الإعلانات", bell: "إعلانات غير مقروءة: {n}",
    filters: { all: "الكل", unread: "غير المقروءة", category: "الفئة", severity: "الأهمية" },
    category: { vehicle: "المركبات", system: "النظام", manual: "رسالة إدارة" },
    severity: { critical: "حرج", important: "مهم", info: "معلومة" },
    cols: { severity: "الأهمية", title: "العنوان", category: "الفئة", date: "التاريخ", author: "الكاتب", status: "الحالة" },
    read: "مقروء", unread: "جديد", markRead: "تعليم كمقروء", markAll: "تعليم الكل كمقروء", archive: "أرشفة", open: "فتح",
    system: "النظام", empty: "لا توجد إعلانات", newTitle: "إعلان جديد للإدارة",
    f: { title: "العنوان", body: "النص", severity: "الأهمية" }, publish: "نشر",
    runCheck: "تشغيل فحص المركبات الآن", runDone: "اكتمل الفحص: {n} إعلانات جديدة", published: "تم نشر الإعلان",
  },
  he: {
    navTitle: "לוח הודעות", title: "לוח הודעות", bell: "הודעות שלא נקראו: {n}",
    filters: { all: "הכל", unread: "לא נקראו", category: "קטגוריה", severity: "חשיבות" },
    category: { vehicle: "רכבים", system: "מערכת", manual: "הודעת הנהלה" },
    severity: { critical: "קריטי", important: "חשוב", info: "מידע" },
    cols: { severity: "חשיבות", title: "כותרת", category: "קטגוריה", date: "תאריך", author: "כותב", status: "סטטוס" },
    read: "נקרא", unread: "חדש", markRead: "סמן כנקרא", markAll: "סמן הכל כנקרא", archive: "העבר לארכיון", open: "פתח",
    system: "מערכת", empty: "אין הודעות", newTitle: "הודעה חדשה להנהלה",
    f: { title: "כותרת", body: "תוכן", severity: "חשיבות" }, publish: "פרסם",
    runCheck: "הרץ בדיקת רכבים עכשיו", runDone: "הבדיקה הסתיימה: {n} הודעות חדשות", published: "ההודעה פורסמה",
  },
  en: {
    navTitle: "Notices", title: "Notices board", bell: "Unread notices: {n}",
    filters: { all: "All", unread: "Unread", category: "Category", severity: "Severity" },
    category: { vehicle: "Vehicles", system: "System", manual: "Management message" },
    severity: { critical: "Critical", important: "Important", info: "Info" },
    cols: { severity: "Severity", title: "Title", category: "Category", date: "Date", author: "Author", status: "Status" },
    read: "Read", unread: "New", markRead: "Mark as read", markAll: "Mark all as read", archive: "Archive", open: "Open",
    system: "System", empty: "No notices", newTitle: "New notice for management",
    f: { title: "Title", body: "Text", severity: "Severity" }, publish: "Publish",
    runCheck: "Run vehicle check now", runDone: "Check finished: {n} new notices", published: "Notice published",
  },
};
```

In `I18nContext.jsx`: `import { noticeStrings } from "./noticeStrings";` and inside the existing merge loop:

```js
  translations[code].notices = noticeStrings[code];
  translations[code].nav.notices = noticeStrings[code].navTitle;
```

- [ ] **Step 6: Bell** (`client/src/Components/Notice/NoticeBell.jsx`)

```jsx
import React, { useCallback, useEffect, useState } from "react";
import { getUnreadCount } from "../../WebServer/services/notice/functionsNotice.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { fillText } from "../../utils/vehicleDisplay";
import styles from "./Notice.module.css";

const POLL_MS = 60 * 1000;

// Administrators only (the Header decides). Polls instead of SSE because the
// SSE stream is not permission-checked.
export default function NoticeBell({ onOpen }) {
  const { t } = useI18n();
  const [count, setCount] = useState(0);
  const refresh = useCallback(() => getUnreadCount().then((res) => res.ok && setCount(res.count || 0)), []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    window.addEventListener("focus", refresh);
    window.addEventListener("NOTICES_CHANGED", refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("NOTICES_CHANGED", refresh);
    };
  }, [refresh]);

  const label = fillText(t("notices.bell"), { n: count });
  return (
    <button type="button" className={styles.bell} onClick={onOpen} title={label} aria-label={label}>
      <span aria-hidden="true">🔔</span>
      {count > 0 && <span className={styles.badge}>{count > 99 ? "99+" : count}</span>}
    </button>
  );
}
```

- [ ] **Step 7: Board page** (`client/src/Components/Notice/NoticesBoard.jsx`)

```jsx
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  archiveNotice, createNotice, getNotices, markAllNoticesRead, markNoticeRead, runVehicleCheck,
} from "../../WebServer/services/notice/functionsNotice.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import Button from "../UI/Button.jsx";
import StatusBadge from "../UI/StatusBadge.jsx";
import { fillText } from "../../utils/vehicleDisplay";
import styles from "./Notice.module.css";

const TONE = { critical: "danger", important: "warning", info: "neutral" };
const notifyChanged = () => window.dispatchEvent(new Event("NOTICES_CHANGED"));
const emptyDraft = { title: "", body: "", severity: "info" };

export default function NoticesBoard() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ status: "all", category: "", severity: "" });
  const [state, setState] = useState({ loading: true, notices: [], error: "" });
  const [draft, setDraft] = useState(emptyDraft);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const res = await getNotices(filters);
    setState(res.ok ? { loading: false, notices: res.notices || [], error: "" } : { loading: false, notices: [], error: res.message });
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const act = async (key, fn, success) => {
    setBusy(key);
    const res = await fn();
    setBusy("");
    if (!res.ok) return toast.warn(res.message);
    if (success) toast.success(typeof success === "function" ? success(res) : success);
    notifyChanged();
    return load();
  };

  const open = async (notice) => {
    if (!notice.read) await markNoticeRead(notice._id).then(notifyChanged);
    if (notice.link) navigate(notice.link);
    else load();
  };

  const publish = async (event) => {
    event.preventDefault();
    setBusy("publish");
    const res = await createNotice(draft);
    setBusy("");
    if (!res.ok) { setErrors(res.errors || {}); return toast.warn(res.message); }
    setDraft(emptyDraft);
    setErrors({});
    toast.success(t("notices.published"));
    notifyChanged();
    load();
  };

  const setFilter = (key) => (event) => setFilters((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <section className={styles.page}>
      <header className={styles.head}>
        <h1>{t("notices.title")}</h1>
        <div className={styles.actions}>
          <Button size="sm" variant="secondary" loading={busy === "all"} onClick={() => act("all", markAllNoticesRead)}>{t("notices.markAll")}</Button>
          <Button size="sm" variant="secondary" loading={busy === "run"}
            onClick={() => act("run", runVehicleCheck, (res) => fillText(t("notices.runDone"), { n: res.created || 0 }))}>
            {t("notices.runCheck")}
          </Button>
        </div>
      </header>

      <div className={styles.filters}>
        <select value={filters.status} onChange={setFilter("status")} aria-label={t("notices.filters.all")}>
          <option value="all">{t("notices.filters.all")}</option>
          <option value="unread">{t("notices.filters.unread")}</option>
        </select>
        <select value={filters.category} onChange={setFilter("category")} aria-label={t("notices.filters.category")}>
          <option value="">{t("notices.filters.category")}</option>
          {["vehicle", "system", "manual"].map((c) => <option key={c} value={c}>{t(`notices.category.${c}`)}</option>)}
        </select>
        <select value={filters.severity} onChange={setFilter("severity")} aria-label={t("notices.filters.severity")}>
          <option value="">{t("notices.filters.severity")}</option>
          {["critical", "important", "info"].map((s) => <option key={s} value={s}>{t(`notices.severity.${s}`)}</option>)}
        </select>
      </div>

      {state.error && <p role="alert">{state.error}</p>}
      {!state.loading && !state.error && state.notices.length === 0 && <p>{t("notices.empty")}</p>}

      {state.notices.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {["severity", "title", "category", "date", "author", "status"].map((c) => <th key={c} scope="col">{t(`notices.cols.${c}`)}</th>)}
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {state.notices.map((n) => (
                <tr key={n._id} className={n.read ? "" : styles.unreadRow}>
                  <td><StatusBadge tone={TONE[n.severity]}>{t(`notices.severity.${n.severity}`)}</StatusBadge></td>
                  <td>
                    <button type="button" className={styles.linkButton} onClick={() => open(n)}>{n.title}</button>
                    {n.body && <div className={styles.body}>{n.body}</div>}
                  </td>
                  <td>{t(`notices.category.${n.category}`)}</td>
                  <td>{new Date(n.createdAt).toLocaleString()}</td>
                  <td>{n.createdBy === "system" ? t("notices.system") : n.createdByName}</td>
                  <td>{n.read ? t("notices.read") : <strong>{t("notices.unread")}</strong>}</td>
                  <td className={styles.rowActions}>
                    {!n.read && <Button size="sm" variant="secondary" onClick={() => act(`r${n._id}`, () => markNoticeRead(n._id))}>{t("notices.markRead")}</Button>}
                    <Button size="sm" variant="secondary" onClick={() => act(`a${n._id}`, () => archiveNotice(n._id))}>{t("notices.archive")}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className={styles.form} onSubmit={publish} noValidate>
        <h2>{t("notices.newTitle")}</h2>
        <label>{t("notices.f.title")}
          <input value={draft.title} maxLength={120} required onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          {errors.title && <span role="alert">{errors.title}</span>}
        </label>
        <label>{t("notices.f.body")}
          <textarea value={draft.body} maxLength={2000} rows={3} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          {errors.body && <span role="alert">{errors.body}</span>}
        </label>
        <label>{t("notices.f.severity")}
          <select value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value })}>
            {["info", "important", "critical"].map((s) => <option key={s} value={s}>{t(`notices.severity.${s}`)}</option>)}
          </select>
        </label>
        <Button type="submit" loading={busy === "publish"}>{t("notices.publish")}</Button>
      </form>
    </section>
  );
}
```

Before writing, check `StatusBadge.jsx` props (`tone`/children) and `Button.jsx` props (`size`, `variant`, `loading`) — they are used the same way in `VehicleAlerts.jsx` and `OfficialLookup.jsx`; match their exact prop names.

`client/src/Components/Notice/Notice.module.css`:

```css
.page { display: grid; gap: 16px; padding: 16px; max-width: 1100px; margin: 0 auto; }
.head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.actions, .filters, .rowActions { display: flex; flex-wrap: wrap; gap: 8px; }
.tableWrap { overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 8px; border-bottom: 1px solid #e3e8ee; text-align: start; vertical-align: top; }
.unreadRow { background: #f3f8fc; }
.body { color: #5a6570; font-size: 0.9em; white-space: pre-wrap; }
.linkButton { background: none; border: 0; padding: 0; color: inherit; font: inherit; font-weight: 600; cursor: pointer; text-align: start; }
.form { display: grid; gap: 8px; max-width: 560px; }
.form label { display: grid; gap: 4px; }
.bell { position: relative; background: none; border: 0; font-size: 1.3rem; cursor: pointer; padding: 4px 8px; }
.badge { position: absolute; top: -2px; inset-inline-end: -2px; min-width: 18px; padding: 0 4px; border-radius: 9px; background: #c62828; color: #fff; font-size: 0.7rem; line-height: 18px; }
```

- [ ] **Step 8: Route and header**

`Routes.jsx`: `import NoticesBoard from '../Notice/NoticesBoard';` and inside the `RoleGuard` block:

```jsx
            <Route path="/notices" element={<NoticesBoard/>} />
```

`Header.jsx`: `import NoticeBell from "../Notice/NoticeBell";`. In the nav, after the users link:

```jsx
        {isAdmin && (
          <a href="/notices" onClick={(event) => onNavClick(event, "/notices")}>{t("nav.notices")}</a>
        )}
```

and next to the header's user/language controls (outside the collapsible nav):

```jsx
        {isAdmin && <NoticeBell onOpen={() => navigate("/notices")} />}
```

Use whatever navigation helper `Header.jsx` already uses inside `onNavClick` (read the function first; reuse it rather than adding a second `useNavigate`).

- [ ] **Step 9: Verify**

Run: `npm test --prefix client` → PASS; `npm run build --prefix client` → "Compiled successfully" (or only pre-existing warnings).
Then with the dev servers (`npm start` at repo root), as an admin: bell shows a count, `/notices` lists, filters, publishes, marks read, archives, "run check" toasts a count. As a guide: no bell, `/notices` redirects to `/dashboard`. Check at 375px width that the table scrolls inside its wrapper. Take a screenshot as proof.

- [ ] **Step 10: Propose commit (do not run)**

`feat(notices): administrators' notices board page and unread bell`

---

### Task 8: Client — "read document" in vehicle forms

**Files:**
- Create: `client/src/utils/vehicleScan.js`, `client/src/utils/vehicleScan.test.js`, `client/src/Components/Vehicle/DocumentScan.jsx`
- Modify: `client/src/WebServer/services/vehicle/functionsVehicle.jsx`, `client/src/Components/Vehicle/VehicleRecords.jsx` (`RecordForm`), `client/src/Components/Vehicle/EditVehicle.jsx`, `client/src/i18n/vehicleStrings.js`

**Interfaces:**
- Consumes: `POST /api/vehicle/extract` (Task 6).
- Produces:
  - `extractVehicleDocument(file, { vehicleId, expected }) → { ok, available, documentType, proposed, warnings } | { ok:false, message, status }`
  - `scanToDraft(target: "license"|"policy"|"vehicle", proposed) → object` (only non-null keys of that form)
  - `mergeScan(draft, patch) → { draft, filled: string[], skipped: string[] }` — never overwrites a non-empty field.
  - `<DocumentScan target vehicleId draft onApply(patch, file) />`

- [ ] **Step 1: Write the failing tests** (`client/src/utils/vehicleScan.test.js`)

```js
import { mergeScan, scanToDraft } from "./vehicleScan";

const proposed = {
  plate: "1234567",
  vehicle: { make: "Ford", model: null, year: 2019, color: null, chassisNumber: null },
  license: { validFrom: "2026-01-01", validUntil: "2026-12-31", feeAmount: 1300 },
  policy: { insurer: "הראל", policyNumber: null, type: "mandatory", startDate: "2026-01-01", endDate: "2026-12-31", cost: 1800 },
};

test("maps only the target form's non-empty fields, as form strings", () => {
  expect(scanToDraft("license", proposed)).toEqual({ validFrom: "2026-01-01", validUntil: "2026-12-31", feeAmount: "1300" });
  expect(scanToDraft("policy", proposed)).toEqual({ insurer: "הראל", type: "mandatory", startDate: "2026-01-01", endDate: "2026-12-31", cost: "1800" });
  expect(scanToDraft("vehicle", proposed)).toEqual({ plate: "1234567", make: "Ford", year: "2019" });
});

test("never overwrites what the user already typed", () => {
  const { draft, filled, skipped } = mergeScan({ insurer: "מנורה", endDate: "" }, { insurer: "הראל", endDate: "2026-12-31" });
  expect(draft).toEqual({ insurer: "מנורה", endDate: "2026-12-31" });
  expect(filled).toEqual(["endDate"]);
  expect(skipped).toEqual(["insurer"]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test --prefix client -- vehicleScan`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `client/src/utils/vehicleScan.js`**

```js
// Turns a server extraction PROPOSAL into values for one vehicle form. Values
// become strings (form inputs hold text); empty/null values are dropped, and a
// field the user already filled is never replaced.

const FIELDS = {
  license: { source: "license", keys: ["validFrom", "validUntil", "feeAmount"] },
  policy: { source: "policy", keys: ["insurer", "policyNumber", "type", "startDate", "endDate", "cost"] },
  vehicle: { source: "vehicle", keys: ["make", "model", "year", "color", "chassisNumber"] },
};

export function scanToDraft(target, proposed = {}) {
  const config = FIELDS[target];
  if (!config) return {};
  const source = proposed[config.source] || {};
  const out = {};
  if (target === "vehicle" && proposed.plate) out.plate = String(proposed.plate);
  for (const key of config.keys) {
    const value = source[key];
    if (value !== null && value !== undefined && value !== "") out[key] = String(value);
  }
  return out;
}

export function mergeScan(draft = {}, patch = {}) {
  const next = { ...draft };
  const filled = [];
  const skipped = [];
  for (const [key, value] of Object.entries(patch)) {
    if (next[key] !== undefined && next[key] !== null && String(next[key]).trim() !== "") skipped.push(key);
    else {
      next[key] = value;
      filled.push(key);
    }
  }
  return { draft: next, filled, skipped };
}
```

Run: `npm test --prefix client -- vehicleScan` → PASS.

- [ ] **Step 4: API call** (`functionsVehicle.jsx`, after `uploadVehicleDocument`)

```js
export const extractVehicleDocument = (file, { vehicleId = "", expected = "any" } = {}) => {
  const form = new FormData();
  form.append("file", file);
  if (vehicleId) form.append("vehicleId", vehicleId);
  form.append("expected", expected);
  return call(() =>
    api.post(`${namespace}/extract`, form, { headers: { "Content-Type": "multipart/form-data" }, timeout: 90000 })
  );
};
```

- [ ] **Step 5: Strings** (`vehicleStrings.js`, a `scan` block in each language)

```js
    scan: {
      button: "📄 قراءة مستند",            // he: "📄 קריאת מסמך"                   en: "📄 Read document"
      hint: "صورة أو PDF للرخصة أو بوليصة التأمين", // he: "תמונה או PDF של רישיון או פוליסה"  en: "Photo or PDF of the licence or policy"
      reading: "جارٍ قراءة المستند…",         // he: "קורא את המסמך…"                 en: "Reading the document…"
      title: "بيانات مقترحة من المستند",       // he: "נתונים מוצעים מהמסמך"           en: "Values proposed from the document"
      apply: "تعبئة النموذج",                 // he: "מלא את הטופס"                   en: "Fill the form"
      dismiss: "تجاهل",                       // he: "התעלם"                          en: "Dismiss"
      applied: "تمت تعبئة {n} حقول، راجعها قبل الحفظ", // he: "מולאו {n} שדות, בדוק לפני שמירה"  en: "{n} fields filled, review before saving"
      skipped: "حقول لم تُستبدل لأنها معبأة: {n}",      // he: "שדות שלא הוחלפו כי כבר מלאים: {n}" en: "Not replaced (already filled): {n}"
      attach: "إرفاق الملف بالسجل بعد الحفظ",           // he: "צרף את הקובץ לרשומה אחרי השמירה"  en: "Attach the file to the record after saving"
      otherType: "يبدو أن هذا المستند من نوع آخر",      // he: "נראה שזה מסמך מסוג אחר"           en: "This looks like a different document type"
      warnings: {
        plate_mismatch: "رقم اللوحة في المستند لا يطابق هذه المركبة",   // he: "מספר הרכב במסמך לא תואם לרכב הזה"   en: "The plate on the document does not match this vehicle"
        dates: "بعض التواريخ غير واضحة أو غير منطقية وتُركت فارغة",      // he: "חלק מהתאריכים לא ברורים והושארו ריקים" en: "Some dates were unclear or inconsistent and were left empty"
        invalid_plate: "رقم اللوحة في المستند غير واضح",                 // he: "מספר הרכב במסמך לא ברור"             en: "The plate on the document is unclear"
      },
    },
```

- [ ] **Step 6: Component** (`client/src/Components/Vehicle/DocumentScan.jsx`)

```jsx
import React, { useRef, useState } from "react";
import { extractVehicleDocument } from "../../WebServer/services/vehicle/functionsVehicle.jsx";
import { useI18n } from "../../i18n/I18nContext";
import { toast } from "../../ALERT/SystemToasts";
import Button from "../UI/Button.jsx";
import { fillText } from "../../utils/vehicleDisplay";
import { mergeScan, scanToDraft } from "../../utils/vehicleScan";
import styles from "./Vehicle.module.css";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

const warningKey = (w) => (w.startsWith("invalid_date") || w.startsWith("dates_reversed") ? "dates" : w);

// Optional helper inside a form: the server reads the document and returns a
// PROPOSAL; "fill" copies it into empty fields only. Nothing is saved here.
export default function DocumentScan({ target, vehicleId = "", draft, onApply }) {
  const { t } = useI18n();
  const input = useRef(null);
  const [state, setState] = useState({ status: "idle", result: null, file: null, message: "" });

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setState({ status: "loading", result: null, file, message: "" });
    const res = await extractVehicleDocument(file, { vehicleId, expected: target === "vehicle" ? "any" : target });
    if (!res.ok) return setState({ status: "message", result: null, file: null, message: res.message });
    setState({ status: "found", result: res, file, message: "" });
  };

  const patch = state.result ? scanToDraft(target, state.result.proposed) : {};
  const rows = Object.entries(patch);
  const warnings = Array.from(new Set((state.result?.warnings || []).map(warningKey)));
  const otherType = state.result && target !== "vehicle" && state.result.documentType !== "unknown" && state.result.documentType !== target;

  const apply = () => {
    const { draft: next, filled, skipped } = mergeScan(draft, patch);
    onApply(next, state.file);
    toast.success(fillText(t("vehicles.scan.applied"), { n: filled.length }));
    if (skipped.length) toast.warn(fillText(t("vehicles.scan.skipped"), { n: skipped.length }));
    setState({ status: "idle", result: null, file: null, message: "" });
  };

  return (
    <div className={styles.wide}>
      <div className={styles.actionsRow}>
        <Button type="button" variant="secondary" size="sm" loading={state.status === "loading"} onClick={() => input.current?.click()}>
          {t("vehicles.scan.button")}
        </Button>
        <span className={styles.fieldHint}>{state.status === "loading" ? t("vehicles.scan.reading") : t("vehicles.scan.hint")}</span>
        <input ref={input} type="file" accept={ACCEPT} hidden onChange={pick} />
      </div>

      {state.status === "message" && <p className={styles.note} role="status">{state.message}</p>}

      {state.status === "found" && (
        <div className={styles.inlineForm} role="region" aria-label={t("vehicles.scan.title")}>
          <strong>{t("vehicles.scan.title")}</strong>
          {otherType && <p className={styles.note} role="alert">{t("vehicles.scan.otherType")}</p>}
          {warnings.map((w) => <p key={w} className={styles.note} role="alert">{t(`vehicles.scan.warnings.${w}`)}</p>)}
          <table className={styles.table}>
            <tbody>
              {rows.map(([key, value]) => (
                <tr key={key}>
                  <td>{t(`vehicles.f.${key === "type" ? "policyType" : key}`)}</td>
                  <td><strong>{value}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.actionsRow}>
            <Button type="button" size="sm" disabled={rows.length === 0} onClick={apply}>{t("vehicles.scan.apply")}</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setState({ status: "idle", result: null, file: null, message: "" })}>
              {t("vehicles.scan.dismiss")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

`policyType` values in the table show the raw key (`mandatory`); render them with `t(\`vehicles.policyType.${value}\`)` when `key === "type"`.

- [ ] **Step 7: Use it in `RecordForm`** (`VehicleRecords.jsx`)

Add imports `DocumentScan` and `uploadVehicleDocument`. Inside `RecordForm`, add state `const [scanFile, setScanFile] = useState(null);` and render, at the top of `formGrid`, for new licence/policy records only:

```jsx
        {!editing && (kind === "license" || kind === "policy") && (
          <DocumentScan
            target={kind}
            vehicleId={vehicleId}
            draft={draft}
            onApply={(next, file) => { setDraft((prev) => ({ ...prev, ...next })); setScanFile(file || null); }}
          />
        )}
        {scanFile && (
          <p className={styles.fieldHint}>{t("vehicles.scan.attach")}: {scanFile.name}</p>
        )}
```

In `submit`, after a successful add (`res.ok`, not editing), attach the scanned file to the new record:

```js
    if (!editing && scanFile) {
      const list = res.vehicle?.[config.list] || [];
      const newest = list[list.length - 1];
      const linkedType = kind === "policy" ? "policy" : "license";
      const uploaded = await uploadVehicleDocument(vehicleId, { file: scanFile, kind: linkedType, linkedType, linkedId: newest?.id });
      if (!uploaded.ok) toast.warn(uploaded.message);
    }
```

Before writing this, confirm in `Vehicle.controller.js` `addRecordHandler` that the response is `{ vehicle }` with records appended at the end and each record has `id`; if `onSaved(res.vehicle)` uses `uploaded.vehicle` freshness, call `onSaved(uploaded.vehicle || res.vehicle)`.

- [ ] **Step 8: Use it in `EditVehicle.jsx`** (new vehicle only)

Next to `<OfficialLookup ... />` (same `form`/setter it uses), when creating:

```jsx
        {isNew && (
          <DocumentScan target="vehicle" draft={form} onApply={(next) => setForm((prev) => ({ ...prev, ...next }))} />
        )}
```

Use the component's existing names for the "new" flag and form setter (read the file around `OfficialLookup` first).

- [ ] **Step 9: Verify**

Run: `npm test --prefix client` → PASS; `npm run build --prefix client` → compiled.
Live (needs `ANTHROPIC_API_KEY`, owner's OK, a non-sensitive sample): add licence → read a licence photo → proposal shown → fill → save → the file appears under the licence's documents. Without the key: the message "قراءة المستندات غير مفعّلة على الخادم" appears and manual entry still works.

- [ ] **Step 10: Propose commit (do not run)**

`feat(vehicles): read-document helper in licence, policy and new-vehicle forms`

---

### Task 9: Configuration notes, full verification, review handoff

**Files:**
- Modify: `server/config/.env.example`, `docs/AI_REVIEW_LOG.md`

- [ ] **Step 1: `.env.example`** — replace the AI block comment:

```
# ---- AI (server/services/ai.service.js + vehicleDocExtract.service.js) ----
# From https://console.anthropic.com -> Settings -> API Keys.
# Used to read vehicle licences/insurance policies (POST /api/vehicle/extract).
# Without it, document reading is disabled and manual entry still works.
ANTHROPIC_API_KEY=
```

and under the SMTP section (or add one) a note: `# SMTP_* is used for the nightly vehicle digest to administrators; without it only the notices board is updated.`

- [ ] **Step 2: Full verification**

Run: `npm run verify` (repo root: server tests + client tests + client build).
Expected: all pass; capture the summary lines.

- [ ] **Step 3: Manual nightly-check proof**

With the dev servers running, as an admin press "تشغيل فحص المركبات الآن" on `/notices`; confirm new notices appear once, pressing again creates `0`. Check the server log for the `JobRuns`/email lines. (No real email is sent unless SMTP is configured.)

- [ ] **Step 4: Review handoff** — append to `docs/AI_REVIEW_LOG.md` an entry listing every changed file from this plan, the spec/plan paths, the verification output, and a request for Codex review with the Review Focus list. No secrets, keys or test passwords.

- [ ] **Step 5: Propose commit (do not run)**

`docs: env notes and review request for vehicle documents, nightly check and notices`
