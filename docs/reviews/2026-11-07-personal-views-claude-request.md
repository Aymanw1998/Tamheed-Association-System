# Final independent source-only Claude Code review request — 2026-11-07
Codex implements. Review only; do not edit, run tools or request another reviewer.
Owner authorized source sharing. No secrets, environment, user records or runtime logs.
Review student filters and responsible-only defaults, separate rules route/unsaved guard, direct clipboard action, home navigation and combined personal/board notification paging (retain current recipient/type/permission/retention restrictions), and multiple educational programs per responsible user. Legacy mode is automatic-all; selected mode is manual. Overlapping subsets are allowed as announced to owner. Responsibility changes remove old memberships and add only to new automatic programs. Preserve legacy additional members; no destructive normalization. Student changes acquire every affected program lock. CAS retries recheck owner/mode. Inspect permission leaks, races and data loss with concrete source evidence.
Final local verify passed: 1503 server tests, 1123 System tests (128 suites), production build. Last presentation-only filter layout adjustment passed its 16 focused tests and production build. Synthetic loopback browser verified personal/all student views, unsigned filter, task group/search/checkbox ordering, separate rules, program membership options, phone navigation and width, and scrolling older home notifications. No real DB or Google changes.
diff --git a/apps/system/src/Components/Dashboard/Dashboard.jsx b/apps/system/src/Components/Dashboard/Dashboard.jsx
index 958f9ad..382f024 100644
--- a/apps/system/src/Components/Dashboard/Dashboard.jsx
+++ b/apps/system/src/Components/Dashboard/Dashboard.jsx
@@ -10,7 +10,8 @@ import { getAll as getAllReports } from "../../WebServer/services/report/functio
 import { toast } from "../../ALERT/SystemToasts.jsx";
 import { canStored, getStoredPermissions, getStoredUserId } from "../../utils/session";
 import { canAccessPath } from "../../utils/routeAccess";
-import ParentLinkPanel from "../Student/ParentLinkPanel.jsx";
+import CopyParentLink from "../Student/CopyParentLink.jsx";
+import SystemAlerts from "../Notice/SystemAlerts.jsx";
 import VehicleAlerts from "../Vehicle/VehicleAlerts.jsx";
 import { useI18n } from "../../i18n/I18nContext";
 import { useRolePicker, permissionError } from "../User/RolePickerDialog.jsx";
@@ -126,7 +127,7 @@ export default function Dashboard() {
         });
       } catch (err) {
         if (!cancelled) {
-          setError(err?.message || "تعذّر تحميل لوحة التحكم");
+          setError(err?.message || "تعذّر تحميل الرئيسي");
         }
       } finally {
         if (!cancelled) {
@@ -286,7 +287,7 @@ export default function Dashboard() {
       {roleDialog}
       <div className={styles.header}>
         <div>
-          <h1>لوحة التحكم</h1>
+          <h1>الرئيسي</h1>
           <p>نظرة سريعة على أهم بيانات النظام.</p>
         </div>
         <div className={styles.links} data-tour="dashboard-links">
@@ -302,6 +303,7 @@ export default function Dashboard() {
       {error && <div className={styles.error}>{error}</div>}
 
       <WeeklyTasksCard />
+      <SystemAlerts title="الإشعارات" showEmpty includeNotices={canStored("notices.view")} />
 
       <div className={styles.stats} data-tour="dashboard-stats">
         {summary.map((item) => (
@@ -404,7 +406,7 @@ export default function Dashboard() {
             <div className={styles.panelHeader}>
               <h2>رابط تسجيل الأهل</h2>
             </div>
-            <ParentLinkPanel />
+            <CopyParentLink />
           </section>
         )}
 
diff --git a/apps/system/src/Components/Dashboard/Dashboard.test.js b/apps/system/src/Components/Dashboard/Dashboard.test.js
index 5600396..9aaa66e 100644
--- a/apps/system/src/Components/Dashboard/Dashboard.test.js
+++ b/apps/system/src/Components/Dashboard/Dashboard.test.js
@@ -14,7 +14,9 @@ jest.mock("../../WebServer/services/student/functionsStudent.jsx", () => ({ dele
 jest.mock("../../WebServer/services/lesson/functionsLesson.jsx", () => ({ getAllLesson: jest.fn() }));
 jest.mock("../../WebServer/services/report/functionsReport.jsx", () => ({ getAll: jest.fn() }));
 jest.mock("../Vehicle/VehicleAlerts.jsx", () => () => null);
-jest.mock("../Student/ParentLinkPanel.jsx", () => () => null);
+jest.mock("../Student/CopyParentLink.jsx", () => () => <button>نسخ رابط تسجيل الأهل</button>);
+jest.mock("../Notice/SystemAlerts.jsx", () => () => <section aria-label="الإشعارات" />);
+jest.mock("../WeeklyTasks/WeeklyTasksCard.jsx", () => () => null);
 
 import { getDashboardSummary } from "../../WebServer/services/dashboard/functionsDashboard.jsx";
 import Dashboard from "./Dashboard";
diff --git a/apps/system/src/Components/Header/Header.jsx b/apps/system/src/Components/Header/Header.jsx
index 46e4a34..a85c911 100644
--- a/apps/system/src/Components/Header/Header.jsx
+++ b/apps/system/src/Components/Header/Header.jsx
@@ -229,6 +229,7 @@ export default function Header() {
       </div>
 
       <NavigationMenu mobile={isMobile} open={menuOpen} onClose={() => setMenuOpen(false)} onNav={onNavClick}
+        home={{ path: "/dashboard", label: t("nav.dashboard"), tour: "menu-home" }}
         program={(opens("/lessons") || opens("/calendar")) ? { path: opens("/lessons") ? "/lessons" : "/calendar", label: t("nav.lessons"), tour: "menu-lessons", badge: "lessons" } : null}
         groups={[
           { id: "daily", label: "العمل اليومي", items: [
@@ -244,6 +245,7 @@ export default function Header() {
             canViewNotices && { path: "/notices", label: t("nav.notices"), tour: "menu-notices", badge: "notices" },
           ] },
           { id: "resources", label: "الموارد", items: [
+            opens("/association-rules") && { path: "/association-rules", label: "قوانين الجمعية", tour: "menu-rules" },
             opens("/files") && { path: "/files", label: t("nav.files"), tour: "menu-files", badge: "files" },
             canViewVehicles && { path: "/vehicles", label: t("nav.vehicles"), tour: "menu-vehicles", badge: "vehicles" },
           ] },
diff --git a/apps/system/src/Components/Header/Header.test.js b/apps/system/src/Components/Header/Header.test.js
index 549b747..42f6e0a 100644
--- a/apps/system/src/Components/Header/Header.test.js
+++ b/apps/system/src/Components/Header/Header.test.js
@@ -60,9 +60,9 @@ beforeEach(() => {
 });
 afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
 
-test("the menu has the pages only: no dashboard, profile, install or sign-out", async () => {
+test("the menu starts with Home; profile, install and sign-out stay in the account menu", async () => {
   await mount();
-  expect(navText()).toEqual(["البرنامج", "المهمات الأسبوعية", "الطلاب", "طاقم الجمعية", "التقارير", "الملفات"]);
+  expect(navText()).toEqual(["الرئيسي", "البرنامج", "المهمات الأسبوعية", "الطلاب", "طاقم الجمعية", "التقارير", "الملفات"]);
 });
 
 test("the logo opens the dashboard", async () => {
@@ -122,14 +122,19 @@ test("sign-out is reachable before the user's details load", async () => {
 test("each page link follows its permission", async () => {
   mockPerms = ["students.view", "lessons.view"];
   await mount();
-  expect(navText()).toEqual(["البرنامج", "المهمات الأسبوعية", "الطلاب"]);
+  expect(navText()).toEqual(["الرئيسي", "البرنامج", "المهمات الأسبوعية", "الطلاب"]);
 });
 
 const groupButton = (name) => [...host.querySelectorAll('#main-nav button')].find((button) => button.textContent.includes(name));
+test("association rules is a separate permission-gated navigation destination", async () => {
+  mockPerms = ["students.parentLink"];
+  await mount();
+  expect(host.querySelector('#main-nav a[href="/association-rules"]').textContent).toBe("قوانين الجمعية");
+});
 test("desktop pages are direct links, mark the active page and keep phone groups after resizing", async () => {
   await mount();
-  expect(host.querySelector('#main-nav a').textContent).toBe("البرنامج");
-  expect(host.querySelector('#main-nav a').getAttribute("aria-current")).toBe("page");
+  expect(host.querySelector('#main-nav a').textContent).toBe("الرئيسي");
+  expect(host.querySelector('#main-nav a[href="/lessons"]').getAttribute("aria-current")).toBe("page");
   expect(host.querySelectorAll('#main-nav button')).toHaveLength(0);
   expect(host.querySelector('#main-nav a[href="/weekly-tasks"]').closest('[hidden]')).toBeNull();
   await act(async () => host.querySelector('#main-nav a[href="/students"]').click());
@@ -197,7 +202,7 @@ test("groups with no permitted pages are absent", async () => {
   expect(groupButton("الأعضاء والطاقم")).toBeUndefined();
   expect(groupButton("المتابعة")).toBeUndefined();
   expect(groupButton("الموارد")).toBeUndefined();
-  expect(navText()).toEqual(["المهمات الأسبوعية"]);
+  expect(navText()).toEqual(["الرئيسي", "المهمات الأسبوعية"]);
 });
 
 // The system account has no everyday role: its label is «النظام», not an assistant's.
diff --git a/apps/system/src/Components/Header/NavigationMenu.jsx b/apps/system/src/Components/Header/NavigationMenu.jsx
index e2bd2f2..5291449 100644
--- a/apps/system/src/Components/Header/NavigationMenu.jsx
+++ b/apps/system/src/Components/Header/NavigationMenu.jsx
@@ -5,7 +5,7 @@ import styles from "./NavigationMenu.module.css";
 
 const activeAt = (item, path) => item.path === "/lessons" ? /^\/(lessons|calendar)(\/|$)/.test(path) : path === item.path || path.startsWith(`${item.path}/`);
 
-export default function NavigationMenu({ groups, program, mobile, open, onClose, onNav }) {
+export default function NavigationMenu({ groups, program, home, mobile, open, onClose, onNav }) {
   const { pathname } = useLocation();
   const nav = useRef(null);
   const triggers = useRef({});
@@ -71,6 +71,7 @@ export default function NavigationMenu({ groups, program, mobile, open, onClose,
       onBlur={(event) => { if (!mobile && !event.currentTarget.contains(event.relatedTarget)) setExpanded(null); }}>
       {mobile && <div className={styles.menuHeading}><strong>القائمة الرئيسية</strong><button type="button" onClick={onClose} aria-label="إغلاق القائمة">×</button></div>}
       <nav id="main-nav" data-tour="menu" aria-label="التنقل الرئيسي" className={styles.nav}>
+        {home && <div className={styles.shortcut}>{link(home)}</div>}
         {program && <div className={styles.shortcut}>{link(program)}</div>}
         {!mobile && groups.flatMap((group) => group.items).map(link)}
         {mobile && groups.map((group) => <div key={group.id} className={styles.group}>
diff --git a/apps/system/src/Components/Lesson/EditLesson.jsx b/apps/system/src/Components/Lesson/EditLesson.jsx
index 2d19c67..8bf6a21 100644
--- a/apps/system/src/Components/Lesson/EditLesson.jsx
+++ b/apps/system/src/Components/Lesson/EditLesson.jsx
@@ -383,7 +383,14 @@ const EditLesson = () => {
             <option value="regular">برنامج عادي</option>
             <option value="educational">برنامج تربوي</option>
           </select>
-          {lesson.kind === 'educational' && <small>كل طلاب المرشد المسؤول ينضمون إلى هذا البرنامج تلقائيًا، ولكل مرشد برنامج تربوي واحد.</small>}
+          {lesson.kind === 'educational' && <>
+            <label htmlFor="educational-roster">طلاب البرنامج التربوي</label>
+            <select id="educational-roster" name="educationalRoster" value={lesson.educationalRoster || 'all'} onChange={handleChange} disabled={!editing}>
+              <option value="all">جميع طلاب المسؤول تلقائيًا</option>
+              <option value="selected">طلاب محددون لهذا البرنامج</option>
+            </select>
+            <small>يمكن أن يكون للمسؤول أكثر من برنامج تربوي، وأن يشارك الطالب في أكثر من برنامج. في وضع «طلاب محددون» تُعدّل القائمة أدناه ولا ينضم الطلاب الجدد تلقائيًا.</small>
+          </>}
         </div>
         <div className={styles.formControl}>
           <label htmlFor="lesson-teacher">المرشد / الإدارة:<span style={{color: "red"}}>*</span></label>
diff --git a/apps/system/src/Components/Notice/Notice.module.css b/apps/system/src/Components/Notice/Notice.module.css
index 8ea819d..fc388e4 100644
--- a/apps/system/src/Components/Notice/Notice.module.css
+++ b/apps/system/src/Components/Notice/Notice.module.css
@@ -26,6 +26,6 @@
   .bellPanel { position: fixed; top: 64px; inset-inline: 12px; width: auto; }
 }
 
-.systemAlerts { display: grid; gap: 6px; }
+.systemAlerts { display: grid; gap: 6px; padding: 16px; border: 1px solid var(--color-border, #d8e2e8); border-radius: 14px; background: var(--color-surface, #fff); }
 .systemAlerts h2 { margin: 0; font-size: 1.05rem; }
 .systemAlerts ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; max-height: 280px; overflow-y: auto; }
diff --git a/apps/system/src/Components/Notice/NoticesBoard.test.js b/apps/system/src/Components/Notice/NoticesBoard.test.js
index c1c4a0c..2e56af7 100644
--- a/apps/system/src/Components/Notice/NoticesBoard.test.js
+++ b/apps/system/src/Components/Notice/NoticesBoard.test.js
@@ -4,6 +4,7 @@ import { MemoryRouter } from "react-router-dom";
 import { I18nProvider } from "../../i18n/I18nContext";
 import NoticesBoard from "./NoticesBoard";
 import { createNotice, getNotices } from "../../WebServer/services/notice/functionsNotice.jsx";
+jest.mock("./SystemAlerts.jsx", () => () => null);
 
 jest.mock("react-router-dom", () => {
   const { TextEncoder, TextDecoder } = require("util");
diff --git a/apps/system/src/Components/Notice/SystemAlerts.jsx b/apps/system/src/Components/Notice/SystemAlerts.jsx
index d3fbc95..7fac164 100644
--- a/apps/system/src/Components/Notice/SystemAlerts.jsx
+++ b/apps/system/src/Components/Notice/SystemAlerts.jsx
@@ -1,27 +1,70 @@
-import React, { useCallback, useEffect, useState } from "react";
+import React, { useCallback, useEffect, useRef, useState } from "react";
 import { useNavigate } from "react-router-dom";
-import { listAlerts, markAlertRead } from "../../WebServer/services/alerts/functionsAlerts.jsx";
+import { getAlertPage, markAlertRead } from "../../WebServer/services/alerts/functionsAlerts.jsx";
 import { liveEvents } from "../../WebServer/services/live/liveStream";
+import { getNotices, markNoticeRead } from "../../WebServer/services/notice/functionsNotice.jsx";
+import useLiveRefresh from "../../locks/useLiveRefresh";
 import { alertTarget, alertText, alertTime, normalizeAlert } from "../../utils/alertDisplay";
 import styles from "./Notice.module.css";
 
 // The signed-in user's system alerts on the board, past the three the bell shows.
-export default function SystemAlerts() {
+export default function SystemAlerts({ title = "رسائل النظام", showEmpty = false, includeNotices = false }) {
   const navigate = useNavigate();
   const [alerts, setAlerts] = useState([]);
+  const [total, setTotal] = useState(0);
+  const [offset, setOffset] = useState(0);
+  const [notices, setNotices] = useState([]);
+  const [noticeOffset, setNoticeOffset] = useState(0);
+  const [moreNotices, setMoreNotices] = useState(false);
+  const [loading, setLoading] = useState(false);
+  const [error, setError] = useState("");
+  const generation = useRef(0);
+  const pending = useRef(false);
 
-  const load = useCallback(() => listAlerts().then((list) => setAlerts(list.map(normalizeAlert))).catch(() => {}), []);
+  const load = useCallback(async (skip = 0, noticeSkip = 0, append = false) => {
+    if (append && pending.current) return;
+    const request = ++generation.current;
+    pending.current = true;
+    setLoading(true); setError("");
+    try {
+      const [page, board] = await Promise.all([
+        getAlertPage(skip),
+        includeNotices ? getNotices({ status: "all", skip: noticeSkip }) : Promise.resolve({ ok: true, notices: [] }),
+      ]);
+      if (request !== generation.current) return;
+      if (!board.ok) throw new Error("Notices unavailable");
+      const list = page.alerts.map(normalizeAlert);
+      setAlerts((previous) => [...new Map([...(append ? previous : []), ...list].map((alert) => [alert.id, alert])).values()]);
+      const boardItems = (board.notices || []).map((notice) => ({ id: String(notice._id), kind: "notice", text: { ar: notice.title }, at: notice.createdAt, read: Boolean(notice.read), link: "/notices" }));
+      setNotices((previous) => [...new Map([...(append ? previous : []), ...boardItems].map((notice) => [notice.id, notice])).values()]);
+      setNoticeOffset(noticeSkip + boardItems.length);
+      setMoreNotices(boardItems.length === 200);
+      setTotal(page.total);
+      setOffset(list.length ? skip + list.length : page.total);
+    } catch {
+      if (request === generation.current) setError("تعذّر تحميل الإشعارات. حاول مرة أخرى.");
+    } finally {
+      if (request === generation.current) { pending.current = false; setLoading(false); }
+    }
+  }, [includeNotices]);
+  useLiveRefresh(["notice"], () => load(0));
   useEffect(() => {
-    load();
-    return liveEvents.on("alert", load);
+    const refresh = () => load(0);
+    refresh();
+    const unsubscribe = liveEvents.on("alert", refresh);
+    window.addEventListener("NOTICES_CHANGED", refresh);
+    return () => { ++generation.current; unsubscribe(); window.removeEventListener("NOTICES_CHANGED", refresh); };
   }, [load]);
 
-  if (!alerts.length) return null;
+  const items = [...alerts, ...(includeNotices ? notices : [])].sort((a, b) => new Date(b.at) - new Date(a.at));
+  if (!showEmpty && !items.length && !error && !loading) return null;
 
   const open = async (alert) => {
     if (!alert.read) {
-      setAlerts((prev) => prev.map((row) => (row.id === alert.id ? { ...row, read: true } : row)));
-      await markAlertRead(alert.id).catch(() => {});
+      const setRows = alert.kind === "notice" ? setNotices : setAlerts;
+      setRows((prev) => prev.map((row) => (row.id === alert.id ? { ...row, read: true } : row)));
+      if (alert.kind === "notice") await markNoticeRead(alert.id).catch(() => {});
+      else await markAlertRead(alert.id).catch(() => {});
       window.dispatchEvent(new Event("NOTICES_CHANGED"));
     }
     const target = alertTarget(alert.link);
@@ -30,18 +73,22 @@ export default function SystemAlerts() {
   };
 
   return (
-    <section className={styles.systemAlerts} aria-label="رسائل النظام">
-      <h2>رسائل النظام</h2>
-      <ul>
-        {alerts.map((alert) => (
-          <li key={alert.id}>
+    <section className={styles.systemAlerts} aria-label={title}>
+      <h2>{title}</h2>
+      {error && <p role="alert">{error}<button type="button" onClick={() => load(0)}>إعادة المحاولة</button></p>}
+      {!loading && !error && !items.length && <p>لا توجد إشعارات.</p>}
+      <ul aria-label="قائمة الإشعارات" tabIndex={0}>
+        {items.map((alert) => (
+          <li key={`${alert.kind || "alert"}:${alert.id}`}>
             <button type="button" className={`${styles.bellItem} ${alert.read ? "" : styles.bellUnread}`} onClick={() => open(alert)}>
               <span dir="auto">{alertText(alert)}</span>
               <small>{alertTime(alert.at)}</small>
             </button>
           </li>
         ))}
+        {(offset < total || moreNotices) && <li><button type="button" disabled={loading} onClick={() => load(offset, noticeOffset, true)}>عرض إشعارات أقدم</button></li>}
       </ul>
+      {loading && <small role="status">جارٍ تحميل الإشعارات…</small>}
     </section>
   );
 }
diff --git a/apps/system/src/Components/Routes/Routes.jsx b/apps/system/src/Components/Routes/Routes.jsx
index 25542ae..b57533e 100644
--- a/apps/system/src/Components/Routes/Routes.jsx
+++ b/apps/system/src/Components/Routes/Routes.jsx
@@ -31,6 +31,7 @@ const RegisterPage = lazyPage(() => import('../Auth/RegisterPage/RegisterPage'))
 const ParentConsentPage = lazyPage(() => import('../Student/ParentConsentPage'));
 const NoticesBoard = lazyPage(() => import('../Notice/NoticesBoard'));
 const ViewAllStudent = lazyPage(() => import('../Student/ViewAllStudent'));
+const AssociationRulesPage = lazyPage(() => import('../Student/AssociationRulesPage'));
 const EditStudent = lazyPage(() => import('../Student/EditStudent'));
 const StudentView = lazyPage(() => import('../Student/StudentView'));
 const ViewAllUser = lazyPage(() => import('../User/ViewAllUser'));
@@ -111,6 +112,7 @@ export default function CRoutes() {
             <Route path="/calendar" element={<LessonsHub active="attendance"><AttendancePage /></LessonsHub>} />
             
             <Route path="/students" element={<ViewAllStudent />} />
+            <Route path="/association-rules" element={<AssociationRulesPage />} />
             {/* A record opens on its read-only page; /new and /:id/edit open the form. */}
             <Route path="/students/:id" element={<RecordRoute view={<StudentView/>} form={<EditStudent/>} />} />
             <Route path="/students/:id/edit" element={<EditStudent/>} />
diff --git a/apps/system/src/Components/Student/ParentLinkPanel.jsx b/apps/system/src/Components/Student/ParentLinkPanel.jsx
index edee255..3ea003c 100644
--- a/apps/system/src/Components/Student/ParentLinkPanel.jsx
+++ b/apps/system/src/Components/Student/ParentLinkPanel.jsx
@@ -4,7 +4,6 @@ import { toast } from "../../ALERT/SystemToasts.jsx";
 import { ask } from "../Provides/confirmBus.js";
 import { getLink, rotateLink } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
 import styles from "./ParentLinkPanel.module.css";
-import RulesEditor from "./RulesEditor.jsx";
 
 const registrationUrl = (token) => `${window.location.origin}/register-student/${token}`;
 
@@ -94,7 +93,6 @@ export default function ParentLinkPanel() {
         {full && <small>لن يستقبل الرابط طلبات جديدة حتى ينخفض العدد.</small>}
       </div>
 
-      <RulesEditor />
 
     </div>
   );
diff --git a/apps/system/src/Components/Student/RulesEditor.jsx b/apps/system/src/Components/Student/RulesEditor.jsx
index 019c38a..f3d0307 100644
--- a/apps/system/src/Components/Student/RulesEditor.jsx
+++ b/apps/system/src/Components/Student/RulesEditor.jsx
@@ -4,6 +4,7 @@ import { toast } from "../../ALERT/SystemToasts.jsx";
 import { ask } from "../Provides/confirmBus.js";
 import { getRules, publishRules } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
 import { DEFAULT_RULES } from "./defaultRules";
+import { setUnsavedChanges } from "../../utils/unsavedChanges";
 
 // The rules a parent signs on the registration link. Publishing makes a new
 // version; those who already signed keep the version they signed.
@@ -14,6 +15,8 @@ export default function RulesEditor() {
   const [saved, setSaved] = useState("");
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState("");
+  useEffect(() => { if (loaded && !error) setUnsavedChanges(text !== saved); }, [loaded, error, text, saved]);
+  useEffect(() => () => setUnsavedChanges(null), []);
 
   useEffect(() => {
     let alive = true;
diff --git a/apps/system/src/Components/Student/Student.module.css b/apps/system/src/Components/Student/Student.module.css
index 1466037..d7ca6ca 100644
--- a/apps/system/src/Components/Student/Student.module.css
+++ b/apps/system/src/Components/Student/Student.module.css
@@ -93,6 +93,9 @@
   text-align: center;
 }
 
+.listFilters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
+@media (max-width: 480px) { .listFilters { grid-template-columns: minmax(0, 1fr); } }
+
 .toolbar {
   display: flex;
   gap: var(--space-2);
diff --git a/apps/system/src/Components/Student/ViewAllStudent.jsx b/apps/system/src/Components/Student/ViewAllStudent.jsx
index 744e22e..efd819c 100644
--- a/apps/system/src/Components/Student/ViewAllStudent.jsx
+++ b/apps/system/src/Components/Student/ViewAllStudent.jsx
@@ -9,7 +9,7 @@ import StudentStatusFilter from "./StudentStatusFilter.jsx";
 import FilterDialog from "../UI/FilterDialog.jsx";
 import Button from "../UI/Button.jsx";
 import StatusBadge from "../UI/StatusBadge.jsx";
-import { ParentLinkDialog } from "./ParentLinkPanel.jsx";
+import CopyParentLink from "./CopyParentLink.jsx";
 import MobileStudentList from "./MobileStudentList.jsx";
 import Avatar from "../UI/Avatar.jsx";
 import { passportSrc } from "../../utils/passportPhoto";
@@ -31,7 +31,9 @@ const getAge = (birthDate) => {
   if (!birthDate) return "-";
   const date = new Date(birthDate);
   if (Number.isNaN(date.getTime())) return "-";
-  return new Date().getFullYear() - date.getFullYear();
+  const today = new Date();
+  const beforeBirthday = today.getMonth() < date.getMonth() || (today.getMonth() === date.getMonth() && today.getDate() < date.getDate());
+  return today.getFullYear() - date.getFullYear() - Number(beforeBirthday);
 };
 
 const ViewAllStudent = () => {
@@ -51,10 +53,11 @@ const ViewAllStudent = () => {
   const [searchTerm, setSearchTerm] = useState("");
   const [statusFilter, setStatusFilter] = useState("active");
   const [onlyUnsigned, setOnlyUnsigned] = useState(false);
+  const [filters, setFilters] = useState({ minAge: "", maxAge: "", layer: "", gender: "", guide: "", school: "" });
+  const [showAll, setShowAll] = useState(false);
   const [loading, setLoading] = useState(true);
   const [err, setErr] = useState(null);
   const [showFab, setShowFab] = useState(false);
-  const [showParentLink, setShowParentLink] = useState(false);
   const [addBtnEl, setAddBtnEl] = useState(null);
 
   const addBtnRef = useCallback((node) => {
@@ -106,8 +109,17 @@ const ViewAllStudent = () => {
   }, [loadStudent]);
   useLiveRefresh(["student", "lesson"], () => loadStudent({ quiet: true }));
 
+  const ownId = localStorage.getItem("user_id");
+  const hasOwn = Boolean(ownId) && students.some((student) => String(student.main_teacher || "") === ownId);
+  const scopedStudents = useMemo(() => isAdmin && hasOwn && !showAll
+    ? students.filter((student) => String(student.main_teacher || "") === ownId) : students,
+  [students, isAdmin, hasOwn, showAll, ownId]);
+  const optionsFor = (key) => [...new Set(scopedStudents.map((student) => String(student[key] || "")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar", { numeric: true }));
+  const guideOptions = [...new Map(scopedStudents.filter((student) => student.main_teacher).map((student) => [String(student.main_teacher), student.responsibleGuideName || "مرشد غير فعّال"])).entries()];
+  const changeFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
+
   const counts = useMemo(() => {
-    return students.reduce(
+    return scopedStudents.reduce(
       (acc, student) => {
         const key = getStudentFilterKey(student);
         acc[key] += 1;
@@ -117,16 +129,25 @@ const ViewAllStudent = () => {
       },
       { active: 0, pending: 0, inactive: 0, waiting: 0, noActive: 0 }
     );
-  }, [students]);
+  }, [scopedStudents]);
 
   const sortedFilteredStudents = useMemo(() => {
     const query = searchTerm.trim().toLowerCase();
 
-    return students
+    return scopedStudents
       .filter((student) => {
         return getStudentFilterKey(student) === statusFilter;
       })
       .filter((student) => !onlyUnsigned || !student.consentAt)
+      .filter((student) => {
+        const age = getAge(student.birth_date);
+        return (filters.minAge === "" || (typeof age === "number" && age >= Number(filters.minAge)))
+          && (filters.maxAge === "" || (typeof age === "number" && age <= Number(filters.maxAge)))
+          && (!filters.layer || String(student.layer || "") === filters.layer)
+          && (!filters.gender || String(student.gender || "") === filters.gender)
+          && (!filters.school || String(student.school || "") === filters.school)
+          && (!filters.guide || (filters.guide === "unassigned" ? !student.main_teacher : String(student.main_teacher) === filters.guide));
+      })
       .filter((student) => {
         if (!query) return true;
 
@@ -139,6 +160,7 @@ const ViewAllStudent = () => {
           student.email,
           student.school,
           student.layer,
+          student.responsibleGuideName,
           student.status,
           getAge(student.birth_date),
         ]
@@ -152,23 +174,22 @@ const ViewAllStudent = () => {
         const bName = `${b.firstname || ""} ${b.lastname || ""}`.trim();
         return aName.localeCompare(bName, "ar", { sensitivity: "base" });
       });
-  }, [students, searchTerm, statusFilter, onlyUnsigned]);
+  }, [scopedStudents, searchTerm, statusFilter, onlyUnsigned, filters]);
 
   const unsignedCount = useMemo(
-    () => students.filter((student) => getStudentFilterKey(student) === statusFilter && !student.consentAt).length,
-    [students, statusFilter]
+    () => scopedStudents.filter((student) => getStudentFilterKey(student) === statusFilter && !student.consentAt).length,
+    [scopedStudents, statusFilter]
   );
 
   const handleAddStudent = () => {
     navigate("/students/new");
   };
-  const closeParentLink = useCallback(() => setShowParentLink(false), []);
 
   return (
     <div>
       <div>
         <h1 className={styles.pageTitle}>
-          {isAdmin ? "قائمة الطلاب" : "قائمة طلابي"}
+          {isAdmin && (!hasOwn || showAll) ? "طلاب الجمعية" : "قائمة طلابي"}
         </h1>
 
         <div className={styles.toolbar} data-tour="students-toolbar">
@@ -189,10 +210,9 @@ const ViewAllStudent = () => {
           )}
 
           {canParentLink && (
-            <Button variant="secondary" data-tour="students-parent-link" onClick={() => setShowParentLink(true)}>
-              رابط تسجيل الأهل
-            </Button>
+            <CopyParentLink data-tour="students-parent-link" />
           )}
+          {isAdmin && hasOwn && <Button variant="secondary" onClick={() => setShowAll((value) => !value)}>{showAll ? "عرض طلابي" : "عرض طلاب الجمعية"}</Button>}
 
           <Button variant="secondary" data-tour="students-refresh" onClick={loadStudent} loading={loading}>
             {loading ? "جارٍ التحديث…" : "تحديث القائمة"}
@@ -216,11 +236,17 @@ const ViewAllStudent = () => {
             : "الطلاب غير الفعّالين"}: {sortedFilteredStudents.length}
         </div>
         <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 }}>
-          <FilterDialog count={onlyUnsigned ? 1 : 0} onClear={() => setOnlyUnsigned(false)}>
-            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
+          <FilterDialog count={Number(onlyUnsigned) + Object.values(filters).filter((value) => value !== "").length} onClear={() => { setOnlyUnsigned(false); setFilters({ minAge: "", maxAge: "", layer: "", gender: "", guide: "", school: "" }); }}>
+            <div className={styles.listFilters}>
+            <label>العمر من<input type="number" min="0" max="120" value={filters.minAge} onChange={(event) => changeFilter("minAge", event.target.value)} /></label>
+            <label>العمر حتى<input type="number" min="0" max="120" value={filters.maxAge} onChange={(event) => changeFilter("maxAge", event.target.value)} /></label>
+            {[ ["layer", "الصف"], ["gender", "الجنس"], ["school", "المدرسة"] ].map(([key, label]) => <label key={key}>{label}<select value={filters[key]} onChange={(event) => changeFilter(key, event.target.value)}><option value="">الكل</option>{optionsFor(key).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>)}
+            <label>المرشد المسؤول<select value={filters.guide} onChange={(event) => changeFilter("guide", event.target.value)}><option value="">الكل</option><option value="unassigned">بدون مرشد مسؤول</option>{guideOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
+            <label style={{ display: "flex", gap: 8, alignItems: "center", gridColumn: "1 / -1" }}>
               <input type="checkbox" style={{ width: "auto" }} checked={onlyUnsigned} onChange={(event) => setOnlyUnsigned(event.target.checked)} />
               <span>بدون توقيع ولي الأمر فقط</span>
             </label>
+            </div>
           </FilterDialog>
           <small style={{ color: "var(--color-text-secondary)" }}>
             متبقٍ توقيع ولي الأمر ({unsignedCount})
@@ -301,7 +327,6 @@ const ViewAllStudent = () => {
           navigate("/students/new");
         }}
       />
-      {showParentLink && <ParentLinkDialog onClose={closeParentLink} />}
     </div>
   );
 };
diff --git a/apps/system/src/Components/Student/ViewAllStudent.test.js b/apps/system/src/Components/Student/ViewAllStudent.test.js
index 91ba5d5..925e40e 100644
--- a/apps/system/src/Components/Student/ViewAllStudent.test.js
+++ b/apps/system/src/Components/Student/ViewAllStudent.test.js
@@ -1,4 +1,5 @@
 import React from "react";
+import { Simulate } from "react-dom/test-utils";
 import { createRoot } from "react-dom/client";
 import { act } from "react";
 import { MemoryRouter, Routes, Route } from "react-router-dom";
@@ -44,7 +45,7 @@ const STUDENT = { _id: "s1", tz: "800000001", firstname: "طالب", lastname: "
 beforeEach(() => {
   getAll.mockResolvedValue({ ok: true, students: [STUDENT] });
 });
-afterEach(() => { act(() => root.unmount()); container.remove(); });
+afterEach(() => { act(() => root.unmount()); container.remove(); localStorage.clear(); });
 
 const labels = () => [...container.querySelectorAll("button")].map((b) => b.textContent.trim());
 
@@ -92,3 +93,34 @@ test("each row shows the person's photo", async () => {
   expect(imgs.map((i) => i.getAttribute("src"))).toEqual(["https://example.test/s1.jpg"]);
   expect(container.querySelectorAll('ul img[loading="lazy"]').length).toBe(1);
 });
+
+test("management starts with responsible students, can show everyone, and without own students sees everyone", async () => {
+  mockPerms = ["students.view", "students.viewAll"];
+  localStorage.setItem("user_id", "guide-a");
+  getAll.mockResolvedValue({ ok: true, students: [{ ...STUDENT, main_teacher: "guide-a" }, { ...STUDENT, _id: "s2", tz: "800000002", main_teacher: "guide-b" }] });
+  await mount();
+  expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
+  expect(container.querySelector("h1").textContent).toContain("طلابي");
+  await act(async () => [...container.querySelectorAll("button")].find((b) => b.textContent === "عرض طلاب الجمعية").click());
+  expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
+  expect(container.querySelector("h1").textContent).toBe("طلاب الجمعية");
+});
+
+test("age, grade, gender, school, guide and unsigned filters coexist and clear together", async () => {
+  mockPerms = ["students.view", "students.viewAll"];
+  getAll.mockResolvedValue({ ok: true, students: [
+    { ...STUDENT, birth_date: "2014-01-01", gender: "ذكر", layer: "السادس", school: "مدرسة أ", main_teacher: "a", responsibleGuideName: "أحمد" },
+    { ...STUDENT, _id: "s2", tz: "800000002", consentAt: "2026-01-01", birth_date: "2010-01-01", gender: "أنثى", layer: "العاشر", school: "مدرسة ب", main_teacher: "b", responsibleGuideName: "سارة" },
+  ] });
+  await mount();
+  await act(async () => [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "فلتر").click());
+  const field = (label) => [...document.querySelectorAll('[role="dialog"] label')].find((node) => node.textContent.startsWith(label)).querySelector("input,select");
+  for (const [label, value] of [["العمر من", "10"], ["العمر حتى", "14"], ["الصف", "السادس"], ["الجنس", "ذكر"], ["المدرسة", "مدرسة أ"], ["المرشد المسؤول", "a"]]) {
+    await act(async () => Simulate.change(field(label), { target: { value } }));
+  }
+  await act(async () => document.querySelector('[role="dialog"] input[type="checkbox"]').click());
+  expect(container.querySelector("tbody").textContent).toContain("800000001");
+  expect(container.querySelector("tbody").textContent).not.toContain("800000002");
+  await act(async () => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "مسح الفلتر").click());
+  expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
+});
diff --git a/apps/system/src/Components/WeeklyTasks/WeeklyTasks.module.css b/apps/system/src/Components/WeeklyTasks/WeeklyTasks.module.css
index 19a7b28..5256dc8 100644
--- a/apps/system/src/Components/WeeklyTasks/WeeklyTasks.module.css
+++ b/apps/system/src/Components/WeeklyTasks/WeeklyTasks.module.css
@@ -1,4 +1,7 @@
 .page { display: grid; gap: 16px; max-width: 1100px; margin: 0 auto; padding: 16px; box-sizing: border-box; }
+.filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; }
+.filters label { display: grid; gap: 5px; flex: 1 1 220px; min-width: 0; }
+.filters input, .filters select { box-sizing: border-box; width: 100%; min-width: 0; }
 .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
 .head h1 { margin: 0; }
 .panel { display: grid; gap: 10px; padding: 16px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); }
diff --git a/apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.jsx b/apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.jsx
index b125146..d7ac062 100644
--- a/apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.jsx
+++ b/apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.jsx
@@ -19,13 +19,25 @@ const weekLabel = (week) => {
 
 // What the person himself must do this week: to do, then done in green.
 function MyTasks({ tasks, onToggle, busy }) {
-  const open = tasks.filter((task) => !task.done);
-  const done = tasks.filter((task) => task.done);
+  const [group, setGroup] = useState("");
+  const [search, setSearch] = useState("");
+  const groups = [...new Map(tasks.map((task) => [String(task.groupId), task.groupName])).entries()];
+  const selectedGroup = groups.some(([id]) => id === group) ? group : "";
+  const query = search.trim().toLocaleLowerCase();
+  const filtered = tasks.filter((task) => (!selectedGroup || String(task.groupId) === selectedGroup)
+    && (!query || `${task.title || ""} ${task.groupName || ""}`.toLocaleLowerCase().includes(query)));
+  const open = filtered.filter((task) => !task.done);
+  const done = filtered.filter((task) => task.done);
   return (
     <section className={styles.panel} aria-label="مهماتي">
       <h2>مهمات مجموعتي هذا الأسبوع</h2>
       <p className={styles.muted}>أكّد إنجاز المهمات حتى نهاية يوم السبت. يبدأ أسبوع جديد بعد ذلك، وتُغلق مهمات الأسبوع السابق.</p>
-      {open.length === 0 && <p className={styles.muted}>لا توجد مهمات متبقية.</p>}
+      <div className={styles.filters}>
+        {groups.length > 1 && <label>المجموعة<select value={selectedGroup} onChange={(event) => setGroup(event.target.value)}><option value="">كل مجموعاتي</option>{groups.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
+        <label>بحث في مهماتي<input type="search" placeholder="اسم مجموعة أو مهمة" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
+        {(selectedGroup || search) && <Button variant="secondary" onClick={() => { setGroup(""); setSearch(""); }}>مسح الفلتر</Button>}
+      </div>
+      {filtered.length === 0 ? <p className={styles.muted}>لا توجد مهمات مطابقة.</p> : open.length === 0 && <p className={styles.muted}>كل المهمات المعروضة منجزة.</p>}
       <ul className={styles.list}>
         {open.map((task) => (
           <li key={`${task.groupId}:${task.taskId}`} className={styles.item}>
diff --git a/apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.test.js b/apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.test.js
index a05301e..71d8db6 100644
--- a/apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.test.js
+++ b/apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.test.js
@@ -1,4 +1,5 @@
 import React, { act } from "react";
+import { Simulate } from "react-dom/test-utils";
 import { createRoot } from "react-dom/client";
 
 const mockNavigate = jest.fn();
@@ -35,6 +36,22 @@ const mount = async () => {
 };
 const button = (text) => [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
 
+test("personal group filter and free search combine without changing completion or management view", async () => {
+  getMyTasks.mockResolvedValue({ ok: true, week: WEEK, tasks: [task(), task({ groupId: "g2", groupName: "المجموعة الثانية", taskId: "t2", title: "ترتيب المطبخ", done: true })] });
+  await mount();
+  await act(async () => Simulate.change(host.querySelector("select"), { target: { value: "g2" } }));
+  expect(host.textContent).not.toContain("نظافة الغرفة");
+  expect(host.textContent).toContain("ترتيب المطبخ");
+  await act(async () => Simulate.change(host.querySelector('input[type="search"]'), { target: { value: "الثانية" } }));
+  expect(host.textContent).toContain("ترتيب المطبخ");
+  await act(async () => Simulate.change(host.querySelector('input[type="search"]'), { target: { value: "غير موجود" } }));
+  expect(host.textContent).toContain("لا توجد مهمات مطابقة");
+  expect(host.textContent).not.toContain("كل المهمات المعروضة منجزة");
+  await act(async () => button("مسح الفلتر").click());
+  expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
+  expect(setMyTaskDone).not.toHaveBeenCalled();
+});
+
 beforeEach(() => {
   mockManage = false;
   mockNavigate.mockReset();
diff --git a/apps/system/src/WebServer/services/alerts/functionsAlerts.jsx b/apps/system/src/WebServer/services/alerts/functionsAlerts.jsx
index ec23293..d1600dd 100644
--- a/apps/system/src/WebServer/services/alerts/functionsAlerts.jsx
+++ b/apps/system/src/WebServer/services/alerts/functionsAlerts.jsx
@@ -7,6 +7,12 @@ export async function listAlerts({ unread = false } = {}) {
   return Array.isArray(data?.alerts) ? data.alerts : [];
 }
 
+export async function getAlertPage(skip = 0) {
+  const { data } = await api.get("/alerts", { params: { skip } });
+  if (data?.ok === false) throw new Error(data.message || "تعذّر تحميل الإشعارات");
+  return { alerts: Array.isArray(data?.alerts) ? data.alerts : [], total: Number(data?.total) || 0 };
+}
+
 // The server's own count: it sees past the 50 a list returns.
 export async function countUnreadAlerts() {
   const { data } = await api.get("/alerts", { params: { unread: 1 } });
diff --git a/apps/system/src/i18n/I18nContext.jsx b/apps/system/src/i18n/I18nContext.jsx
index deaf091..fa50874 100644
--- a/apps/system/src/i18n/I18nContext.jsx
+++ b/apps/system/src/i18n/I18nContext.jsx
@@ -20,7 +20,7 @@ const translations = {
       system: "النظام",
     },
     nav: {
-      dashboard: "لوحة التحكم",
+      dashboard: "الرئيسي",
       attendance: "الحضور والغياب",
       students: "الطلاب",
       users: "المستخدمون",
diff --git a/apps/system/src/i18n/accessStrings.js b/apps/system/src/i18n/accessStrings.js
index 38adb59..454d2b0 100644
--- a/apps/system/src/i18n/accessStrings.js
+++ b/apps/system/src/i18n/accessStrings.js
@@ -3,7 +3,7 @@
 
 const modules = {
   ar: {
-    dashboard: "لوحة التحكم", calendar: "التقويم", students: "الطلاب", lessons: "البرامج",
+    dashboard: "الرئيسي", calendar: "التقويم", students: "الطلاب", lessons: "البرامج",
     attendance: "الحضور والغياب", tasks: "المهمات الأسبوعية", reports: "التقارير", vehicles: "المركبات", files: "الملفات",
     notices: "الإعلانات", users: "المستخدمون", ai: "المساعد الذكي", permissions: "الصلاحيات",
     audit: "سجل التغييرات", sports: "الرياضة", systemRecovery: "استعادة حساب النظام", storage: "التخزين",
diff --git a/apps/system/src/i18n/assistantStrings.js b/apps/system/src/i18n/assistantStrings.js
index 62a6f2a..2a70e85 100644
--- a/apps/system/src/i18n/assistantStrings.js
+++ b/apps/system/src/i18n/assistantStrings.js
@@ -50,7 +50,7 @@ export const assistantStrings = {
         other: "البيانات",
       },
       screens: {
-        dashboard: "لوحة التحكم", students: "الطلاب", student: "ملف الطالب", lessons: "البرامج", lesson: "البرنامج",
+        dashboard: "الرئيسي", students: "الطلاب", student: "ملف الطالب", lessons: "البرامج", lesson: "البرنامج",
         attendance: "الحضور", reports: "التقارير", report: "التقرير", vehicles: "المركبات", vehicle: "المركبة",
         files: "الملفات", notices: "لوحة الإعلانات", users: "المستخدمون", user: "المستخدم", audit: "سجل التغييرات", profile: "الملف الشخصي",
       },
diff --git a/apps/system/src/utils/routeAccess.js b/apps/system/src/utils/routeAccess.js
index 5838b1c..521b723 100644
--- a/apps/system/src/utils/routeAccess.js
+++ b/apps/system/src/utils/routeAccess.js
@@ -4,6 +4,7 @@ import { hasPermission } from "./permissionKeys";
 // page behind login is open to every signed-in user. These mirror what the
 // menu and the page buttons offer; the server enforces its own rules.
 const RESTRICTED = [
+  { pattern: /^\/association-rules(\/|$)/, key: "students.parentLink" },
   // The forms: only an admin edits by default (owner, 2026-11-01).
   { pattern: /^\/weekly-tasks\/manage$/, key: "tasks.manage" },
   { pattern: /^\/users\/new$/, key: "users.create" },
diff --git a/apps/system/src/utils/unsavedChanges.js b/apps/system/src/utils/unsavedChanges.js
index 1a1457e..d7396da 100644
--- a/apps/system/src/utils/unsavedChanges.js
+++ b/apps/system/src/utils/unsavedChanges.js
@@ -13,6 +13,7 @@ export const getUnsavedChanges = () => state;
 
 // Pages whose edits a navigation away could lose.
 export const EDIT_PATTERNS = [
+  /^\/association-rules$/,
   // A student, user or lesson opens on a read-only page (/x/:id); its form is
   // /x/new or /x/:id/edit.
   /^\/students\/(new|[^/]+\/edit)$/,
diff --git a/apps/system/src/utils/unsavedChanges.test.js b/apps/system/src/utils/unsavedChanges.test.js
index bc6c1aa..94b884f 100644
--- a/apps/system/src/utils/unsavedChanges.test.js
+++ b/apps/system/src/utils/unsavedChanges.test.js
@@ -16,6 +16,8 @@ describe("needsLeaveConfirm", () => {
   });
 
   test("defaults to the state the page reported", () => {
+    expect(needsLeaveConfirm("/association-rules", true)).toBe(true);
+    expect(needsLeaveConfirm("/association-rules", false)).toBe(false);
     setUnsavedChanges(false);
     expect(needsLeaveConfirm("/students/1/edit")).toBe(false);
     setUnsavedChanges(true);
diff --git a/server/Entities/Alert/Alert.model.js b/server/Entities/Alert/Alert.model.js
index a36ff08..bd9d10c 100644
--- a/server/Entities/Alert/Alert.model.js
+++ b/server/Entities/Alert/Alert.model.js
@@ -34,7 +34,7 @@ AlertModelDef.insertOnce = async function (doc) {
 
 // The recipient's alerts, newest first; total counts every match. `types`
 // (optional) limits the result to those alert types.
-AlertModelDef.listFor = async function (recipientTz, { unreadOnly = false, limit = 50, types } = {}) {
+AlertModelDef.listFor = async function (recipientTz, { unreadOnly = false, limit = 50, types, skip = 0 } = {}) {
   const filter = { recipientTz };
   if (unreadOnly) filter.readAt = null;
   if (Array.isArray(types)) filter.type = { $in: types };
@@ -44,6 +44,7 @@ AlertModelDef.listFor = async function (recipientTz, { unreadOnly = false, limit
     filter,
     sort: { at: -1, _id: -1 },
     limit,
+    skip,
   });
   return { result: res.result, total: res.total };
 };
diff --git a/server/Entities/Alert/Alert.route.js b/server/Entities/Alert/Alert.route.js
index 29c1735..87d3972 100644
--- a/server/Entities/Alert/Alert.route.js
+++ b/server/Entities/Alert/Alert.route.js
@@ -36,7 +36,9 @@ function createAlertRouter({ requireAuth, loadActor, store, now = () => new Date
       // Only the types the caller may still see now (a demoted user stops
       // seeing alerts sent under their old permissions).
       const types = visibleAlertTypes(req.actor);
-      const { result, total } = await store.listFor(req.actor.tz, { unreadOnly, limit: LIMIT, types });
+      const skip = Number(req.query.skip || 0);
+      if (!Number.isSafeInteger(skip) || skip < 0 || skip > 1000000) return res.status(400).json({ ok: false, message: "صفحة الإشعارات غير صالحة" });
+      const { result, total } = await store.listFor(req.actor.tz, { unreadOnly, limit: LIMIT, types, skip });
       return res.status(200).json({ ok: true, alerts: (result || []).map(view), total });
     } catch (error) {
       logWithSource("Alert.list", error);
diff --git a/server/Entities/Lesson/Lesson.controller.js b/server/Entities/Lesson/Lesson.controller.js
index 24c3167..77f7c8b 100644
--- a/server/Entities/Lesson/Lesson.controller.js
+++ b/server/Entities/Lesson/Lesson.controller.js
@@ -148,14 +148,15 @@ function buildLesson(body) {
     room: body?.room ?? "0",
     list_students: Array.isArray(body?.list_students) ? body.list_students : [],
     ...(body?.kind ? { kind: body.kind === "educational" ? "educational" : "regular" } : {}),
+    ...(body?.kind === "educational" ? { educationalRoster: body.educationalRoster === "selected" ? "selected" : "all" } : {}),
   };
 }
 
 // A guide's educational lesson (services/educationalLesson). Never fatal to the save.
 const edu = () => require("../../services/educationalLesson").educationalLessons();
-const EDUCATIONAL_TAKEN = { ok: false, code: "EDUCATIONAL_EXISTS", message: "لهذا المرشد برنامج تربوي. لكل مرشد برنامج تربوي واحد." };
-const enrolGuideStudents = (teacher) => Promise.resolve()
-  .then(() => edu().enrolAll(teacher))
+const validEducationalRoster = (body) => body?.educationalRoster === undefined || ["all", "selected"].includes(body.educationalRoster);
+const enrolGuideStudents = (teacher, lessonId) => Promise.resolve()
+  .then(() => edu().enrolAll(teacher, lessonId))
   .catch((err) => logWithSource("Lesson.enrolGuideStudents", err));
 
 const pad2 = (n) => String(n).padStart(2, "0");
@@ -314,7 +315,7 @@ const postOne = async (req, res) => {
     }
     if (await namesSystemAccount([model.teacher, model.helper])) return res.status(400).json(SYSTEM_STAFF);
     if (!validProgramHours(req.body?.date)) return res.status(400).json(PROGRAM_HOURS);
-    if (model.kind === "educational" && (await edu().takenBy(model.teacher))) return res.status(409).json(EDUCATIONAL_TAKEN);
+    if (!validEducationalRoster(req.body)) return res.status(400).json({ ok: false, message: "اختر طريقة إضافة طلاب البرنامج التربوي" });
 
     const sameDay = await LessonModelDef.get({ "date.day": model.date.day });
     const sportDay = await SportLessonModelDef.get({ "date.day": model.date.day });
@@ -338,7 +339,7 @@ const postOne = async (req, res) => {
     });
     await recordLesson(req, "create", null, created?.result || model);
     notifyChange("lesson", created?.result?._id);
-    if (model.kind === "educational") await enrolGuideStudents(model.teacher);
+    if (model.kind === "educational") await enrolGuideStudents(model.teacher, created?.result?._id);
 
     return res.status(201).json({ ok: true, lesson: created });
   } catch (err) {
@@ -392,7 +393,7 @@ const putOne = async (req, res) => {
     }
     if (await namesSystemAccount([req.body?.teacher, req.body?.helper])) return res.status(400).json(SYSTEM_STAFF);
     if (!validProgramHours(date)) return res.status(400).json(PROGRAM_HOURS);
-    if (next.kind === "educational" && (await edu().takenBy(next.teacher, id))) return res.status(409).json(EDUCATIONAL_TAKEN);
+    if (!validEducationalRoster(req.body)) return res.status(400).json({ ok: false, message: "اختر طريقة إضافة طلاب البرنامج التربوي" });
 
     const sameDay = await LessonModelDef.get({ "date.day": next.date.day });
     const sportDay = await SportLessonModelDef.get({ "date.day": next.date.day });
@@ -418,7 +419,7 @@ const putOne = async (req, res) => {
     await recordLesson(req, "update", current, { ...current, ...next });
     notifyChange("lesson", id);
     // The guide's students stay on it, whatever the submitted roster said.
-    if (next.kind === "educational") await enrolGuideStudents(next.teacher);
+    if (next.kind === "educational") await enrolGuideStudents(next.teacher, id);
 
     const lesson = visible && updated?.result ? { ...updated, result: scopeLesson(updated.result, visible) } : updated;
     return res.status(200).json({ ok: true, lesson });
@@ -511,7 +512,7 @@ const removeFromList = async (req, res) => {
     }
 
     const lesson = existingRes.result[0];
-    if (lesson.kind === "educational" && removeList.length) {
+    if (lesson.kind === "educational" && lesson.educationalRoster !== "selected" && removeList.length) {
       const own = await StudentModelDef.get({ main_teacher: String(lesson.teacher) });
       const ownIds = new Set((own?.result || []).map((s) => String(s._id)));
       if (removeList.some((r) => ownIds.has(String(r)))) {
diff --git a/server/Entities/Notice/Notice.controller.js b/server/Entities/Notice/Notice.controller.js
index fa6ab61..4e0ce56 100644
--- a/server/Entities/Notice/Notice.controller.js
+++ b/server/Entities/Notice/Notice.controller.js
@@ -38,11 +38,14 @@ const handle = (name, fn) => async (req, res) => {
 
 const list = handle("list", async (req, res) => {
   const { status = "all", category = "", severity = "" } = req.query || {};
+  const skip = Number(req.query?.skip || 0);
+  if (!Number.isSafeInteger(skip) || skip < 0 || skip > 1000000) return fail(res, 400, "صفحة الإشعارات غير صالحة");
   const notices = await service.listNotices({
     userId: req.actor.id,
     status: status === "unread" ? "unread" : "all",
     category: CATEGORIES.includes(category) ? category : "",
     severity: SEVERITIES.includes(severity) ? severity : "",
+    skip,
   });
   return res.status(200).json({ ok: true, notices });
 });
diff --git a/server/Entities/Notice/Notice.service.js b/server/Entities/Notice/Notice.service.js
index 5b9a46a..7c3e085 100644
--- a/server/Entities/Notice/Notice.service.js
+++ b/server/Entities/Notice/Notice.service.js
@@ -63,7 +63,7 @@ function stillShown(row, userId, now) {
   return now - readAt <= READ_KEEP_MS;
 }
 
-async function listNotices({ userId, status = "all", category = "", severity = "" }) {
+async function listNotices({ userId, status = "all", category = "", severity = "", skip = 0 }) {
   const now = new Date();
   return (await activeNotices(now))
     .filter((row) => stillShown(row, userId, now))
@@ -71,7 +71,7 @@ async function listNotices({ userId, status = "all", category = "", severity = "
     .filter((row) => (status === "unread" ? !row.read : true))
     .filter((row) => (category ? row.category === category : true))
     .filter((row) => (severity ? row.severity === severity : true))
-    .slice(0, MAX_LIST);
+    .slice(skip, skip + MAX_LIST);
 }
 
 async function countUnread(userId) {
diff --git a/server/Entities/Student/Student.controller.js b/server/Entities/Student/Student.controller.js
index c018ea2..e76114a 100644
--- a/server/Entities/Student/Student.controller.js
+++ b/server/Entities/Student/Student.controller.js
@@ -160,10 +160,12 @@ const getAllS = async (req, res) => {
   try {
     const [result, visible] = await Promise.all([StudentModelDef.get({}), scope.visibleStudentIds(req.actor)]);
     const students = (result?.result || []).filter((s) => inScope(visible, s));
+    const guideNames = new Map(await Promise.all([...new Set(students.map((s) => String(s.main_teacher || "")).filter(Boolean))]
+      .map(async (id) => [id, (await contactById(UserModelDef, id, req.actor))?.name || ""])));
 
     return res.status(200).json({
       ok: true,
-      students: students.map(sanitize),
+      students: students.map((student) => ({ ...sanitize(student), responsibleGuideName: guideNames.get(String(student.main_teacher || "")) || "" })),
     });
   } catch (err) {
     logWithSource("Student.getAllS", err);
diff --git a/server/services/educationalLesson.js b/server/services/educationalLesson.js
index d32fcf8..9e144b8 100644
--- a/server/services/educationalLesson.js
+++ b/server/services/educationalLesson.js
@@ -1,21 +1,23 @@
-// A responsible guide's educational lesson holds all of that guide's students
-// (owner, 2026-11-05): a student joins on approval or when added, and moves when the
-// guide changes. A waiting request is not a student yet.
+// A responsible user can have multiple educational programs. Legacy programs
+// automatically include all their students; selected programs keep manual
+// rosters. Changing the responsible user removes the student from old programs
+// and adds them only to the new user's automatic programs.
 const KIND = "educational";
 const PENDING = "ينتظر";
 
 const rows = (res) => (Array.isArray(res?.result) ? res.result : []);
 const same = (a, b) => String(a) === String(b);
+const automatic = (lesson) => lesson.kind === KIND && lesson.educationalRoster !== "selected";
 
 function createEducationalLessons({ lessons, students, now = () => new Date(), lockPrograms = async () => async () => {}, changed = () => {} }) {
-  const lessonOf = async (teacher) => (teacher ? rows(await lessons.get({ teacher: String(teacher), kind: KIND }))[0] || null : null);
+  const lessonsOf = async (teacher) => teacher ? rows(await lessons.get({ teacher: String(teacher), kind: KIND })) : [];
 
   // Retry a roster delta against the latest snapshot. Never replace a roster
   // another write changed while this request was awaiting the database.
   async function change(lesson, delta) {
     for (let attempt = 0; attempt < 8 && lesson; attempt += 1) {
       const list = lesson.list_students || [];
-      const next = delta(list);
+      const next = delta(list, lesson);
       if (next.length === list.length && next.every((id, i) => same(id, list[i]))) return 0;
       const before = lesson.updatedAt;
       const updatedAt = new Date(Math.max(now().getTime(), (new Date(before || 0).getTime() || 0) + 1));
@@ -29,39 +31,33 @@ function createEducationalLessons({ lessons, students, now = () => new Date(), l
   }
 
   async function holdForStudentChange(from, to, req) {
-    const programs = await Promise.all([lessonOf(from), lessonOf(to)]);
-    return lockPrograms(programs.filter(Boolean).map((lesson) => `lesson:${lesson._id}`), req);
+    const programs = (await Promise.all([lessonsOf(from), lessonsOf(to)])).flat();
+    return lockPrograms([...new Set(programs.map((lesson) => `lesson:${lesson._id}`))].sort(), req);
   }
 
   // Puts every student of this guide on the lesson. Returns how many joined.
-  async function enrolAll(teacher) {
-    const lesson = await lessonOf(teacher);
-    if (!lesson) return 0;
+  async function enrolAll(teacher, lessonId = null) {
+    const programs = (await lessonsOf(teacher)).filter((lesson) => automatic(lesson) && (!lessonId || same(lesson._id, lessonId)));
+    if (!programs.length) return 0;
     const own = rows(await students.get({ main_teacher: String(teacher) })).filter((s) => s.status !== PENDING);
-    return change(lesson, (list) => [...new Set([...list.map(String), ...own.map((s) => String(s._id))])]);
+    let added = 0;
+    for (const lesson of programs) added += await change(lesson, (list, current) => automatic(current) && same(current.teacher, teacher)
+      ? [...new Set([...list.map(String), ...own.map((s) => String(s._id))])] : list);
+    return added;
   }
 
   // After a student's guide changed, or a request was approved.
   async function moveStudent(studentId, fromTeacher, toTeacher) {
     if (fromTeacher && !same(fromTeacher, toTeacher ?? "")) {
-      const old = await lessonOf(fromTeacher);
-      if (old && (old.list_students || []).some((x) => same(x, studentId))) {
-        await change(old, (list) => list.filter((x) => !same(x, studentId)));
+      for (const old of await lessonsOf(fromTeacher)) {
+        await change(old, (list, current) => current.kind === KIND && same(current.teacher, fromTeacher) ? list.filter((x) => !same(x, studentId)) : list);
       }
     }
-    const next = await lessonOf(toTeacher);
-    if (next && !(next.list_students || []).some((x) => same(x, studentId))) {
-      await change(next, (list) => list.some((x) => same(x, studentId)) ? list : [...list, String(studentId)]);
+    for (const next of (await lessonsOf(toTeacher)).filter(automatic)) {
+      await change(next, (list, current) => !automatic(current) || !same(current.teacher, toTeacher) || list.some((x) => same(x, studentId)) ? list : [...list, String(studentId)]);
     }
   }
-
-  // Taken by another lesson of the same guide? A guide has one for now.
-  async function takenBy(teacher, ignoreId = null) {
-    const lesson = await lessonOf(teacher);
-    return lesson && !same(lesson._id, ignoreId ?? "") ? lesson : null;
-  }
-
-  return { enrolAll, moveStudent, takenBy, holdForStudentChange };
+  return { enrolAll, moveStudent, holdForStudentChange };
 }
 
 const educationalLessons = () => createEducationalLessons({
diff --git a/server/test/alert-engine.test.js b/server/test/alert-engine.test.js
index e142cc5..be59464 100644
--- a/server/test/alert-engine.test.js
+++ b/server/test/alert-engine.test.js
@@ -50,10 +50,10 @@ function alertStore() {
       docs.push(saved);
       return { created: true, alert: saved };
     },
-    async listFor(recipientTz, { unreadOnly = false, limit = 50, types } = {}) {
+    async listFor(recipientTz, { unreadOnly = false, limit = 50, types, skip = 0 } = {}) {
       const mine = docs.filter((d) => d.recipientTz === recipientTz && (!unreadOnly || !d.readAt)
         && (!Array.isArray(types) || types.includes(d.type)));
-      const result = mine.sort((a, b) => new Date(b.at) - new Date(a.at) || (a._id < b._id ? 1 : -1)).slice(0, limit);
+      const result = mine.sort((a, b) => new Date(b.at) - new Date(a.at) || (a._id < b._id ? 1 : -1)).slice(skip, skip + limit);
       return { result, total: mine.length };
     },
     async markRead(recipientTz, id, at) {
@@ -350,6 +350,14 @@ test("GET /api/alerts lists only the caller's alerts, newest first, at most 50;
     const unread = await (await fetch(`${base}?unread=1`, { headers: { "x-tz": "t-a" } })).json();
     assert.equal(unread.alerts[0].text.en, "e53");
     assert.equal(unread.total, 54);
+    const older = await (await fetch(`${base}?skip=50`, { headers: { "x-tz": "t-a" } })).json();
+    assert.equal(older.alerts.length, 5);
+    assert.equal(older.total, 55);
+    assert.equal(older.alerts[0].text.en, "e4");
+    assert.ok(older.alerts.every((row) => !all.alerts.some((first) => first.id === row.id)));
+    for (const skip of ["-1", "1.5", "NaN", "1000001"]) {
+      assert.equal((await fetch(`${base}?skip=${skip}`, { headers: { "x-tz": "t-a" } })).status, 400);
+    }
   } finally { server.close(); }
 });
 
diff --git a/server/test/alert-model.test.js b/server/test/alert-model.test.js
index 126d5f5..529d579 100644
--- a/server/test/alert-model.test.js
+++ b/server/test/alert-model.test.js
@@ -12,6 +12,7 @@ function loadModel() {
   const rows = [];
   const fakeApi = {
     calls, rows,
+    async readPage(options) { calls.push(["readPage", options]); return { result: [], total: 0 }; },
     async read({ filter }) {
       calls.push(["read", filter]);
       return { result: rows.filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v)) };
@@ -68,6 +69,16 @@ test("someone else's row is not read and not found", async () => {
   assert.equal(api.rows[0].readAt, null);
 });
 
+test("older inbox pages keep recipient and current type restrictions in the database query", async () => {
+  const { AlertModelDef, api } = loadModel();
+  await AlertModelDef.listFor("caller", { skip: 50, limit: 50, types: ["report_missing"], unreadOnly: true });
+  const query = api.calls[0][1];
+  assert.deepEqual(query.filter, { recipientTz: "caller", type: { $in: ["report_missing"] }, readAt: null });
+  assert.equal(query.skip, 50);
+  assert.equal(query.limit, 50);
+  assert.deepEqual(query.sort, { at: -1, _id: -1 });
+});
+
 test("read all: 30 days for ordinary rows, no limit for vehicle rows", async () => {
   const { AlertModelDef, api } = loadModel();
   const updated = await AlertModelDef.markAllRead("t1", AT);
diff --git a/server/test/educational-lesson.test.js b/server/test/educational-lesson.test.js
index 662efe8..668d8c6 100644
--- a/server/test/educational-lesson.test.js
+++ b/server/test/educational-lesson.test.js
@@ -59,11 +59,47 @@ test("an approved request joins; the same guide again adds nothing", async () =>
   assert.deepEqual(lessons.docs[0].list_students, ["s9", "s2"]);
 });
 
-test("a guide has one educational lesson: another is reported as taken", async () => {
-  const { edu } = setup();
-  assert.equal((await edu.takenBy("g1"))._id, "e1");
-  assert.equal(await edu.takenBy("g1", "e1"), null);
-  assert.equal(await edu.takenBy("nobody"), null);
+test("multiple automatic programs receive students; selected programs retain separate rosters", async () => {
+  const { edu, lessons } = setup();
+  lessons.docs.push({ _id: "e3", teacher: "g1", kind: "educational", educationalRoster: "all", list_students: [] });
+  lessons.docs.push({ _id: "e4", teacher: "g1", kind: "educational", educationalRoster: "selected", list_students: ["s9"] });
+  await edu.enrolAll("g1");
+  assert.deepEqual(lessons.docs[3].list_students, ["s1", "s9"]);
+  assert.deepEqual(lessons.docs[4].list_students, ["s9"]);
+  await edu.moveStudent("s3", "g2", "g1");
+  assert.ok(lessons.docs[0].list_students.includes("s3"));
+  assert.ok(lessons.docs[3].list_students.includes("s3"));
+  assert.deepEqual(lessons.docs[4].list_students, ["s9"]);
+});
+
+test("saving one program does not reconcile other automatic programs", async () => {
+  const { edu, lessons } = setup();
+  lessons.docs.push({ _id: "e3", teacher: "g1", kind: "educational", educationalRoster: "all", list_students: [] });
+  await edu.enrolAll("g1", "e3");
+  assert.deepEqual(lessons.docs[0].list_students, ["s9"]);
+  assert.deepEqual(lessons.docs[3].list_students, ["s1", "s9"]);
+});
+
+test("changing responsibility removes the student from every old subset; new subsets remain manual", async () => {
+  const { edu, lessons } = setup();
+  lessons.docs.push({ _id: "e3", teacher: "g2", kind: "educational", educationalRoster: "selected", list_students: ["s3"] });
+  lessons.docs.push({ _id: "e4", teacher: "g1", kind: "educational", educationalRoster: "selected", list_students: [] });
+  await edu.moveStudent("s3", "g2", "g1");
+  assert.deepEqual(lessons.docs[1].list_students, []);
+  assert.deepEqual(lessons.docs[3].list_students, []);
+  assert.deepEqual(lessons.docs[4].list_students, []);
+});
+
+test("a concurrent switch to selected membership prevents an automatic retry from adding students", async () => {
+  const { edu, lessons } = setup();
+  const update = lessons.updateExisting;
+  let raced = false;
+  lessons.updateExisting = async (filter, data) => {
+    if (!raced) { raced = true; lessons.docs[0].educationalRoster = "selected"; lessons.docs[0].updatedAt = new Date("2026-11-06"); }
+    return update(filter, data);
+  };
+  await edu.moveStudent("s1", null, "g1");
+  assert.deepEqual(lessons.docs[0].list_students, ["s9"]);
 });
 
 test("simultaneous automatic additions preserve both students using a fresh roster on conflict", async () => {
@@ -92,4 +128,7 @@ test("student guide changes request locks for old and new educational programs",
   const edu = createEducationalLessons({ lessons, students, lockPrograms: async (keys, request) => { asked.push([keys, request]); return async () => {}; } });
   await edu.holdForStudentChange("g1", "g2", req);
   assert.deepEqual(asked, [[["lesson:e1", "lesson:e2"], req]]);
+  lessons.docs.push({ _id: "e3", teacher: "g1", kind: "educational", educationalRoster: "selected", list_students: [] });
+  await edu.holdForStudentChange("g1", "g1", req);
+  assert.deepEqual(asked[1], [["lesson:e1", "lesson:e3"], req]);
 });
diff --git a/server/test/notice-controller.test.js b/server/test/notice-controller.test.js
index 05ef597..bc58204 100644
--- a/server/test/notice-controller.test.js
+++ b/server/test/notice-controller.test.js
@@ -14,6 +14,19 @@ const READER = { _id: "c".repeat(24), tz: "333333334", firstname: "Re", lastname
 // An administrator whose notices access was revoked.
 const REVOKED = { _id: "d".repeat(24), tz: "444444442", firstname: "Re", lastname: "Voked", roles: ["ادارة"], permissionRevokes: ["notices"], email: "revoked@example.com" };
 
+test("notice pages preserve visibility, expiry and the page limit", async () => {
+  const ctx = setup();
+  for (let i = 0; i < 205; i += 1) ctx.rows.push({ _id: String(i).padStart(24, "0"), title: `notice ${i}`, createdAt: new Date(Date.UTC(2026, 10, 7, 0, i)).toISOString(), readBy: [], archivedAt: null });
+  ctx.rows.push({ _id: "f".repeat(24), title: "Expired", createdAt: "2099-01-01", expireAt: new Date("2020-01-01"), readBy: [] });
+  const first = await guarded(ctx, READER, "list");
+  const next = await guarded(ctx, READER, "list", { query: { skip: "200" } });
+  assert.equal(first.body.notices.length, 200);
+  assert.equal(next.body.notices.length, 5);
+  assert.ok(!next.body.notices.some((row) => first.body.notices.some((other) => other._id === row._id)));
+  assert.equal((await guarded(ctx, REVOKED, "list", { query: { skip: "200" } })).statusCode, 403);
+  for (const skip of ["-1", "1.5", "invalid"]) assert.equal((await guarded(ctx, READER, "list", { query: { skip } })).statusCode, 400);
+});
+
 function load(file, dependencies) {
   const filename = path.join(__dirname, "../Entities/Notice", file);
   const module = { exports: {} };
diff --git a/server/test/student-scope-routes.test.js b/server/test/student-scope-routes.test.js
index de82d26..eede9c3 100644
--- a/server/test/student-scope-routes.test.js
+++ b/server/test/student-scope-routes.test.js
@@ -114,6 +114,7 @@ function world({ lockPrograms } = {}) {
   });
   const lesson = load("Lesson/Lesson.controller.js", {
     ...common,
+    "../../services/educationalLesson": { educationalLessons: () => require("../services/educationalLesson").createEducationalLessons({ lessons, students, lockPrograms }) },
     "./Lesson.model": { LessonModelDef: lessons },
     "../Sport/SportLesson.model": { SportLessonModelDef: { async get() { return { success: true, result: [] }; } } },
     "../../utils/lessonConflict": require("../utils/lessonConflict"),
@@ -153,6 +154,9 @@ test("a guide's student list holds only his 2 of the 5 students; an admin sees a
 
   const admin = await call(w.student.getAllS, reqAs(ADMIN));
   assert.equal(admin.body.students.length, 5);
+  assert.equal(guide.body.students.find((student) => student._id === sid(2)).responsibleGuideName, "Gu Ide");
+  assert.equal(guide.body.students.find((student) => student._id === sid(1)).responsibleGuideName, "");
+  assert.equal(guide.body.students[0].guide, undefined, "listing adds a safe name only, not the user record");
 });
 
 test("an administrator can still make an IT guide a student's responsible guide", async () => {
@@ -334,6 +338,29 @@ test("removeFromList with a hidden id leaves the roster unchanged; a visible id
   assert.deepEqual(plain(w.lessons.all().find((l) => l._id === "lesson-2").list_students), [sid(4)]);
 });
 
+test("one responsible user can create separate educational subsets alongside automatic programs", async () => {
+  const w = world();
+  const create = (day, educationalRoster, ids) => call(w.lesson.postOne, reqAs(ADMIN, { body: {
+    name: `Educational ${day}`, teacher: GUIDE._id, room: "1", kind: "educational", educationalRoster,
+    date: { day, startMin: 840, endMin: 885 }, list_students: ids,
+  } }));
+  assert.equal((await create(3, "selected", [sid(1)])).statusCode, 201);
+  const selected = w.lessons.all().at(-1);
+  assert.deepEqual(plain(selected.list_students), [sid(1)], "another responsible student is not injected into a subset");
+  assert.equal((await create(4, "selected", [sid(2)])).statusCode, 201);
+  assert.equal((await create(5, "all", [])).statusCode, 201);
+  assert.deepEqual(plain(w.lessons.all().at(-1).list_students), [sid(2)]);
+  const removed = await call(w.lesson.removeFromList, reqAs(ADMIN, { params: { id: w.lessons.all().at(-2)._id }, body: { list_students: [sid(2)] } }));
+  assert.equal(removed.statusCode, 200);
+  assert.deepEqual(plain(w.lessons.all().at(-2).list_students), []);
+  const blocked = await call(w.lesson.removeFromList, reqAs(ADMIN, { params: { id: w.lessons.all().at(-1)._id }, body: { list_students: [sid(2)] } }));
+  assert.equal(blocked.statusCode, 409);
+  const changed = await call(w.lesson.putOne, reqAs(ADMIN, { params: { id: selected._id }, body: { educationalRoster: "all" } }));
+  assert.equal(changed.statusCode, 200);
+  assert.ok(w.lessons.all().find((lesson) => String(lesson._id) === String(selected._id)).list_students.includes(sid(2)));
+  assert.equal((await create(6, "invalid", [])).statusCode, 400);
+});
+
 test("a scoped addToList takes _ids only if visible; existing but hidden _ids and unknown ids are dropped", async () => {
   const w = world();
   // s5 exists but is hidden: a guessed _id must not pull him in.
### apps/system/src/Components/Student/CopyParentLink.jsx
import React, { useEffect, useState } from "react";
import { getLink } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
import Button from "../UI/Button.jsx";

// Fetch in advance so clipboard.writeText runs during the user's click,
// including on browsers that require transient user activation.
export default function CopyParentLink(props) {
  const [token, setToken] = useState("");
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setError(false);
    getLink().then((res) => {
      if (!live) return;
      if (res?.ok && res.token) setToken(res.token);
      else setError(true);
    }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [attempt]);
  const copy = () => {
    if (error) { setAttempt((value) => value + 1); return; }
    try {
      Promise.resolve(navigator.clipboard.writeText(`${window.location.origin}/register-student/${token}`))
        .then(() => toast.success("تم نسخ الرابط"))
        .catch(() => toast.error("تعذّر نسخ الرابط، حاول مرة أخرى."));
    } catch { toast.error("تعذّر نسخ الرابط، حاول مرة أخرى."); }
  };
  return <Button variant="secondary" {...props} disabled={!token && !error} onClick={copy}>
    {error ? "إعادة تحميل رابط الأهل" : "نسخ رابط تسجيل الأهل"}
  </Button>;
}

### apps/system/src/Components/Student/AssociationRulesPage.jsx
import React from "react";
import RulesEditor from "./RulesEditor.jsx";

export default function AssociationRulesPage() {
  return <section dir="rtl" style={{ maxWidth: 900, margin: "0 auto" }}>
    <h1>قوانين الجمعية</h1>
    <p>تعديل القوانين ونشر النسخة التي يوافق عليها الأهل عند التسجيل أو التوقيع.</p>
    <RulesEditor />
  </section>;
}

### apps/system/src/Components/Student/CopyParentLink.test.js
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import CopyParentLink from "./CopyParentLink";
import { getLink } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
jest.mock("../../WebServer/services/inviteToken/functionInviteToken.jsx", () => ({ getLink: jest.fn() }));
jest.mock("../../ALERT/SystemToasts.jsx", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, write;
beforeEach(() => {
  write = jest.fn().mockResolvedValue();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: write } });
  getLink.mockResolvedValue({ ok: true, token: "synthetic-token" });
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
test("one press copies the registration link without exposing a URL or opening rules", async () => {
  await act(async () => root.render(<CopyParentLink />));
  expect(host.querySelector("input,textarea,[role=dialog],a")).toBeNull();
  expect(host.textContent).not.toContain("synthetic-token");
  await act(async () => host.querySelector("button").click());
  expect(write).toHaveBeenCalledWith(`${window.location.origin}/register-student/synthetic-token`);
  expect(toast.success).toHaveBeenCalled();
});
test("a failed fetch offers retry and never copies an invalid link", async () => {
  getLink.mockResolvedValueOnce({ ok: false });
  await act(async () => root.render(<CopyParentLink />));
  await act(async () => host.querySelector("button").click());
  expect(write).not.toHaveBeenCalled();
  expect(host.textContent).toBe("نسخ رابط تسجيل الأهل");
  await act(async () => host.querySelector("button").click());
  expect(write).toHaveBeenCalledTimes(1);
});

### apps/system/src/Components/Notice/SystemAlerts.test.js
import React, { act } from "react";
import { createRoot } from "react-dom/client";
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));
jest.mock("../../WebServer/services/alerts/functionsAlerts.jsx", () => ({ getAlertPage: jest.fn(), markAlertRead: jest.fn() }));
jest.mock("../../WebServer/services/live/liveStream", () => ({ liveEvents: { on: () => () => {} } }));
jest.mock("../../WebServer/services/notice/functionsNotice.jsx", () => ({ getNotices: jest.fn(), markNoticeRead: jest.fn() }));
import { getNotices, markNoticeRead } from "../../WebServer/services/notice/functionsNotice.jsx";
import { getAlertPage, markAlertRead } from "../../WebServer/services/alerts/functionsAlerts.jsx";
import SystemAlerts from "./SystemAlerts";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const row = (n) => ({ id: String(n), text: { ar: `تنبيه ${n}` }, at: "2026-11-07T10:00:00Z", link: "/weekly-tasks", read: false });
beforeEach(() => {
  getAlertPage.mockImplementation(async (skip) => ({ alerts: skip ? [row(51)] : Array.from({ length: 50 }, (_, n) => row(n + 1)), total: 51 }));
  markAlertRead.mockResolvedValue();
  getNotices.mockResolvedValue({ ok: true, notices: [] });
  markNoticeRead.mockResolvedValue({ ok: true });
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
test("home can browse beyond fifty personal notifications and open an older task", async () => {
  await act(async () => root.render(<SystemAlerts title="الإشعارات" showEmpty />));
  const older = () => [...host.querySelectorAll("button")].find((button) => button.textContent === "عرض إشعارات أقدم");
  await act(async () => older().click());
  expect(getAlertPage).toHaveBeenLastCalledWith(50);
  expect(host.querySelectorAll("li")).toHaveLength(51);
  expect(older()).toBeUndefined();
  await act(async () => [...host.querySelectorAll("li button")].find((button) => button.textContent.includes("تنبيه 51")).click());
  expect(markAlertRead).toHaveBeenCalledWith("51");
  expect(mockNavigate).toHaveBeenCalledWith("/weekly-tasks");
  expect(getNotices).not.toHaveBeenCalled();
});
test("home includes board notices only when allowed, with their separate read action", async () => {
  getNotices.mockResolvedValue({ ok: true, notices: [{ _id: "1", title: "إعلان اجتماع", createdAt: "2026-11-07T11:00:00Z", read: false }] });
  await act(async () => root.render(<SystemAlerts title="الإشعارات" includeNotices />));
  expect(host.querySelectorAll("li")).toHaveLength(52);
  await act(async () => [...host.querySelectorAll("li button")].find((button) => button.textContent.includes("إعلان اجتماع")).click());
  expect(markNoticeRead).toHaveBeenCalledWith("1");
  expect(markAlertRead).not.toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalledWith("/notices");
});
test("a failure is visible and retry recovers", async () => {
  getAlertPage.mockRejectedValueOnce(new Error("offline"));
  await act(async () => root.render(<SystemAlerts showEmpty />));
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () => host.querySelector('[role="alert"] button').click());
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.querySelectorAll("li")).toHaveLength(51);
});

## Final guide alignment addendum
Final verify: 1503 server, 1124 System tests, 128 suites, optimized build passed.
diff --git a/apps/system/src/WebServer/services/problemLog.js b/apps/system/src/WebServer/services/problemLog.js
index 0389d41..889828a 100644
--- a/apps/system/src/WebServer/services/problemLog.js
+++ b/apps/system/src/WebServer/services/problemLog.js
@@ -5,7 +5,7 @@
 export const WINDOW_MS = 2 * 60 * 1000;
 
 const SECTIONS = {
-  dashboard: "لوحة التحكم",
+  dashboard: "الرئيسي",
   calendar: "الحضور والغياب",
   attendance: "الحضور والغياب",
   students: "الطلاب",
diff --git a/apps/system/src/guide/guideContent.js b/apps/system/src/guide/guideContent.js
index 275bca3..18cd8cf 100644
--- a/apps/system/src/guide/guideContent.js
+++ b/apps/system/src/guide/guideContent.js
@@ -70,7 +70,7 @@ export const GUIDE = [
     path: "/dashboard",
     chapterId: "journey-dashboard",
     updated: "2026-10-29",
-    title: { ar: "لوحة التحكم", he: "לוח הבקרה" },
+    title: { ar: "الرئيسي", he: "לוח הבקרה" },
     summary: {
       ar: "الشاشة الأولى بعد الدخول: أرقام سريعة، طلبات تنتظر موافقتك، ودروس اليوم.",
       he: "המסך הראשון אחרי הכניסה: מספרים מהירים, בקשות שמחכות לאישור שלך, והשיעורים של היום.",
@@ -251,8 +251,8 @@ export const GUIDE = [
       {
         requires: "students.parentLink",
         text: {
-          ar: "«رابط تسجيل الأهل»: انسخه وأرسله للأهل، وطلباتهم تظهر بانتظار الموافقة. تغيير الرابط يوقف القديم.",
-          he: "«رابط تسجيل الأهل» (קישור הרשמה להורים): מעתיקים ושולחים להורים, והבקשות שלהם מופיעות בהמתנה לאישור. החלפת הקישור מבטלת את הישן.",
+          ar: "«نسخ رابط تسجيل الأهل» ينسخ الرابط مباشرة، وطلبات الأهل تظهر بانتظار الموافقة. تُعدّل القوانين من قسم «قوانين الجمعية» المستقل.",
+          he: "«نسخ رابط تسجيل الأهل» מעתיק את הקישור ישירות; בקשות ההורים ממתינות לאישור. עורכים את התקנון במחלקת «قوانين الجمعية».",
         },
       },
       {
diff --git a/apps/system/src/journey/chapters/dashboard.js b/apps/system/src/journey/chapters/dashboard.js
index ec97e04..2c5b777 100644
--- a/apps/system/src/journey/chapters/dashboard.js
+++ b/apps/system/src/journey/chapters/dashboard.js
@@ -3,7 +3,7 @@
 // pending student, and opens the reject confirmation only to cancel it.
 const dashboard = {
   id: "journey-dashboard",
-  title: "لوحة التحكم",
+  title: "الرئيسي",
   route: "/dashboard",
   requires: null,
   steps: [
diff --git a/apps/system/src/journey/chapters/students.js b/apps/system/src/journey/chapters/students.js
index edd78ea..6bc5642 100644
--- a/apps/system/src/journey/chapters/students.js
+++ b/apps/system/src/journey/chapters/students.js
@@ -184,53 +184,7 @@ const students = {
       requires: "students.parentLink",
       mood: "point",
       title: "رابط تسجيل الأهل",
-      body: "سأفتح لك نافذة رابط تسجيل الأهل.",
-      action: { type: "click", target: "students-parent-link" },
-    },
-    {
-      target: "parent-link-dialog",
-      requires: "students.parentLink",
-      mood: "explain",
-      title: "الرابط الثابت",
-      body: "الرابط الثابت يُرسل للأهل، وطلبهم يظهر في الانتظار.",
-    },
-    {
-      target: "parent-link-copy",
-      requires: "students.parentLink",
-      mood: "point",
-      title: "نسخ الرابط",
-      body: "«نسخ» ينسخ الرابط لتلصقه في رسالة.",
-    },
-    {
-      target: "parent-link-usage",
-      requires: "students.parentLink",
-      mood: "point",
-      title: "عدد الطلبات",
-      body: "عدد الطلبات آخر سبعة أيام، وللرابط حدّ أقصى.",
-    },
-    {
-      target: "parent-link-rotate",
-      requires: "students.parentLink",
-      mood: "warn",
-      title: "تغيير الرابط",
-      body: "تغيير الرابط يوقف القديم، وسأعرض التأكيد فقط.",
-      action: { type: "click", target: "parent-link-rotate" },
-    },
-    {
-      target: "confirm-cancel",
-      requires: "students.parentLink",
-      mood: "explain",
-      title: "إلغاء التغيير",
-      body: "سأضغط «إلغاء» فيبقى الرابط كما هو.",
-      action: { type: "cancelConfirm" },
-    },
-    {
-      target: "parent-link-close",
-      requires: "students.parentLink",
-      mood: "point",
-      title: "إغلاق النافذة",
-      body: "سأغلق النافذة وأعود إلى قائمة الطلاب.",
-      action: { type: "click", target: "parent-link-close" },
+      body: "«نسخ رابط تسجيل الأهل» ينسخ الرابط مباشرة. القوانين في قسم «قوانين الجمعية».",
     },
   ],
 };
diff --git a/apps/system/src/utils/routeAccess.test.js b/apps/system/src/utils/routeAccess.test.js
index ad39f6e..c69ff16 100644
--- a/apps/system/src/utils/routeAccess.test.js
+++ b/apps/system/src/utils/routeAccess.test.js
@@ -86,6 +86,7 @@ test.each([
   ["/reports/new", ["reports.create"]],
   ["/files", ["files.use"]],
   ["/files", ["files.manageAll"]],
+  ["/association-rules", ["students.parentLink"]],
 ])("%s opens with %j and is closed with no key of its section", (path, keys) => {
   expect(canAccessPath(path, keys)).toBe(true);
   expect(canAccessPath(path, ["dashboard.view", "students.view"])).toBe(false);
