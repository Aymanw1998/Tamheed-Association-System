# Independent Claude Code review request — selected improvements (2026-11-07)

Codex is the sole implementer; you are the independent actual Claude Code reviewer.
Review only this authorized source payload; do not use tools, read other files, edit,
or request another reviewer. No environment files, credentials, runtime logs or real
records are included. Source sharing and committing/pushing are already authorized.

Scope: grouped desktop navigation, phone accordion, bell layering, DMY dates;
server-process Arabic report PDF with bounded queue, authenticated per-report jobs,
permission/scope rechecks, cancellation and tab-session resume; reused SMTP pool
with safe pre-DATA retry only; file list/grid/search/sort and owner names; recoverable
IT audit archive and manual notice trash/restore; personal system-alert dismissal.
Preserve all existing record ACLs and explicit grants/revokes. New operations have
catalog, server and UI guards. No database migrations, external sends, Drive moves
or production deployment performed. PDF needs installed Chromium and non-root worker;
current queue assumes one API process. Local tests and browser fixture use synthetic
data. Report concrete defects with source evidence, severity and failure scenario;
state explicitly if no findings. A request is not approval.

## Tracked source changes

```diff
diff --git a/apps/it/package.json b/apps/it/package.json
index 581323b..4ff15f3 100644
--- a/apps/it/package.json
+++ b/apps/it/package.json
@@ -6,9 +6,9 @@
     "start": "react-scripts start",
     "build": "react-scripts build",
     "test": "react-scripts test --watchAll=false --runInBand",
-    "prestart": "node ../../scripts/syncPermissions.js",
-    "pretest": "node ../../scripts/syncPermissions.js",
-    "prebuild": "node ../../scripts/syncPermissions.js"
+    "prestart": "node ../../scripts/syncShared.js",
+    "pretest": "node ../../scripts/syncShared.js",
+    "prebuild": "node ../../scripts/syncShared.js"
   },
   "dependencies": {
     "@simplewebauthn/browser": "13.3.0",
diff --git a/apps/it/src/App.jsx b/apps/it/src/App.jsx
index 149cca8..62e50b2 100644
--- a/apps/it/src/App.jsx
+++ b/apps/it/src/App.jsx
@@ -30,7 +30,7 @@ function Screen({ path, me }) {
   if (user) return <UserPage key={user[1]} tz={decodeURIComponent(user[1])} />;
   if (path === "/roles") return <RoleDefaults />;
   if (path === "/bug-reports") return <BugReports />;
-  if (path === "/audit") return <Audit />;
+  if (path === "/audit") return <Audit me={me} />;
   if (path === "/storage") return <Storage />;
   if (path === "/settings") return <Settings />;
   // The IT users screen: the system account and the «مدير IT» users (the server checks too).
diff --git a/apps/it/src/api.js b/apps/it/src/api.js
index 35586cc..c601d61 100644
--- a/apps/it/src/api.js
+++ b/apps/it/src/api.js
@@ -100,6 +100,7 @@ export const getAudit = (filters = {}, page = 1) => {
   for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
   return call(`/audit?${query}`);
 };
+export const archiveAudit = (ids, archived) => call("/audit/archive", { method: "POST", body: { ids, archived } });
 export const getDriveStatus = () => call("/storage/google/status");
 export const getDriveConnectUrl = (options = {}) => send("POST", "/storage/google/connect-url", { fullAccess: options.fullAccess === true });
 export const forceReleaseLock = (key) => send("POST", "/locks/force-release", { key });
diff --git a/apps/it/src/generated/permissions.json b/apps/it/src/generated/permissions.json
index c9d40db..91a7fc7 100644
--- a/apps/it/src/generated/permissions.json
+++ b/apps/it/src/generated/permissions.json
@@ -69,7 +69,9 @@
       "view",
       "post",
       "runCheck",
-      "archive"
+      "archive",
+      "delete",
+      "restore"
     ],
     "users": [
       "view",
@@ -89,7 +91,8 @@
       "manage"
     ],
     "audit": [
-      "view"
+      "view",
+      "archive"
     ],
     "systemRecovery": [
       "reset"
@@ -113,6 +116,9 @@
       "view",
       "edit",
       "link"
+    ],
+    "alerts": [
+      "dismiss"
     ]
   },
   "itKeys": [
@@ -121,7 +127,8 @@
     "users.unlock",
     "audit.view",
     "storage.drive",
-    "systemRecovery.reset"
+    "systemRecovery.reset",
+    "audit.archive"
   ],
   "hiddenModules": [
     "finance"
@@ -148,7 +155,8 @@
         "storage": "التخزين",
         "finance": "المالية",
         "rules": "قوانين الجمعية",
-        "consents": "تواقيع أولياء الأمور"
+        "consents": "تواقيع أولياء الأمور",
+        "alerts": "تنبيهاتي"
       },
       "leaves": {
         "view": "عرض",
@@ -185,7 +193,8 @@
         "createFolder": "إنشاء مجلد",
         "rename": "إعادة تسمية",
         "link": "إنشاء رابط توقيع",
-        "share": "مشاركة وإلغاء المشاركة"
+        "share": "مشاركة وإلغاء المشاركة",
+        "restore": "استعادة"
       },
       "leavesByModule": {
         "sports": {
@@ -206,6 +215,12 @@
         },
         "consents": {
           "edit": "إضافة أو تحديث التوقيع"
+        },
+        "audit": {
+          "archive": "أرشفة واستعادة السجلات"
+        },
+        "alerts": {
+          "dismiss": "إخفاء واستعادة تنبيهاتي"
         }
       }
     }
diff --git a/apps/it/src/screens/Audit.jsx b/apps/it/src/screens/Audit.jsx
index 9ab6a08..0b37da7 100644
--- a/apps/it/src/screens/Audit.jsx
+++ b/apps/it/src/screens/Audit.jsx
@@ -1,11 +1,13 @@
+import { formatDateTime } from "../generated/dateFormat";
 import { useCallback, useEffect, useState } from "react";
-import { errorText, getAudit } from "../api";
+import { archiveAudit, errorText, getAudit } from "../api";
+import ConfirmDialog from "../ui/ConfirmDialog";
 import { auditActions, auditModules, fillText } from "../strings";
 import FilterDialog from "../ui/FilterDialog.jsx";

 const PAGE_SIZE = 50;
 const FIELDS = ["from", "to", "module", "actor", "action", "targetId", "q"];
-const when = (value) => (value ? new Date(value).toLocaleString("ar", { timeZone: "Asia/Jerusalem" }) : "—");
+const when = (value) => formatDateTime(value);
 const show = (value) => (value === null || value === undefined || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value));

 function Changes({ changes }) {
@@ -22,7 +24,9 @@ function Changes({ changes }) {

 // The audit log: today's screen of the everyday app, moved here. The system
 // account's actions show as «النظام» (the server names the actor).
-export default function Audit() {
+export default function Audit({ me }) {
+  const [status, setStatus] = useState("active"), [selected, setSelected] = useState([]), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false);
+  const canArchive = Boolean(me?.permissions?.includes("audit.archive"));
   const [filters, setFilters] = useState({});
   const [draft, setDraft] = useState({});
   const [page, setPage] = useState(1);
@@ -36,7 +40,12 @@ export default function Audit() {
     setData({ items: res.data.items || [], total: res.data.total || 0 });
   }, []);

-  useEffect(() => { load(filters, page); }, [load, filters, page]);
+  useEffect(() => { setSelected([]); load({ ...filters, status }, page); }, [load, filters, page, status]);
+  const archive = async () => {
+    setBusy(true); const res = await archiveAudit(selected, status !== "archived"); setBusy(false); setConfirm(false);
+    if (!res.ok) return setError(errorText(res));
+    setSelected([]); await load({ ...filters, status }, page);
+  };

   const set = (key) => (event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }));
   const apply = () => {
@@ -53,6 +62,12 @@ export default function Audit() {
   return (
     <section>
       <h1>سجل التغييرات</h1>
+      <div className="row" role="tablist" aria-label="عرض السجل">
+        <button role="tab" aria-selected={status === "active"} onClick={() => { setStatus("active"); setPage(1); }}>السجل الحالي</button>
+        <button role="tab" aria-selected={status === "archived"} onClick={() => { setStatus("archived"); setPage(1); }}>الأرشيف</button>
+        {canArchive && <><button disabled={!data?.items.length} onClick={() => setSelected(data.items.map((item) => item._id))}>تحديد الصفحة</button><button disabled={!selected.length || busy} onClick={() => setConfirm(true)}>{status === "archived" ? "استعادة المحدد" : "أرشفة المحدد"} ({selected.length})</button></>}
+      </div>
+      {confirm && <ConfirmDialog title={status === "archived" ? "استعادة السجلات" : "أرشفة السجلات"} message={`سيتم ${status === "archived" ? "استعادة" : "أرشفة"} ${selected.length} سجلًا. يبقى سجل التغييرات محفوظًا وقابلًا للاستعادة.`} confirmText="تأكيد" cancelText="إلغاء" onCancel={() => setConfirm(false)} onConfirm={archive} />}
       <div className="toolbar">
         <FilterDialog count={count} onClear={clear} onApply={apply}>
           <label>من تاريخ<input name="from" type="date" value={draft.from || ""} onChange={set("from")} /></label>
@@ -86,7 +101,7 @@ export default function Audit() {
             <tbody>
               {data.items.map((item, index) => (
                 <tr key={item._id || index}>
-                  <td>{when(item.at)}</td>
+                  <td>{canArchive && <input type="checkbox" aria-label={`تحديد السجل ${index + 1}`} checked={selected.includes(item._id)} onChange={(event) => setSelected((old) => event.target.checked ? [...old, item._id] : old.filter((id) => id !== item._id))} />} <time dir="ltr">{when(item.at)}</time></td>
                   <td>{item.actor === "system" ? (item.realActorName ? `النظام (${item.realActorName})` : "النظام") : item.actorName || item.actor || "—"}</td>
                   <td>{auditModules[item.module] || item.module}</td>
                   <td>{auditActions[item.action] || item.action}</td>
diff --git a/apps/it/src/screens/Audit.test.js b/apps/it/src/screens/Audit.test.js
index 006d709..b333e6d 100644
--- a/apps/it/src/screens/Audit.test.js
+++ b/apps/it/src/screens/Audit.test.js
@@ -2,7 +2,7 @@ import Audit from "./Audit.jsx";
 import * as api from "../api";
 import { mount, unmountAll, ok, button, click, type, submit } from "../testUtils";

-jest.mock("../api", () => ({ ...jest.requireActual("../api"), getAudit: jest.fn() }));
+jest.mock("../api", () => ({ ...jest.requireActual("../api"), getAudit: jest.fn(), archiveAudit: jest.fn() }));

 const ITEMS = [
   { _id: "a1", at: "2026-11-02T10:00:00Z", actor: "100000001", actorName: "سامر الأول", module: "users", action: "role_change", targetType: "user", targetId: "100000002", targetLabel: "ليلى الثانية", changes: { role: { before: "مساعد", after: "مرشد" } } },
@@ -14,7 +14,7 @@ afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

 test("Audit renders its data", async () => {
   const c = await mount(<Audit />);
-  expect(api.getAudit).toHaveBeenCalledWith({}, 1);
+  expect(api.getAudit).toHaveBeenCalledWith({ status: "active" }, 1);
   expect(c.querySelectorAll("tbody tr")).toHaveLength(2);
   expect(c.textContent).toContain("سامر الأول");
   expect(c.textContent).toContain("تغيير دور");
@@ -34,10 +34,10 @@ test("Audit: filters apply from the «فلتر» window and paging asks the serv
   await type(dialog.querySelector('select[name="module"]'), "users");
   await type(dialog.querySelector('input[name="q"]'), "ليلى");
   await submit(dialog);
-  expect(api.getAudit).toHaveBeenLastCalledWith({ module: "users", q: "ليلى" }, 1);
+  expect(api.getAudit).toHaveBeenLastCalledWith({ module: "users", q: "ليلى", status: "active" }, 1);

   await click(button(c, "التالي"));
-  expect(api.getAudit).toHaveBeenLastCalledWith({ module: "users", q: "ليلى" }, 2);
+  expect(api.getAudit).toHaveBeenLastCalledWith({ module: "users", q: "ليلى", status: "active" }, 2);
 });

 test("the real person behind «النظام» shows only here", async () => {
@@ -45,3 +45,19 @@ test("the real person behind «النظام» shows only here", async () => {
   const c = await mount(<Audit />);
   expect(c.textContent).toContain("النظام (اسم حقيقي)");
 });
+
+test("archive permission allows recoverable selection, and archived view restores it", async () => {
+  api.archiveAudit.mockImplementation(() => ok());
+  const c = await mount(<Audit me={{ permissions: ["audit.view", "audit.archive"] }} />);
+  await click(button(c, "تحديد الصفحة")); await click(button(c, "أرشفة المحدد (2)"));
+  await click(button(document.body.querySelector('[role="dialog"]'), "تأكيد"));
+  expect(api.archiveAudit).toHaveBeenLastCalledWith(["a1", "a2"], true);
+  await click(button(c, "الأرشيف")); expect(api.getAudit).toHaveBeenLastCalledWith({ status: "archived" }, 1);
+  await click(button(c, "تحديد الصفحة")); await click(button(c, "استعادة المحدد (2)"));
+  await click(button(document.body.querySelector('[role="dialog"]'), "تأكيد"));
+  expect(api.archiveAudit).toHaveBeenLastCalledWith(["a1", "a2"], false);
+});
+test("view-only audit access has no selection or archive action", async () => {
+  const c = await mount(<Audit me={{ permissions: ["audit.view"] }} />);
+  expect(c.querySelector('input[type="checkbox"]')).toBeNull(); expect(button(c, "تحديد الصفحة")).toBeUndefined();
+});
diff --git a/apps/it/src/screens/BugReports.jsx b/apps/it/src/screens/BugReports.jsx
index 579bbb5..01c6f0e 100644
--- a/apps/it/src/screens/BugReports.jsx
+++ b/apps/it/src/screens/BugReports.jsx
@@ -1,3 +1,4 @@
+import { formatDateTime } from "../generated/dateFormat";
 import { useCallback, useEffect, useState } from "react";
 import { bugReportImage, deleteBugReport, errorText, getBugReports } from "../api";
 import { roleLabel } from "../strings";
@@ -7,10 +8,7 @@ import { toast } from "../ui/toast.jsx";
 const TYPES = { fault: "عطل", suggestion: "اقتراح تحسين", problem: "مشكلة ملموسة" };
 const KINDS = { server: "خطأ خادم", network: "الخادم لا يجيب", crash: "تعطل الشاشة" };

-const when = (value) => {
-  const date = new Date(value);
-  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
-};
+const when = (value) => formatDateTime(value);

 function Field({ label, value }) {
   if (!value) return null;
diff --git a/apps/it/src/screens/RoleDefaults.jsx b/apps/it/src/screens/RoleDefaults.jsx
index a195bfc..6fc0ced 100644
--- a/apps/it/src/screens/RoleDefaults.jsx
+++ b/apps/it/src/screens/RoleDefaults.jsx
@@ -1,3 +1,4 @@
+import { formatDateTime } from "../generated/dateFormat";
 import { useCallback, useEffect, useMemo, useRef, useState } from "react";
 import { errorText, getRoleDefaults, resetRoleDefaults, saveRoleDefaults } from "../api";
 import { fillText, leafName, moduleName, perms, roleDefaultsText as text, roleLabel } from "../strings";
@@ -6,7 +7,7 @@ import { leavesOf, visibleModules } from "../ui/permissionTree";
 import styles from "../ui/PermissionsEditor.module.css";
 import { toast } from "../ui/toast.jsx";

-const when = (value) => new Date(value).toLocaleString("ar", { timeZone: "Asia/Jerusalem" });
+const when = (value) => formatDateTime(value);

 function TriStateBox({ state, ...rest }) {
   const ref = useRef(null);
diff --git a/apps/it/src/screens/UserPage.jsx b/apps/it/src/screens/UserPage.jsx
index 3548502..66fec99 100644
--- a/apps/it/src/screens/UserPage.jsx
+++ b/apps/it/src/screens/UserPage.jsx
@@ -1,3 +1,4 @@
+import { formatDateTime } from "../generated/dateFormat";
 import RequiredMark from "../ui/RequiredMark";
 import { useCallback, useEffect, useState } from "react";
 import {
@@ -18,7 +19,7 @@ const roleOf = (user) => {
   return held.sort((a, b) => RANK[b] - RANK[a])[0] || "";
 };

-const when = (value) => (value ? new Date(value).toLocaleString("ar", { timeZone: "Asia/Jerusalem" }) : "—");
+const when = (value) => formatDateTime(value);

 // One user: role, permissions, password, unlock and signed-in devices.
 // Every action is decided by the server; a refusal is shown as its text.
diff --git a/apps/it/src/ui/PermissionsEditor.jsx b/apps/it/src/ui/PermissionsEditor.jsx
index 60f7ef9..d770d01 100644
--- a/apps/it/src/ui/PermissionsEditor.jsx
+++ b/apps/it/src/ui/PermissionsEditor.jsx
@@ -1,3 +1,4 @@
+import { formatDateTime } from "../generated/dateFormat";
 import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
 import { errorText, getPermissions, savePermissions } from "../api";
 import { fillText, leafName, moduleName, perms, roleLabel } from "../strings";
@@ -102,7 +103,7 @@ export default function PermissionsEditor({ tz, onSaved }) {

   const who = data.updatedBy === "system" ? perms.system : data.updatedBy;
   const lastChange = data.updatedAt
-    ? fillText(perms.lastChange, { who: who || "—", when: new Date(data.updatedAt).toLocaleString("ar", { timeZone: "Asia/Jerusalem" }) })
+    ? fillText(perms.lastChange, { who: who || "—", when: formatDateTime(data.updatedAt) })
     : perms.neverChanged;
   const hasSpecial = (data.grants || []).length > 0 || (data.revokes || []).length > 0;
   const canReset = isResettable(data, grantable);
diff --git a/apps/sport/package.json b/apps/sport/package.json
index f274585..e2d717f 100644
--- a/apps/sport/package.json
+++ b/apps/sport/package.json
@@ -5,7 +5,10 @@
   "scripts": {
     "start": "react-scripts start",
     "build": "react-scripts build",
-    "test": "react-scripts test --watchAll=false --runInBand"
+    "test": "react-scripts test --watchAll=false --runInBand",
+    "prestart": "node ../../scripts/syncShared.js",
+    "pretest": "node ../../scripts/syncShared.js",
+    "prebuild": "node ../../scripts/syncShared.js"
   },
   "dependencies": {
     "@dicebear/collection": "9.4.3",
diff --git a/apps/sport/src/NoticesPage.jsx b/apps/sport/src/NoticesPage.jsx
index 64cffab..a2fc26b 100644
--- a/apps/sport/src/NoticesPage.jsx
+++ b/apps/sport/src/NoticesPage.jsx
@@ -1,8 +1,9 @@
+import { formatDate } from "./generated/dateFormat";
 import { BellIcon } from "./Art.jsx";

 const dateLabel = (v) => {
   const d = new Date(v);
-  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB");
+  return Number.isNaN(d.getTime()) ? "" : formatDate(d);
 };

 // The staff's notices to this player, newest first. `seenBefore` marks the
diff --git a/apps/sport/src/format.js b/apps/sport/src/format.js
index 92d7c9a..6d51979 100644
--- a/apps/sport/src/format.js
+++ b/apps/sport/src/format.js
@@ -1,3 +1,4 @@
+import { formatDate } from "./generated/dateFormat";
 // Day 1 = الأحد … 7 = السبت, like Lesson.date.day on the server.
 export const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

@@ -14,7 +15,7 @@ export function lessonTime({ day, startMin, endMin }) {
 export function historyLabel({ date, status }) {
   const [y, m, d] = String(date).split("-").map(Number);
   const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
-  return `${DAY_NAMES[weekday]} ${d}/${m} · ${status}`;
+  return `${DAY_NAMES[weekday]} ${formatDate(date)} · ${status}`;
 }

 export function attendanceLabel(value) {
@@ -53,8 +54,4 @@ export function lessonDays(lessons) {
 }

 // "2015-05-10" -> «10/05/2015».
-export function birthDateLabel(iso) {
-  if (!iso) return "—";
-  const [y, m, d] = String(iso).split("-");
-  return y && m && d ? `${d}/${m}/${y}` : "—";
-}
+export function birthDateLabel(iso) { return formatDate(iso); }
diff --git a/apps/sport/src/format.test.js b/apps/sport/src/format.test.js
index 040c296..a2014f0 100644
--- a/apps/sport/src/format.test.js
+++ b/apps/sport/src/format.test.js
@@ -22,10 +22,10 @@ describe("lessonTime", () => {

 describe("historyLabel", () => {
   it("shows the weekday, day/month and status", () => {
-    expect(historyLabel({ date: "2026-10-25", status: "حاضر" })).toBe("الأحد 25/10 · حاضر");
+    expect(historyLabel({ date: "2026-10-25", status: "حاضر" })).toBe("الأحد 25/10/2026 · حاضر");
   });
   it("works for a Saturday", () => {
-    expect(historyLabel({ date: "2026-10-31", status: "غائب" })).toBe("السبت 31/10 · غائب");
+    expect(historyLabel({ date: "2026-10-31", status: "غائب" })).toBe("السبت 31/10/2026 · غائب");
   });
 });

diff --git a/apps/system/package.json b/apps/system/package.json
index f85b9fc..c7b0779 100644
--- a/apps/system/package.json
+++ b/apps/system/package.json
@@ -38,9 +38,9 @@
     "start": "react-scripts start",
     "build": "react-scripts build",
     "test": "react-scripts test --watchAll=false --runInBand",
-    "prestart": "node ../../scripts/syncPermissions.js",
-    "pretest": "node ../../scripts/syncPermissions.js",
-    "prebuild": "node ../../scripts/syncPermissions.js"
+    "prestart": "node ../../scripts/syncShared.js",
+    "pretest": "node ../../scripts/syncShared.js",
+    "prebuild": "node ../../scripts/syncShared.js"
   },
   "jest": {
     "moduleNameMapper": {
diff --git a/apps/system/src/Components/Files/FilesPage.jsx b/apps/system/src/Components/Files/FilesPage.jsx
index e43bdb5..110c4b1 100644
--- a/apps/system/src/Components/Files/FilesPage.jsx
+++ b/apps/system/src/Components/Files/FilesPage.jsx
@@ -1,3 +1,4 @@
+import { formatDateTime as displayDateTime } from "../../generated/dateFormat";
 import RequiredMark from "../UI/RequiredMark";
 import { useEffect, useMemo, useRef, useState } from "react";
 import styles from "./FilesPage.module.css";
@@ -46,18 +47,7 @@ const formatBytes = (bytes) => {
   return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unit]}`;
 };

-const formatDate = (value, locale = "ar") => {
-  if (!value) return "-";
-  const date = new Date(value);
-  if (Number.isNaN(date.getTime())) return "-";
-  return date.toLocaleString(locale, {
-    year: "numeric",
-    month: "numeric",
-    day: "numeric",
-    hour: "2-digit",
-    minute: "2-digit",
-  });
-};
+const formatDate = (value) => displayDateTime(value, "-");

 const getExtension = (name = "") => {
   const parts = String(name).split(".");
@@ -240,6 +230,8 @@ export default function FilesPage() {

   const [items, setItems] = useState([]);
   const [currentPath, setCurrentPath] = useState("");
+  const [viewMode, setViewMode] = useState(() => { try { return localStorage.getItem("files.view") === "grid" ? "grid" : "list"; } catch { return "list"; } });
+  const [sortBy, setSortBy] = useState("name"), [fileKind, setFileKind] = useState("all");
   const [query, setQuery] = useState("");
   const [loading, setLoading] = useState(false);
   const [uploading, setUploading] = useState(false);
@@ -408,14 +400,13 @@ export default function FilesPage() {

   const filteredItems = useMemo(() => {
     const q = query.trim().toLowerCase();
-    if (!q) return items;

-    return items.filter((file) =>
+    return items.filter((file) => (fileKind === "all" || (fileKind === "folders" ? file.isDirectory : !file.isDirectory))).filter((file) =>
       String(`${file.displayName || ""} ${file.name || ""} ${file.filename || ""} ${file.ownerName || ""}`)
         .toLowerCase()
         .includes(q)
     );
-  }, [items, query]);
+  }, [items, query, fileKind]);

   const visibleFolders = useMemo(
     () =>
@@ -438,8 +429,8 @@ export default function FilesPage() {
   );

   const explorerItems = useMemo(
-    () => [...visibleFolders, ...visibleFiles],
-    [visibleFolders, visibleFiles]
+    () => [...visibleFolders, ...visibleFiles].sort((a, b) => Number(Boolean(b.isDirectory)) - Number(Boolean(a.isDirectory)) || (sortBy === "date" ? new Date(b.date || 0) - new Date(a.date || 0) : sortBy === "size" ? Number(b.size || 0) - Number(a.size || 0) : getDisplayName(a).localeCompare(getDisplayName(b), "ar", { numeric: true }))),
+    [visibleFolders, visibleFiles, sortBy]
   );

   const folderCount = items.filter((file) => file.isDirectory).length;
@@ -1023,6 +1014,9 @@ export default function FilesPage() {
         )}

         <div className={styles.searchRow} data-tour="files-search">
+          <label>النوع<select aria-label="نوع الملفات" value={fileKind} onChange={(event) => setFileKind(event.target.value)}><option value="all">الكل</option><option value="folders">المجلدات</option><option value="files">الملفات</option></select></label>
+          <label>الترتيب<select aria-label="ترتيب الملفات" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="name">الاسم</option><option value="date">الأحدث</option><option value="size">الحجم</option></select></label>
+          <div role="group" aria-label="طريقة عرض الملفات">{["list", "grid"].map((mode) => <button key={mode} type="button" aria-pressed={viewMode === mode} onClick={() => { setViewMode(mode); try { localStorage.setItem("files.view", mode); } catch {} }}>{mode === "list" ? "☷ قائمة" : "▦ شبكة"}</button>)}</div>
           <input
             className={styles.searchInput}
             value={query}
@@ -1041,7 +1035,7 @@ export default function FilesPage() {
         )}

         {!isInitialLoading && !!filteredItems.length && (
-          <div className={styles.cardsGrid} data-tour="files-items" data-label={t("files.foldersAndFiles")}>
+          <div className={`${styles.cardsGrid} ${viewMode === "list" ? styles.listView : ""}`} data-tour="files-items" data-label={t("files.foldersAndFiles")} role="list" aria-label="الملفات والمجلدات">
             {explorerItems.map((file) => {
               const displayName = getDisplayName(file);
               const type = getType(file);
@@ -1059,6 +1053,7 @@ export default function FilesPage() {
                 <article
                   key={getItemKey(file)}
                   className={`${styles.fileCard} ${file.isDirectory ? styles.folderCard : styles.documentCard} ${pending ? styles.pendingCard : ""}`}
+                  role="listitem"
                   onMouseDown={(event) => {
                     if (event.button === 2) {
                       openContextMenu(event, file);
@@ -1113,7 +1108,7 @@ export default function FilesPage() {
                     <span>{formatBytes(file.size)}</span>
                   </div>

-                  <div className={styles.cardDate}>{formatDate(file.date)}</div>
+                  <div className={styles.cardDate}><time dir="ltr">{formatDate(file.date)}</time></div>

                   <div className={styles.cardActions}>
                     <button disabled={Boolean(pending)} onClick={() => (file.isDirectory ? openFolder(file) : openFile(file))}>
diff --git a/apps/system/src/Components/Files/FilesPage.module.css b/apps/system/src/Components/Files/FilesPage.module.css
index 79bd259..7b39a33 100644
--- a/apps/system/src/Components/Files/FilesPage.module.css
+++ b/apps/system/src/Components/Files/FilesPage.module.css
@@ -941,3 +941,23 @@
     grid-template-columns: 1fr;
   }
 }
+
+.listView { display: flex; flex-direction: column; gap: 0; padding: 0; overflow-x: auto; }
+.listView .fileCard { display: grid; grid-template-columns: minmax(180px, 2fr) minmax(100px, 1fr) 150px minmax(230px, auto) 36px; grid-template-areas: "name owner date actions menu"; align-items: center; min-width: 850px; min-height: 64px; border: 0; border-bottom: 1px solid #e3e9f0; border-radius: 0; box-shadow: none; gap: 10px; }
+.listView .cardTop { grid-area: menu; }
+.listView .cardTop .fileBadge { display: none; }
+.listView .cardTitle { grid-area: name; text-align: start; }
+.listView .cardOwner { grid-area: owner; }
+.listView .cardDate { grid-area: date; }
+.listView .cardActions { grid-area: actions; }
+.listView .cardMeta { display: none; }
+.listView .inlineProgress { grid-column: 1 / -1; }
+.searchRow { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; }
+.searchRow label { display: grid; gap: 4px; min-width: 120px; }
+.searchRow .searchInput { flex: 1; min-width: 180px; }
+.searchRow select, .searchRow button { min-height: 40px; border: 1px solid #ccd9e1; border-radius: 8px; background: white; padding: 8px 12px; }
+.searchRow button[aria-pressed="true"] { background: #e1f0f6; color: #175971; border-color: #2a7794; }
+@media(max-width: 768px) {
+  .listView .fileCard { min-width: 0; grid-template-columns: minmax(0, 1fr) 36px; grid-template-areas: "name menu" "owner owner" "date date" "actions actions"; padding: 12px; }
+  .searchRow label { flex: 1; min-width: 100px; }
+}
diff --git a/apps/system/src/Components/Files/FilesPage.test.js b/apps/system/src/Components/Files/FilesPage.test.js
index 0762377..2f456aa 100644
--- a/apps/system/src/Components/Files/FilesPage.test.js
+++ b/apps/system/src/Components/Files/FilesPage.test.js
@@ -72,6 +72,25 @@ afterEach(async () => {

 const byTour = (name) => container.querySelector(`[data-tour="${name}"]`);

+test("file explorer filters and sorts actual entries while list/grid changes preserve them", async () => {
+  Storage.getStorageEntries.mockResolvedValue({ items: [
+    { name: "B.pdf", path: "Storages/B.pdf", size: 200, ownerName: "فريق", date: "2026-11-07", isDirectory: false },
+    { name: "A.txt", path: "Storages/A.txt", size: 10, ownerName: "النظام", date: "2026-11-06", isDirectory: false },
+    { name: "Folder", path: "Storages/Folder", isDirectory: true },
+  ] });
+  await act(async () => byTour("files-refresh").click());
+  const entries = () => [...byTour("files-items").querySelectorAll('[role="listitem"]')];
+  expect(entries()).toHaveLength(3); expect(entries()[0].textContent).toContain("Folder");
+  const select = async (label, value) => act(async () => { const el = container.querySelector(`[aria-label="${label}"]`); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, value); el.dispatchEvent(new Event("change", { bubbles: true })); });
+  await select("نوع الملفات", "files"); expect(entries()).toHaveLength(2);
+  await select("ترتيب الملفات", "size"); expect(entries()[0].textContent).toContain("B.pdf");
+  const grid = [...container.querySelectorAll("button")].find((el) => el.textContent.includes("شبكة"));
+  await act(async () => grid.click()); expect(grid.getAttribute("aria-pressed")).toBe("true"); expect(entries()).toHaveLength(2);
+  const search = byTour("files-search").querySelector("input");
+  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(search, "النظام"); search.dispatchEvent(new Event("input", { bubbles: true })); });
+  expect(entries()).toHaveLength(1); expect(entries()[0].textContent).toContain("A.txt");
+});
+
 test("in training mode the upload button uploads the demo file and never reaches the file picker", async () => {
   startDemo();
   const input = byTour("files-upload").querySelector('input[type="file"]');
diff --git a/apps/system/src/Components/Header/Header.test.js b/apps/system/src/Components/Header/Header.test.js
index b68586d..9a1cd86 100644
--- a/apps/system/src/Components/Header/Header.test.js
+++ b/apps/system/src/Components/Header/Header.test.js
@@ -131,12 +131,15 @@ test("association rules is a separate permission-gated navigation destination",
   await mount();
   expect(host.querySelector('#main-nav a[href="/association-rules"]').textContent).toBe("قوانين الجمعية");
 });
-test("desktop pages are direct links, mark the active page and keep phone groups after resizing", async () => {
+test("desktop groups open on click, mark the active page and preserve phone accordion behavior", async () => {
   await mount();
   expect(host.querySelector('#main-nav a').textContent).toBe("الرئيسي");
   expect(host.querySelector('#main-nav a[href="/lessons"]').getAttribute("aria-current")).toBe("page");
-  expect(host.querySelectorAll('#main-nav button')).toHaveLength(0);
+  expect(host.querySelectorAll('#main-nav button').length).toBeGreaterThan(0);
+  expect(host.querySelector('#main-nav a[href="/weekly-tasks"]').closest('[hidden]')).not.toBeNull();
+  await act(async () => groupButton("العمل اليومي").click());
   expect(host.querySelector('#main-nav a[href="/weekly-tasks"]').closest('[hidden]')).toBeNull();
+  await act(async () => groupButton("الأعضاء والطاقم").click());
   await act(async () => host.querySelector('#main-nav a[href="/students"]').click());
   expect(at()).toBe("/students");
   expect(host.querySelector('#main-nav a[href="/students"]').getAttribute("aria-current")).toBe("page");
@@ -147,7 +150,7 @@ test("desktop pages are direct links, mark the active page and keep phone groups
   window.innerWidth = 1280;
   await act(async () => window.dispatchEvent(new Event("resize")));
   expect(host.querySelector('[role="dialog"]')).toBeNull();
-  expect(host.querySelectorAll('#main-nav button')).toHaveLength(0);
+  expect(host.querySelectorAll('#main-nav button').length).toBeGreaterThan(0);
   expect(document.body.style.overflow).not.toBe("hidden");
 });
 test("phone dropdown expands groups, closes after navigation and returns focus to its toggle", async () => {
diff --git a/apps/system/src/Components/Header/NavigationMenu.jsx b/apps/system/src/Components/Header/NavigationMenu.jsx
index 5291449..5d45a25 100644
--- a/apps/system/src/Components/Header/NavigationMenu.jsx
+++ b/apps/system/src/Components/Header/NavigationMenu.jsx
@@ -73,8 +73,7 @@ export default function NavigationMenu({ groups, program, home, mobile, open, on
       <nav id="main-nav" data-tour="menu" aria-label="التنقل الرئيسي" className={styles.nav}>
         {home && <div className={styles.shortcut}>{link(home)}</div>}
         {program && <div className={styles.shortcut}>{link(program)}</div>}
-        {!mobile && groups.flatMap((group) => group.items).map(link)}
-        {mobile && groups.map((group) => <div key={group.id} className={styles.group}>
+        {groups.map((group) => <div key={group.id} className={styles.group}>
           <button ref={(element) => { triggers.current[group.id] = element; }} type="button"
             className={styles.groupButton} data-active={group.id === activeGroup}
             aria-expanded={expanded === group.id} aria-controls={`nav-group-${group.id}`}
diff --git a/apps/system/src/Components/Header/NavigationMenu.module.css b/apps/system/src/Components/Header/NavigationMenu.module.css
index 1606f46..0c96018 100644
--- a/apps/system/src/Components/Header/NavigationMenu.module.css
+++ b/apps/system/src/Components/Header/NavigationMenu.module.css
@@ -6,7 +6,7 @@
 .group { position: relative; }
 .groupButton, .shortcut a { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; padding: 9px 16px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--color-text-on-primary); font: inherit; text-decoration: none; cursor: pointer; }
 .groupButton:hover, .groupButton[aria-expanded="true"], .groupButton[data-active="true"], .shortcut a[aria-current="page"] { background: var(--color-primary-500); }
-.panel { position: absolute; inset-inline-start: 0; top: calc(100% + 5px); min-width: 200px; padding: 6px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: var(--shadow-lg); }
+.panel { position: absolute; inset-inline-start: 0; top: calc(100% + 5px); min-width: 200px; max-width: min(320px, calc(100vw - 24px)); max-height: min(420px, 65vh); overflow-y: auto; padding: 6px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: var(--shadow-lg); }
 .panel a { display: flex; gap: 8px; align-items: center; min-height: 44px; padding: 10px 12px; border-radius: var(--radius-md); color: var(--color-text-primary); text-decoration: none; }
 .panel a:hover, .panel a[aria-current="page"] { background: var(--color-primary-100); color: var(--color-primary-700); }
 .nav a:focus-visible, .nav button:focus-visible, .menuHeading button:focus-visible { outline: 2px solid var(--color-accent-500); outline-offset: 2px; }
diff --git a/apps/system/src/Components/Notice/Notice.module.css b/apps/system/src/Components/Notice/Notice.module.css
index fc388e4..b5598fa 100644
--- a/apps/system/src/Components/Notice/Notice.module.css
+++ b/apps/system/src/Components/Notice/Notice.module.css
@@ -13,7 +13,7 @@
 .badge { position: absolute; top: -2px; inset-inline-end: -2px; min-width: 18px; padding: 0 4px; border-radius: 9px; background: #c62828; color: #fff; font-size: 0.7rem; line-height: 18px; }

 /* The bell's window */
-.bellWrap { position: relative; display: inline-flex; }
+.bellWrap { position: relative; display: inline-flex; z-index: 1400; }
 .bellPanel { position: absolute; top: calc(100% + 6px); inset-inline-start: 0; z-index: 1000; width: min(320px, calc(100vw - 24px)); display: grid; gap: 6px; padding: 10px; background: #fff; color: #1f2933; border: 1px solid #d7dee5; border-radius: 10px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18); text-align: start; }
 .bellTitle { font-size: 0.95rem; }
 .bellEmpty { margin: 4px 0; color: #5a6570; font-size: 0.9rem; }
diff --git a/apps/system/src/Components/Notice/NoticeBell.jsx b/apps/system/src/Components/Notice/NoticeBell.jsx
index fbd61cc..d15b33a 100644
--- a/apps/system/src/Components/Notice/NoticeBell.jsx
+++ b/apps/system/src/Components/Notice/NoticeBell.jsx
@@ -141,7 +141,7 @@ export default function NoticeBell({ canViewNotices = false }) {
           {shown.map((item) => (
             <button key={item.key} type="button" className={`${styles.bellItem} ${item.read ? "" : styles.bellUnread}`} onClick={() => openItem(item)}>
               <span dir="auto">{item.text}</span>
-              <small>{alertTime(item.at)}</small>
+              <small><time dir="ltr">{alertTime(item.at)}</time></small>
             </button>
           ))}
           {canViewNotices && (
diff --git a/apps/system/src/Components/Notice/NoticesBoard.jsx b/apps/system/src/Components/Notice/NoticesBoard.jsx
index 57ec54e..38e3801 100644
--- a/apps/system/src/Components/Notice/NoticesBoard.jsx
+++ b/apps/system/src/Components/Notice/NoticesBoard.jsx
@@ -1,9 +1,10 @@
+import { formatDate, formatDateTime } from "../../generated/dateFormat";
 import { canStored } from "../../utils/session";
 import RequiredMark from "../UI/RequiredMark";
 import React, { useCallback, useEffect, useState } from "react";
 import { useNavigate } from "react-router-dom";
 import {
-  archiveNotice, createNotice, getNotices, markAllNoticesRead, markNoticeRead, runVehicleCheck,
+  archiveNotice, changeNoticeState, createNotice, getNotices, markAllNoticesRead, markNoticeRead, runVehicleCheck,
 } from "../../WebServer/services/notice/functionsNotice.jsx";
 import { useI18n } from "../../i18n/I18nContext";
 import { toast } from "../../ALERT/SystemToasts";
@@ -92,6 +93,9 @@ export default function NoticesBoard() {
       </header>

       <SystemAlerts />
+      <div role="tablist" aria-label="مجلدات الإعلانات" className={styles.actions}>
+        {[ ["all", "الوارد"], ["archived", "المؤرشف"], ["deleted", "المحذوفات"] ].map(([value, label]) => <Button key={value} role="tab" aria-selected={value === filters.status || (value === "all" && filters.status === "unread")} variant={value === filters.status ? "primary" : "secondary"} onClick={() => setFilters((old) => ({ ...old, status: value }))}>{label}</Button>)}
+      </div>

       <div className={styles.filters} data-tour="notices-filters">
         <FilterDialog
@@ -102,6 +106,7 @@ export default function NoticesBoard() {
             <select value={filters.status} onChange={setFilter("status")}>
               <option value="all">{t("notices.filters.all")}</option>
               <option value="unread">{t("notices.filters.unread")}</option>
+              <option value="archived">المؤرشف</option><option value="deleted">المحذوفات</option>
             </select>
           </label>
           <label>{t("notices.filters.category")}
@@ -138,15 +143,18 @@ export default function NoticesBoard() {
                   <td>
                     <button type="button" className={styles.linkButton} onClick={() => open(n)}>{n.title}</button>
                     {n.body && <div className={styles.body}>{n.body}</div>}
-                    {n.endDate && <div className={styles.body}>{t("notices.endsOn").replace("{date}", n.endDate)}</div>}
+                    {n.endDate && <div className={styles.body}>{t("notices.endsOn").replace("{date}", formatDate(n.endDate))}</div>}
                   </td>
                   <td>{t(`notices.category.${n.category}`)}</td>
-                  <td>{new Date(n.createdAt).toLocaleString("ar")}</td>
+                  <td>{<time dir="ltr">{formatDateTime(n.createdAt)}</time>}</td>
                   <td>{n.createdBy === "system" ? t("notices.system") : n.createdByName}</td>
                   <td>{n.read ? t("notices.read") : <strong>{t("notices.unread")}</strong>}</td>
                   <td className={styles.rowActions}>
                     {!n.read && <Button size="sm" variant="secondary" onClick={() => act(`r${n._id}`, () => markNoticeRead(n._id))}>{t("notices.markRead")}</Button>}
-                    {canStored("notices.archive") && <Button size="sm" variant="secondary" data-tour="notices-archive" onClick={() => archive(n)}>{t("notices.archive")}</Button>}
+                    {n.category === "manual" && !n.archivedAt && !n.deletedAt && canStored("notices.archive") && <Button size="sm" variant="secondary" data-tour="notices-archive" onClick={() => archive(n)}>{t("notices.archive")}</Button>}
+                    {n.category === "manual" && !n.deletedAt && canStored("notices.delete") && <Button size="sm" variant="secondary" onClick={async () => { if (await ask("change", { title: "نقل إلى المحذوفات", message: "سيُنقل الإعلان إلى المحذوفات للجميع، ويمكن استعادته. هل تريد المتابعة؟" }).catch(() => false)) act(`d${n._id}`, () => changeNoticeState(n._id, "delete")); }}>حذف للجميع</Button>}
+                    {(n.archivedAt || n.deletedAt) && canStored("notices.restore") && <Button size="sm" onClick={() => act(`s${n._id}`, () => changeNoticeState(n._id, "restore"))}>استعادة الإعلان</Button>}
+                    {canStored("alerts.dismiss") && <Button size="sm" variant="secondary" onClick={() => act(`h${n._id}`, () => changeNoticeState(n._id, n.hiddenForMe ? "unhide" : "hide"))}>{n.hiddenForMe ? "إعادة إلى قائمتي" : "حذف من قائمتي"}</Button>}
                   </td>
                 </tr>
               ))}
diff --git a/apps/system/src/Components/Notice/NoticesBoard.test.js b/apps/system/src/Components/Notice/NoticesBoard.test.js
index a553676..8a94240 100644
--- a/apps/system/src/Components/Notice/NoticesBoard.test.js
+++ b/apps/system/src/Components/Notice/NoticesBoard.test.js
@@ -16,7 +16,7 @@ jest.mock("react-router-dom", () => {
 // Owner, 2026-11-02: a notice may get an end date when it is posted; the
 // board shows it.
 jest.mock("../../WebServer/services/notice/functionsNotice.jsx", () => ({
-  archiveNotice: jest.fn(), createNotice: jest.fn(), getNotices: jest.fn(),
+  archiveNotice: jest.fn(), changeNoticeState: jest.fn(), createNotice: jest.fn(), getNotices: jest.fn(),
   markAllNoticesRead: jest.fn(), markNoticeRead: jest.fn(), runVehicleCheck: jest.fn(),
 }));
 jest.mock("../../ALERT/SystemToasts", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
@@ -59,5 +59,5 @@ test("the end date chosen is sent with the notice", async () => {

 test("a notice with an end date shows it", async () => {
   await mount();
-  expect(host.textContent).toContain("2026-11-20");
+  expect(host.textContent).toContain("20/11/2026");
 });
diff --git a/apps/system/src/Components/Notice/SystemAlerts.jsx b/apps/system/src/Components/Notice/SystemAlerts.jsx
index 7fac164..6b827ab 100644
--- a/apps/system/src/Components/Notice/SystemAlerts.jsx
+++ b/apps/system/src/Components/Notice/SystemAlerts.jsx
@@ -1,14 +1,16 @@
 import React, { useCallback, useEffect, useRef, useState } from "react";
 import { useNavigate } from "react-router-dom";
-import { getAlertPage, markAlertRead } from "../../WebServer/services/alerts/functionsAlerts.jsx";
+import { dismissAlert, getAlertPage, markAlertRead } from "../../WebServer/services/alerts/functionsAlerts.jsx";
 import { liveEvents } from "../../WebServer/services/live/liveStream";
-import { getNotices, markNoticeRead } from "../../WebServer/services/notice/functionsNotice.jsx";
+import { changeNoticeState, getNotices, markNoticeRead } from "../../WebServer/services/notice/functionsNotice.jsx";
+import { canStored } from "../../utils/session";
 import useLiveRefresh from "../../locks/useLiveRefresh";
 import { alertTarget, alertText, alertTime, normalizeAlert } from "../../utils/alertDisplay";
 import styles from "./Notice.module.css";

 // The signed-in user's system alerts on the board, past the three the bell shows.
 export default function SystemAlerts({ title = "رسائل النظام", showEmpty = false, includeNotices = false }) {
+  const [trash, setTrash] = useState(false);
   const navigate = useNavigate();
   const [alerts, setAlerts] = useState([]);
   const [total, setTotal] = useState(0);
@@ -28,8 +30,8 @@ export default function SystemAlerts({ title = "رسائل النظام", showEm
     setLoading(true); setError("");
     try {
       const [page, board] = await Promise.all([
-        getAlertPage(skip),
-        includeNotices ? getNotices({ status: "all", skip: noticeSkip }) : Promise.resolve({ ok: true, notices: [] }),
+        getAlertPage(skip, trash ? "deleted" : "active"),
+        includeNotices ? getNotices({ status: trash ? "deleted" : "all", skip: noticeSkip, ...(trash ? { personal: 1 } : {}) }) : Promise.resolve({ ok: true, notices: [] }),
       ]);
       if (request !== generation.current) return;
       if (!board.ok) throw new Error("Notices unavailable");
@@ -46,7 +48,7 @@ export default function SystemAlerts({ title = "رسائل النظام", showEm
     } finally {
       if (request === generation.current) { pending.current = false; setLoading(false); }
     }
-  }, [includeNotices]);
+  }, [includeNotices, trash]);
   useLiveRefresh(["notice"], () => load(0));
   useEffect(() => {
     const refresh = () => load(0);
@@ -57,7 +59,7 @@ export default function SystemAlerts({ title = "رسائل النظام", showEm
   }, [load]);

   const items = [...alerts, ...(includeNotices ? notices : [])].sort((a, b) => new Date(b.at) - new Date(a.at));
-  if (!showEmpty && !items.length && !error && !loading) return null;
+  if (!showEmpty && !items.length && !error && !loading && !trash && !canStored("alerts.dismiss")) return null;

   const open = async (alert) => {
     if (!alert.read) {
@@ -75,6 +77,7 @@ export default function SystemAlerts({ title = "رسائل النظام", showEm
   return (
     <section className={styles.systemAlerts} aria-label={title}>
       <h2>{title}</h2>
+      {canStored("alerts.dismiss") && <button type="button" onClick={() => setTrash((old) => !old)}>{trash ? "العودة للتنبيهات" : "المحذوفة من تنبيهاتي"}</button>}
       {error && <p role="alert">{error}<button type="button" onClick={() => load(0)}>إعادة المحاولة</button></p>}
       {!loading && !error && !items.length && <p>لا توجد إشعارات.</p>}
       <ul aria-label="قائمة الإشعارات" tabIndex={0}>
@@ -82,8 +85,15 @@ export default function SystemAlerts({ title = "رسائل النظام", showEm
           <li key={`${alert.kind || "alert"}:${alert.id}`}>
             <button type="button" className={`${styles.bellItem} ${alert.read ? "" : styles.bellUnread}`} onClick={() => open(alert)}>
               <span dir="auto">{alertText(alert)}</span>
-              <small>{alertTime(alert.at)}</small>
+              <small><time dir="ltr">{alertTime(alert.at)}</time></small>
             </button>
+            {canStored("alerts.dismiss") && <button type="button" onClick={async () => {
+              try {
+                if (alert.kind === "notice") { const res = await changeNoticeState(alert.id, trash ? "unhide" : "hide"); if (!res.ok) throw new Error(); }
+                else await dismissAlert(alert.id, !trash);
+                window.dispatchEvent(new Event("NOTICES_CHANGED")); await load(0);
+              } catch { setError("تعذّر تنفيذ العملية. حاول مرة أخرى."); }
+            }}>{trash ? "استعادة التنبيه" : "حذف من قائمتي"}</button>}
           </li>
         ))}
         {(offset < total || moreNotices) && <li><button type="button" disabled={loading} onClick={() => load(offset, noticeOffset, true)}>عرض إشعارات أقدم</button></li>}
diff --git a/apps/system/src/Components/Notice/SystemAlerts.test.js b/apps/system/src/Components/Notice/SystemAlerts.test.js
index 4b7632c..3da85c7 100644
--- a/apps/system/src/Components/Notice/SystemAlerts.test.js
+++ b/apps/system/src/Components/Notice/SystemAlerts.test.js
@@ -2,28 +2,41 @@ import React, { act } from "react";
 import { createRoot } from "react-dom/client";
 const mockNavigate = jest.fn();
 jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));
-jest.mock("../../WebServer/services/alerts/functionsAlerts.jsx", () => ({ getAlertPage: jest.fn(), markAlertRead: jest.fn() }));
+jest.mock("../../WebServer/services/alerts/functionsAlerts.jsx", () => ({ getAlertPage: jest.fn(), markAlertRead: jest.fn(), dismissAlert: jest.fn() }));
+jest.mock("../../utils/session", () => ({ canStored: jest.fn(() => false) }));
 jest.mock("../../WebServer/services/live/liveStream", () => ({ liveEvents: { on: () => () => {} } }));
 jest.mock("../../WebServer/services/notice/functionsNotice.jsx", () => ({ getNotices: jest.fn(), markNoticeRead: jest.fn() }));
 import { getNotices, markNoticeRead } from "../../WebServer/services/notice/functionsNotice.jsx";
-import { getAlertPage, markAlertRead } from "../../WebServer/services/alerts/functionsAlerts.jsx";
+import { getAlertPage, markAlertRead, dismissAlert } from "../../WebServer/services/alerts/functionsAlerts.jsx";
+import { canStored } from "../../utils/session";
 import SystemAlerts from "./SystemAlerts";
 globalThis.IS_REACT_ACT_ENVIRONMENT = true;
 let host, root;
 const row = (n) => ({ id: String(n), text: { ar: `تنبيه ${n}` }, at: "2026-11-07T10:00:00Z", link: "/weekly-tasks", read: false });
 beforeEach(() => {
+  canStored.mockReturnValue(false);
   getAlertPage.mockImplementation(async (skip) => ({ alerts: skip ? [row(51)] : Array.from({ length: 50 }, (_, n) => row(n + 1)), total: 51 }));
   markAlertRead.mockResolvedValue();
   getNotices.mockResolvedValue({ ok: true, notices: [] });
   markNoticeRead.mockResolvedValue({ ok: true });
   host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
 });
+test("personal trash remains reachable from an empty inbox and restores its item", async () => {
+  canStored.mockReturnValue(true); dismissAlert.mockResolvedValue({ ok: true });
+  getAlertPage.mockImplementation(async (skip, status) => ({ alerts: status === "deleted" ? [row(1)] : [], total: status === "deleted" ? 1 : 0 }));
+  await act(async () => root.render(<SystemAlerts />));
+  const button = (text) => [...host.querySelectorAll("button")].find((b) => b.textContent === text);
+  await act(async () => button("المحذوفة من تنبيهاتي").click());
+  expect(getAlertPage).toHaveBeenLastCalledWith(0, "deleted");
+  await act(async () => button("استعادة التنبيه").click());
+  expect(dismissAlert).toHaveBeenCalledWith("1", false);
+});
 afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
 test("home can browse beyond fifty personal notifications and open an older task", async () => {
   await act(async () => root.render(<SystemAlerts title="الإشعارات" showEmpty />));
   const older = () => [...host.querySelectorAll("button")].find((button) => button.textContent === "عرض إشعارات أقدم");
   await act(async () => older().click());
-  expect(getAlertPage).toHaveBeenLastCalledWith(50);
+  expect(getAlertPage).toHaveBeenLastCalledWith(50, "active");
   expect(host.querySelectorAll("li")).toHaveLength(51);
   expect(older()).toBeUndefined();
   await act(async () => [...host.querySelectorAll("li button")].find((button) => button.textContent.includes("تنبيه 51")).click());
diff --git a/apps/system/src/Components/Report/ViewAllReport.jsx b/apps/system/src/Components/Report/ViewAllReport.jsx
index 6331ce4..93cd97a 100644
--- a/apps/system/src/Components/Report/ViewAllReport.jsx
+++ b/apps/system/src/Components/Report/ViewAllReport.jsx
@@ -6,7 +6,7 @@ import { getAll as getUsers } from "../../WebServer/services/user/functionsUser.
 import { getMe } from "../../WebServer/services/auth/fuctionsAuth.jsx";
 import styles from "./Report.module.css";
 import Fabtn from "../Global/Fabtn/Fabtn.jsx";
-import { exportReportPdf } from "./ExportPDF.jsx";
+import ReportPdfAction from "./ReportPdfAction";
 import Button from "../UI/Button.jsx";
 import PersonCard, { PersonCardList } from "../UI/PersonCard.jsx";
 import { joinParts } from "../../utils/personCard";
@@ -274,9 +274,7 @@ const ViewAllReport = () => {
                 tags={report.title ?? []}
                 onOpen={() => navigate(`/reports/${report._id}`)}
                 actions={
-                  <Button size="sm" variant="secondary" onClick={() => exportReportPdf(report, report.user)}>
-                    ملف التقرير
-                  </Button>
+                  <ReportPdfAction report={report} />
                 }
               />
             ))}
@@ -319,9 +317,7 @@ const ViewAllReport = () => {
                       <Button size="sm" variant="warning" data-tour="reports-open" onClick={() => navigate(`/reports/${report._id}`)}>
                         تعديل
                       </Button>
-                      <Button size="sm" variant="secondary" data-tour="reports-pdf" onClick={() => exportReportPdf(report, report.user)}>
-                        ملف التقرير
-                      </Button>
+                      <ReportPdfAction report={report} tour="reports-pdf" />
                     </div>
                   </td>
                 </tr>
diff --git a/apps/system/src/Components/Student/ConsentView.jsx b/apps/system/src/Components/Student/ConsentView.jsx
index 4088dee..2451243 100644
--- a/apps/system/src/Components/Student/ConsentView.jsx
+++ b/apps/system/src/Components/Student/ConsentView.jsx
@@ -1,3 +1,4 @@
+import { formatDateTime } from "../../generated/dateFormat";
 import { canStored } from "../../utils/session";
 import React, { useCallback, useEffect, useRef, useState } from "react";
 import { createConsentLink, getConsent, getRules, signConsent } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
@@ -5,10 +6,7 @@ import { toast } from "../../ALERT/SystemToasts.jsx";
 import Button from "../UI/Button.jsx";
 import RegistrationConsent from "./RegistrationConsent";

-const when = (value) => {
-  const date = new Date(value);
-  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-GB");
-};
+const when = (value) => formatDateTime(value);

 export default function ConsentView({ studentId }) {
   const [state, setState] = useState({ loading: true, consent: null, rules: null });
diff --git a/apps/system/src/Components/User/EditUser.jsx b/apps/system/src/Components/User/EditUser.jsx
index 7a4a149..218895c 100644
--- a/apps/system/src/Components/User/EditUser.jsx
+++ b/apps/system/src/Components/User/EditUser.jsx
@@ -1,3 +1,4 @@
+import { formatDateTime } from "../../generated/dateFormat";
 import RequiredMark from "../UI/RequiredMark";
 import React, { useEffect, useState } from "react";
 import { useParams, useNavigate } from "react-router-dom";
@@ -504,7 +505,7 @@ const EditUser = () => {
         {isEdit && form.lockedAt && (
           <div className={tabStyles.lockRow}>
             <StatusBadge tone="danger">{t("perms.locked")}</StatusBadge>
-            <small>{fillText(t("perms.lockedSince"), { when: new Date(form.lockedAt).toLocaleString("ar", { timeZone: "Asia/Jerusalem" }) })}</small>
+            <small>{fillText(t("perms.lockedSince"), { when: formatDateTime(form.lockedAt) })}</small>
           </div>
         )}
       </fieldset>
diff --git a/apps/system/src/Components/User/PermissionsTab.jsx b/apps/system/src/Components/User/PermissionsTab.jsx
index b64c998..e4053c8 100644
--- a/apps/system/src/Components/User/PermissionsTab.jsx
+++ b/apps/system/src/Components/User/PermissionsTab.jsx
@@ -1,3 +1,4 @@
+import { formatDateTime } from "../../generated/dateFormat";
 import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
 import { getUserPermissions, saveUserPermissions } from "../../WebServer/services/user/functionsUser.jsx";
 import { useI18n } from "../../i18n/I18nContext";
@@ -107,7 +108,7 @@ export default function PermissionsTab({ tz, onSaved }) {

   const who = data.updatedBy === "system" ? t("perms.system") : data.updatedBy;
   const lastChange = data.updatedAt
-    ? fillText(t("perms.lastChange"), { who: who || "—", when: new Date(data.updatedAt).toLocaleString("ar", { timeZone: "Asia/Jerusalem" }) })
+    ? fillText(t("perms.lastChange"), { who: who || "—", when: formatDateTime(data.updatedAt) })
     : t("perms.neverChanged");
   const hasSpecial = (data.grants || []).length > 0 || (data.revokes || []).length > 0;
   const canReset = isResettable(data, grantable);
diff --git a/apps/system/src/WebServer/services/alerts/functionsAlerts.jsx b/apps/system/src/WebServer/services/alerts/functionsAlerts.jsx
index d1600dd..5219a0f 100644
--- a/apps/system/src/WebServer/services/alerts/functionsAlerts.jsx
+++ b/apps/system/src/WebServer/services/alerts/functionsAlerts.jsx
@@ -7,11 +7,12 @@ export async function listAlerts({ unread = false } = {}) {
   return Array.isArray(data?.alerts) ? data.alerts : [];
 }

-export async function getAlertPage(skip = 0) {
-  const { data } = await api.get("/alerts", { params: { skip } });
+export async function getAlertPage(skip = 0, status = "active") {
+  const { data } = await api.get("/alerts", { params: { skip, ...(status === "deleted" ? { status } : {}) } });
   if (data?.ok === false) throw new Error(data.message || "تعذّر تحميل الإشعارات");
   return { alerts: Array.isArray(data?.alerts) ? data.alerts : [], total: Number(data?.total) || 0 };
 }
+export const dismissAlert = (id, dismissed) => api.post(`/alerts/${encodeURIComponent(id)}/dismiss`, { dismissed });

 // The server's own count: it sees past the 50 a list returns.
 export async function countUnreadAlerts() {
diff --git a/apps/system/src/WebServer/services/notice/functionsNotice.jsx b/apps/system/src/WebServer/services/notice/functionsNotice.jsx
index 2b9e33f..a7499d0 100644
--- a/apps/system/src/WebServer/services/notice/functionsNotice.jsx
+++ b/apps/system/src/WebServer/services/notice/functionsNotice.jsx
@@ -19,4 +19,5 @@ export const createNotice = (payload) => call(() => api.post(namespace, payload)
 export const markNoticeRead = (id) => call(() => api.post(`${namespace}/${encodeURIComponent(id)}/read`, {}));
 export const markAllNoticesRead = () => call(() => api.post(`${namespace}/read-all`, {}));
 export const archiveNotice = (id) => call(() => api.post(`${namespace}/${encodeURIComponent(id)}/archive`, {}));
+export const changeNoticeState = (id, action) => call(() => api.post(`${namespace}/${encodeURIComponent(id)}/${encodeURIComponent(action)}`, {}));
 export const runVehicleCheck = () => call(() => api.post(`${namespace}/run-vehicle-check`, {}, { timeout: 120000 }));
diff --git a/apps/system/src/generated/permissions.json b/apps/system/src/generated/permissions.json
index c9d40db..91a7fc7 100644
--- a/apps/system/src/generated/permissions.json
+++ b/apps/system/src/generated/permissions.json
@@ -69,7 +69,9 @@
       "view",
       "post",
       "runCheck",
-      "archive"
+      "archive",
+      "delete",
+      "restore"
     ],
     "users": [
       "view",
@@ -89,7 +91,8 @@
       "manage"
     ],
     "audit": [
-      "view"
+      "view",
+      "archive"
     ],
     "systemRecovery": [
       "reset"
@@ -113,6 +116,9 @@
       "view",
       "edit",
       "link"
+    ],
+    "alerts": [
+      "dismiss"
     ]
   },
   "itKeys": [
@@ -121,7 +127,8 @@
     "users.unlock",
     "audit.view",
     "storage.drive",
-    "systemRecovery.reset"
+    "systemRecovery.reset",
+    "audit.archive"
   ],
   "hiddenModules": [
     "finance"
@@ -148,7 +155,8 @@
         "storage": "التخزين",
         "finance": "المالية",
         "rules": "قوانين الجمعية",
-        "consents": "تواقيع أولياء الأمور"
+        "consents": "تواقيع أولياء الأمور",
+        "alerts": "تنبيهاتي"
       },
       "leaves": {
         "view": "عرض",
@@ -185,7 +193,8 @@
         "createFolder": "إنشاء مجلد",
         "rename": "إعادة تسمية",
         "link": "إنشاء رابط توقيع",
-        "share": "مشاركة وإلغاء المشاركة"
+        "share": "مشاركة وإلغاء المشاركة",
+        "restore": "استعادة"
       },
       "leavesByModule": {
         "sports": {
@@ -206,6 +215,12 @@
         },
         "consents": {
           "edit": "إضافة أو تحديث التوقيع"
+        },
+        "audit": {
+          "archive": "أرشفة واستعادة السجلات"
+        },
+        "alerts": {
+          "dismiss": "إخفاء واستعادة تنبيهاتي"
         }
       }
     }
diff --git a/apps/system/src/pwa/shouldCache.js b/apps/system/src/pwa/shouldCache.js
index eab62ba..e3b2f00 100644
--- a/apps/system/src/pwa/shouldCache.js
+++ b/apps/system/src/pwa/shouldCache.js
@@ -2,6 +2,7 @@
 // GETs under /api/, and never the sign-in, code, photo or file endpoints.
 // Matching ignores case, because the server treats paths that way.
 const NEVER = [
+  /^\/api\/report\/[^/]+\/pdf(\/|$)/i,
   /^\/api\/auth(\/|$)/i,
   /^\/api\/sport-portal\/request-code(\/|$)/i,
   /^\/api\/sport-portal\/verify(\/|$)/i,
diff --git a/apps/system/src/pwa/shouldCache.test.js b/apps/system/src/pwa/shouldCache.test.js
index 103d32e..12bd2bf 100644
--- a/apps/system/src/pwa/shouldCache.test.js
+++ b/apps/system/src/pwa/shouldCache.test.js
@@ -7,6 +7,8 @@ describe("shouldCache", () => {
   ])("caches %s", (url, method) => expect(shouldCache(url, method)).toBe(true));

   test.each([
+    ["/api/report/aaaaaaaaaaaaaaaaaaaaaaaa/pdf/jobs/job/file", "GET"],
+    ["/api/report/aaaaaaaaaaaaaaaaaaaaaaaa/pdf/jobs/job", "GET"],
     ["/api/attendance/bulk-save", "POST"],
     ["/api/auth/refresh", "GET"],
     ["/api/AUTH/refresh", "GET"],
diff --git a/apps/system/src/utils/alertDisplay.js b/apps/system/src/utils/alertDisplay.js
index 8d5538e..f3ee946 100644
--- a/apps/system/src/utils/alertDisplay.js
+++ b/apps/system/src/utils/alertDisplay.js
@@ -1,3 +1,4 @@
+import { formatDateTime } from "../generated/dateFormat";
 import { isItLink } from "./siteLink";
 // Pure helpers for the assistant's alerts tab.
 // An alert: { id, type, severity, text: { ar, ... }, link, at, read }.
@@ -34,19 +35,7 @@ export const markReadLocal = (alerts, id) =>
   (Array.isArray(alerts) ? alerts : []).map((alert) =>
     !id || alert.id === id ? { ...alert, read: true } : alert);

-export const alertTime = (value) => {
-  const date = new Date(value);
-  if (Number.isNaN(date.getTime())) return "";
-  return new Intl.DateTimeFormat("ar", {
-    timeZone: "Asia/Jerusalem",
-    day: "2-digit",
-    month: "2-digit",
-    hour: "2-digit",
-    minute: "2-digit",
-    hour12: false,
-    numberingSystem: "latn",
-  }).format(date);
-};
+export const alertTime = (value) => formatDateTime(value, "");

 export const severityClass = (severity) =>
   severity === "critical" || severity === "important" ? severity : "info";
diff --git a/apps/system/src/utils/permissionKeys.test.js b/apps/system/src/utils/permissionKeys.test.js
index a6bb4e5..55ad68f 100644
--- a/apps/system/src/utils/permissionKeys.test.js
+++ b/apps/system/src/utils/permissionKeys.test.js
@@ -38,9 +38,9 @@ test("lessons has a viewAll leaf", () => {
   expect(hasPermission(["lessons.viewAll"], "lessons.viewAll")).toBe(true);
 });

-test("users has a resetPassword leaf and IT_KEYS mirrors the server's six IT keys", () => {
+test("users has a resetPassword leaf and IT_KEYS mirrors the server's IT keys", () => {
   expect(PERMISSION_TREE.users).toContain("resetPassword");
-  expect([...IT_KEYS].sort()).toEqual(["audit.view", "permissions.manage", "storage.drive",
+  expect([...IT_KEYS].sort()).toEqual(["audit.archive", "audit.view", "permissions.manage", "storage.drive",
     "systemRecovery.reset", "users.passwords", "users.unlock"]);
   for (const key of IT_KEYS) expect(ALL_KEYS).toContain(key);
 });
diff --git a/server/Entities/Alert/Alert.model.js b/server/Entities/Alert/Alert.model.js
index bd9d10c..f94b945 100644
--- a/server/Entities/Alert/Alert.model.js
+++ b/server/Entities/Alert/Alert.model.js
@@ -34,8 +34,8 @@ AlertModelDef.insertOnce = async function (doc) {

 // The recipient's alerts, newest first; total counts every match. `types`
 // (optional) limits the result to those alert types.
-AlertModelDef.listFor = async function (recipientTz, { unreadOnly = false, limit = 50, types, skip = 0 } = {}) {
-  const filter = { recipientTz };
+AlertModelDef.listFor = async function (recipientTz, { unreadOnly = false, limit = 50, types, skip = 0, dismissed = false } = {}) {
+  const filter = { recipientTz, dismissedAt: dismissed ? { $ne: null } : null };
   if (unreadOnly) filter.readAt = null;
   if (Array.isArray(types)) filter.type = { $in: types };
   const res = await api.readPage({
@@ -48,6 +48,11 @@ AlertModelDef.listFor = async function (recipientTz, { unreadOnly = false, limit
   });
   return { result: res.result, total: res.total };
 };
+AlertModelDef.dismiss = async function (recipientTz, id, dismissed) {
+  const result = await api.updateExisting({ dbName: this.dbName, collection: this.collection,
+    filter: { _id: String(id), recipientTz }, newData: { dismissedAt: dismissed ? new Date() : null } });
+  return result.result || null;
+};

 // Marks one of the recipient's own alerts read; from then it is kept 30 days
 // (a vehicle alert until the renewal). Null when it is not theirs.
diff --git a/server/Entities/Alert/Alert.route.js b/server/Entities/Alert/Alert.route.js
index 87d3972..8cfa371 100644
--- a/server/Entities/Alert/Alert.route.js
+++ b/server/Entities/Alert/Alert.route.js
@@ -1,6 +1,6 @@
 const express = require("express");
 const { requireAuth } = require("../../middleware/authMiddleware");
-const { loadActor } = require("../../middleware/permissionMiddleware");
+const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware");
 const { logWithSource } = require("../../middleware/logger");
 const { visibleAlertTypes } = require("../../services/alertAccess");

@@ -38,7 +38,7 @@ function createAlertRouter({ requireAuth, loadActor, store, now = () => new Date
       const types = visibleAlertTypes(req.actor);
       const skip = Number(req.query.skip || 0);
       if (!Number.isSafeInteger(skip) || skip < 0 || skip > 1000000) return res.status(400).json({ ok: false, message: "صفحة الإشعارات غير صالحة" });
-      const { result, total } = await store.listFor(req.actor.tz, { unreadOnly, limit: LIMIT, types, skip });
+      const { result, total } = await store.listFor(req.actor.tz, { unreadOnly, limit: LIMIT, types, skip, dismissed: req.query.status === "deleted" });
       return res.status(200).json({ ok: true, alerts: (result || []).map(view), total });
     } catch (error) {
       logWithSource("Alert.list", error);
@@ -46,6 +46,15 @@ function createAlertRouter({ requireAuth, loadActor, store, now = () => new Date
     }
   });

+  router.post("/:id/dismiss", requirePermission("alerts.dismiss"), async (req, res) => {
+    if (!OBJECT_ID.test(String(req.params.id)) || typeof req.body?.dismissed !== "boolean") return res.status(400).json({ ok: false, code: "BAD_SELECTION" });
+    try {
+      const row = await store.dismiss(req.actor.tz, req.params.id, req.body.dismissed);
+      if (!row) return res.status(404).json(NOT_FOUND);
+      return res.json({ ok: true });
+    } catch (error) { logWithSource("Alert.dismiss", error); return res.status(500).json({ ok: false, message: SERVER_ERROR }); }
+  });
+
   router.post("/read-all", async (req, res) => {
     try {
       const updated = await store.markAllRead(req.actor.tz, now());
diff --git a/server/Entities/Audit/Audit.model.js b/server/Entities/Audit/Audit.model.js
index ae27038..5653d63 100644
--- a/server/Entities/Audit/Audit.model.js
+++ b/server/Entities/Audit/Audit.model.js
@@ -7,6 +7,11 @@ const api = require("../api");
 const dbName = process.env.DB_NAME || "tamheed_db";

 const AuditModelDef = { dbName, collection: "AuditLog" };
+// Only archive metadata changes; the original evidence is never rewritten.
+AuditModelDef.archive = async function (ids, archived, actor) {
+  return api.updateMany({ dbName: this.dbName, collection: this.collection,
+    filter: { _id: { $in: ids } }, newData: { archivedAt: archived ? new Date() : null, archivedBy: archived ? actor : null } });
+};
 AuditModelDef.create = async function (data) {
   return await api.create({ dbName: this.dbName, collection: this.collection, data });
 };
diff --git a/server/Entities/Audit/Audit.route.js b/server/Entities/Audit/Audit.route.js
index eab7880..976c856 100644
--- a/server/Entities/Audit/Audit.route.js
+++ b/server/Entities/Audit/Audit.route.js
@@ -74,7 +74,8 @@ function createAuditRouter({ model, loadActor }) {
   router.get("/", requirePermission("audit.view"), async (req, res) => {
     try {
       const page = Math.min(MAX_PAGE, Math.max(1, parseInt(req.query.page, 10) || 1));
-      const { items, total } = await model.page(buildFilter(req.query), { page, pageSize: PAGE_SIZE });
+      const filter = { ...buildFilter(req.query), archivedAt: req.query.status === "archived" ? { $ne: null } : null };
+      const { items, total } = await model.page(filter, { page, pageSize: PAGE_SIZE });
       return res.status(200).json({ ok: true, items, total });
     } catch (error) {
       if (error instanceof BadDateError) return res.status(400).json({ ok: false, code: "BAD_DATE" });
@@ -83,6 +84,17 @@ function createAuditRouter({ model, loadActor }) {
     }
   });

+  router.post("/archive", requirePermission("audit.view"), requirePermission("audit.archive"), async (req, res) => {
+    const ids = req.body?.ids;
+    if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some((id) => typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id)) || typeof req.body.archived !== "boolean") {
+      return res.status(400).json({ ok: false, code: "BAD_SELECTION" });
+    }
+    try {
+      await model.archive([...new Set(ids)], req.body.archived, req.actor?.isSystem ? "system" : req.actor?.tz || "");
+      return res.json({ ok: true });
+    } catch (error) { logWithSource("Audit.archive", error); return res.status(500).json({ ok: false, message: SERVER_ERROR }); }
+  });
+
   return router;
 }

diff --git a/server/Entities/It/It.auth.js b/server/Entities/It/It.auth.js
index 7952fde..d191706 100644
--- a/server/Entities/It/It.auth.js
+++ b/server/Entities/It/It.auth.js
@@ -285,6 +285,7 @@ function createItAuth(deps = {}) {
     // hasEverydayRole: the pass routes' condition, so the site can show «النظام» without asking for a pass.
     return res.json({
       ok: true, tz, name, isSystem, photo: user?.photo || null, hasEverydayRole: Boolean(resolveRole(user)),
+      permissions: [...(req.actor.permissions || [])],
       // The site shows only «تغيير كلمة المرور» until it is changed (requireIt refuses the rest).
       mustChangePassword: Boolean(req.actor.mustChangePassword),
       // «مستخدمو IT»: the system account and the managers it named.
diff --git a/server/Entities/Notice/Notice.controller.js b/server/Entities/Notice/Notice.controller.js
index 4e0ce56..f2a344e 100644
--- a/server/Entities/Notice/Notice.controller.js
+++ b/server/Entities/Notice/Notice.controller.js
@@ -3,6 +3,7 @@ const { logWithSource } = require("../../middleware/logger.js");
 const { runVehicleExpiryCheck } = require("../../services/vehicleExpiryJob.js");
 const { audit } = require("../../utils/audit.js");
 const { actorRef, actorDisplayName } = require("../../utils/permissions.js");
+const { can } = require("../../utils/permissions.js");
 const { recipientsFor } = require("../../services/alertEngine.js");
 const { push } = require("../../utils/push.js");

@@ -42,7 +43,8 @@ const list = handle("list", async (req, res) => {
   if (!Number.isSafeInteger(skip) || skip < 0 || skip > 1000000) return fail(res, 400, "صفحة الإشعارات غير صالحة");
   const notices = await service.listNotices({
     userId: req.actor.id,
-    status: status === "unread" ? "unread" : "all",
+    status: ["unread", "archived", "deleted"].includes(status) ? status : "all",
+    canManageTrash: req.query?.personal !== "1" && (can(req.actor?.permissions, "notices.delete") || can(req.actor?.permissions, "notices.restore")),
     category: CATEGORIES.includes(category) ? category : "",
     severity: SEVERITIES.includes(severity) ? severity : "",
     skip,
@@ -113,4 +115,11 @@ const runVehicleCheck = handle("runVehicleCheck", async (req, res) => {
   return res.status(200).json({ ok: true, ...result });
 });

-module.exports = { list, unreadCount, create, read, readAll, archive, runVehicleCheck };
+const stateAction = (action) => handle(action, async (req, res) => {
+  const notice = await service.changeNoticeState(req.params.id, req.actor, action);
+  if (!notice) return fail(res, 404, "الإعلان غير موجود أو لا يمكن تنفيذ العملية عليه");
+  await audit.record(req, { module: "notices", action: "update", targetType: "notice", targetId: notice._id, targetLabel: notice.title, after: { action } });
+  return res.json({ ok: true });
+});
+module.exports = { list, unreadCount, create, read, readAll, archive, runVehicleCheck,
+  trash: stateAction("delete"), restore: stateAction("restore"), hide: stateAction("hide"), unhide: stateAction("unhide") };
diff --git a/server/Entities/Notice/Notice.model.js b/server/Entities/Notice/Notice.model.js
index 56a0efe..5d7c401 100644
--- a/server/Entities/Notice/Notice.model.js
+++ b/server/Entities/Notice/Notice.model.js
@@ -31,6 +31,12 @@ NoticeModelDef.removeExcept = async function (prefix, keepKeys = []) {
 NoticeModelDef.update = async function (filter, newData) {
   return await api.update({ dbName: this.dbName, collection: this.collection, filter, newData });
 };
+// Concurrent personal dismissals must not overwrite another reader's choice.
+NoticeModelDef.setHidden = async function (id, reader, hidden) {
+  const collection = mongoose.connection.useDb(this.dbName, { useCache: true }).collection(this.collection);
+  return collection.updateOne({ _id: new mongoose.Types.ObjectId(String(id)) },
+    hidden ? { $addToSet: { hiddenBy: String(reader) } } : { $pull: { hiddenBy: String(reader) } });
+};

 // One row per scheduled-job run: { job, date ("YYYY-MM-DD"), trigger, created, emailed, error, finishedAt }.
 // A lock row { job, date, lockKey, lockedAt (Date) } claims one run slot across
diff --git a/server/Entities/Notice/Notice.route.js b/server/Entities/Notice/Notice.route.js
index 501a5c7..8e6c0af 100644
--- a/server/Entities/Notice/Notice.route.js
+++ b/server/Entities/Notice/Notice.route.js
@@ -18,5 +18,9 @@ router.post("/run-vehicle-check", requirePermission("notices.runCheck"), checkRa
 router.post("/:id/read", requirePermission("notices.view"), controller.read);
 // Archiving removes a notice from everyone's board: independently revocable.
 router.post("/:id/archive", requirePermission("notices.archive"), controller.archive);
+router.post("/:id/delete", requirePermission("notices.view"), requirePermission("notices.delete"), controller.trash);
+router.post("/:id/restore", requirePermission("notices.view"), requirePermission("notices.restore"), controller.restore);
+router.post("/:id/hide", requirePermission("notices.view"), requirePermission("alerts.dismiss"), controller.hide);
+router.post("/:id/unhide", requirePermission("notices.view"), requirePermission("alerts.dismiss"), controller.unhide);

 module.exports = router;
diff --git a/server/Entities/Notice/Notice.service.js b/server/Entities/Notice/Notice.service.js
index 7c3e085..b9cd49c 100644
--- a/server/Entities/Notice/Notice.service.js
+++ b/server/Entities/Notice/Notice.service.js
@@ -42,13 +42,14 @@ async function existingDedupKeys(prefix = "vehicle:") {
 }

 // Who read a notice stays here: the browser needs only "did I".
-const withRead = ({ readBy, readTimes, ...row }, userId) => ({ ...row, read: (readBy || []).includes(String(userId)) });
+const withRead = ({ readBy, readTimes, hiddenBy, ...row }, userId) => ({ ...row, read: (readBy || []).includes(String(userId)), hiddenForMe: (hiddenBy || []).includes(String(userId)) });

 // Past its end date a notice is gone at once, before the TTL index deletes it.
 async function activeNotices(now = new Date()) {
   const found = await NoticeModelDef.get({});
   return (found?.result || [])
     .filter((row) => !row.archivedAt)
+    .filter((row) => !row.deletedAt)
     .filter((row) => !row.expireAt || new Date(row.expireAt) > now)
     .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
 }
@@ -63,10 +64,14 @@ function stillShown(row, userId, now) {
   return now - readAt <= READ_KEEP_MS;
 }

-async function listNotices({ userId, status = "all", category = "", severity = "", skip = 0 }) {
+async function listNotices({ userId, status = "all", category = "", severity = "", skip = 0, canManageTrash = false }) {
   const now = new Date();
-  return (await activeNotices(now))
-    .filter((row) => stillShown(row, userId, now))
+  const found = await NoticeModelDef.get({});
+  return (found?.result || [])
+    .filter((row) => !row.expireAt || new Date(row.expireAt) > now)
+    .filter((row) => status === "deleted" ? (canManageTrash && Boolean(row.deletedAt)) || (row.hiddenBy || []).includes(String(userId)) : status === "archived" ? row.archivedAt && !row.deletedAt && !(row.hiddenBy || []).includes(String(userId)) : !row.archivedAt && !row.deletedAt && !(row.hiddenBy || []).includes(String(userId)))
+    .filter((row) => status === "archived" || status === "deleted" || stillShown(row, userId, now))
+    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
     .map((row) => withRead(row, userId))
     .filter((row) => (status === "unread" ? !row.read : true))
     .filter((row) => (category ? row.category === category : true))
@@ -75,7 +80,7 @@ async function listNotices({ userId, status = "all", category = "", severity = "
 }

 async function countUnread(userId) {
-  return (await activeNotices()).filter((row) => !(row.readBy || []).includes(String(userId))).length;
+  return (await activeNotices()).filter((row) => !(row.hiddenBy || []).includes(String(userId)) && !(row.readBy || []).includes(String(userId))).length;
 }

 async function findNotice(id) {
@@ -95,19 +100,38 @@ async function markRead(id, userId) {
 }

 async function markAllRead(userId) {
-  const unread = (await activeNotices()).filter((row) => !(row.readBy || []).includes(String(userId)));
+  const unread = (await activeNotices()).filter((row) => !(row.hiddenBy || []).includes(String(userId)) && !(row.readBy || []).includes(String(userId)));
   for (const row of unread) await markRead(row._id, userId);
   return unread.length;
 }

 async function archiveNotice(id, actor) {
   const notice = await findNotice(id);
-  if (!notice || notice.archivedAt) return null;
+  if (!notice || notice.archivedAt || notice.deletedAt || notice.category !== "manual") return null;
   const patch = { archivedAt: new Date().toISOString(), archivedBy: actorRef(actor, String(actor.id)) };
   await NoticeModelDef.update({ _id: notice._id }, patch);
   return { ...notice, ...patch };
 }

+async function changeNoticeState(id, actor, action) {
+  const notice = await findNotice(id); if (!notice) return null;
+  const me = String(actor.id);
+  let patch;
+  if (action === "hide" || action === "unhide") {
+    const hidden = new Set(notice.hiddenBy || []); action === "hide" ? hidden.add(me) : hidden.delete(me);
+    patch = { hiddenBy: [...hidden] };
+    await NoticeModelDef.setHidden(notice._id, me, action === "hide");
+    return { ...notice, ...patch };
+  } else if (action === "delete") {
+    // Automatic system notices retain their source lifecycle; dismissal is personal.
+    if (notice.category !== "manual") return null;
+    patch = { deletedAt: new Date().toISOString(), deletedBy: actorRef(actor, me) };
+  } else if (action === "restore") patch = { deletedAt: null, deletedBy: null, archivedAt: null, archivedBy: null };
+  else return null;
+  await NoticeModelDef.update({ _id: notice._id }, patch);
+  return { ...notice, ...patch };
+}
+
 // Who receives board items by email: active users whose effective permissions
 // include notices.view.
 async function listNoticeRecipients() {
@@ -124,4 +148,4 @@ async function listNoticeRecipients() {
     .filter((user) => EMAIL.test(user.email) && user.email !== "test@test.com");
 }

-module.exports = { publishNotice, existingDedupKeys, listNotices, countUnread, markRead, markAllRead, archiveNotice, listNoticeRecipients };
+module.exports = { publishNotice, existingDedupKeys, listNotices, countUnread, markRead, markAllRead, archiveNotice, changeNoticeState, listNoticeRecipients };
diff --git a/server/Entities/Report/Report.route.js b/server/Entities/Report/Report.route.js
index 184f810..f8a9229 100644
--- a/server/Entities/Report/Report.route.js
+++ b/server/Entities/Report/Report.route.js
@@ -6,6 +6,9 @@ const { loadActor, requirePermission } = require("../../middleware/permissionMid
 const { requireFreeOrMine } = require("../../middleware/lockGuard.js");
 const { can } = require("../../utils/permissions.js");
 const router = express.Router();
+const { reportPdf } = require("./ReportPdf.controller");
+const { rateLimit } = require("../../middleware/rateLimit");
+const pdfLimit = rateLimit({ windowMs: 60000, max: 6, scope: "report-pdf" });

 // An edit learns who holds the report only if the caller may edit it: for an
 // editOwn-only caller someone else's report has no key here, so the controller
@@ -29,6 +32,10 @@ router.use(requireAuth, loadActor);
 const READ_KEYS = ["reports.create", "reports.editOwn", "reports.viewAll", "reports.editAll", "reports.delete", "reports.exportPdf"];
 router.get("/", requirePermission(...READ_KEYS), getAll);
 router.get("/:id", requirePermission(...READ_KEYS), getById);
+router.post("/:id/pdf/jobs", requirePermission("reports.exportPdf"), pdfLimit, reportPdf.start);
+router.get("/:id/pdf/jobs/:job", requirePermission("reports.exportPdf"), reportPdf.status);
+router.get("/:id/pdf/jobs/:job/file", requirePermission("reports.exportPdf"), reportPdf.download);
+router.delete("/:id/pdf/jobs/:job", requirePermission("reports.exportPdf"), reportPdf.cancel);
 router.post("/", requirePermission("reports.create"), post);
 router.put("/:id", requirePermission("reports.editOwn", "reports.editAll"), lockedForEdit, put);
 router.delete("/:id", requirePermission("reports.delete"), lockedReport, remove);
diff --git a/server/Entities/Storage/Storage.controller.js b/server/Entities/Storage/Storage.controller.js
index bda9800..908e89b 100644
--- a/server/Entities/Storage/Storage.controller.js
+++ b/server/Entities/Storage/Storage.controller.js
@@ -9,6 +9,7 @@ const liveBus = require("../../services/liveBus");
 const { createStorageRecipients } = require("../../services/storageRecipients");
 const { repairMisencodedText } = require("../../utils/textEncoding");
 const { can, isSystemTz, SYSTEM_ACTOR_NAME, isHiddenUser } = require("../../utils/permissions");
+const { storageOwnerLabel } = require("../../utils/storageOwnerLabel");
 const { audit } = require("../../utils/audit");

 const STORAGE_DB_NAME = process.env.DB_NAME || "tamheed_db";
@@ -683,12 +684,12 @@ const enrichItemsWithOwner = async (items = []) => {
     const itemPath = normalizeRelativePath(item?.relativePath || item?.filename || "");
     const metadata = metadataByPath.get(itemPath);
     const ownerId = String(metadata?.ownerId || "").trim();
-    const ownerName = ownerId ? userLookup.get(ownerId) || ownerId : "";
+    const ownerName = storageOwnerLabel({ ownerId, knownName: userLookup.get(ownerId), suppliedName: item.ownerName, relativePath: itemPath });

     return {
       ...item,
       ownerId,
-      ownerName: ownerName || item.ownerName || "",
+      ownerName,
     };
   });
 };
diff --git a/server/package.json b/server/package.json
index 4dcb0df..11ebc53 100644
--- a/server/package.json
+++ b/server/package.json
@@ -19,7 +19,7 @@
     "system:recover": "node scripts/systemRecover.js",
     "permissions:migrate": "node scripts/migratePermissions.js",
     "users:encrypt-plain-passwords": "node scripts/encryptPlainPasswords.js",
-    "pretest": "node ../scripts/syncPermissions.js"
+    "pretest": "node ../scripts/syncShared.js"
   },
   "keywords": [],
   "author": "",
@@ -50,7 +50,9 @@
     "nodemailer": "^10.2.0",
     "nodemon": "^3.0.2",
     "onnxruntime-node": "^1.31.1",
+    "puppeteer-core": "24.43.1",
     "qrcode": "1.5.4",
+    "sanitize-html": "2.17.7",
     "sharp": "^0.35.5",
     "web-push": "3.6.7",
     "xss-clean": "^0.1.4"
diff --git a/server/test/alert-engine.test.js b/server/test/alert-engine.test.js
index be59464..62dfa57 100644
--- a/server/test/alert-engine.test.js
+++ b/server/test/alert-engine.test.js
@@ -50,8 +50,8 @@ function alertStore() {
       docs.push(saved);
       return { created: true, alert: saved };
     },
-    async listFor(recipientTz, { unreadOnly = false, limit = 50, types, skip = 0 } = {}) {
-      const mine = docs.filter((d) => d.recipientTz === recipientTz && (!unreadOnly || !d.readAt)
+    async listFor(recipientTz, { unreadOnly = false, limit = 50, types, skip = 0, dismissed = false } = {}) {
+      const mine = docs.filter((d) => d.recipientTz === recipientTz && Boolean(d.dismissedAt) === dismissed && (!unreadOnly || !d.readAt)
         && (!Array.isArray(types) || types.includes(d.type)));
       const result = mine.sort((a, b) => new Date(b.at) - new Date(a.at) || (a._id < b._id ? 1 : -1)).slice(skip, skip + limit);
       return { result, total: mine.length };
@@ -62,6 +62,7 @@ function alertStore() {
       if (!hit.readAt) hit.readAt = at;
       return hit;
     },
+    async dismiss(recipientTz, id, dismissed) { const hit = docs.find((d) => d._id === id && d.recipientTz === recipientTz); if (!hit) return null; hit.dismissedAt = dismissed ? new Date() : null; return hit; },
     async markAllRead(recipientTz, at) {
       let n = 0;
       for (const d of docs) if (d.recipientTz === recipientTz && !d.readAt) { d.readAt = at; n += 1; }
@@ -306,6 +307,7 @@ test("the system account receives no alert of a non-system type", async () => {

 async function startInbox(store, clock = { now: Date.UTC(2026, 9, 20, 11) }) {
   const app = express();
+  app.use(express.json());
   const requireAuth = (req, res, next) => {
     const tz = req.headers["x-tz"];
     if (!tz) return res.status(401).json({ code: "NO_TOKEN" });
@@ -332,6 +334,20 @@ const seedRow = (store, recipientTz, n, extra = {}) => store.insertOnce({
   link: "/users", dedupKey: `k${n}`, readAt: null, at: new Date(Date.UTC(2026, 9, 20, 8, n)), ...extra,
 });

+test("personal trash requires dismissal grant, never edits another recipient and restores", async () => {
+  const store = alertStore(); await seedRow(store, "owner", 1); const id = store.docs[0]._id;
+  const { server, base } = await startInbox(store);
+  try {
+    const post = (tz, perms, dismissed) => fetch(`${base}/${id}/dismiss`, { method: "POST", headers: { "Content-Type": "application/json", "x-tz": tz, "x-perms": perms }, body: JSON.stringify({ dismissed }) });
+    assert.equal((await post("owner", "reports.create", true)).status, 403);
+    assert.equal((await post("other", "alerts.dismiss", true)).status, 404);
+    assert.equal((await post("owner", "alerts.dismiss", true)).status, 200);
+    const list = async (status) => (await (await fetch(`${base}?status=${status}`, { headers: { "x-tz": "owner", "x-perms": "reports.create,alerts.dismiss" } })).json()).alerts;
+    assert.equal((await list("active")).length, 0); assert.equal((await list("deleted")).length, 1);
+    assert.equal((await post("owner", "alerts.dismiss", false)).status, 200); assert.equal((await list("active")).length, 1);
+  } finally { server.close(); }
+});
+
 test("GET /api/alerts lists only the caller's alerts, newest first, at most 50; unread=1 filters", async () => {
   const store = alertStore();
   for (let n = 0; n < 55; n += 1) await seedRow(store, "t-a", n);
diff --git a/server/test/alert-model.test.js b/server/test/alert-model.test.js
index 529d579..0e94e24 100644
--- a/server/test/alert-model.test.js
+++ b/server/test/alert-model.test.js
@@ -73,12 +73,24 @@ test("older inbox pages keep recipient and current type restrictions in the data
   const { AlertModelDef, api } = loadModel();
   await AlertModelDef.listFor("caller", { skip: 50, limit: 50, types: ["report_missing"], unreadOnly: true });
   const query = api.calls[0][1];
-  assert.deepEqual(query.filter, { recipientTz: "caller", type: { $in: ["report_missing"] }, readAt: null });
+  assert.deepEqual(query.filter, { recipientTz: "caller", dismissedAt: null, type: { $in: ["report_missing"] }, readAt: null });
   assert.equal(query.skip, 50);
   assert.equal(query.limit, 50);
   assert.deepEqual(query.sort, { at: -1, _id: -1 });
 });

+test("dismiss and restore update only an existing recipient-owned alert and keep evidence", async () => {
+  const { AlertModelDef, api } = loadModel(); const id = "a".repeat(24);
+  api.rows.push({ _id: id, recipientTz: "owner", readAt: null, text: { ar: "synthetic" } });
+  assert.equal(await AlertModelDef.dismiss("other", id, true), null);
+  assert.equal(api.rows[0].dismissedAt, undefined);
+  await AlertModelDef.dismiss("owner", id, true); assert.ok(api.rows[0].dismissedAt instanceof Date);
+  await AlertModelDef.dismiss("owner", id, false); assert.equal(api.rows[0].dismissedAt, null);
+  assert.deepEqual(api.rows[0].text, { ar: "synthetic" });
+  await AlertModelDef.listFor("owner", { dismissed: true, types: ["report_missing"] });
+  assert.deepEqual(api.calls.at(-1)[1].filter, { recipientTz: "owner", dismissedAt: { $ne: null }, type: { $in: ["report_missing"] } });
+});
+
 test("read all: 30 days for ordinary rows, no limit for vehicle rows", async () => {
   const { AlertModelDef, api } = loadModel();
   const updated = await AlertModelDef.markAllRead("t1", AT);
diff --git a/server/test/audit.test.js b/server/test/audit.test.js
index f549622..671e7b7 100644
--- a/server/test/audit.test.js
+++ b/server/test/audit.test.js
@@ -87,6 +87,7 @@ function startApp({ permissions = [], rows = [] } = {}) {
   const seen = {};
   const model = {
     async page(filter, opts) { seen.filter = filter; seen.opts = opts; return { items: rows, total: rows.length }; },
+    async archive(ids, archived, actor) { seen.archive = { ids, archived, actor }; },
   };
   // Signs in and loads the actor, as requireIt does on /api/it.
   const loadActor = (req, res, next) => {
@@ -94,6 +95,7 @@ function startApp({ permissions = [], rows = [] } = {}) {
     next();
   };
   const app = express();
+  app.use(express.json());
   app.use("/api/audit", createAuditRouter({ model, loadActor }));
   const server = http.createServer(app);
   return new Promise((resolve) =>
@@ -108,6 +110,23 @@ test("GET without audit.view is 403", async () => {
   } finally { server.close(); }
 });

+test("audit archiving and recovery require their own grant and validate selections", async () => {
+  const id = "a".repeat(24);
+  for (const permissions of [["audit.view"], ["audit.view", "audit.archive"]]) {
+    const { server, base, seen } = await startApp({ permissions });
+    try {
+      const send = (body) => fetch(`${base}/archive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
+      const response = await send({ ids: [id, id], archived: true });
+      assert.equal(response.status, permissions.length === 1 ? 403 : 200);
+      if (permissions.length === 1) { assert.equal(seen.archive, undefined); continue; }
+      assert.deepEqual(seen.archive, { ids: [id], archived: true, actor: "1" });
+      assert.equal((await send({ ids: [id], archived: false })).status, 200); assert.equal(seen.archive.archived, false);
+      for (const ids of [[], ["invalid"], Array(201).fill(id)]) assert.equal((await send({ ids, archived: true })).status, 400);
+      await fetch(`${base}?status=archived`); assert.deepEqual(seen.filter.archivedAt, { $ne: null });
+    } finally { server.close(); }
+  }
+});
+
 test("GET with audit.view returns a page of 50, newest first", async () => {
   const { server, base, seen } = await startApp({ permissions: ["audit.view"], rows: [{ action: "create" }] });
   try {
diff --git a/server/test/helpers/storageController.js b/server/test/helpers/storageController.js
index 50e22ab..5781835 100644
--- a/server/test/helpers/storageController.js
+++ b/server/test/helpers/storageController.js
@@ -63,6 +63,7 @@ function loadStorageController(seed = [], { users: baseUsers = [ADMIN, OTHER], e
     "../../services/storageRecipients": require("../../services/storageRecipients"),
     "../../utils/textEncoding": require("../../utils/textEncoding"),
     "../../utils/permissions": require("../../utils/permissions"),
+    "../../utils/storageOwnerLabel": require("../../utils/storageOwnerLabel"),
     "../../utils/permissionRules": require("../../utils/permissionRules"),
     "../../utils/israeliId": require("../../utils/israeliId"),
     ...audit.deps,
diff --git a/server/test/it-api.test.js b/server/test/it-api.test.js
index 7e0b97e..6108da9 100644
--- a/server/test/it-api.test.js
+++ b/server/test/it-api.test.js
@@ -347,7 +347,7 @@ test("audit: the IT site reads today's audit query", withApp(async ({ call, audi
   const page = await call("GET", "/audit?module=users&page=2", { as: IT_A.tz });
   assert.equal(page.status, 200);
   assert.deepEqual(page.body, { ok: true, items: [{ action: "x" }], total: 1 });
-  assert.deepEqual(auditRows[0], { filter: { module: "users" }, page: 2, pageSize: 50 });
+  assert.deepEqual(auditRows[0], { filter: { module: "users", archivedAt: null }, page: 2, pageSize: 50 });
 }));

 test("storage: IT gets the Drive status and a connect URL; Google's callback stays on the everyday mount", withApp(async ({ call, audit }) => {
diff --git a/server/test/it-auth.test.js b/server/test/it-auth.test.js
index 9905b89..79249ba 100644
--- a/server/test/it-auth.test.js
+++ b/server/test/it-auth.test.js
@@ -344,7 +344,7 @@ test("requireIt builds the IT actor, and me answers from it", async () => {

   const me = res();
   await ctx.auth.me(req, me);
-  assert.deepEqual(me.body, { ok: true, tz: "100000009", name: "It One", isSystem: false, photo: "https://example.com/p.jpg", hasEverydayRole: false, mustChangePassword: false, isItManager: false });
+  assert.deepEqual(me.body, { ok: true, tz: "100000009", name: "It One", isSystem: false, photo: "https://example.com/p.jpg", permissions: [...req.actor.permissions], hasEverydayRole: false, mustChangePassword: false, isItManager: false });

   // An IT user who also has an everyday role: the same condition the pass routes use.
   const both = res();
diff --git a/server/test/it-rules.test.js b/server/test/it-rules.test.js
index a816da4..47abfb9 100644
--- a/server/test/it-rules.test.js
+++ b/server/test/it-rules.test.js
@@ -57,8 +57,8 @@ const itActor = actorOf(itDoc, { it: true });
 const systemIt = actorOf(systemDoc, { isSystem: true, it: true });
 const systemEveryday = actorOf(systemDoc, { isSystem: true });

-test("IT_KEYS has the six keys that move to the IT site", () => {
-  assert.deepEqual([...IT_KEYS].sort(), ["audit.view", "permissions.manage", "storage.drive",
+test("IT_KEYS has the IT keys that move to the IT site", () => {
+  assert.deepEqual([...IT_KEYS].sort(), ["audit.archive", "audit.view", "permissions.manage", "storage.drive",
     "systemRecovery.reset", "users.passwords", "users.unlock"]);
   assert.equal(isItUser(itDoc), true);
   assert.equal(isItUser(guide), false);
diff --git a/server/test/notice-controller.test.js b/server/test/notice-controller.test.js
index bc58204..c1f623a 100644
--- a/server/test/notice-controller.test.js
+++ b/server/test/notice-controller.test.js
@@ -54,6 +54,7 @@ function setup({ extraUsers = [], pushFails = false } = {}) {
       const doc = { _id: String(next++).padStart(24, "0"), ...structuredClone(data) }; rows.push(doc); return { result: structuredClone(doc) };
     },
     async update(filter, patch) { rows.forEach((r, i) => { if (matches(r, filter)) rows[i] = { ...r, ...structuredClone(patch) }; }); return { result: null }; },
+    async setHidden(id, reader, hidden) { const row = rows.find((r) => r._id === id); if (row) { const readers = new Set(row.hiddenBy || []); hidden ? readers.add(reader) : readers.delete(reader); row.hiddenBy = [...readers]; } },
   };
   const users = [ADMIN, GUIDE, READER, REVOKED, ...extraUsers];
   const common = {
@@ -167,7 +168,7 @@ test("publishNotice ignores a duplicate dedupKey", async () => {
 test("mark read, unread count and archive", async () => {
   const ctx = setup();
   const { service } = ctx;
-  const { notice } = await service.publishNotice({ title: "t", body: "b", category: "system", severity: "info" });
+  const { notice } = await service.publishNotice({ title: "t", body: "b", category: "manual", severity: "info" });
   assert.equal((await guarded(ctx, ADMIN, "unreadCount")).body.count, 1);
   await guarded(ctx, ADMIN, "read", { params: { id: notice._id } });
   assert.equal((await guarded(ctx, ADMIN, "unreadCount")).body.count, 0);
@@ -318,3 +319,31 @@ test("a notice read before read times were kept counts from when it was posted",
   assert.equal((await guarded(ctx, ADMIN, "list")).body.notices.length, 0);
   assert.equal((await guarded(ctx, READER, "list")).body.notices.length, 1);
 });
+
+test("manual notices archive, trash and restore while automatic notices have only personal dismissal", async () => {
+  const ctx = setup();
+  const { notice } = await ctx.service.publishNotice({ title: "Synthetic", body: "", category: "manual", severity: "info" });
+  const params = { id: notice._id };
+  assert.equal((await guarded(ctx, READER, "trash", { params })).statusCode, 403);
+  assert.equal((await guarded(ctx, ADMIN, "archive", { params })).statusCode, 200);
+  assert.equal((await guarded(ctx, ADMIN, "list")).body.notices.length, 0);
+  assert.equal((await guarded(ctx, ADMIN, "list", { query: { status: "archived" } })).body.notices.length, 1);
+  await guarded(ctx, ADMIN, "restore", { params }); await guarded(ctx, ADMIN, "trash", { params });
+  assert.equal((await guarded(ctx, READER, "list", { query: { status: "deleted" } })).body.notices.length, 0);
+  assert.equal((await guarded(ctx, ADMIN, "list", { query: { status: "deleted" } })).body.notices.length, 1);
+  await guarded(ctx, ADMIN, "restore", { params });
+  assert.equal((await guarded(ctx, READER, "list")).body.notices.length, 1);
+  ctx.rows[0].category = "system";
+  assert.equal((await guarded(ctx, ADMIN, "trash", { params })).statusCode, 404);
+  assert.equal((await guarded(ctx, ADMIN, "archive", { params })).statusCode, 404);
+  await Promise.all([guarded(ctx, ADMIN, "hide", { params }), guarded(ctx, READER, "hide", { params })]);
+  assert.equal(ctx.rows[0].hiddenBy.length, 2);
+  assert.equal((await guarded(ctx, ADMIN, "list")).body.notices.length, 0);
+  const ownTrash = await guarded(ctx, READER, "list", { query: { status: "deleted" } });
+  assert.equal(ownTrash.body.notices[0].hiddenForMe, true); assert.equal(ownTrash.body.notices[0].hiddenBy, undefined);
+  await guarded(ctx, READER, "unhide", { params });
+  assert.equal((await guarded(ctx, READER, "list")).body.notices.length, 1);
+  assert.equal((await guarded(ctx, ADMIN, "list")).body.notices.length, 0);
+  const revoked = { ...READER, permissionRevokes: ["alerts.dismiss"] };
+  assert.equal((await guarded(ctx, revoked, "hide", { params })).statusCode, 403);
+});
diff --git a/server/test/open-items.test.js b/server/test/open-items.test.js
index 8b379b6..eb86b23 100644
--- a/server/test/open-items.test.js
+++ b/server/test/open-items.test.js
@@ -38,7 +38,7 @@ test("the lock check on a user route answers nothing for a hidden person", () =>

 test("a notice sent to the browser carries no list of readers", () => {
   const source = read("Entities/Notice/Notice.service.js");
-  assert.match(source, /const withRead = \(\{ readBy, readTimes, \.\.\.row \}, userId\)/);
+  assert.match(source, /const withRead = \(\{ readBy, readTimes, hiddenBy, \.\.\.row \}, userId\)/);
 });

 test("the assistant blanks a hidden person's ID number wherever it appears", () => {
diff --git a/server/test/permissions.test.js b/server/test/permissions.test.js
index 7106d6e..82b018f 100644
--- a/server/test/permissions.test.js
+++ b/server/test/permissions.test.js
@@ -37,7 +37,7 @@ test("constants have the expected shape", () => {
   assert.deepEqual([...GRANT_ONLY_MODULES].sort(), ["finance", "sports"]);
   assert.deepEqual(
     [...IT_KEYS].sort(),
-    ["audit.view", "permissions.manage", "storage.drive", "systemRecovery.reset", "users.passwords", "users.unlock"],
+    ["audit.archive", "audit.view", "permissions.manage", "storage.drive", "systemRecovery.reset", "users.passwords", "users.unlock"],
   );
   assert.deepEqual(PERMISSION_TREE.users,
     ["view", "create", "edit", "approve", "delete", "changeRole", "passwords", "unlock", "resetPassword"]);
diff --git a/server/test/weekly-task-email.test.js b/server/test/weekly-task-email.test.js
index 19999cc..8a5467f 100644
--- a/server/test/weekly-task-email.test.js
+++ b/server/test/weekly-task-email.test.js
@@ -10,6 +10,7 @@ test("weekly greetings send the exact custom text only to the chosen mailbox, wi
   vm.runInNewContext(fs.readFileSync(require.resolve("../utils/sendEmail"), "utf8"), {
     module, console, process: { env: { SMTP_SERVER: "smtp.example.test", SMTP_PORT: "587", SMTP_FROM: "sender@example.org" } },
     require(name) {
+      if (name === "../services/mailDelivery") return require("../services/mailDelivery");
       assert.equal(name, "nodemailer");
       return { createTransport(options) { configurations.push(options); return { sendMail: async (message) => sent.push(message) }; } };
     },
diff --git a/server/utils/permissions.js b/server/utils/permissions.js
index 5e129e0..969e9cc 100644
--- a/server/utils/permissions.js
+++ b/server/utils/permissions.js
@@ -5,16 +5,16 @@ const catalog = require("../../shared/permissions.json");
 const PERMISSION_TREE = catalog.tree;

 const ROLE_DEFAULTS = {
-  "ادارة": ["dashboard", "calendar", "students", "lessons", "attendance", "reports", "vehicles",
+  "ادارة": ["dashboard", "calendar", "alerts.dismiss", "students", "lessons", "attendance", "reports", "vehicles",
             "files", "notices", "tasks", "rules", "consents", "users.view", "users.create", "users.edit", "users.approve",
             "users.delete", "users.changeRole", "users.resetPassword", "ai"],
   // Only an admin edits students, lessons and users (owner, 2026-11-01); an
   // admin may still grant one guide an edit key in the permissions screen.
-  "مرشد": ["dashboard", "calendar", "students.view",
+  "مرشد": ["dashboard", "calendar", "alerts.dismiss", "students.view",
            "lessons.view",
            "attendance", "reports.create", "reports.editOwn", "reports.exportPdf",
            "files.use", "files.upload", "files.createFolder", "files.rename", "files.delete", "files.share", "tasks.view", "tasks.complete", "ai"],
-  "مساعد": ["dashboard", "calendar", "students.view", "lessons.view", "attendance.view",
+  "مساعد": ["dashboard", "calendar", "alerts.dismiss", "students.view", "lessons.view", "attendance.view",
             "reports.create", "reports.editOwn", "reports.exportPdf", "files.use", "files.upload", "files.createFolder", "files.rename", "files.delete", "files.share", "tasks.view", "tasks.complete", "ai"],
 };

diff --git a/server/utils/sendEmail.js b/server/utils/sendEmail.js
index 03c6079..078baa8 100644
--- a/server/utils/sendEmail.js
+++ b/server/utils/sendEmail.js
@@ -1,23 +1,14 @@
 const nodemailer = require('nodemailer');

-// ملاحظة عربية
-const createTransporter = (options = {}) => {
-    try{
-    return nodemailer.createTransport({
-        host: process.env.SMTP_SERVER,
-        port: Number(process.env.SMTP_PORT),
-        secure: Number(process.env.SMTP_PORT) == 465, // ملاحظة عربية
-        auth: {
-            user: process.env.SMTP_USER,
-            pass: process.env.SMTP_PASS,
-        },
-        ...options,
-    });
-    }catch(err){
-        console.error("Error creating SMTP transporter:", err);
-        throw err;
-    }
-}
+const { createMailDelivery } = require('../services/mailDelivery');
+const deliveryStats = { accepted: 0, failed: 0, lastElapsedMs: null };
+const delivery = createMailDelivery({
+  createTransport: (options) => nodemailer.createTransport(options),
+  config: () => ({ host: process.env.SMTP_SERVER, port: Number(process.env.SMTP_PORT), secure: Number(process.env.SMTP_PORT) === 465,
+    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }),
+  onMetric: ({ status, elapsedMs }) => { deliveryStats[status] += 1; deliveryStats.lastElapsedMs = elapsedMs; },
+});
+const createTransporter = () => delivery;

 const sendResetPasswordEmail = async (to, otp) => {
     const transporter = createTransporter();
@@ -135,6 +126,7 @@ const sendBugReportEmail = async (to, report) => {
 };

 module.exports = {
+    getDeliveryStats: () => ({ ...deliveryStats }),
     // Plain text preserves management's wording without interpreting HTML.
     sendWeeklyTaskEmail: async (to, text) => {
         if (!smtpConfigured()) throw new Error("SMTP is not configured");
diff --git a/shared/permissions.json b/shared/permissions.json
index c9d40db..91a7fc7 100644
--- a/shared/permissions.json
+++ b/shared/permissions.json
@@ -69,7 +69,9 @@
       "view",
       "post",
       "runCheck",
-      "archive"
+      "archive",
+      "delete",
+      "restore"
     ],
     "users": [
       "view",
@@ -89,7 +91,8 @@
       "manage"
     ],
     "audit": [
-      "view"
+      "view",
+      "archive"
     ],
     "systemRecovery": [
       "reset"
@@ -113,6 +116,9 @@
       "view",
       "edit",
       "link"
+    ],
+    "alerts": [
+      "dismiss"
     ]
   },
   "itKeys": [
@@ -121,7 +127,8 @@
     "users.unlock",
     "audit.view",
     "storage.drive",
-    "systemRecovery.reset"
+    "systemRecovery.reset",
+    "audit.archive"
   ],
   "hiddenModules": [
     "finance"
@@ -148,7 +155,8 @@
         "storage": "التخزين",
         "finance": "المالية",
         "rules": "قوانين الجمعية",
-        "consents": "تواقيع أولياء الأمور"
+        "consents": "تواقيع أولياء الأمور",
+        "alerts": "تنبيهاتي"
       },
       "leaves": {
         "view": "عرض",
@@ -185,7 +193,8 @@
         "createFolder": "إنشاء مجلد",
         "rename": "إعادة تسمية",
         "link": "إنشاء رابط توقيع",
-        "share": "مشاركة وإلغاء المشاركة"
+        "share": "مشاركة وإلغاء المشاركة",
+        "restore": "استعادة"
       },
       "leavesByModule": {
         "sports": {
@@ -206,6 +215,12 @@
         },
         "consents": {
           "edit": "إضافة أو تحديث التوقيع"
+        },
+        "audit": {
+          "archive": "أرشفة واستعادة السجلات"
+        },
+        "alerts": {
+          "dismiss": "إخفاء واستعادة تنبيهاتي"
         }
       }
     }

```

## apps/it/src/generated/dateFormat.js

```
const ZONE = "Asia/Jerusalem";
const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/;
const displayDay = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const dateParts = new Intl.DateTimeFormat("en-GB-u-nu-latn", { timeZone: ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const clockParts = new Intl.DateTimeFormat("en-GB-u-nu-latn", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function dateValue(value) { const date = value == null || value === "" ? null : new Date(value); return date && Number.isFinite(date.getTime()) ? date : null; }
function formatDate(value, fallback = "—") {
  const displayed = typeof value === "string" && value.match(displayDay);
  if (displayed) return formatDate(`${displayed[3]}-${displayed[2]}-${displayed[1]}`, fallback);
  const match = typeof value === "string" && value.match(dayOnly);
  if (match) {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? `${match[3]}/${match[2]}/${match[1]}` : fallback;
  }
  const date = dateValue(value);
  if (!date) return fallback;
  const parts = Object.fromEntries(dateParts.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.day}/${parts.month}/${parts.year}`;
}
function formatTime(value, fallback = "—") { const date = dateValue(value); return date ? clockParts.format(date) : fallback; }
function formatDateTime(value, fallback = "—") {
  const day = formatDate(value, fallback);
  return day === fallback || (typeof value === "string" && (dayOnly.test(value) || displayDay.test(value))) ? day : `${day} ${formatTime(value, fallback)}`;
}
export { formatDate, formatDateTime, formatTime };

```

## apps/sport/src/generated/dateFormat.js

```
const ZONE = "Asia/Jerusalem";
const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/;
const displayDay = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const dateParts = new Intl.DateTimeFormat("en-GB-u-nu-latn", { timeZone: ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const clockParts = new Intl.DateTimeFormat("en-GB-u-nu-latn", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function dateValue(value) { const date = value == null || value === "" ? null : new Date(value); return date && Number.isFinite(date.getTime()) ? date : null; }
function formatDate(value, fallback = "—") {
  const displayed = typeof value === "string" && value.match(displayDay);
  if (displayed) return formatDate(`${displayed[3]}-${displayed[2]}-${displayed[1]}`, fallback);
  const match = typeof value === "string" && value.match(dayOnly);
  if (match) {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? `${match[3]}/${match[2]}/${match[1]}` : fallback;
  }
  const date = dateValue(value);
  if (!date) return fallback;
  const parts = Object.fromEntries(dateParts.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.day}/${parts.month}/${parts.year}`;
}
function formatTime(value, fallback = "—") { const date = dateValue(value); return date ? clockParts.format(date) : fallback; }
function formatDateTime(value, fallback = "—") {
  const day = formatDate(value, fallback);
  return day === fallback || (typeof value === "string" && (dayOnly.test(value) || displayDay.test(value))) ? day : `${day} ${formatTime(value, fallback)}`;
}
export { formatDate, formatDateTime, formatTime };

```

## apps/system/src/Components/Report/ReportPdfAction.jsx

```
import { useEffect, useRef, useState } from "react";
import api from "../../WebServer/services/api";
import Button from "../UI/Button";
import { canStored, getStoredUserId } from "../../utils/session";

export default function ReportPdfAction({ report, tour }) {
  const [job, setJob] = useState(null), [error, setError] = useState("");
  const alive = useRef(true), timer = useRef(null), busy = useRef(false), generation = useRef(0);
  const base = `/report/${encodeURIComponent(report._id)}/pdf/jobs`;
  const storageKey = `report.pdf:${getStoredUserId()}:${report._id}`;
  const remember = (value) => { try { if (value?.id) sessionStorage.setItem(storageKey, JSON.stringify({ id: value.id, expiresAt: value.expiresAt })); else sessionStorage.removeItem(storageKey); } catch {} };
  useEffect(() => {
    alive.current = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (canStored("reports.exportPdf") && saved?.id && saved.expiresAt > Date.now()) { busy.current = true; setJob({ id: saved.id, state: "queued" }); poll(saved.id, ++generation.current); }
      else sessionStorage.removeItem(storageKey);
    } catch {}
    return () => { alive.current = false; generation.current++; clearTimeout(timer.current); };
    // A job belongs to this signed-in user and report; changing either resumes its own job.
  }, [storageKey]);
  const poll = async (id, ticket) => {
    try {
      const { data } = await api.get(`${base}/${id}`);
      if (!alive.current || ticket !== generation.current) return;
      setJob(data.job);
      remember(data.job);
      if (["queued", "rendering"].includes(data.job.state)) timer.current = setTimeout(() => poll(id, ticket), 1500);
      else busy.current = false;
    } catch { if (alive.current && ticket === generation.current) { busy.current = false; remember(null); setError("تعذّر متابعة تجهيز الملف. حاول من جديد."); setJob(null); } }
  };
  const start = async () => {
    if (busy.current) return; busy.current = true; setError(""); setJob({ state: "queued" });
    const ticket = ++generation.current;
    try { const { data } = await api.post(base); if (alive.current && ticket === generation.current) { setJob(data.job); remember(data.job); poll(data.job.id, ticket); } }
    catch (error) { busy.current = false; if (alive.current) { setJob(null); setError(error.response?.data?.message || "تعذّر تجهيز الملف"); } }
  };
  const cancel = async () => { generation.current++; clearTimeout(timer.current); remember(null); try { await api.delete(`${base}/${job.id}`); } catch { if (alive.current) setError("تعذّر إلغاء العملية. ستنتهي صلاحيتها تلقائيًا."); } finally { busy.current = false; if (alive.current) setJob(null); } };
  const download = async () => {
    try {
      const { data } = await api.get(`${base}/${job.id}/file`, { responseType: "blob" });
      const url = URL.createObjectURL(data), link = document.createElement("a");
      link.href = url; link.download = "tamheed-report.pdf"; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch { remember(null); setError("تعذّر تنزيل الملف. أعد تجهيز التقرير."); setJob(null); }
  };
  if (!canStored("reports.exportPdf")) return null;
  const working = ["queued", "rendering"].includes(job?.state);
  return <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
    {working ? <><small role="status">{job.state === "queued" ? "بانتظار تجهيز PDF…" : "جارٍ تجهيز PDF بالخلفية…"}</small><Button size="sm" variant="secondary" disabled={!job.id} onClick={cancel}>إلغاء</Button></>
      : job?.state === "ready" ? <Button size="sm" onClick={download}>تنزيل PDF</Button>
        : <Button size="sm" variant="secondary" data-tour={tour} onClick={start}>ملف التقرير</Button>}
    {(error || job?.state === "failed") && <small role="alert">{error || (job.code === "PDF_UNAVAILABLE" ? "تصدير PDF غير متاح مؤقتًا. تواصل مع مسؤول النظام." : "تعذّر تجهيز الملف. يمكنك إعادة المحاولة.")}</small>}
  </span>;
}

```

## apps/system/src/Components/Report/ReportPdfAction.test.js

```
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ReportPdfAction from "./ReportPdfAction";
import api from "../../WebServer/services/api";
import { canStored } from "../../utils/session";
jest.mock("../../WebServer/services/api", () => ({ get: jest.fn(), post: jest.fn(), delete: jest.fn() }));
jest.mock("../../utils/session", () => ({ canStored: jest.fn(), getStoredUserId: () => "synthetic-user" }));
global.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
const report = { _id: "a".repeat(24) };
const job = (state) => ({ id: "b".repeat(48), state, expiresAt: Date.now() + 600000 });
const mount = async () => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); await act(async () => root.render(<ReportPdfAction report={report} />)); };
const click = async (text) => act(async () => [...host.querySelectorAll("button")].find((b) => b.textContent === text).click());
beforeEach(() => { sessionStorage.clear(); canStored.mockReturnValue(true); api.post.mockResolvedValue({ data: { job: job("queued") } }); api.get.mockResolvedValue({ data: { job: job("ready") } }); api.delete.mockResolvedValue({}); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); jest.clearAllMocks(); });

test("server generation becomes downloadable and resumes after navigating back without another POST", async () => {
  await mount(); await click("ملف التقرير");
  expect(host.textContent).toContain("تنزيل PDF");
  expect(api.post).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount()); host.remove(); await mount();
  expect(host.textContent).toContain("تنزيل PDF"); expect(api.post).toHaveBeenCalledTimes(1);
});
test("cancel ignores an in-flight late status response", async () => {
  let finish; api.get.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await mount(); await click("ملف التقرير"); await click("إلغاء");
  await act(async () => finish({ data: { job: job("ready") } }));
  expect(host.textContent).toContain("ملف التقرير"); expect(host.textContent).not.toContain("تنزيل PDF");
  expect(api.delete).toHaveBeenCalledTimes(1); expect(sessionStorage.length).toBe(0);
});
test("revoked export permission never resumes a retained job or exposes its controls", async () => {
  sessionStorage.setItem(`report.pdf:synthetic-user:${report._id}`, JSON.stringify(job("ready"))); canStored.mockReturnValue(false);
  await mount(); expect(host.textContent).toBe(""); expect(api.get).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled();
});
test("ready PDF downloads the authenticated blob instead of rendering the report in the page", async () => {
  await mount(); await click("ملف التقرير");
  const blob = new Blob(["%PDF-synthetic"], { type: "application/pdf" });
  api.get.mockResolvedValue({ data: blob });
  const old = URL.createObjectURL; URL.createObjectURL = jest.fn(() => "blob:synthetic");
  const anchorClick = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  try {
    await click("تنزيل PDF");
    expect(api.get).toHaveBeenLastCalledWith(expect.stringMatching(/\/pdf\/jobs\/.+\/file$/), { responseType: "blob" });
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob); expect(anchorClick).toHaveBeenCalledTimes(1);
  } finally { URL.createObjectURL = old; anchorClick.mockRestore(); }
});

```

## apps/system/src/generated/dateFormat.js

```
const ZONE = "Asia/Jerusalem";
const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/;
const displayDay = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const dateParts = new Intl.DateTimeFormat("en-GB-u-nu-latn", { timeZone: ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const clockParts = new Intl.DateTimeFormat("en-GB-u-nu-latn", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function dateValue(value) { const date = value == null || value === "" ? null : new Date(value); return date && Number.isFinite(date.getTime()) ? date : null; }
function formatDate(value, fallback = "—") {
  const displayed = typeof value === "string" && value.match(displayDay);
  if (displayed) return formatDate(`${displayed[3]}-${displayed[2]}-${displayed[1]}`, fallback);
  const match = typeof value === "string" && value.match(dayOnly);
  if (match) {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? `${match[3]}/${match[2]}/${match[1]}` : fallback;
  }
  const date = dateValue(value);
  if (!date) return fallback;
  const parts = Object.fromEntries(dateParts.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.day}/${parts.month}/${parts.year}`;
}
function formatTime(value, fallback = "—") { const date = dateValue(value); return date ? clockParts.format(date) : fallback; }
function formatDateTime(value, fallback = "—") {
  const day = formatDate(value, fallback);
  return day === fallback || (typeof value === "string" && (dayOnly.test(value) || displayDay.test(value))) ? day : `${day} ${formatTime(value, fallback)}`;
}
export { formatDate, formatDateTime, formatTime };

```

## scripts/syncShared.js

```
const fs = require("node:fs");
const path = require("node:path");
const { syncPermissions } = require("./syncPermissions");
function syncShared({ root = path.resolve(__dirname, ".."), check = false } = {}) {
  syncPermissions({ root, check });
  const source = fs.readFileSync(path.join(root, "shared/dateFormat.js"), "utf8").replace(/\r\n/g, "\n").replace("module.exports =", "export");
  for (const app of ["system", "it", "sport"]) {
    const target = path.join(root, "apps", app, "src/generated/dateFormat.js");
    const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n") : "";
    if (current === source) continue;
    if (check) throw new Error(`Stale shared date formatter: ${app}`);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, source);
  }
}
if (require.main === module) syncShared({ check: process.argv.includes("--check") });
module.exports = { syncShared };

```

## server/Entities/Report/ReportPdf.controller.js

```
const { can, isHiddenUser, SYSTEM_ACTOR_NAME } = require("../../utils/permissions");
const { createReportPdfQueue } = require("../../services/reportPdfQueue");
const { renderReportPdf } = require("../../services/renderReportPdf");
const queue = createReportPdfQueue({ render: renderReportPdf });
const ID = /^[a-f\d]{24}$/i;
function createReportPdfController({ reports, getAuthor = async () => "", jobs = queue }) {
  const denied = (status) => Object.assign(new Error("denied"), { status });
  const owner = (req) => String(req.actor?.id || req.actor?.tz || "");
  const load = async (req, id) => {
    if (!owner(req) || !can(req.actor?.permissions, "reports.exportPdf")) throw denied(403);
    if (!ID.test(String(id))) throw denied(404);
    const found = await reports.get({ _id: String(id) });
    const report = found?.result?.[0];
    if (!report) throw denied(404);
    const author = String(report.createdBy || "");
    if (!can(req.actor.permissions, "reports.viewAll") && (!author || ![req.user?.id, req.user?.tz].some((id) => id != null && author === String(id)))) throw denied(403);
    return report;
  };
  const wrap = (handler) => async (req, res) => {
    try { return await handler(req, res); }
    catch (error) { const status = error.status || 500; return res.status(status).json({ ok: false, code: status === 429 ? "PDF_BUSY" : status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : "PDF_FAILED", message: status === 429 ? "توجد ملفات قيد التجهيز. حاول بعد قليل." : status === 403 ? "لا توجد صلاحية" : status === 404 ? "الملف غير موجود أو انتهت صلاحيته" : "تعذّر تجهيز ملف التقرير" }); }
  };
  const resolve = async (req) => {
    const job = jobs.status(req.params.job, owner(req));
    if (!job || job.reportId !== String(req.params.id)) throw denied(404);
    await load(req, job.reportId); // Recheck current permission, owner and existence.
    return job;
  };
  return {
    start: wrap(async (req, res) => {
      const report = await load(req, req.params.id);
      const payload = { stitle: report.stitle, title: report.title, date: report.date, info: report.info, authorName: await getAuthor(report, req) };
      if (Buffer.byteLength(String(payload.info || ""), "utf8") > 2 * 1024 * 1024) return res.status(413).json({ ok: false, message: "التقرير أكبر من الحد المسموح للتصدير." });
      const job = jobs.start(owner(req), req.params.id, payload);
      res.set("Cache-Control", "no-store"); return res.status(202).json({ ok: true, job });
    }),
    status: wrap(async (req, res) => { const job = await resolve(req); res.set("Cache-Control", "no-store"); return res.json({ ok: true, job }); }),
    download: wrap(async (req, res) => {
      await resolve(req); const buffer = jobs.file(req.params.job, owner(req));
      if (!buffer) return res.status(409).json({ ok: false, message: "الملف ليس جاهزًا بعد" });
      res.set({ "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="tamheed-report.pdf"', "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); return res.send(buffer);
    }),
    cancel: wrap(async (req, res) => { await resolve(req); jobs.cancel(req.params.job, owner(req)); return res.json({ ok: true }); }),
  };
}
let shared;
const actual = () => shared ||= createReportPdfController({
  reports: require("./Report.model").ReportModelDef,
  getAuthor: async (report, req) => {
    const key = String(report.createdBy || "");
    if (key === "system") return SYSTEM_ACTOR_NAME;
    if ([req.actor?.id, req.actor?.tz].includes(key)) return req.actor.isSystem ? SYSTEM_ACTOR_NAME : req.actor.name;
    const result = await require("../User/User.model").UserModelDef.get(ID.test(key) ? { _id: key } : { tz: key }, "active");
    const user = result?.result?.[0]; return user ? isHiddenUser(user) ? SYSTEM_ACTOR_NAME : [user.firstname, user.lastname].filter(Boolean).join(" ") : "";
  },
});
module.exports = { createReportPdfController, reportPdf: Object.fromEntries(["start", "status", "download", "cancel"].map((name) => [name, (req, res) => actual()[name](req, res)])) };

```

## server/scripts/checkReportPdf.js

```
// Synthetic preflight only: no database, SMTP or real report reads.
const { renderReportPdf } = require("../services/renderReportPdf");
(async () => {
  const started = Date.now(); let ticks = 0, previous = started, maxGapMs = 0;
  const timer = setInterval(() => { ticks++; const now = Date.now(); maxGapMs = Math.max(maxGapMs, now - previous); previous = now; }, 10);
  try {
    const pdf = await renderReportPdf({ stitle: "فحص تصدير تجريبي", date: "2026-11-07", info: "<p>بيانات مصطنعة لفحص العربية.</p>".repeat(100) });
    if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("INVALID_PDF");
    console.log(JSON.stringify({ ok: true, elapsedMs: Date.now() - started, bytes: pdf.length, heartbeatTicks: ticks, maxGapMs }));
  } finally { clearInterval(timer); }
})().catch((error) => { console.error(error.code || error.message || "PDF_FAILED"); process.exitCode = 1; });

```

## server/services/mailDelivery.js

```
// One reusable SMTP pool per configuration. Never log recipient, body or code.
function createMailDelivery({ createTransport, config, now = () => Date.now(), onMetric = () => {}, delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  let transport, fingerprint;
  const get = () => {
    const options = config();
    const next = JSON.stringify(options);
    if (!transport || next !== fingerprint) {
      transport?.close?.();
      transport = createTransport({ pool: true, maxConnections: 2, maxMessages: 100,
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000, maxRequeues: 0, ...options });
      fingerprint = next;
    }
    return transport;
  };
  const sendMail = async (message) => {
    const started = now();
    for (let attempt = 0; ; attempt += 1) {
      try {
        const result = await get().sendMail(message);
        onMetric({ status: "accepted", elapsedMs: now() - started, attempts: attempt + 1 });
        return result;
      } catch (error) {
        // Never retry an ambiguous post-DATA failure (it may already be sent).
        const beforeData = ["CONN", "CONNECT", "EHLO", "HELO", "STARTTLS"].includes(String(error.command || "").toUpperCase());
        if (attempt === 0 && beforeData && ["ECONNECTION", "ETIMEDOUT", "ESOCKET"].includes(error.code)) { await delay(250); continue; }
        onMetric({ status: "failed", elapsedMs: now() - started, attempts: attempt + 1 });
        throw error;
      }
    }
  };
  return { sendMail, close() { transport?.close?.(); transport = null; fingerprint = null; } };
}
module.exports = { createMailDelivery };

```

## server/services/renderReportPdf.js

```
const { fork } = require("node:child_process");
const path = require("node:path");
function renderReportPdf(report, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("cancelled"));
    const identity = process.platform !== "win32" && /^\d+$/.test(process.env.PDF_RENDER_UID || "") ? { uid: Number(process.env.PDF_RENDER_UID), ...(/^\d+$/.test(process.env.PDF_RENDER_GID || "") ? { gid: Number(process.env.PDF_RENDER_GID) } : {}) } : {};
    // Credentials are deliberately not inherited by the renderer process.
    const env = Object.fromEntries(["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "LANG", "PDF_CHROME_EXECUTABLE"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
    const child = fork(path.join(__dirname, "reportPdfWorker.js"), [], { ...identity, env, execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"] });
    let settled = false;
    const finish = (error, buffer) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); if (error) { child.kill("SIGTERM"); reject(error); } else resolve(buffer); };
    const abort = () => finish(new Error("cancelled"));
    const timer = setTimeout(() => finish(new Error("PDF_TIMEOUT")), 100000); timer.unref?.();
    signal?.addEventListener("abort", abort, { once: true });
    child.once("error", (error) => finish(error));
    child.once("exit", () => finish(new Error("PDF_EXIT")));
    child.once("message", (message) => message?.ok ? finish(null, Buffer.from(message.pdf || "", "base64")) : finish(Object.assign(new Error("PDF_FAILED"), { code: message?.code })));
    child.send({ report });
  });
}
module.exports = { renderReportPdf };

```

## server/services/reportPdfHtml.js

```
const sanitize = require("sanitize-html");
const { formatDateTime } = require("../../shared/dateFormat");
let logo = "";
try { logo = `data:image/png;base64,${require("node:fs").readFileSync(require("node:path").join(__dirname, "../../apps/system/src/images/logo.png")).toString("base64")}`; } catch {}
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function reportPdfHtml(report = {}) {
  const info = String(report.info || "");
  if (Buffer.byteLength(info, "utf8") > 2 * 1024 * 1024) throw new Error("PDF_LIMIT");
  const html = sanitize(info, {
    allowedTags: ["p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "h1", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "table", "thead", "tbody", "tr", "td", "th", "hr", "pre", "code"],
    allowedAttributes: { "*": ["dir"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] },
    allowedSchemes: [], disallowedTagsMode: "discard",
  });
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"><style>
    @page{size:A4;margin:22mm 16mm 22mm}*{box-sizing:border-box}body{font-family:Arial,"DejaVu Sans",sans-serif;color:#183b4a;font-size:12pt;line-height:1.7;overflow-wrap:anywhere}
    header{border-bottom:3px solid #1e657b;padding-bottom:12px;margin-bottom:18px}h1{font-size:20pt}h2{font-size:16pt}h3{font-size:14pt}h1,h2,h3,h4{break-after:avoid;page-break-after:avoid}p{orphans:3;widows:3}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{border:1px solid #c9d4d9;padding:6px}thead{display:table-header-group}tr,img{break-inside:avoid}pre{white-space:pre-wrap}blockquote{border-inline-start:3px solid #ddd;padding-inline-start:12px}li{break-inside:avoid}.meta{font-size:10pt;color:#526674}.chips{font-size:10pt;color:#406479}.brandLogo{width:64px;height:64px;object-fit:contain;float:left}
    </style></head><body><header>${logo ? `<img class="brandLogo" src="${logo}" alt="شعار الجمعية">` : ""}<strong>جمعية تمهيد - الرملة</strong><h1>${escape(report.stitle || "تقرير")}</h1><div class="meta"><bdi dir="ltr">${escape(formatDateTime(report.date))}</bdi>${report.authorName ? ` — أُعِدّ بواسطة: ${escape(report.authorName)}` : ""}</div><div class="chips">${(Array.isArray(report.title) ? report.title : []).map(escape).join(" · ")}</div></header><main>${html}</main></body></html>`;
}
module.exports = { reportPdfHtml };

```

## server/services/reportPdfQueue.js

```
const { randomBytes } = require("node:crypto");

function createReportPdfQueue({ render, now = () => Date.now(), ttlMs = 10 * 60 * 1000, maxJobs = 16, maxBytes = 24 * 1024 * 1024 } = {}) {
  const jobs = new Map(); let active = false, buffered = 0;
  const drop = (job) => { if (job.buffer) buffered -= job.buffer.length; job.controller?.abort(); jobs.delete(job.id); };
  const sweep = () => { for (const job of jobs.values()) if (now() >= job.expiresAt) drop(job); };
  const pump = async () => {
    if (active) return;
    sweep(); const job = [...jobs.values()].find((item) => item.state === "queued");
    if (!job) return;
    active = true; job.state = "rendering"; job.controller = new AbortController();
    try {
      const buffer = Buffer.from(await render(job.payload, job.controller.signal));
      if (!jobs.has(job.id) || job.state === "cancelled") return;
      if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-")) || buffer.length > maxBytes || buffered + buffer.length > maxBytes) throw new Error("PDF_LIMIT");
      job.buffer = buffer; buffered += buffer.length; job.state = "ready";
    } catch (error) {
      if (jobs.has(job.id) && job.state !== "cancelled") { job.state = "failed"; job.code = error.code === "PDF_UNAVAILABLE" ? "PDF_UNAVAILABLE" : "PDF_FAILED"; }
    } finally { job.payload = null; job.controller = null; active = false; queueMicrotask(pump); }
  };
  const view = (job) => job && ({ id: job.id, reportId: job.reportId, state: job.state, code: job.code || "", expiresAt: job.expiresAt });
  const get = (id, owner) => { sweep(); const job = jobs.get(String(id)); return job?.owner === String(owner) ? job : null; };
  return {
    start(owner, reportId, payload) {
      sweep(); const mine = [...jobs.values()].filter((job) => job.owner === String(owner) && ["queued", "rendering"].includes(job.state));
      const duplicate = mine.find((job) => job.reportId === String(reportId));
      if (duplicate) return view(duplicate);
      const retained = [...jobs.values()].filter((job) => job.owner === String(owner));
      if (retained.length >= 4) { const old = retained.find((job) => !["queued", "rendering"].includes(job.state)); if (old) drop(old); }
      if (jobs.size >= maxJobs) { const old = [...jobs.values()].find((job) => !["queued", "rendering"].includes(job.state)); if (old) drop(old); }
      if (mine.length >= 2 || jobs.size >= maxJobs) { const error = new Error("PDF_BUSY"); error.status = 429; throw error; }
      const job = { id: randomBytes(24).toString("hex"), owner: String(owner), reportId: String(reportId), payload, state: "queued", expiresAt: now() + ttlMs };
      jobs.set(job.id, job); queueMicrotask(pump); return view(job);
    },
    status(id, owner) { return view(get(id, owner)); },
    file(id, owner) { const job = get(id, owner); return job?.state === "ready" ? job.buffer : null; },
    cancel(id, owner) { const job = get(id, owner); if (!job) return false; job.state = "cancelled"; job.controller?.abort(); job.payload = null; if (job.buffer) { buffered -= job.buffer.length; job.buffer = null; } return true; },
    close() { for (const job of jobs.values()) drop(job); },
  };
}
module.exports = { createReportPdfQueue };

```

## server/services/reportPdfWorker.js

```
// Runs in a dedicated process; no database, credentials, URLs or mail access.
const fs = require("node:fs");
const { reportPdfHtml } = require("./reportPdfHtml");
let browser, stopping = false;
async function stop() { stopping = true; try { await browser?.close(); } finally { process.exit(0); } }
process.on("disconnect", stop); process.on("SIGTERM", stop);
process.on("message", async (message) => {
  if (message.cancel) return stop();
  try {
    const candidates = [process.env.PDF_CHROME_EXECUTABLE, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"];
    const executablePath = candidates.find((entry) => entry && fs.existsSync(entry));
    if (!executablePath || (process.getuid && process.getuid() === 0)) throw Object.assign(new Error("unavailable"), { code: "PDF_UNAVAILABLE" });
    const puppeteer = await import("puppeteer-core");
    browser = await puppeteer.default.launch({ executablePath, headless: true, timeout: 20000, args: ["--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (request) => request.url().startsWith("data:image/png;base64,") ? request.continue() : request.abort());
    await page.setContent(reportPdfHtml(message.report), { waitUntil: "load", timeout: 20000 });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, timeout: 60000,
      displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: '<div style="width:100%;text-align:center;font-size:9px;color:#666"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
    if (!stopping && process.send) await new Promise((resolve) => process.send({ ok: true, pdf: Buffer.from(pdf).toString("base64") }, resolve));
  } catch (error) { if (process.send) await new Promise((resolve) => process.send({ ok: false, code: error.code === "PDF_UNAVAILABLE" ? "PDF_UNAVAILABLE" : "PDF_FAILED" }, resolve)); }
  finally { await stop(); }
});

```

## server/test/improvement-services.test.js

```
const test = require("node:test");
const assert = require("node:assert/strict");
const { formatDate, formatDateTime } = require("../../shared/dateFormat");
const { createMailDelivery } = require("../services/mailDelivery");
const { storageOwnerLabel } = require("../utils/storageOwnerLabel");
const { createReportPdfQueue } = require("../services/reportPdfQueue");
const { reportPdfHtml } = require("../services/reportPdfHtml");
const { createReportPdfController } = require("../Entities/Report/ReportPdf.controller");
const { effectivePermissions } = require("../utils/permissions");
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("all systems share DMY dates, explicit Jerusalem time and no date-only drift", () => {
  assert.equal(formatDate("2026-11-07"), "07/11/2026");
  assert.equal(formatDate("07/11/2026"), "07/11/2026");
  assert.equal(formatDateTime("2026-11-06T22:30:00Z"), "07/11/2026 00:30");
  assert.equal(formatDateTime("2026-11-07"), "07/11/2026");
  assert.equal(formatDate("2026-02-31"), "—");
  assert.equal(formatDate(null), "—");
});
test("mail transport is pooled, reused and records only timing/status", async () => {
  let created = 0; const seen = [], metrics = [];
  const delivery = createMailDelivery({ createTransport: (options) => { created++; assert.equal(options.pool, true); assert.equal(options.maxRequeues, 0); return { sendMail: async (body) => { seen.push(body); return { messageId: "test" }; } }; }, config: () => ({ host: "smtp.example.test" }), onMetric: (metric) => metrics.push(metric) });
  await delivery.sendMail({ to: "synthetic@example.test", text: "synthetic-code" });
  await delivery.sendMail({ to: "synthetic@example.test", text: "second" });
  assert.equal(created, 1); assert.equal(seen.length, 2);
  assert.deepEqual(Object.keys(metrics[0]).sort(), ["attempts", "elapsedMs", "status"]);
});
test("mail retries only an unambiguous connection failure, never post-DATA delivery", async () => {
  for (const command of ["CONN", "DATA"]) {
    let calls = 0;
    const delivery = createMailDelivery({ config: () => ({}), delay: async () => {}, createTransport: () => ({ sendMail: async () => { if (++calls === 1) throw Object.assign(new Error("unavailable"), { code: "ECONNECTION", command }); return {}; } }) });
    if (command === "CONN") await delivery.sendMail({}); else await assert.rejects(delivery.sendMail({}));
    assert.equal(calls, command === "CONN" ? 2 : 1);
  }
});
test("owner labels distinguish system, known user and unknown identity without exposing ids", () => {
  assert.equal(storageOwnerLabel({ ownerId: "system" }), "النظام");
  assert.equal(storageOwnerLabel({ ownerId: "abcdef1234567890abcdef12", relativePath: "tamheed_db/root/users" }), "النظام");
  assert.equal(storageOwnerLabel({ ownerId: "abcdef1234567890abcdef12", knownName: "اسم تجريبي" }), "اسم تجريبي");
  assert.equal(storageOwnerLabel({ ownerId: "abcdef1234567890abcdef12" }), "غير معروف");
});
test("PDF queue never exposes another user's job, supports cancel and bounds retention", async () => {
  let now = 0, finish; const q = createReportPdfQueue({ now: () => now, ttlMs: 1000, render: () => new Promise((done) => { finish = done; }) });
  const job = q.start("one", "report", { info: "synthetic" }); await flush();
  assert.equal(q.status(job.id, "two"), null);
  assert.equal(q.status(job.id, "one").state, "rendering");
  q.cancel(job.id, "one"); finish(Buffer.from("%PDF-test")); await flush();
  assert.equal(q.file(job.id, "one"), null);
  now = 1001; assert.equal(q.status(job.id, "one"), null); q.close();
});
test("PDF queue serializes rendering and reuses one pending job per report/owner", async () => {
  let active = 0, max = 0;
  const q = createReportPdfQueue({ render: async () => { active++; max = Math.max(max, active); await flush(); active--; return Buffer.from("%PDF-test"); } });
  const one = q.start("owner", "first", {}); assert.equal(q.start("owner", "first", {}).id, one.id);
  const two = q.start("owner", "second", {}); assert.throws(() => q.start("owner", "third", {}), /PDF_BUSY/);
  for (let i = 0; i < 8; i++) await flush();
  assert.equal(max, 1); assert.equal(q.status(two.id, "owner").state, "ready"); q.close();
});
test("PDF HTML keeps Arabic rich text and tables, strips scripts, remote requests and injected titles", () => {
  const html = reportPdfHtml({ stitle: '<script>alert(1)</script>', info: '<p>تقرير تجريبي</p><table><tr><td>خانة</td></tr></table><script>bad()</script><img src="http://127.0.0.1/private"><iframe src="file:///secret"></iframe>' });
  assert.ok(html.includes("تقرير تجريبي")); assert.ok(html.includes("<table>"));
  assert.ok(!html.includes("<script>")); assert.ok(!html.includes("127.0.0.1")); assert.ok(!html.includes("file:///"));
});
test("PDF download/status recheck current report permission and scope", async () => {
  const id = "abcdef1234567890abcdef12", q = createReportPdfQueue({ render: async () => Buffer.from("%PDF-test") });
  const controller = createReportPdfController({ reports: { get: async () => ({ result: [{ _id: id, createdBy: "owner", info: "synthetic" }] }) }, jobs: q });
  const request = { user: { id: "owner" }, actor: { id: "owner", permissions: effectivePermissions({ role: "مرشد" }) }, params: { id } };
  const res = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, set() { return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } });
  const start = res(); await controller.start(request, start); assert.equal(start.statusCode, 202);
  await flush(); request.params.job = start.body.job.id;
  request.actor.permissions = effectivePermissions({ role: "مرشد", permissionRevokes: ["reports.exportPdf"] });
  const blocked = res(); await controller.download(request, blocked); assert.equal(blocked.statusCode, 403);
  request.actor.permissions = effectivePermissions({ role: "مرشد" }); request.user.id = "other";
  const foreign = res(); await controller.status(request, foreign); assert.equal(foreign.statusCode, 403);
  q.close();
});

```

## server/utils/storageOwnerLabel.js

```
const { isSystemTz, SYSTEM_ACTOR_NAME } = require("./permissions");
function storageOwnerLabel({ ownerId = "", knownName = "", suppliedName = "", relativePath = "" }) {
  if (!ownerId || ownerId === "system" || isSystemTz(ownerId) || /^tamheed_db\/root\/(users|students)$/i.test(relativePath)) return SYSTEM_ACTOR_NAME;
  if (knownName) return knownName;
  if (suppliedName && suppliedName !== ownerId && !/^[a-f\d]{24}$/i.test(suppliedName)) return suppliedName;
  return "غير معروف";
}
module.exports = { storageOwnerLabel };

```

## shared/dateFormat.js

```
const ZONE = "Asia/Jerusalem";
const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/;
const displayDay = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const dateParts = new Intl.DateTimeFormat("en-GB-u-nu-latn", { timeZone: ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const clockParts = new Intl.DateTimeFormat("en-GB-u-nu-latn", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function dateValue(value) { const date = value == null || value === "" ? null : new Date(value); return date && Number.isFinite(date.getTime()) ? date : null; }
function formatDate(value, fallback = "—") {
  const displayed = typeof value === "string" && value.match(displayDay);
  if (displayed) return formatDate(`${displayed[3]}-${displayed[2]}-${displayed[1]}`, fallback);
  const match = typeof value === "string" && value.match(dayOnly);
  if (match) {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? `${match[3]}/${match[2]}/${match[1]}` : fallback;
  }
  const date = dateValue(value);
  if (!date) return fallback;
  const parts = Object.fromEntries(dateParts.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.day}/${parts.month}/${parts.year}`;
}
function formatTime(value, fallback = "—") { const date = dateValue(value); return date ? clockParts.format(date) : fallback; }
function formatDateTime(value, fallback = "—") {
  const day = formatDate(value, fallback);
  return day === fallback || (typeof value === "string" && (dayOnly.test(value) || displayDay.test(value))) ? day : `${day} ${formatTime(value, fallback)}`;
}
module.exports = { formatDate, formatDateTime, formatTime };

```

## Deployment and behavior notes

# تحسينات التنقل والتقارير والبريد والملفات

## السلوك

- على الكمبيوتر: الرئيسي والبرنامج، ثم مجموعات العمل اليومي والأعضاء
  والطاقم والمتابعة والموارد. تفتح المجموعة بالنقر أو سهم الأسفل، وتغلق
  بزر Escape أو بالنقر خارجها. الهاتف يحتفظ بالقائمة القابلة للطي تحت الرأس.
- الجرس فوق شريط التنقل. التاريخ المعروض يوم/شهر/سنة بأرقام لاتينية،
  والوقت بتوقيت القدس. المصدر `shared/dateFormat.js`، وتزامنه
  `scripts/syncShared.js` في بدء وبناء واختبار الأنظمة الثلاثة.
- الملفات تعرض قائمة أو شبكة مع بحث بالاسم/المالك ونوع الملف وترتيبه.
  المجلدات أولًا. المالك المجهول لا يُعرض كرقم قاعدة بيانات ولا يُنسب
  كذبًا إلى النظام. صلاحيات المسار والمشاركة باقية إضافة لصلاحيات العملية.
- لوحة الإعلانات تحتوي الوارد والمؤرشف والمحذوفات. إعلانات الإدارة تقبل
  الأرشفة والنقل للمحذوفات والاستعادة. رسائل النظام تُخفى من قائمة الشخص
  فقط، وتبقى لدى الآخرين. الاستعادة لا تلغي تاريخ انتهاء الإعلان أو
  سياسة الاحتفاظ بالتنبيهات الأصلية.
- سجل IT يقبل أرشفة واستعادة سجلات محددة، دون محو أصل الدليل.
  الصلاحيات الجديدة: `audit.archive` (IT)، `notices.delete`،
  `notices.restore`، `alerts.dismiss`. الإخفاء الشخصي ضمن الأدوار المبنية
  افتراضيًا، ولا يوسّع هذا التعديل المنح المخصصة أو يلغي السحب المخزن.

## PDF على الخادم

زر التقرير يُنشئ مهمة بالخلفية، يعرض تقدمها، ويدعم الإلغاء والتنزيل.
الرجوع إلى نفس التقرير في نفس تبويب وحساب المستخدم يستعيد المتابعة.
يُجهّز النص العربي والجداول كصفحات قابلة للبحث، بدل تصوير صفحة المتصفح.
المحتوى من التقرير المخزن، وتُعاد صلاحية التصدير ونطاق السجل عند كل
متابعة وتنزيل. الروابط الخارجية والبرمجيات وصور المحتوى لا تُحمّل أثناء
التصدير؛ شعار الجمعية أصل محلي موثوق.

تُشغّل Chromium في عملية مستقلة، بمهمة واحدة في الوقت نفسه، وحد أقصى
مهمتين معلقتين للشخص و16 مهمة إجمالًا و24MiB للملفات المخزنة في الذاكرة.
المهمة صالحة عشر دقائق. نسخة PDF لقطة من التقرير وقت الطلب، وإعادة تشغيل
الخادم تفقد المهام المؤقتة ويمكن طلبها مجددًا. هذا الإصدار يفترض عملية
API واحدة في PM2؛ تعدد نسخ API يحتاج مخزن/طابور مشترك قبل تفعيله.

### متطلبات النشر

`puppeteer-core` لا ينزّل متصفحًا. ثبّت Chrome/Chromium مدعومًا وخطًا عربيًا
على خادم الاختبار من مصدر النظام الرسمي، ثم عيّن مسار الملف التنفيذي:

```bash
PDF_CHROME_EXECUTABLE=/usr/bin/chromium
```

الأفضل تشغيل التطبيق بحساب خدمة غير root. إذا كان PM2 يعمل حاليًا بـroot،
فيمكن فصل هوية عملية PDF فقط: أنشئ حساب خدمة محدودًا، امنحه قراءة مجلد
التطبيق وتنفيذ Node/Chromium وحق الكتابة في مجلده المؤقت، ثم أضف إلى
بيئة خدمة التطبيق (استبدل الأرقام بنتيجة id للحساب الفعلي):

```bash
PDF_RENDER_UID=1001
PDF_RENDER_GID=1001
```

لا تشغّل Chromium كـroot ولا تضف `--no-sandbox`. نظام التشغيل يجب أن يسمح
بـChromium sandbox للحساب المختار. متصفح مفقود أو عامل root يعطي
`PDF_UNAVAILABLE`؛ تعطل التشغيل الآخر يعطي `PDF_FAILED`، دون كشف تفاصيل
الخادم للمتصفح. اختبر بالبيئة نفسها التي تستخدمها خدمة PM2:

```bash
node server/scripts/checkReportPdf.js
```

الفحص يستخدم بيانات مصطنعة ولا يقرأ قاعدة البيانات ولا يرسل بريدًا.
يجب أن يرجع `ok:true` قبل اعتبار PDF جاهزًا على الخادم. بعد تحديث متغيرات
خدمة PM2 أعد تحميلها بـ`--update-env` وفق إعداد النشر المعتاد.

## البريد وDrive

الأنظمة الثلاثة تستخدم خدمة SMTP نفسها. الاتصال pooled ويُعاد استخدامه،
مع حدود زمنية وإعادة محاولة واحدة لأخطاء الاتصال المؤكدة قبل إرسال
المحتوى؛ لا تُكرر الرسالة بعد فشل ملتبس أثناء DATA. `getDeliveryStats()`
يعطي عدادات القبول والفشل ومدة آخر إرسال دون عناوين أو رموز دخول.
قبول SMTP ليس إثبات الوصول إلى صندوق البريد؛ لم نرسل رسائل حقيقية في الاختبارات.

تصميم الملفات لا ينقل بيانات Drive تلقائيًا. راجع [هيكل Drive](DRIVE_LAYOUT.md)
للـStorages وربط الحساب وإظهار الملفات المضافة يدويًا والنطاق المطلوب.
لم يُغيّر هذا العمل الربط الفعلي أو صلاحيات Google أو ينفّذ أداة النقل.

## التحقق المحلي

اختبارات الصلاحيات والأرشفة والاستعادة والحدود وإلغاء PDF تستخدم بيانات
مصطنعة فقط. فحص عربي كبير من 180 فقرة وجداول أنتج 45 صفحة A4 في 1.69 ثانية
محليًا، وأقصى فاصل نبض في العملية الرئيسية 25ms. هذا قياس جهاز التطوير،
ولا يضمن زمن الخادم الفعلي. فُحص الشعار والعربية والجداول وتقسيم الصفحات
بصريًا، وفُحصت القائمة والجرس والملفات على الكمبيوتر وهاتف بعرض 390px.
