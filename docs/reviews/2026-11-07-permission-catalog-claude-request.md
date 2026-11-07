# Independent source-only review: unified permission catalog

Codex implements; actual Claude Code reviews only the supplied patch without
tools, external file access or editing. Find concrete authorization regressions,
missing or incorrectly granted permissions, stale build artifacts, or UI saves
that remove grants/revokes. Give severity, file/line evidence and a failure case.
Do not request another reviewer. Report when no concrete finding is established.

Owner wants IT permission sections to match System and stay synchronized.
IT previously missed tasks.manage and used old dashboard/program/roster names.
One canonical JSON now holds the existing server tree, six IT-only keys, labels
and hidden sections. Server reads it; CRA-local generated copies synchronize
before each client's start/test/build and before server tests. Existing server
role defaults, validation, grants/revokes and enforcement are unchanged.
User permission and role-default screens use the existing toggle/save behavior.
Navigation permission section labels read the same catalog. No database, actual
permissions assignment, cloud services, migration or production deployment.

Focused server tests passed (30). IT focused UI tests passed before adding an
extra role-default task regression; full suites/build verification in progress.
Only authorized source below; no credentials, environment values, logs or records.

## Existing-file diff

```diff
diff --git a/apps/it/package.json b/apps/it/package.json
index 47e9bf4..581323b 100644
--- a/apps/it/package.json
+++ b/apps/it/package.json
@@ -5,7 +5,10 @@
   "scripts": {
     "start": "react-scripts start",
     "build": "react-scripts build",
-    "test": "react-scripts test --watchAll=false --runInBand"
+    "test": "react-scripts test --watchAll=false --runInBand",
+    "prestart": "node ../../scripts/syncPermissions.js",
+    "pretest": "node ../../scripts/syncPermissions.js",
+    "prebuild": "node ../../scripts/syncPermissions.js"
   },
   "dependencies": {
     "@simplewebauthn/browser": "13.3.0",
diff --git a/apps/it/src/screens/RoleDefaults.test.js b/apps/it/src/screens/RoleDefaults.test.js
index 7efc3ef..181bbf1 100644
--- a/apps/it/src/screens/RoleDefaults.test.js
+++ b/apps/it/src/screens/RoleDefaults.test.js
@@ -27,6 +27,18 @@ afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });
 const moduleBox = (c, module) => c.querySelector(`[data-module="${module}"] input[type=checkbox]`);
 const openModule = (c, module) => click(c.querySelector(`[data-module="${module}"] button[aria-expanded]`));

+test("RoleDefaults includes weekly tasks from the shared catalog and keeps IT keys out", async () => {
+  api.getRoleDefaults.mockImplementation(() => ok({ ...DATA, grantable: [...DATA.grantable, "tasks.manage"] }));
+  const c = await mount(<RoleDefaults />);
+  expect(c.querySelector('[data-module="tasks"]')).not.toBeNull();
+  expect(c.querySelector('[data-module="permissions"]')).toBeNull();
+  await openModule(c, "tasks");
+  expect(c.textContent).toContain("إدارة المهمات الأسبوعية");
+  await click(c.querySelector('input[name="tasks.manage"]'));
+  await click(button(c, "حفظ"));
+  expect(c.querySelector('[role="dialog"]').textContent).toContain("المهمات الأسبوعية: إدارة المهمات الأسبوعية");
+});
+
 test("RoleDefaults: three roles; only keys that may be defaults are shown", async () => {
   const c = await mount(<RoleDefaults />);
   expect(button(c, "الإدارة")).toBeDefined();
@@ -49,7 +61,7 @@ test("RoleDefaults: a change is saved after the confirm, with what was added", a
   await click(button(c, "حفظ"));
   const dialog = c.querySelector("[role=dialog]");
   expect(dialog.textContent).toContain("4 مستخدمين");
-  expect(dialog.textContent).toContain("الدروس");
+  expect(dialog.textContent).toContain("البرنامج");
   await click(button(dialog, "حفظ"));
   await flush();
   expect(api.saveRoleDefaults).toHaveBeenCalledWith("مرشد", ["students.view", "lessons.view", "lessons.edit"]);
diff --git a/apps/it/src/strings.js b/apps/it/src/strings.js
index e981f9d..35dfddf 100644
--- a/apps/it/src/strings.js
+++ b/apps/it/src/strings.js
@@ -1,5 +1,5 @@
-// Arabic text of the IT site. The permission names are copied from the
-// everyday app (apps/system/src/i18n/accessStrings.js).
+// Arabic permission labels share the System/server catalog.
+import catalog from "./generated/permissions.json";

 export const GENERIC_ERROR = "حدث خطأ، حاول مرة أخرى.";
 export const TOO_MANY = "محاولات كثيرة. حاول مرة أخرى بعد قليل.";
@@ -12,25 +12,7 @@ export const ROOMS = { active: "نشط", waiting: "بانتظار القبول",

 export const fillText = (text, values) => String(text).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");

-const modules = {
-  dashboard: "لوحة التحكم", calendar: "التقويم", students: "الطلاب", lessons: "الدروس",
-  attendance: "الحضور والغياب", tasks: "المهمات الأسبوعية", reports: "التقارير", vehicles: "المركبات", files: "الملفات",
-  notices: "الإعلانات", users: "المستخدمون", ai: "المساعد الذكي", permissions: "الصلاحيات",
-  audit: "سجل التغييرات", sports: "الرياضة", systemRecovery: "استعادة حساب النظام", storage: "التخزين",
-};
-
-const leaves = {
-  view: "عرض", viewAll: "عرض الكل", create: "إضافة", edit: "تعديل", delete: "حذف",
-  photo: "الصورة", parentLink: "رابط تسجيل الأهل", roster: "قائمة طلاب الدرس", copyMonth: "نسخ شهر",
-  record: "تسجيل", editOwn: "تعديل ما أنشأه", editAll: "تعديل الكل", exportPdf: "تصدير PDF",
-  compliance: "الفحوصات والتأمين", documents: "المستندات", archive: "أرشفة",
-  use: "استخدام", manageAll: "إدارة كل الملفات", post: "نشر", runCheck: "تشغيل الفحص",
-  approve: "قبول", changeRole: "تغيير الدور", passwords: "عرض كلمات المرور", unlock: "رفع الحظر",
-  resetPassword: "تعيين كلمة مرور جديدة", manage: "إدارة الصلاحيات", reset: "إعادة تعيين",
-};
-
-// Module-specific leaf names win over the shared ones.
-const leavesByModule = { sports: { coach: "تدريب الفرق", manage: "إدارة الرياضة" }, storage: { drive: "حساب Google Drive" } };
+const { modules, leaves, leavesByModule } = catalog.labels.ar;

 export const moduleName = (module) => modules[module] || module;
 export const leafName = (key) => {
diff --git a/apps/it/src/ui/permissionKeys.js b/apps/it/src/ui/permissionKeys.js
index 2008496..893bf62 100644
--- a/apps/it/src/ui/permissionKeys.js
+++ b/apps/it/src/ui/permissionKeys.js
@@ -1,27 +1,13 @@
-// Mirror of PERMISSION_TREE and IT_KEYS in server/utils/permissions.js. Keep both in step.
-export const PERMISSION_TREE = {
-  dashboard: ["view"], calendar: ["view"],
-  students: ["view", "viewAll", "create", "edit", "delete", "photo", "parentLink"],
-  lessons: ["view", "viewAll", "create", "edit", "roster", "delete", "copyMonth"],
-  attendance: ["view", "record"],
-  reports: ["create", "editOwn", "viewAll", "editAll", "delete", "exportPdf"],
-  vehicles: ["view", "edit", "compliance", "documents", "archive", "delete"],
-  files: ["use", "manageAll"],
-  notices: ["view", "post", "runCheck"],
-  users: ["view", "create", "edit", "approve", "delete", "changeRole", "passwords", "unlock", "resetPassword"],
-  ai: ["use"], permissions: ["manage"], audit: ["view"], systemRecovery: ["reset"],
-  sports: ["view", "coach", "manage"], finance: ["view"],
-  storage: ["drive"],
-};
+// Canonical definitions are generated from shared/permissions.json.
+import catalog from "../generated/permissions.json";
+
+export const PERMISSION_TREE = catalog.tree;

 export const ALL_KEYS = Object.entries(PERMISSION_TREE).flatMap(([module, leaves]) =>
   leaves.map((leaf) => `${module}.${leaf}`));

 // What only the IT site does; no everyday permission set holds one.
-export const IT_KEYS = new Set([
-  "permissions.manage", "users.passwords", "users.unlock",
-  "audit.view", "storage.drive", "systemRecovery.reset",
-]);
+export const IT_KEYS = new Set(catalog.itKeys);

 // A leaf key needs that leaf; a module key needs every leaf of the module.
 export const hasPermission = (permissions, key) => {
diff --git a/apps/it/src/ui/permissionTree.js b/apps/it/src/ui/permissionTree.js
index f538048..7f17489 100644
--- a/apps/it/src/ui/permissionTree.js
+++ b/apps/it/src/ui/permissionTree.js
@@ -1,10 +1,11 @@
 // Pure helpers for the permissions tab. A state is { defaults, grants, revokes }:
 // defaults are the role's leaf keys; grants/revokes may hold leaf or module
 // keys (the server expands module keys). effective = (defaults + grants) - revokes.
+import catalog from "../generated/permissions.json";
 import { PERMISSION_TREE, ALL_KEYS } from "./permissionKeys";

 // Reserved modules are not shown until they are built.
-export const HIDDEN_MODULES = ["finance"];
+export const HIDDEN_MODULES = catalog.hiddenModules;

 export const visibleModules = () => Object.keys(PERMISSION_TREE).filter((m) => !HIDDEN_MODULES.includes(m));

diff --git a/apps/system/package.json b/apps/system/package.json
index 90bf6c5..f85b9fc 100644
--- a/apps/system/package.json
+++ b/apps/system/package.json
@@ -37,7 +37,10 @@
   "scripts": {
     "start": "react-scripts start",
     "build": "react-scripts build",
-    "test": "react-scripts test --watchAll=false --runInBand"
+    "test": "react-scripts test --watchAll=false --runInBand",
+    "prestart": "node ../../scripts/syncPermissions.js",
+    "pretest": "node ../../scripts/syncPermissions.js",
+    "prebuild": "node ../../scripts/syncPermissions.js"
   },
   "jest": {
     "moduleNameMapper": {
diff --git a/apps/system/src/Components/Header/Header.jsx b/apps/system/src/Components/Header/Header.jsx
index a85c911..cfa6c7d 100644
--- a/apps/system/src/Components/Header/Header.jsx
+++ b/apps/system/src/Components/Header/Header.jsx
@@ -233,12 +233,12 @@ export default function Header() {
         program={(opens("/lessons") || opens("/calendar")) ? { path: opens("/lessons") ? "/lessons" : "/calendar", label: t("nav.lessons"), tour: "menu-lessons", badge: "lessons" } : null}
         groups={[
           { id: "daily", label: "العمل اليومي", items: [
-            { path: "/weekly-tasks", label: "المهمات الأسبوعية", tour: "menu-weekly-tasks" },
+            { path: "/weekly-tasks", label: t("nav.tasks"), tour: "menu-weekly-tasks" },
             opens("/sports") && { path: "/sports", label: t("nav.sports"), tour: "menu-sports" },
           ] },
           { id: "people", label: "الأعضاء والطاقم", items: [
             canViewStudents && { path: "/students", label: t("nav.students"), tour: "menu-students", badge: "students" },
-            canViewUsers && { path: "/users", label: "طاقم الجمعية", tour: "menu-users", badge: "users" },
+            canViewUsers && { path: "/users", label: t("nav.users"), tour: "menu-users", badge: "users" },
           ] },
           { id: "followup", label: "المتابعة", items: [
             opens("/reports") && { path: "/reports", label: t("nav.reports"), tour: "menu-reports", badge: "reports" },
diff --git a/apps/system/src/i18n/I18nContext.jsx b/apps/system/src/i18n/I18nContext.jsx
index fa50874..8faf053 100644
--- a/apps/system/src/i18n/I18nContext.jsx
+++ b/apps/system/src/i18n/I18nContext.jsx
@@ -1,3 +1,4 @@
+import catalog from "../generated/permissions.json";
 import { createContext, useContext, useEffect } from "react";

 import { vehicleStrings } from "./vehicleStrings";
@@ -20,13 +21,14 @@ const translations = {
       system: "النظام",
     },
     nav: {
-      dashboard: "الرئيسي",
-      attendance: "الحضور والغياب",
-      students: "الطلاب",
-      users: "المستخدمون",
-      lessons: "البرنامج",
-      reports: "التقارير",
-      files: "الملفات",
+      tasks: catalog.labels.ar.modules.tasks,
+      dashboard: catalog.labels.ar.modules.dashboard,
+      attendance: catalog.labels.ar.modules.attendance,
+      students: catalog.labels.ar.modules.students,
+      users: catalog.labels.ar.modules.users,
+      lessons: catalog.labels.ar.modules.lessons,
+      reports: catalog.labels.ar.modules.reports,
+      files: catalog.labels.ar.modules.files,
       profile: "الملف الشخصي",
       guide: "دليل المستخدم",
       logout: "تسجيل الخروج",
@@ -98,11 +100,11 @@ const translations = {
 // The vehicles section (and a few others) keep their (large) text in their own files.
 const dictionary = translations.ar;
 dictionary.vehicles = vehicleStrings.ar;
-dictionary.nav.vehicles = vehicleStrings.ar.navTitle;
+dictionary.nav.vehicles = catalog.labels.ar.modules.vehicles;
 dictionary.sport = sportStrings.ar;
-dictionary.nav.sports = sportStrings.ar.navTitle;
+dictionary.nav.sports = catalog.labels.ar.modules.sports;
 dictionary.notices = noticeStrings.ar;
-dictionary.nav.notices = noticeStrings.ar.navTitle;
+dictionary.nav.notices = catalog.labels.ar.modules.notices;
 dictionary.roster = rosterStrings.ar;
 dictionary.record = recordStrings.ar;
 dictionary.assistant = assistantStrings.ar;
diff --git a/apps/system/src/i18n/accessStrings.js b/apps/system/src/i18n/accessStrings.js
index 454d2b0..f493abd 100644
--- a/apps/system/src/i18n/accessStrings.js
+++ b/apps/system/src/i18n/accessStrings.js
@@ -1,28 +1,8 @@
 // Text for the permissions tab, role changes, approvals, unlock and the audit
 // log. Merged in I18nContext as `perms` and `audit`.

-const modules = {
-  ar: {
-    dashboard: "الرئيسي", calendar: "التقويم", students: "الطلاب", lessons: "البرامج",
-    attendance: "الحضور والغياب", tasks: "المهمات الأسبوعية", reports: "التقارير", vehicles: "المركبات", files: "الملفات",
-    notices: "الإعلانات", users: "المستخدمون", ai: "المساعد الذكي", permissions: "الصلاحيات",
-    audit: "سجل التغييرات", sports: "الرياضة", systemRecovery: "استعادة حساب النظام", storage: "التخزين",
-  },
-};
-
-// Operation names, shared by every module that has them.
-const leaves = {
-  ar: {
-    view: "عرض", viewAll: "عرض الكل", create: "إضافة", edit: "تعديل", delete: "حذف",
-    photo: "الصورة", parentLink: "رابط تسجيل الأهل", roster: "قائمة طلاب البرنامج", copyMonth: "نسخ شهر",
-    record: "تسجيل", editOwn: "تعديل ما أنشأه", editAll: "تعديل الكل", exportPdf: "تصدير PDF",
-    compliance: "الفحوصات والتأمين", documents: "المستندات", archive: "أرشفة",
-    use: "استخدام", manageAll: "إدارة كل الملفات", post: "نشر", runCheck: "تشغيل الفحص",
-    approve: "قبول", changeRole: "تغيير الدور", passwords: "عرض كلمات المرور", unlock: "رفع الحظر",
-    resetPassword: "تعيين كلمة مرور جديدة",
-    manage: "إدارة الصلاحيات", reset: "إعادة تعيين",
-  },
-};
+import catalog from "../generated/permissions.json";
+const { modules, leaves, leavesByModule } = catalog.labels.ar;

 export const accessStrings = {
   ar: {
@@ -56,9 +36,9 @@ export const accessStrings = {
       accessChanged: "عدّلت الإدارة صلاحياتك.",
       accessWaiting: "ستتحدّث الصفحة بعد أن تحفظ تعديلاتك أو تغادرها.",
       accessApplyNow: "حدّث الآن", accessClose: "إغلاق",
-      modules: modules.ar, leaves: leaves.ar,
+      modules, leaves,
       // Module-specific leaf names; they win over the shared `leaves`.
-      leavesByModule: { sports: { coach: "تدريب الفرق", manage: "إدارة الرياضة" }, storage: { drive: "حساب Google Drive" } },
+      leavesByModule,
     },
     passwordChange: {
       title: "يجب تغيير كلمة المرور",
diff --git a/apps/system/src/utils/permissionKeys.js b/apps/system/src/utils/permissionKeys.js
index 66fdc02..893bf62 100644
--- a/apps/system/src/utils/permissionKeys.js
+++ b/apps/system/src/utils/permissionKeys.js
@@ -1,28 +1,13 @@
-// Mirror of PERMISSION_TREE and IT_KEYS in server/utils/permissions.js. Keep both in step.
-export const PERMISSION_TREE = {
-  dashboard: ["view"], calendar: ["view"],
-  students: ["view", "viewAll", "create", "edit", "delete", "photo", "parentLink"],
-  lessons: ["view", "viewAll", "create", "edit", "roster", "delete", "copyMonth"],
-  attendance: ["view", "record"],
-  tasks: ["manage"],
-  reports: ["create", "editOwn", "viewAll", "editAll", "delete", "exportPdf"],
-  vehicles: ["view", "edit", "compliance", "documents", "archive", "delete"],
-  files: ["use", "manageAll"],
-  notices: ["view", "post", "runCheck"],
-  users: ["view", "create", "edit", "approve", "delete", "changeRole", "passwords", "unlock", "resetPassword"],
-  ai: ["use"], permissions: ["manage"], audit: ["view"], systemRecovery: ["reset"],
-  sports: ["view", "coach", "manage"], finance: ["view"],
-  storage: ["drive"],
-};
+// Canonical definitions are generated from shared/permissions.json.
+import catalog from "../generated/permissions.json";
+
+export const PERMISSION_TREE = catalog.tree;

 export const ALL_KEYS = Object.entries(PERMISSION_TREE).flatMap(([module, leaves]) =>
   leaves.map((leaf) => `${module}.${leaf}`));

 // What only the IT site does; no everyday permission set holds one.
-export const IT_KEYS = new Set([
-  "permissions.manage", "users.passwords", "users.unlock",
-  "audit.view", "storage.drive", "systemRecovery.reset",
-]);
+export const IT_KEYS = new Set(catalog.itKeys);

 // A leaf key needs that leaf; a module key needs every leaf of the module.
 export const hasPermission = (permissions, key) => {
diff --git a/apps/system/src/utils/permissionKeys.test.js b/apps/system/src/utils/permissionKeys.test.js
index 96642ab..3f69c7a 100644
--- a/apps/system/src/utils/permissionKeys.test.js
+++ b/apps/system/src/utils/permissionKeys.test.js
@@ -1,4 +1,15 @@
 import { PERMISSION_TREE, ALL_KEYS, IT_KEYS, hasPermission } from "./permissionKeys";
+import catalog from "../generated/permissions.json";
+import { accessStrings } from "../i18n/accessStrings";
+
+test("permission labels and keys use the same canonical catalog, including weekly tasks", () => {
+  expect(PERMISSION_TREE).toEqual(catalog.tree);
+  expect(accessStrings.ar.perms.modules).toEqual(catalog.labels.ar.modules);
+  expect(accessStrings.ar.perms.leavesByModule.tasks.manage).toBe("إدارة المهمات الأسبوعية");
+  expect(accessStrings.ar.perms.modules.dashboard).toBe("الرئيسي");
+  expect(accessStrings.ar.perms.modules.lessons).toBe("البرنامج");
+  expect(ALL_KEYS).toContain("tasks.manage");
+});

 test("vehicles has six leaves including delete", () => {
   expect(PERMISSION_TREE.vehicles).toEqual(["view", "edit", "compliance", "documents", "archive", "delete"]);
diff --git a/apps/system/src/utils/permissionTree.js b/apps/system/src/utils/permissionTree.js
index f538048..7f17489 100644
--- a/apps/system/src/utils/permissionTree.js
+++ b/apps/system/src/utils/permissionTree.js
@@ -1,10 +1,11 @@
 // Pure helpers for the permissions tab. A state is { defaults, grants, revokes }:
 // defaults are the role's leaf keys; grants/revokes may hold leaf or module
 // keys (the server expands module keys). effective = (defaults + grants) - revokes.
+import catalog from "../generated/permissions.json";
 import { PERMISSION_TREE, ALL_KEYS } from "./permissionKeys";

 // Reserved modules are not shown until they are built.
-export const HIDDEN_MODULES = ["finance"];
+export const HIDDEN_MODULES = catalog.hiddenModules;

 export const visibleModules = () => Object.keys(PERMISSION_TREE).filter((m) => !HIDDEN_MODULES.includes(m));

diff --git a/server/package.json b/server/package.json
index bb35950..4dcb0df 100644
--- a/server/package.json
+++ b/server/package.json
@@ -18,7 +18,8 @@
     "user:unlock": "node scripts/unlockUser.js",
     "system:recover": "node scripts/systemRecover.js",
     "permissions:migrate": "node scripts/migratePermissions.js",
-    "users:encrypt-plain-passwords": "node scripts/encryptPlainPasswords.js"
+    "users:encrypt-plain-passwords": "node scripts/encryptPlainPasswords.js",
+    "pretest": "node ../scripts/syncPermissions.js"
   },
   "keywords": [],
   "author": "",
diff --git a/server/utils/permissions.js b/server/utils/permissions.js
index 1c5a3d3..f463662 100644
--- a/server/utils/permissions.js
+++ b/server/utils/permissions.js
@@ -1,22 +1,8 @@
 const { repairMisencodedText } = require("./textEncoding");

 /* ================= Permission tree ================= */
-const PERMISSION_TREE = {
-  dashboard: ["view"], calendar: ["view"],
-  students: ["view", "viewAll", "create", "edit", "delete", "photo", "parentLink"],
-  lessons: ["view", "viewAll", "create", "edit", "roster", "delete", "copyMonth"],
-  attendance: ["view", "record"],
-  tasks: ["manage"], // the weekly tasks: writing them and joining them to groups
-  reports: ["create", "editOwn", "viewAll", "editAll", "delete", "exportPdf"],
-  vehicles: ["view", "edit", "compliance", "documents", "archive", "delete"], // delete: admin default only
-  files: ["use", "manageAll"],
-  notices: ["view", "post", "runCheck"],
-  // passwords: view a user's password (IT); resetPassword: set a new one.
-  users: ["view", "create", "edit", "approve", "delete", "changeRole", "passwords", "unlock", "resetPassword"],
-  ai: ["use"], permissions: ["manage"], audit: ["view"], systemRecovery: ["reset"],
-  sports: ["view", "coach", "manage"], finance: ["view"], // finance reserved
-  storage: ["drive"], // the Drive account the app stores in: an IT action
-};
+const catalog = require("../../shared/permissions.json");
+const PERMISSION_TREE = catalog.tree;

 const ROLE_DEFAULTS = {
   "ادارة": ["dashboard", "calendar", "students", "lessons", "attendance", "reports", "vehicles",
@@ -36,10 +22,7 @@ const ROLE_RANK = { "ادارة": 3, "مرشد": 2, "مساعد": 1 };

 // What only the IT site does (IT-site design, 2026-11-03). No everyday set
 // ever holds one, not even the system account's.
-const IT_KEYS = new Set([
-  "permissions.manage", "users.passwords", "users.unlock",
-  "audit.view", "storage.drive", "systemRecovery.reset",
-]);
+const IT_KEYS = new Set(catalog.itKeys);

 // What an IT user may do on the IT site. users.approve also disables and
 // re-enables an account; users.delete deletes one; users.create makes a new
```

## shared/permissions.json

```
{
  "tree": {
    "dashboard": [
      "view"
    ],
    "calendar": [
      "view"
    ],
    "students": [
      "view",
      "viewAll",
      "create",
      "edit",
      "delete",
      "photo",
      "parentLink"
    ],
    "lessons": [
      "view",
      "viewAll",
      "create",
      "edit",
      "roster",
      "delete",
      "copyMonth"
    ],
    "attendance": [
      "view",
      "record"
    ],
    "tasks": [
      "manage"
    ],
    "reports": [
      "create",
      "editOwn",
      "viewAll",
      "editAll",
      "delete",
      "exportPdf"
    ],
    "vehicles": [
      "view",
      "edit",
      "compliance",
      "documents",
      "archive",
      "delete"
    ],
    "files": [
      "use",
      "manageAll"
    ],
    "notices": [
      "view",
      "post",
      "runCheck"
    ],
    "users": [
      "view",
      "create",
      "edit",
      "approve",
      "delete",
      "changeRole",
      "passwords",
      "unlock",
      "resetPassword"
    ],
    "ai": [
      "use"
    ],
    "permissions": [
      "manage"
    ],
    "audit": [
      "view"
    ],
    "systemRecovery": [
      "reset"
    ],
    "sports": [
      "view",
      "coach",
      "manage"
    ],
    "finance": [
      "view"
    ],
    "storage": [
      "drive"
    ]
  },
  "itKeys": [
    "permissions.manage",
    "users.passwords",
    "users.unlock",
    "audit.view",
    "storage.drive",
    "systemRecovery.reset"
  ],
  "hiddenModules": [
    "finance"
  ],
  "labels": {
    "ar": {
      "modules": {
        "dashboard": "الرئيسي",
        "calendar": "برنامج الأسبوع",
        "students": "الطلاب",
        "lessons": "البرنامج",
        "attendance": "الحضور والغياب",
        "tasks": "المهمات الأسبوعية",
        "reports": "التقارير",
        "vehicles": "المركبات والمقطورات",
        "files": "الملفات",
        "notices": "لوحة الإعلانات",
        "users": "طاقم الجمعية",
        "ai": "المساعد الذكي",
        "permissions": "الصلاحيات",
        "audit": "سجل التغييرات",
        "sports": "الرياضة",
        "systemRecovery": "استعادة حساب النظام",
        "storage": "التخزين",
        "finance": "المالية"
      },
      "leaves": {
        "view": "عرض",
        "viewAll": "عرض الكل",
        "create": "إضافة",
        "edit": "تعديل",
        "delete": "حذف",
        "photo": "الصورة",
        "parentLink": "رابط تسجيل الأهل",
        "roster": "قائمة طلاب البرنامج",
        "copyMonth": "نسخ شهر",
        "record": "تسجيل",
        "editOwn": "تعديل ما أنشأه",
        "editAll": "تعديل الكل",
        "exportPdf": "تصدير PDF",
        "compliance": "الفحوصات والتأمين",
        "documents": "المستندات",
        "archive": "أرشفة",
        "use": "استخدام",
        "manageAll": "إدارة كل الملفات",
        "post": "نشر",
        "runCheck": "تشغيل الفحص",
        "approve": "قبول",
        "changeRole": "تغيير الدور",
        "passwords": "عرض كلمات المرور",
        "unlock": "رفع الحظر",
        "resetPassword": "تعيين كلمة مرور جديدة",
        "manage": "إدارة",
        "reset": "إعادة تعيين"
      },
      "leavesByModule": {
        "sports": {
          "coach": "تدريب الفرق",
          "manage": "إدارة الرياضة"
        },
        "storage": {
          "drive": "حساب Google Drive"
        },
        "tasks": {
          "manage": "إدارة المهمات الأسبوعية"
        },
        "permissions": {
          "manage": "إدارة الصلاحيات"
        }
      }
    }
  }
}
```

## scripts/syncPermissions.js

```
const fs = require("node:fs");
const path = require("node:path");

const CLIENTS = ["system", "it"];

// CRA bundles imports inside src only. These JSON copies are build artifacts;
// shared/permissions.json is the only editable definition, also read by Node.
function syncPermissions({ root = path.resolve(__dirname, ".."), check = false } = {}) {
  const source = fs.readFileSync(path.join(root, "shared/permissions.json"), "utf8");
  const catalog = JSON.parse(source);
  const keys = Object.entries(catalog.tree).flatMap(([module, leaves]) => leaves.map((leaf) => `${module}.${leaf}`));
  for (const key of catalog.itKeys) if (!keys.includes(key)) throw new Error(`Unknown IT permission: ${key}`);
  for (const [module, leaves] of Object.entries(catalog.tree)) {
    if (!catalog.labels.ar.modules[module]) throw new Error(`Missing permission module label: ${module}`);
    for (const leaf of leaves) {
      if (!catalog.labels.ar.leavesByModule[module]?.[leaf] && !catalog.labels.ar.leaves[leaf]) {
        throw new Error(`Missing permission label: ${module}.${leaf}`);
      }
    }
  }
  const output = `${JSON.stringify(catalog, null, 2)}\n`;
  for (const client of CLIENTS) {
    const target = path.join(root, "apps", client, "src", "generated", "permissions.json");
    const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n") : "";
    if (current === output) continue;
    if (check) throw new Error(`Stale permission catalog: ${client}; run node scripts/syncPermissions.js`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, output);
  }
}

if (require.main === module) syncPermissions({ check: process.argv.includes("--check") });
module.exports = { syncPermissions };

```

## server/test/permission-catalog.test.js

```
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const catalog = require("../../shared/permissions.json");
const { PERMISSION_TREE, IT_KEYS, can, effectivePermissions, checkRoleDefaults } = require("../utils/permissions");
const { syncPermissions } = require("../../scripts/syncPermissions");

test("System, IT and server share the complete permission catalog", () => {
  syncPermissions({ check: true });
  assert.deepEqual(PERMISSION_TREE, catalog.tree);
  assert.deepEqual([...IT_KEYS], catalog.itKeys);
  for (const app of ["system", "it"]) {
    assert.deepEqual(require(`../../apps/${app}/src/generated/permissions.json`), catalog);
  }
  assert.deepEqual(catalog.tree.tasks, ["manage"]);
});

test("new shared labels never grant access or make IT actions role defaults", () => {
  assert.ok(can(effectivePermissions({ role: "ادارة" }), "tasks.manage"));
  assert.ok(!can(effectivePermissions({ role: "مرشد" }), "tasks.manage"));
  assert.equal(checkRoleDefaults(["permissions.manage"]).ok, false);
  assert.equal(checkRoleDefaults(["unknown.manage"]).ok, false);
  assert.equal(checkRoleDefaults(["tasks.manage"]).ok, true);
});

test("changing the canonical catalog updates both clients without hand editing mirrors", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tamheed-catalog-"));
  try {
    const synthetic = JSON.parse(JSON.stringify(catalog));
    synthetic.labels.ar.modules.tasks = "اسم تجريبي";
    synthetic.tree.tasks.push("testOnly");
    synthetic.labels.ar.leavesByModule.tasks.testOnly = "عملية تجريبية";
    fs.mkdirSync(path.join(root, "shared"));
    fs.writeFileSync(path.join(root, "shared/permissions.json"), JSON.stringify(synthetic));
    assert.throws(() => syncPermissions({ root, check: true }), /Stale permission catalog/);
    syncPermissions({ root });
    syncPermissions({ root, check: true });
    for (const app of ["system", "it"]) {
      const generated = JSON.parse(fs.readFileSync(path.join(root, "apps", app, "src/generated/permissions.json"), "utf8"));
      assert.deepEqual(generated, synthetic);
    }
  } finally {
    // Only this freshly allocated synthetic temporary directory.
    fs.rmSync(root, { recursive: true, force: true });
  }
});

```

## apps/it/src/ui/PermissionsEditor.test.js

```
import PermissionsEditor from "./PermissionsEditor";
import * as api from "../api";
import { moduleName, leafName } from "../strings";
import { mount, unmountAll, ok, button, click, flush } from "../testUtils";

jest.mock("../api", () => ({
  ...jest.requireActual("../api"), getPermissions: jest.fn(), savePermissions: jest.fn(),
}));

afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

test("IT shows current System names and saves weekly task permissions without adding IT keys", async () => {
  const data = { role: "مرشد", defaults: ["lessons.view"], grants: [], revokes: [], effective: ["lessons.view"], grantable: ["tasks.manage"] };
  api.getPermissions.mockImplementation(() => ok(data));
  api.savePermissions.mockImplementation((tz, draft) => ok({ ...draft, effective: ["lessons.view", "tasks.manage"] }));
  const c = await mount(<PermissionsEditor tz="synthetic-user" />);
  expect(c.textContent).toContain("الرئيسي");
  expect(c.textContent).toContain("البرنامج");
  expect(c.textContent).not.toContain("لوحة التحكم");
  const itRow = [...c.querySelectorAll("li")].find((el) => el.querySelector("span")?.textContent === "الصلاحيات");
  expect(itRow.querySelector("input").disabled).toBe(true);
  const row = [...c.querySelectorAll("li")].find((el) => el.querySelector("span")?.textContent === "المهمات الأسبوعية");
  expect(row).toBeDefined();
  await click(row.querySelector("button"));
  expect(row.textContent).toContain("إدارة المهمات الأسبوعية");
  const boxes = row.querySelectorAll("input[type=checkbox]");
  expect(boxes[1].disabled).toBe(false);
  await click(boxes[1]);
  await click(button(c, "حفظ"));
  const dialog = c.querySelector('[role="dialog"]');
  expect(dialog.textContent).toContain("المهمات الأسبوعية: إدارة المهمات الأسبوعية");
  await click(button(dialog, "حفظ"));
  await flush();
  expect(api.savePermissions).toHaveBeenCalledWith("synthetic-user", { grants: ["tasks.manage"], revokes: [] });
  expect(moduleName("lessons")).toBe("البرنامج");
  expect(leafName("lessons.roster")).toBe("قائمة طلاب البرنامج");
});

```

## docs/PERMISSIONS_CATALOG.md

```
# Shared permission catalog

Edit `shared/permissions.json` for section keys, operation keys, Arabic section
and operation labels, module-specific operation labels, IT-only keys and hidden
sections. The server reads this file directly. System and IT import generated
copies inside `src/generated/permissions.json` because CRA restricts external
source imports.

Both clients automatically run `scripts/syncPermissions.js` before `npm start`,
`npm test` and `npm run build`, including deployment builds. Server `npm test`
also synchronizes before regression checks. Generated copies are committed for
editors and direct test runners; do not edit them manually. You can synchronize
explicitly with `node scripts/syncPermissions.js` or check parity with `--check`.
An already running development server should be restarted after editing the
canonical catalog. Production clients receive changes with the next built and
deployed release, through the normal automatic-update mechanism.

System permission screens, its navigation labels and IT user/role permission
editors use these names. Module-specific labels distinguish weekly-task
management from permission management. IT now includes `tasks.manage`, which
was absent from its hand-maintained mirror.

Renaming labels does not change stored permissions. Existing role defaults,
user grants/revokes and server-side authorization remain authoritative. Adding
a catalog entry alone does not implement a feature or its route enforcement.
IT-only actions remain excluded from everyday roles and cannot be granted by
renaming a section. No migration is needed for this consolidation.

```
