# Actual independent review: grantable business features and operations

Codex implements; actual Claude Code is the independent reviewer. Review only
this supplied source without tools, file access, edits or recursive reviewers.
Report concrete bugs/security regressions with severity, file/line evidence,
failure scenario and a fix. Do not claim a finding without source evidence.

Owner requires every business section/operation to be grantable and revocable,
especially association rules. Prior code tied rules and signatures to parentLink,
weekly task management to one key, file writes to files.use, and left dashboard
view unguarded. The patch separates these operations in the shared catalog,
uses server guards plus UI/route gates, retains per-record ACL/hierarchy/locks,
and adds current student scope to staff signature access. Public parent token
flows and personal security/session infrastructure retain separate safeguards.
Unknown frontend business paths fail closed. Existing route audit is extended
with catalog-key checks and new exact sensitive keys. No real permissions or
records are written; no migration/deployment. New built-in defaults retain prior
role behavior, custom defaults and user grants/revokes are left untouched.

Read docs/FEATURE_PERMISSIONS.md below for dependencies and explicit exceptions.
Focused endpoint grant/revoke tests pass. Full server suite passed 1555 tests.
System regression caught obsolete assumptions about a permanently-open dashboard
and two-leaf file module; fixtures/expectations now cover actual explicit keys.
Final npm run verify and IT tests/build are in progress. Only authorized source
is supplied: no environment values, credentials, runtime logs or real records.

## Production source diff

```diff
diff --git a/AGENTS.md b/AGENTS.md
index 5048c4c..2b7ae30 100644
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -22,3 +22,13 @@ together on stability. Read `docs/AI_COLLABORATION.md` and the current

 These instructions govern active work. They do not start background agents or
 schedule unattended changes.
+
+## Business permissions
+
+Every business section and meaningful operation must have a grantable/revocable
+capability in `shared/permissions.json`, a server-side guard, matching page/button
+gates and isolated grant/revoke tests. Preserve record scope, hierarchy and lock
+checks. A broad section permission must not bypass a revoked operation. Register
+new frontend business paths explicitly; unknown sections fail closed. Keep the
+server route audit current and document any public/self-only infrastructure
+exception. See `docs/FEATURE_PERMISSIONS.md` for the existing operation map.
diff --git a/apps/system/src/Components/Files/FilesPage.jsx b/apps/system/src/Components/Files/FilesPage.jsx
index 7429285..e43bdb5 100644
--- a/apps/system/src/Components/Files/FilesPage.jsx
+++ b/apps/system/src/Components/Files/FilesPage.jsx
@@ -22,7 +22,7 @@ import {
   uploadStorageFileAuto,
 } from "../../WebServer/services/storage/functionsStorage";
 import { getAll as getAllUsers } from "../../WebServer/services/user/functionsUser";
-import { getStoredUserId } from "../../utils/session";
+import { getStoredUserId, canStored } from "../../utils/session";
 import { useI18n } from "../../i18n/I18nContext";
 import { ask } from "../Provides/confirmBus";
 import FilterDialog from "../UI/FilterDialog.jsx";
@@ -615,6 +615,7 @@ export default function FilesPage() {
   };

   const enqueueUploads = (files = []) => {
+    if (!canStored("files.upload")) return;
     if (isSharedView) return;
     const acceptedFiles = files.filter(Boolean);
     if (!acceptedFiles.length) return;
@@ -677,7 +678,7 @@ export default function FilesPage() {
   const openContextMenu = (event, file) => {
     event.preventDefault();
     event.stopPropagation();
-    const canEditItem = !isSharedView && (!file.shared || ["write", "manage"].includes(file.sharedRole));
+    const canEditItem = canStored("files.rename") && !isSharedView && (!file.shared || ["write", "manage"].includes(file.sharedRole));
     const canManageItem = !isSharedView && (!file.shared || file.sharedRole === "manage");
     const position = getContextMenuPosition(event.clientX, event.clientY, canEditItem || canManageItem);

@@ -694,7 +695,7 @@ export default function FilesPage() {
     event.preventDefault();
     event.stopPropagation();
     const rect = event.currentTarget.getBoundingClientRect();
-    const canEditItem = !isSharedView && (!file.shared || ["write", "manage"].includes(file.sharedRole));
+    const canEditItem = canStored("files.rename") && !isSharedView && (!file.shared || ["write", "manage"].includes(file.sharedRole));
     const canManageItem = !isSharedView && (!file.shared || file.sharedRole === "manage");
     const position = getContextMenuPosition(rect.left, rect.bottom + 6, canEditItem || canManageItem);

@@ -708,6 +709,7 @@ export default function FilesPage() {
   };

   const handleDelete = async (file) => {
+    if (!canStored("files.delete")) return;
     if (isSharedView) return;
     closeContextMenu();

@@ -742,6 +744,7 @@ export default function FilesPage() {
   };

   const handleRename = async (file) => {
+    if (!canStored("files.rename")) return;
     if (isSharedView) return;
     closeContextMenu();

@@ -779,6 +782,7 @@ export default function FilesPage() {
   };

   const submitShareToUser = async (user) => {
+    if (!canStored("files.share")) return;
     if (!shareModalFile) return;

     try {
@@ -817,12 +821,14 @@ export default function FilesPage() {
   };

   const openFolderDialog = () => {
+    if (!canStored("files.createFolder")) return;
     if (isSharedView) return;
     closeContextMenu();
     setFolderName("");
   };

   const createFolder = async (event) => {
+    if (!canStored("files.createFolder")) return;
     event?.preventDefault?.();
     if (isSharedView) return;
     const cleanName = String(folderName || "").trim();
@@ -886,7 +892,7 @@ export default function FilesPage() {
       className={`${styles.shell} ${dragActive ? styles.dragActive : ""}`}
       onDragEnter={(event) => {
         event.preventDefault();
-        if (!isSharedView) setDragActive(true);
+        if (!isSharedView && canStored("files.upload")) setDragActive(true);
       }}
       onDragOver={(event) => event.preventDefault()}
       onDragLeave={() => setDragActive(false)}
@@ -937,12 +943,12 @@ export default function FilesPage() {
               <button className={styles.secondaryBtn} data-tour="files-refresh" onClick={loadFiles} disabled={loading}>
                 {t("files.refresh")}
               </button>
-              <button className={styles.secondaryBtn} data-tour="files-new-folder" onClick={openFolderDialog} disabled={loading}>
+              {canStored("files.createFolder") && <button className={styles.secondaryBtn} data-tour="files-new-folder" onClick={openFolderDialog} disabled={loading}>
                 {t("files.newFolder")}
-              </button>
+              </button>}
               {/* Training mode: the guide «chooses» a demo file built in memory;
                   the real file picker never opens. */}
-              <label
+              {canStored("files.upload") && <label
                 className={styles.primaryBtn}
                 data-tour="files-upload"
                 onClick={(event) => {
@@ -959,7 +965,7 @@ export default function FilesPage() {
                   multiple
                   onChange={(event) => enqueueUploads(Array.from(event.target.files || []))}
                 />
-              </label>
+              </label>}
             </div>
           )}
         </header>
@@ -1043,7 +1049,7 @@ export default function FilesPage() {
               const extension = file.isDirectory
                 ? "DIR"
                 : typeMeta.badge || getExtension(file.filename).toUpperCase() || "FILE";
-              const canEditItem = !isSharedView && (!file.shared || ["write", "manage"].includes(file.sharedRole));
+              const canEditItem = canStored("files.rename") && !isSharedView && (!file.shared || ["write", "manage"].includes(file.sharedRole));
               const canManageItem = !isSharedView && (!file.shared || file.sharedRole === "manage");
               const pending = file._pending;
               const pendingText = pendingLabel[pending];
@@ -1121,9 +1127,9 @@ export default function FilesPage() {

                     {(canEditItem || canManageItem) && (
                       <>
-                        {canManageItem && <button data-tour="files-share" disabled={Boolean(pending)} onClick={() => setShareModalFile(file)}>{t("files.share")}</button>}
+                        {canManageItem && canStored("files.share") && <button data-tour="files-share" disabled={Boolean(pending)} onClick={() => setShareModalFile(file)}>{t("files.share")}</button>}
                         {canEditItem && <button disabled={Boolean(pending)} onClick={() => handleRename(file)}>{t("files.rename")}</button>}
-                        {canManageItem && <button data-tour="files-delete" disabled={Boolean(pending) || uploading} className={styles.deleteBtn} onClick={() => handleDelete(file)}>{t("files.delete")}</button>}
+                        {canManageItem && canStored("files.delete") && <button data-tour="files-delete" disabled={Boolean(pending) || uploading} className={styles.deleteBtn} onClick={() => handleDelete(file)}>{t("files.delete")}</button>}
                       </>
                     )}
                   </div>
@@ -1261,7 +1267,7 @@ export default function FilesPage() {

           {(contextMenu.canEditItem || contextMenu.canManageItem) && (
             <>
-              {contextMenu.canManageItem && (
+              {contextMenu.canManageItem && canStored("files.share") && (
                 <button
                   className={styles.contextMenuItem}
                   onClick={() => {
@@ -1280,7 +1286,7 @@ export default function FilesPage() {
                   {t("files.rename")}
                 </button>
               )}
-              {contextMenu.canManageItem && (
+              {contextMenu.canManageItem && canStored("files.delete") && (
                 <button
                   className={`${styles.contextMenuItem} ${styles.contextMenuDanger}`}
                   onClick={() => handleDelete(contextMenu.file)}
diff --git a/apps/system/src/Components/Header/Header.jsx b/apps/system/src/Components/Header/Header.jsx
index cfa6c7d..e5ae64c 100644
--- a/apps/system/src/Components/Header/Header.jsx
+++ b/apps/system/src/Components/Header/Header.jsx
@@ -229,11 +229,11 @@ export default function Header() {
       </div>

       <NavigationMenu mobile={isMobile} open={menuOpen} onClose={() => setMenuOpen(false)} onNav={onNavClick}
-        home={{ path: "/dashboard", label: t("nav.dashboard"), tour: "menu-home" }}
+        home={opens("/dashboard") ? { path: "/dashboard", label: t("nav.dashboard"), tour: "menu-home" } : null}
         program={(opens("/lessons") || opens("/calendar")) ? { path: opens("/lessons") ? "/lessons" : "/calendar", label: t("nav.lessons"), tour: "menu-lessons", badge: "lessons" } : null}
         groups={[
           { id: "daily", label: "العمل اليومي", items: [
-            { path: "/weekly-tasks", label: t("nav.tasks"), tour: "menu-weekly-tasks" },
+            opens("/weekly-tasks") && { path: "/weekly-tasks", label: t("nav.tasks"), tour: "menu-weekly-tasks" },
             opens("/sports") && { path: "/sports", label: t("nav.sports"), tour: "menu-sports" },
           ] },
           { id: "people", label: "الأعضاء والطاقم", items: [
diff --git a/apps/system/src/Components/Notice/NoticesBoard.jsx b/apps/system/src/Components/Notice/NoticesBoard.jsx
index 4652ef5..57ec54e 100644
--- a/apps/system/src/Components/Notice/NoticesBoard.jsx
+++ b/apps/system/src/Components/Notice/NoticesBoard.jsx
@@ -1,3 +1,4 @@
+import { canStored } from "../../utils/session";
 import RequiredMark from "../UI/RequiredMark";
 import React, { useCallback, useEffect, useState } from "react";
 import { useNavigate } from "react-router-dom";
@@ -83,10 +84,10 @@ export default function NoticesBoard() {
         <h1>{t("notices.title")}</h1>
         <div className={styles.actions} data-tour="notices-actions">
           <Button size="sm" variant="secondary" data-tour="notices-mark-all" loading={busy === "all"} onClick={() => act("all", markAllNoticesRead)}>{t("notices.markAll")}</Button>
-          <Button size="sm" variant="secondary" data-tour="notices-run-check" loading={busy === "run"}
+          {canStored("notices.runCheck") && <Button size="sm" variant="secondary" data-tour="notices-run-check" loading={busy === "run"}
             onClick={() => act("run", runVehicleCheck, (res) => fillText(t("notices.runDone"), { n: res.created || 0 }))}>
             {t("notices.runCheck")}
-          </Button>
+          </Button>}
         </div>
       </header>

@@ -145,7 +146,7 @@ export default function NoticesBoard() {
                   <td>{n.read ? t("notices.read") : <strong>{t("notices.unread")}</strong>}</td>
                   <td className={styles.rowActions}>
                     {!n.read && <Button size="sm" variant="secondary" onClick={() => act(`r${n._id}`, () => markNoticeRead(n._id))}>{t("notices.markRead")}</Button>}
-                    <Button size="sm" variant="secondary" data-tour="notices-archive" onClick={() => archive(n)}>{t("notices.archive")}</Button>
+                    {canStored("notices.archive") && <Button size="sm" variant="secondary" data-tour="notices-archive" onClick={() => archive(n)}>{t("notices.archive")}</Button>}
                   </td>
                 </tr>
               ))}
@@ -154,7 +155,7 @@ export default function NoticesBoard() {
         </div>
       )}

-      <form className={styles.form} data-tour="notices-publish" onSubmit={publish} noValidate>
+      {canStored("notices.post") && <form className={styles.form} data-tour="notices-publish" onSubmit={publish} noValidate>
         <h2>{t("notices.newTitle")}</h2>
         <label><span>{t("notices.f.title")}<RequiredMark /></span>
           <input data-tour="notices-title" value={draft.title} maxLength={120} required onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
@@ -175,7 +176,7 @@ export default function NoticesBoard() {
           {errors.endDate && <span role="alert">{errors.endDate}</span>}
         </label>
         <Button type="submit" data-tour="notices-submit" loading={busy === "publish"}>{t("notices.publish")}</Button>
-      </form>
+      </form>}
     </section>
   );
 }
diff --git a/apps/system/src/Components/Routes/Routes.jsx b/apps/system/src/Components/Routes/Routes.jsx
index b57533e..90d25c4 100644
--- a/apps/system/src/Components/Routes/Routes.jsx
+++ b/apps/system/src/Components/Routes/Routes.jsx
@@ -106,9 +106,9 @@ export default function CRoutes() {
       <Route element={<RequireAuth />}>
         <Route element={<ProtectedLayout />}>
           {/* ادارة الاثنينعربيالاثنينالأربعاء */}
-          <Route path='/dashboard' element={<Dashboard />} />
           <Route path='/guide' element={<GuidePage />} />
           <Route element={<RoleGuard />}>
+            <Route path='/dashboard' element={<Dashboard />} />
             <Route path="/calendar" element={<LessonsHub active="attendance"><AttendancePage /></LessonsHub>} />

             <Route path="/students" element={<ViewAllStudent />} />
diff --git a/apps/system/src/Components/Student/ConsentView.jsx b/apps/system/src/Components/Student/ConsentView.jsx
index 74510a5..4088dee 100644
--- a/apps/system/src/Components/Student/ConsentView.jsx
+++ b/apps/system/src/Components/Student/ConsentView.jsx
@@ -1,3 +1,4 @@
+import { canStored } from "../../utils/session";
 import React, { useCallback, useEffect, useRef, useState } from "react";
 import { createConsentLink, getConsent, getRules, signConsent } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
 import { toast } from "../../ALERT/SystemToasts.jsx";
@@ -27,6 +28,7 @@ export default function ConsentView({ studentId }) {
   useEffect(() => { setLink(null); setState({ loading: true }); load(); return () => { request.current += 1; }; }, [load]);

   const submit = async () => {
+    if (!canStored("consents.edit")) return false;
     if (!form.accepted || !form.signerName.trim() || !form.signature) {
       setError("يجب الموافقة على قوانين الجمعية وكتابة اسم ولي الأمر والتوقيع قبل الإرسال.");
       return false;
@@ -43,6 +45,7 @@ export default function ConsentView({ studentId }) {
     return true;
   };
   const makeLink = async () => {
+    if (!canStored("consents.link")) return;
     setLinkBusy(true);
     const result = await createConsentLink(studentId);
     setLinkBusy(false);
@@ -67,8 +70,8 @@ export default function ConsentView({ studentId }) {
       <details><summary>النص الذي تم التوقيع عليه</summary><div dir="auto" style={{ whiteSpace: "pre-wrap" }}>{consent.rulesText}</div></details>
     </> : <p>متبقٍ توقيع ولي الأمر{consent?.acceptedAt ? ` — تمت الموافقة بتاريخ ${when(consent.acceptedAt)}، ولم يُستكمل التوقيع بعد.` : ""}</p>}
     {state.rules?.text ? <>
-      <RegistrationConsent key={`${state.rules.version}:${consent?.revision || "none"}`} rules={state.rules} value={form} onChange={setForm} nameId="consent-signer" onConfirm={submit} busy={busy} error={error} linkLabel={consent?.signature ? "تحديث التوقيع" : "قوانين الجمعية والتوقيع"} confirmLabel="حفظ التوقيع" />
-      <div><Button size="sm" loading={linkBusy} onClick={makeLink}>إنشاء رابط لولي الأمر</Button></div>
+      {canStored("consents.edit") && <RegistrationConsent key={`${state.rules.version}:${consent?.revision || "none"}`} rules={state.rules} value={form} onChange={setForm} nameId="consent-signer" onConfirm={submit} busy={busy} error={error} linkLabel={consent?.signature ? "تحديث التوقيع" : "قوانين الجمعية والتوقيع"} confirmLabel="حفظ التوقيع" />}
+      {canStored("consents.link") && <div><Button size="sm" loading={linkBusy} onClick={makeLink}>إنشاء رابط لولي الأمر</Button></div>}
     </> : <p>التوقيع غير متاح حتى تنشر الإدارة قوانين الجمعية.</p>}
     {link && <section aria-label="رابط توقيع ولي الأمر" style={{ display: "grid", gap: 8 }}>
       <input readOnly dir="ltr" aria-label="رابط التوقيع" value={link.url} onFocus={(event) => event.target.select()} />
diff --git a/apps/system/src/Components/Student/RulesEditor.jsx b/apps/system/src/Components/Student/RulesEditor.jsx
index f3d0307..442a6b8 100644
--- a/apps/system/src/Components/Student/RulesEditor.jsx
+++ b/apps/system/src/Components/Student/RulesEditor.jsx
@@ -1,3 +1,4 @@
+import { canStored } from "../../utils/session";
 import React, { useEffect, useState } from "react";
 import Button from "../UI/Button.jsx";
 import { toast } from "../../ALERT/SystemToasts.jsx";
@@ -9,6 +10,7 @@ import { setUnsavedChanges } from "../../utils/unsavedChanges";
 // The rules a parent signs on the registration link. Publishing makes a new
 // version; those who already signed keep the version they signed.
 export default function RulesEditor() {
+  const canEdit = canStored("rules.edit");
   const [loaded, setLoaded] = useState(false);
   const [version, setVersion] = useState(0);
   const [text, setText] = useState("");
@@ -33,6 +35,7 @@ export default function RulesEditor() {
   }, []);

   const publish = async () => {
+    if (!canEdit) return;
     let confirmed = false;
     try {
       confirmed = await ask("", {
@@ -64,11 +67,11 @@ export default function RulesEditor() {
       <h3 style={{ margin: 0 }}>نظام الجمعية{version ? ` (الإصدار ${version})` : ""}</h3>
       <small>يظهر للأهل في رابط «قوانين الجمعية». الموافقة والتوقيع/الختم مطلوبان لإرسال الطلب. يمكن استكمال توقيع طالب أضافته الجمعية من ملفه أو برابط شخصي لولي الأمر. النص الافتراضي متاح ما لم تنشر الإدارة نصًا آخر.</small>
       {!saved.trim() && version > 0 && <strong role="alert" style={{ color: "#b91c1c" }}>النص المنشور فارغ: رابط التسجيل لا يستقبل طلبات.</strong>}
-      <textarea aria-label="نص نظام الجمعية" rows={8} maxLength={20000} value={text} onChange={(event) => setText(event.target.value)} />
-      <div>
+      <textarea readOnly={!canEdit} aria-label="نص نظام الجمعية" rows={8} maxLength={20000} value={text} onChange={(event) => canEdit && setText(event.target.value)} />
+      {canEdit && <div>
         <Button size="sm" variant="secondary" disabled={busy || text === DEFAULT_RULES} onClick={() => setText(DEFAULT_RULES)}>استعادة النص الافتراضي</Button>{" "}
         <Button size="sm" loading={busy} disabled={text === saved} onClick={publish}>نشر</Button>
-      </div>
+      </div>}
     </div>
   );
 }
diff --git a/apps/system/src/Components/Student/StudentView.jsx b/apps/system/src/Components/Student/StudentView.jsx
index cc78774..fbfac8f 100644
--- a/apps/system/src/Components/Student/StudentView.jsx
+++ b/apps/system/src/Components/Student/StudentView.jsx
@@ -136,7 +136,7 @@ export default function StudentView() {
       label: t("record.guide"),
       content: <GuideCard contact={s.guide} to={guideLink(s.guide, getStoredUserId(), s.main_teacher)} empty={t("record.noGuide")} />,
     },
-    canStored("students.parentLink") && {
+    canStored("consents.view") && {
       id: "consent",
       label: "التوقيع",
       content: <ConsentView studentId={s._id} />,
diff --git a/apps/system/src/Components/WeeklyTasks/ManageWeeklyTasks.jsx b/apps/system/src/Components/WeeklyTasks/ManageWeeklyTasks.jsx
index 0a5caea..87d7d5b 100644
--- a/apps/system/src/Components/WeeklyTasks/ManageWeeklyTasks.jsx
+++ b/apps/system/src/Components/WeeklyTasks/ManageWeeklyTasks.jsx
@@ -1,3 +1,4 @@
+import { canStored } from "../../utils/session";
 import React, { useCallback, useEffect, useState } from "react";
 import { useNavigate } from "react-router-dom";
 import { addTask, assignTask, editTask, getTaskBoard, removeTask, unassignTask } from "../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx";
@@ -64,7 +65,7 @@ export default function ManageWeeklyTasks() {
     if (picked === task.id) setPicked("");
   };
   const join = async (taskId, guideId) => {
-    if (taskId) await run(() => assignTask(taskId, guideId));
+    if (canStored("tasks.assign") && taskId) await run(() => assignTask(taskId, guideId));
   };

   if (error && !board) return <div className={styles.page} dir="rtl"><div role="alert" className={styles.error}>{error}</div></div>;
@@ -76,26 +77,26 @@ export default function ManageWeeklyTasks() {
       {greeting && <GreetingDialog guides={board.guides} defaultText={board.defaultGreeting} onClose={() => setGreeting(false)} />}
       <header className={styles.head}>
         <h1>تعديل المهمات والمجموعات</h1>
-        <Button disabled={!board.guides.length} onClick={() => setGreeting(true)}>إرسال بركة</Button>
+        {canStored("tasks.greet") && <Button disabled={!board.guides.length} onClick={() => setGreeting(true)}>إرسال بركة</Button>}
         <Button variant="secondary" onClick={() => navigate("/weekly-tasks")}>العودة إلى المهمات</Button>
       </header>

       <section className={styles.panel} aria-label="المهمات">
         <h2>المهمات</h2>
-        <form className={styles.form} onSubmit={create}>
+        {canStored("tasks.create") && <form className={styles.form} onSubmit={create}>
           <label htmlFor="task-title">اسم المهمة<RequiredMark /></label>
           <input id="task-title" maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
           <label htmlFor="task-details">تفاصيل</label>
           <input id="task-details" maxLength={500} value={draft.details} onChange={(event) => setDraft({ ...draft, details: event.target.value })} />
           <div><Button type="submit" loading={saving} disabled={!draft.title.trim()}>إضافة مهمة</Button></div>
-        </form>
+        </form>}
         {board.tasks.length === 0 && <p className={styles.muted}>لا توجد مهمات بعد.</p>}
         <ul className={styles.list}>
           {board.tasks.map((task) => (
             <li
               key={task.id}
               className={`${styles.item} ${picked === task.id ? styles.picked : ""}`}
-              draggable={!editing}
+              draggable={!editing && canStored("tasks.assign")}
               onDragStart={(event) => event.dataTransfer.setData("text/plain", task.id)}
             >
               {editing?.id === task.id ? (
@@ -114,8 +115,8 @@ export default function ManageWeeklyTasks() {
                     {task.details && <small dir="auto">{task.details}</small>}
                   </button>
                   <span className={styles.row}>
-                    <Button size="sm" variant="secondary" onClick={() => setEditing({ ...task })}>تعديل</Button>
-                    <Button size="sm" variant="danger" onClick={() => remove(task)}>حذف</Button>
+                    {canStored("tasks.edit") && <Button size="sm" variant="secondary" onClick={() => setEditing({ ...task })}>تعديل</Button>}
+                    {canStored("tasks.delete") && <Button size="sm" variant="danger" onClick={() => remove(task)}>حذف</Button>}
                   </span>
                 </>
               )}
@@ -140,7 +141,7 @@ export default function ManageWeeklyTasks() {
                 onDragOver={(event) => event.preventDefault()}
                 onDrop={(event) => { event.preventDefault(); join(event.dataTransfer.getData("text/plain"), guide.id); }}
               >
-                <button type="button" className={styles.groupHead} disabled={!picked} onClick={() => join(picked, guide.id)}>
+                <button type="button" className={styles.groupHead} disabled={!picked || !canStored("tasks.assign")} onClick={() => join(picked, guide.id)}>
                   <h3 dir="auto">{guide.name}</h3>
                   <small dir="auto">{guide.ownerNames?.join("، ")}</small>
                 </button>
@@ -150,7 +151,7 @@ export default function ManageWeeklyTasks() {
                     return task && (
                       <li key={row.taskId} className={styles.chip}>
                         <span dir="auto">{task.title}</span>
-                        <button type="button" aria-label={`إزالة ${task.title} من ${guide.name}`} onClick={() => run(() => unassignTask(row.taskId, guide.id))}>×</button>
+                        {canStored("tasks.assign") && <button type="button" aria-label={`إزالة ${task.title} من ${guide.name}`} onClick={() => run(() => unassignTask(row.taskId, guide.id))}>×</button>}
                       </li>
                     );
                   })}
diff --git a/apps/system/src/Components/WeeklyTasks/WeeklyPraise.jsx b/apps/system/src/Components/WeeklyTasks/WeeklyPraise.jsx
index b1331fa..65b47fa 100644
--- a/apps/system/src/Components/WeeklyTasks/WeeklyPraise.jsx
+++ b/apps/system/src/Components/WeeklyTasks/WeeklyPraise.jsx
@@ -3,7 +3,7 @@ import { useNavigate } from "react-router-dom";
 import "../Provides/ConfirmContext.css";
 import { getMyTasks, markPraiseSeen } from "../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx";
 import { isDemo } from "../../journey/demoMode";
-import { getStoredUserId } from "../../utils/session";
+import { getStoredUserId, canStored } from "../../utils/session";

 // Unfinished current-week tasks remind on every signed-in layout mount.
 export default function WeeklyPraise() {
@@ -15,6 +15,7 @@ export default function WeeklyPraise() {
     setNotice(null);
     if (isDemo()) return undefined;
     let alive = true;
+    if (!canStored("tasks.view")) return undefined;
     getMyTasks().then((res) => {
       if (!alive || !res.ok) return;
       const remaining = (res.tasks || []).filter((task) => !task.done).length;
diff --git a/apps/system/src/Components/WeeklyTasks/WeeklyTasksCard.jsx b/apps/system/src/Components/WeeklyTasks/WeeklyTasksCard.jsx
index fbf9e15..63b1d20 100644
--- a/apps/system/src/Components/WeeklyTasks/WeeklyTasksCard.jsx
+++ b/apps/system/src/Components/WeeklyTasks/WeeklyTasksCard.jsx
@@ -1,3 +1,4 @@
+import { canStored } from "../../utils/session";
 import React, { useEffect, useState } from "react";
 import { useNavigate } from "react-router-dom";
 import { getMyTasks } from "../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx";
@@ -11,6 +12,7 @@ export default function WeeklyTasksCard() {

   useEffect(() => {
     let alive = true;
+    if (!canStored("tasks.view")) return undefined;
     getMyTasks().then((res) => {
       if (alive && res.ok) setLeft((res.tasks || []).filter((task) => !task.done).length);
     });
diff --git a/apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.jsx b/apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.jsx
index d7ac062..35dd523 100644
--- a/apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.jsx
+++ b/apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.jsx
@@ -18,7 +18,7 @@ const weekLabel = (week) => {
 };

 // What the person himself must do this week: to do, then done in green.
-function MyTasks({ tasks, onToggle, busy }) {
+function MyTasks({ tasks, onToggle, busy, canComplete }) {
   const [group, setGroup] = useState("");
   const [search, setSearch] = useState("");
   const groups = [...new Map(tasks.map((task) => [String(task.groupId), task.groupName])).entries()];
@@ -42,7 +42,7 @@ function MyTasks({ tasks, onToggle, busy }) {
         {open.map((task) => (
           <li key={`${task.groupId}:${task.taskId}`} className={styles.item}>
             <span className={styles.text}><strong dir="auto">{task.title}</strong><small dir="auto">{task.groupName}</small>{task.details && <small dir="auto">{task.details}</small>}</span>
-            <TaskCheck checked={false} disabled={busy === `${task.groupId}:${task.taskId}`} label={`إنجاز ${task.title} — ${task.groupName}`} onChange={(checked) => onToggle(task, checked)} />
+            <TaskCheck checked={false} disabled={!canComplete || busy === `${task.groupId}:${task.taskId}`} label={`إنجاز ${task.title} — ${task.groupName}`} onChange={(checked) => onToggle(task, checked)} />
           </li>
         ))}
       </ul>
@@ -53,7 +53,7 @@ function MyTasks({ tasks, onToggle, busy }) {
             {done.map((task) => (
               <li key={`${task.groupId}:${task.taskId}`} className={`${styles.item} ${styles.done}`}>
                 <span className={styles.text}><strong dir="auto">{task.title}</strong><small dir="auto">{task.groupName}</small>{task.approved && <small>أكّدتها الإدارة</small>}</span>
-                <TaskCheck checked disabled={task.approved || busy === `${task.groupId}:${task.taskId}`} label={`إنجاز ${task.title} — ${task.groupName}`} onChange={(checked) => onToggle(task, checked)} />
+                <TaskCheck checked disabled={!canComplete || task.approved || busy === `${task.groupId}:${task.taskId}`} label={`إنجاز ${task.title} — ${task.groupName}`} onChange={(checked) => onToggle(task, checked)} />
               </li>
             ))}
           </ul>
@@ -64,7 +64,7 @@ function MyTasks({ tasks, onToggle, busy }) {
 }

 // The management's register: each group and its tasks, each with its check.
-function Register({ board, onToggle, busy }) {
+function Register({ board, onToggle, busy, canApprove }) {
   const groups = useMemo(() => board.groups.map((group) => ({
     ...group,
     tasks: board.assignments
@@ -94,7 +94,7 @@ function Register({ board, onToggle, busy }) {
                     <TaskCheck
                       checked={task.done}
                       label={`${task.done ? "إلغاء إنجاز" : "تأكيد إنجاز"} ${task.title} — ${group.name}`}
-                      disabled={busy === key}
+                      disabled={!canApprove || busy === key}
                       onChange={(checked) => onToggle(task, group, checked)}
                     />
                     <span className={styles.text}>
@@ -118,6 +118,8 @@ function Register({ board, onToggle, busy }) {
 export default function WeeklyTasksPage() {
   const navigate = useNavigate();
   const canManage = canStored("tasks.manage");
+  const canViewAll = canStored("tasks.viewAll");
+  const canViewMine = canStored("tasks.view");
   const [mine, setMine] = useState(null);
   const [board, setBoard] = useState(null);
   const [error, setError] = useState("");
@@ -125,15 +127,15 @@ export default function WeeklyTasksPage() {
   const [showAll, setShowAll] = useState(false);

   const load = useCallback(async () => {
-    const own = await getMyTasks();
+    const own = canViewMine ? await getMyTasks() : { ok: true, tasks: [] };
     if (!own.ok) setError(own.message);
     else { setError(""); setMine(own); }
-    if (canManage && showAll) {
+    if (canViewAll && (showAll || !canViewMine)) {
       const res = await getTaskBoard();
       if (res.ok) setBoard(res);
       else setError(res.message);
     }
-  }, [canManage, showAll]);
+  }, [canViewAll, canViewMine, showAll]);
   useEffect(() => { load(); }, [load]);

   const toggleMine = async (task, done) => {
@@ -148,7 +150,7 @@ export default function WeeklyTasksPage() {
   const toggleRegister = async (task, group, approved) => {
     const key = `${task.id}:${group.id}`;
     setBusy(key);
-    const res = await approveTask(task.id, group.id, approved, board.week || mine.week);
+    const res = await approveTask(task.id, group.id, approved, board.week || mine?.week);
     setBusy("");
     if (!res.ok) { if (res.code === "WEEK_CLOSED") await load(); return toast.warn(res.message); }
     return load();
@@ -161,14 +163,14 @@ export default function WeeklyTasksPage() {
           <h1>المهمات الأسبوعية</h1>
           {mine?.week && <p className={styles.muted}>الأسبوع الذي بدأ في {weekLabel(mine.week)}</p>}
         </div>
-        {canManage && <div className={styles.row}>
+        {canViewAll && <div className={styles.row}>
           <Button variant="secondary" onClick={() => setShowAll((shown) => !shown)}>{showAll ? "عرض مهماتي" : "عرض مهمات الجمعية"}</Button>
-          {showAll && <Button onClick={() => navigate("/weekly-tasks/manage")}>تعديل المهمات والمجموعات</Button>}
+          {canManage && (showAll || !canViewMine) && <Button onClick={() => navigate("/weekly-tasks/manage")}>تعديل المهمات والمجموعات</Button>}
         </div>}
       </header>
       {error && <div role="alert" className={styles.error}>{error}</div>}
-      {mine && !showAll && <MyTasks tasks={mine.tasks} onToggle={toggleMine} busy={busy} />}
-      {canManage && showAll && board && <Register board={board} onToggle={toggleRegister} busy={busy} />}
+      {canViewMine && mine && !showAll && <MyTasks canComplete={canStored("tasks.complete")} tasks={mine.tasks} onToggle={toggleMine} busy={busy} />}
+      {canViewAll && (showAll || !canViewMine) && board && <Register canApprove={canStored("tasks.approve")} board={board} onToggle={toggleRegister} busy={busy} />}
     </div>
   );
 }
diff --git a/apps/system/src/utils/routeAccess.js b/apps/system/src/utils/routeAccess.js
index 521b723..3bf7176 100644
--- a/apps/system/src/utils/routeAccess.js
+++ b/apps/system/src/utils/routeAccess.js
@@ -1,12 +1,14 @@
 import { hasPermission } from "./permissionKeys";

-// Pages limited to a permission, checked in order (first match wins). Any other
-// page behind login is open to every signed-in user. These mirror what the
-// menu and the page buttons offer; the server enforces its own rules.
+// Business pages require an explicit permission rule (first match wins).
+// Only listed personal/help pages bypass it; unknown sections fail closed.
+// The server independently enforces permissions and record scope.
 const RESTRICTED = [
-  { pattern: /^\/association-rules(\/|$)/, key: "students.parentLink" },
+  { pattern: /^\/dashboard(\/|$)/, key: "dashboard.view" },
+  { pattern: /^\/association-rules(\/|$)/, key: "rules.view" },
   // The forms: only an admin edits by default (owner, 2026-11-01).
-  { pattern: /^\/weekly-tasks\/manage$/, key: "tasks.manage" },
+  { pattern: /^\/weekly-tasks\/manage$/, all: ["tasks.manage", "tasks.viewAll"] },
+  { pattern: /^\/weekly-tasks(\/|$)/, any: ["tasks.view", "tasks.viewAll"] },
   { pattern: /^\/users\/new$/, key: "users.create" },
   { pattern: /^\/users\/[^/]+\/edit$/, key: "users.edit" },
   { pattern: /^\/students\/[^/]+\/edit$/, key: "students.edit" },
@@ -22,14 +24,14 @@ const RESTRICTED = [
   { pattern: /^\/calendar(\/|$)/, key: "attendance.view" },
   { pattern: /^\/lessons(\/|$)/, key: "lessons.view" },
   { pattern: /^\/reports(\/|$)/, any: ["reports.create", "reports.editOwn", "reports.viewAll", "reports.editAll", "reports.delete", "reports.exportPdf"] },
-  { pattern: /^\/files(\/|$)/, any: ["files.use", "files.manageAll"] },
+  { pattern: /^\/files(\/|$)/, key: "files.use" },
 ];

 export const canAccessPath = (pathname, permissions) => {
   const path = String(pathname || "").replace(/\/+$/, "") || "/";
   const rule = RESTRICTED.find(({ pattern }) => pattern.test(path));
-  if (!rule) return true;
-  return rule.any ? rule.any.some((key) => hasPermission(permissions, key)) : hasPermission(permissions, rule.key);
+  if (!rule) return ["/", "/profile", "/guide"].includes(path);
+  return rule.all ? rule.all.every((key) => hasPermission(permissions, key)) : rule.any ? rule.any.some((key) => hasPermission(permissions, key)) : hasPermission(permissions, rule.key);
 };

 // Where a blocked page sends the user: their own user page (/users/<own tz>,
@@ -38,5 +40,5 @@ export const canAccessPath = (pathname, permissions) => {
 export const blockedRedirect = (pathname, permissions, ownTz) => {
   if (canAccessPath(pathname, permissions)) return null;
   const own = String(pathname || "").match(/^\/users\/([^/]+)(?:\/edit)?\/?$/);
-  return own && ownTz && own[1] === String(ownTz) ? "/profile" : "/dashboard";
+  return own && ownTz && own[1] === String(ownTz) ? "/profile" : canAccessPath("/dashboard", permissions) ? "/dashboard" : "/profile";
 };
diff --git a/server/Entities/Dashboard/Dashboard.route.js b/server/Entities/Dashboard/Dashboard.route.js
index da5397c..e091cb4 100644
--- a/server/Entities/Dashboard/Dashboard.route.js
+++ b/server/Entities/Dashboard/Dashboard.route.js
@@ -1,6 +1,6 @@
 const express = require("express");
 const { requireAuth } = require("../../middleware/authMiddleware");
-const { loadActor } = require("../../middleware/permissionMiddleware");
+const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware");
 const { logWithSource } = require("../../middleware/logger");
 const { can } = require("../../utils/permissions");

@@ -47,7 +47,7 @@ const answered = (part) => part.status >= 200 && part.status < 300 && part.body?
 function createDashboardRouter({ requireAuth, loadActor, handlers }) {
   const router = express.Router();

-  router.get("/summary", requireAuth, loadActor, async (req, res) => {
+  router.get("/summary", requireAuth, loadActor, requirePermission("dashboard.view"), async (req, res) => {
     try {
       const h = handlers();
       const allowed = (part) => [].concat(PARTS[part]).some((key) => can(req.actor?.permissions, key));
diff --git a/server/Entities/InviteToken/InviteToken.route.js b/server/Entities/InviteToken/InviteToken.route.js
index 753bcd2..d09585d 100644
--- a/server/Entities/InviteToken/InviteToken.route.js
+++ b/server/Entities/InviteToken/InviteToken.route.js
@@ -11,6 +11,7 @@ const {
 } = require("./InviteToken.controller");
 const { requireAuth: protect } = require("../../middleware/authMiddleware");
 const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware");
+const { consentScope } = require("../../middleware/consentScope");
 const { rateLimit } = require("../../middleware/rateLimit");

 const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
@@ -40,11 +41,11 @@ const acceptPhoto = (req, res, next) => {

 router.get("/link", protect, loadActor, requirePermission("students.parentLink"), getLink);
 router.post("/link/rotate", protect, loadActor, requirePermission("students.parentLink"), rotateLink);
-router.get("/rules", protect, loadActor, requirePermission("students.parentLink"), getRules);
-router.post("/rules", protect, loadActor, requirePermission("students.parentLink"), publishRules);
-router.get("/consent/:studentId", protect, loadActor, requirePermission("students.parentLink"), getConsent);
-router.post("/consent/:studentId", protect, loadActor, requirePermission("students.parentLink"), signConsent);
-router.post("/consent/:studentId/link", protect, loadActor, requirePermission("students.parentLink"), createConsentLink);
+router.get("/rules", protect, loadActor, requirePermission("rules.view", "consents.view", "consents.edit"), getRules);
+router.post("/rules", protect, loadActor, requirePermission("rules.edit"), publishRules);
+router.get("/consent/:studentId", protect, loadActor, requirePermission("consents.view"), requirePermission("students.view"), consentScope, getConsent);
+router.post("/consent/:studentId", protect, loadActor, requirePermission("consents.edit"), requirePermission("students.view"), consentScope, signConsent);
+router.post("/consent/:studentId/link", protect, loadActor, requirePermission("consents.link"), requirePermission("students.view"), consentScope, createConsentLink);
 const limitConsent = rateLimit({ windowMs: 60 * 1000, max: 30, scope: "parent-consent" });
 router.post("/consent-link/validate", limitConsent, validateConsentLink);
 router.post("/consent-link/submit", limitConsent, submitConsentLink);
diff --git a/server/Entities/InviteToken/Rules.model.js b/server/Entities/InviteToken/Rules.model.js
index 97a4786..5d25a2e 100644
--- a/server/Entities/InviteToken/Rules.model.js
+++ b/server/Entities/InviteToken/Rules.model.js
@@ -13,7 +13,7 @@ RulesModelDef.create = async function (data) {
 };

 // A parent's signature on a version of the rules, apart from the student so no
-// list ever carries it, and only the rules' editors can read it.
+// list ever carries it. Separate consent permissions and student scope guard it.
 //   { studentId, tz, rulesVersion, signerName, signature, signedAt }
 const ConsentModelDef = { dbName, collection: "StudentConsents" };
 ConsentModelDef.get = async function (filter = {}) {
diff --git a/server/Entities/Notice/Notice.route.js b/server/Entities/Notice/Notice.route.js
index 12672d9..501a5c7 100644
--- a/server/Entities/Notice/Notice.route.js
+++ b/server/Entities/Notice/Notice.route.js
@@ -16,7 +16,7 @@ router.post("/", requirePermission("notices.post"), controller.create);
 router.post("/read-all", requirePermission("notices.view"), controller.readAll);
 router.post("/run-vehicle-check", requirePermission("notices.runCheck"), checkRateLimit, controller.runVehicleCheck);
 router.post("/:id/read", requirePermission("notices.view"), controller.read);
-// Archiving removes a notice from everyone's board, so it sits with posting.
-router.post("/:id/archive", requirePermission("notices.post"), controller.archive);
+// Archiving removes a notice from everyone's board: independently revocable.
+router.post("/:id/archive", requirePermission("notices.archive"), controller.archive);

 module.exports = router;
diff --git a/server/Entities/Storage/Storage.route.js b/server/Entities/Storage/Storage.route.js
index df078e5..889ab7a 100644
--- a/server/Entities/Storage/Storage.route.js
+++ b/server/Entities/Storage/Storage.route.js
@@ -90,17 +90,17 @@ router.get("/share-status", requireAuth, loadActor, requirePermission("files.use
 router.get("/share-link/:token", requireAuth, loadActor, requirePermission("files.use"), getShareLinkInfo);
 router.get("/share-link/:token/items", requireAuth, loadActor, requirePermission("files.use"), listSharedLinkItems);
 router.post("/share-link/:token/open-link", requireAuth, loadActor, requirePermission("files.use"), getSharedLinkOpenLink);
-router.post("/folder", requireAuth, loadActor, requirePermission("files.use"), createFolder);
+router.post("/folder", requireAuth, loadActor, requirePermission("files.use"), requirePermission("files.createFolder"), createFolder);
 router.get("/upload-status", requireAuth, loadActor, requirePermission("files.use"), getUploadStatus);
 router.post("/cancel-upload", requireAuth, loadActor, requirePermission("files.use"), express.json({ limit: "1mb" }), cancelUpload);
-router.post("/upload-chunk", requireAuth, loadActor, requirePermission("files.use"), storageUploadRateLimit, chunkUpload.single("chunk"), uploadChunk);
-router.post("/merge-chunks", requireAuth, loadActor, requirePermission("files.use"), storageUploadRateLimit, express.json({ limit: "5mb" }), mergeChunks);
-router.post("/upload", requireAuth, loadActor, requirePermission("files.use"), storageUploadRateLimit, uploadSingleFile, uploadFile);
-router.post("/share", requireAuth, loadActor, requirePermission("files.use"), shareEntry);
-router.post("/unshare", requireAuth, loadActor, requirePermission("files.use"), unshareEntry);
-router.patch("/rename", requireAuth, loadActor, requirePermission("files.use"), renameFile);
-router.post("/rename", requireAuth, loadActor, requirePermission("files.use"), renameFile);
-router.delete("/delete", requireAuth, loadActor, requirePermission("files.use"), deleteEntry);
-router.delete("/*", requireAuth, loadActor, requirePermission("files.use"), deleteEntry);
+router.post("/upload-chunk", requireAuth, loadActor, requirePermission("files.use"), requirePermission("files.upload"), storageUploadRateLimit, chunkUpload.single("chunk"), uploadChunk);
+router.post("/merge-chunks", requireAuth, loadActor, requirePermission("files.use"), requirePermission("files.upload"), storageUploadRateLimit, express.json({ limit: "5mb" }), mergeChunks);
+router.post("/upload", requireAuth, loadActor, requirePermission("files.use"), requirePermission("files.upload"), storageUploadRateLimit, uploadSingleFile, uploadFile);
+router.post("/share", requireAuth, loadActor, requirePermission("files.use"), requirePermission("files.share"), shareEntry);
+router.post("/unshare", requireAuth, loadActor, requirePermission("files.use"), requirePermission("files.share"), unshareEntry);
+router.patch("/rename", requireAuth, loadActor, requirePermission("files.use"), requirePermission("files.rename"), renameFile);
+router.post("/rename", requireAuth, loadActor, requirePermission("files.use"), requirePermission("files.rename"), renameFile);
+router.delete("/delete", requireAuth, loadActor, requirePermission("files.use"), requirePermission("files.delete"), deleteEntry);
+router.delete("/*", requireAuth, loadActor, requirePermission("files.use"), requirePermission("files.delete"), deleteEntry);

 module.exports = router;
diff --git a/server/Entities/WeeklyTask/WeeklyTask.route.js b/server/Entities/WeeklyTask/WeeklyTask.route.js
index f62dc25..2a9fd17 100644
--- a/server/Entities/WeeklyTask/WeeklyTask.route.js
+++ b/server/Entities/WeeklyTask/WeeklyTask.route.js
@@ -4,8 +4,8 @@ const { loadActor, requirePermission, actorLabel } = require("../../middleware/p
 const { logWithSource } = require("../../middleware/logger");
 const { weeklyTasks } = require("../../services/weeklyTasks");

-// /me: the signed-in user's own tasks, whoever he is: only those joined to him.
-// The rest: tasks.manage.
+// Personal tasks retain group ownership checks. Every operation also requires
+// its own capability; entering management never substitutes for an operation.
 const router = express.Router();
 router.use(requireAuth, loadActor);

@@ -20,17 +20,17 @@ const handle = (work) => async (req, res) => {
     return res.status(500).json({ ok: false, message: "حدث خطأ غير متوقع، حاول مرة أخرى" });
   }
 };
-router.get("/me", handle((req) => weeklyTasks().mine(req.actor.id)));
-router.post("/me/praise-seen", handle((req) => weeklyTasks().praiseSeen(req.actor.id, req.body?.week)));
-router.post("/me/:taskId", handle((req) => weeklyTasks().setDone(req.actor.id, req.params.taskId, req.body?.groupId, req.body?.done === true, ACTOR_NAME(req), req.body?.week || "")));
+router.get("/me", requirePermission("tasks.view"), handle((req) => weeklyTasks().mine(req.actor.id)));
+router.post("/me/praise-seen", requirePermission("tasks.view"), handle((req) => weeklyTasks().praiseSeen(req.actor.id, req.body?.week)));
+router.post("/me/:taskId", requirePermission("tasks.complete"), handle((req) => weeklyTasks().setDone(req.actor.id, req.params.taskId, req.body?.groupId, req.body?.done === true, ACTOR_NAME(req), req.body?.week || "")));

-router.get("/board", requirePermission("tasks.manage"), handle(() => weeklyTasks().board()));
-router.post("/greetings", requirePermission("tasks.manage"), handle((req) => weeklyTasks().sendGreeting(req.body, req.actor.id)));
-router.post("/", requirePermission("tasks.manage"), handle(async (req) => ({ id: await weeklyTasks().addTask(req.body, ACTOR_NAME(req)) })));
-router.put("/:id", requirePermission("tasks.manage"), handle((req) => weeklyTasks().editTask(req.params.id, req.body)));
-router.delete("/:id", requirePermission("tasks.manage"), handle((req) => weeklyTasks().removeTask(req.params.id)));
-router.post("/:id/assign/:groupId", requirePermission("tasks.manage"), handle((req) => weeklyTasks().assign(req.params.id, req.params.groupId)));
-router.delete("/:id/assign/:groupId", requirePermission("tasks.manage"), handle((req) => weeklyTasks().unassign(req.params.id, req.params.groupId)));
-router.post("/:id/approve/:groupId", requirePermission("tasks.manage"), handle((req) => weeklyTasks().setApproved(req.params.id, req.params.groupId, req.body?.approved === true, req.body?.week || "")));
+router.get("/board", requirePermission("tasks.viewAll"), handle(() => weeklyTasks().board()));
+router.post("/greetings", requirePermission("tasks.manage"), requirePermission("tasks.greet"), handle((req) => weeklyTasks().sendGreeting(req.body, req.actor.id)));
+router.post("/", requirePermission("tasks.manage"), requirePermission("tasks.create"), handle(async (req) => ({ id: await weeklyTasks().addTask(req.body, ACTOR_NAME(req)) })));
+router.put("/:id", requirePermission("tasks.manage"), requirePermission("tasks.edit"), handle((req) => weeklyTasks().editTask(req.params.id, req.body)));
+router.delete("/:id", requirePermission("tasks.manage"), requirePermission("tasks.delete"), handle((req) => weeklyTasks().removeTask(req.params.id)));
+router.post("/:id/assign/:groupId", requirePermission("tasks.manage"), requirePermission("tasks.assign"), handle((req) => weeklyTasks().assign(req.params.id, req.params.groupId)));
+router.delete("/:id/assign/:groupId", requirePermission("tasks.manage"), requirePermission("tasks.assign"), handle((req) => weeklyTasks().unassign(req.params.id, req.params.groupId)));
+router.post("/:id/approve/:groupId", requirePermission("tasks.approve"), handle((req) => weeklyTasks().setApproved(req.params.id, req.params.groupId, req.body?.approved === true, req.body?.week || "")));

 module.exports = router;
diff --git a/server/services/alertAccess.js b/server/services/alertAccess.js
index 068618e..444e9ce 100644
--- a/server/services/alertAccess.js
+++ b/server/services/alertAccess.js
@@ -26,10 +26,10 @@ const ALERT_ACCESS = {
   lesson_no_attendance: always,
   report_missing: always,
   access_changed: always,
-  weekly_tasks: always,
-  weekly_task_added: always,
-  weekly_tasks_overdue: always,
-  weekly_tasks_greeting: always,
+  weekly_tasks: has("tasks.view"),
+  weekly_task_added: has("tasks.view"),
+  weekly_tasks_overdue: has("tasks.view"),
+  weekly_tasks_greeting: has("tasks.view"),
 };

 function canSeeAlertType(actor, type) {
diff --git a/server/test/route-guards.test.js b/server/test/route-guards.test.js
index d1af6bf..85dd679 100644
--- a/server/test/route-guards.test.js
+++ b/server/test/route-guards.test.js
@@ -59,8 +59,6 @@ const PUBLIC_ROUTES = {
   // with a single-use 60 s ticket from POST /ticket, and the handler re-loads
   // the user (active, not locked) exactly as loadActor does before streaming.
   "Live/Live.route.js": ["GET /stream"],
-  // Only the signed-in user's own tasks (services/weeklyTasks).
-  "WeeklyTask/WeeklyTask.route.js": ["GET /me", "POST /me/praise-seen", "POST /me/:taskId"],
   // Student sport site (sign-in, me, photo): its own cookie and requireSportStudent, never staff auth.
   "SportPortal/SportPortal.route.js": ["POST /request-code", "POST /verify", "POST /card", "POST /passkey/login-options", "POST /passkey/login", "POST /passkey/register-options", "POST /passkey/register", "POST /logout", "GET /me", "GET /photo", "GET /id", "GET /notices", "GET /live", "POST /push/subscribe", "DELETE /push/subscribe"],
   // IT site sign-in: IT_HOST only (router.use(requireItHost)), its own cookie, never staff auth.
@@ -76,8 +74,6 @@ const PUBLIC_ROUTES = {
 // Routes any active signed-in user may call (loadActor, no key): the
 // controller scopes the answer to the caller.
 const ANY_ACTOR_ROUTES = {
-  // The dashboard summary checks, per part, the permission of that part's own route.
-  "Dashboard/Dashboard.route.js": ["GET /summary"],
   "Vehicle/Vehicle.route.js": ["GET /me/permissions", "GET /alerts"], // own permissions / assigned vehicles
   "User/Auth.route.js": ["POST /change-password", "GET /sessions", "POST /sessions/sign-out-others", "DELETE /sessions/:sid", "POST /it-pass", "POST /passkey/register-options", "POST /passkey/register"], // one's own password (checks the current one), one's own devices, one's own pass to the IT site (the handler checks IT)
   "Live/Live.route.js": ["POST /ticket"], // a ticket for one's own live channel
@@ -104,6 +100,19 @@ const fileOf = (name) => (name.startsWith("routes/") ? path.join(SERVER, name) :

 const rel = (file) => path.relative(ENTITIES, file).split(path.sep).join("/").replace(/^\.\.\/routes\//, "routes/");

+test("permission guards on all routers reference the canonical permission catalog", () => {
+  const { ALL_KEYS, PERMISSION_TREE } = require("../utils/permissions");
+  for (const file of ROUTE_FILES) {
+    const source = stripComments(fs.readFileSync(file, "utf8"));
+    for (const match of source.matchAll(/requirePermission\(([^)]*)\)/g)) {
+      for (const quoted of match[1].matchAll(/["'`]([^"'`]+)["'`]/g)) {
+        const key = quoted[1];
+        assert.ok(ALL_KEYS.includes(key) || Object.hasOwn(PERMISSION_TREE, key), `${rel(file)}: unknown permission ${key}`);
+      }
+    }
+  }
+});
+
 function stripComments(source) {
   return source
     .replace(/\/\*[\s\S]*?\*\//g, "")
@@ -195,7 +204,13 @@ const EXACT_GUARDS = {
     "DELETE /users/:tz/sessions/:sid": "users.unlock",
     "POST /system/recover": "systemRecovery.reset",
   },
-  "Notice/Notice.route.js": { "POST /:id/archive": "notices.post" },
+  "Notice/Notice.route.js": { "POST /:id/archive": "notices.archive" },
+  "InviteToken/InviteToken.route.js": {
+    "POST /rules": "rules.edit",
+    "GET /consent/:studentId": "consents.view",
+    "POST /consent/:studentId": "consents.edit",
+    "POST /consent/:studentId/link": "consents.link",
+  },
   "Lesson/Lesson.route.js": {
     "POST /copy-month": "lessons.copyMonth",
     "DELETE /delete-perMonth/:month/:year": "lessons.copyMonth",
diff --git a/server/utils/permissions.js b/server/utils/permissions.js
index f463662..5e129e0 100644
--- a/server/utils/permissions.js
+++ b/server/utils/permissions.js
@@ -6,16 +6,16 @@ const PERMISSION_TREE = catalog.tree;

 const ROLE_DEFAULTS = {
   "ادارة": ["dashboard", "calendar", "students", "lessons", "attendance", "reports", "vehicles",
-            "files", "notices", "tasks", "users.view", "users.create", "users.edit", "users.approve",
+            "files", "notices", "tasks", "rules", "consents", "users.view", "users.create", "users.edit", "users.approve",
             "users.delete", "users.changeRole", "users.resetPassword", "ai"],
   // Only an admin edits students, lessons and users (owner, 2026-11-01); an
   // admin may still grant one guide an edit key in the permissions screen.
   "مرشد": ["dashboard", "calendar", "students.view",
            "lessons.view",
            "attendance", "reports.create", "reports.editOwn", "reports.exportPdf",
-           "files.use", "ai"],
+           "files.use", "files.upload", "files.createFolder", "files.rename", "files.delete", "files.share", "tasks.view", "tasks.complete", "ai"],
   "مساعد": ["dashboard", "calendar", "students.view", "lessons.view", "attendance.view",
-            "reports.create", "reports.editOwn", "reports.exportPdf", "files.use", "ai"],
+            "reports.create", "reports.editOwn", "reports.exportPdf", "files.use", "files.upload", "files.createFolder", "files.rename", "files.delete", "files.share", "tasks.view", "tasks.complete", "ai"],
 };

 const ROLE_RANK = { "ادارة": 3, "مرشد": 2, "مساعد": 1 };
diff --git a/shared/permissions.json b/shared/permissions.json
index b67148f..c9d40db 100644
--- a/shared/permissions.json
+++ b/shared/permissions.json
@@ -29,7 +29,16 @@
       "record"
     ],
     "tasks": [
-      "manage"
+      "view",
+      "complete",
+      "viewAll",
+      "manage",
+      "create",
+      "edit",
+      "delete",
+      "assign",
+      "approve",
+      "greet"
     ],
     "reports": [
       "create",
@@ -49,12 +58,18 @@
     ],
     "files": [
       "use",
-      "manageAll"
+      "manageAll",
+      "upload",
+      "createFolder",
+      "rename",
+      "delete",
+      "share"
     ],
     "notices": [
       "view",
       "post",
-      "runCheck"
+      "runCheck",
+      "archive"
     ],
     "users": [
       "view",
@@ -89,6 +104,15 @@
     ],
     "storage": [
       "drive"
+    ],
+    "rules": [
+      "view",
+      "edit"
+    ],
+    "consents": [
+      "view",
+      "edit",
+      "link"
     ]
   },
   "itKeys": [
@@ -122,7 +146,9 @@
         "sports": "الرياضة",
         "systemRecovery": "استعادة حساب النظام",
         "storage": "التخزين",
-        "finance": "المالية"
+        "finance": "المالية",
+        "rules": "قوانين الجمعية",
+        "consents": "تواقيع أولياء الأمور"
       },
       "leaves": {
         "view": "عرض",
@@ -151,7 +177,15 @@
         "unlock": "رفع الحظر",
         "resetPassword": "تعيين كلمة مرور جديدة",
         "manage": "إدارة",
-        "reset": "إعادة تعيين"
+        "reset": "إعادة تعيين",
+        "complete": "تأكيد الإنجاز",
+        "assign": "توزيع وربط بالمجموعات",
+        "greet": "إرسال بركة",
+        "upload": "رفع ملفات",
+        "createFolder": "إنشاء مجلد",
+        "rename": "إعادة تسمية",
+        "link": "إنشاء رابط توقيع",
+        "share": "مشاركة وإلغاء المشاركة"
       },
       "leavesByModule": {
         "sports": {
@@ -162,10 +196,16 @@
           "drive": "حساب Google Drive"
         },
         "tasks": {
-          "manage": "إدارة المهمات الأسبوعية"
+          "manage": "فتح صفحة تحديث المهمات"
         },
         "permissions": {
           "manage": "إدارة الصلاحيات"
+        },
+        "rules": {
+          "edit": "تعديل ونشر القوانين"
+        },
+        "consents": {
+          "edit": "إضافة أو تحديث التوقيع"
         }
       }
     }
```

## server/middleware/consentScope.js

```
// Signature access follows the same student scope as the student's own page.
// Public parent links use their separate, expiring capability checks.
function createConsentScope({ visibleStudentIds = async (actor) => {
  const { createStudentScope } = require("../utils/studentScope");
  return createStudentScope({
    lessonModel: require("../Entities/Lesson/Lesson.model").LessonModelDef,
    studentModel: require("../Entities/Student/Student.model").StudentModelDef,
  }).visibleStudentIds(actor);
} } = {}) {
  return async (req, res, next) => {
    try {
      const ids = await visibleStudentIds(req.actor);
      if (ids !== null && !ids.has(String(req.params.studentId))) {
        return res.status(404).json({ ok: false, message: "الطالب غير موجود" });
      }
      return next();
    } catch (error) { return next(error); }
  };
}
module.exports = { createConsentScope, consentScope: createConsentScope() };

```

## server/test/business-capabilities.test.js

```
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { effectivePermissions } = require("../utils/permissions");
const pm = require("../middleware/permissionMiddleware");
const { createConsentScope } = require("../middleware/consentScope");
const { canSeeAlertType } = require("../services/alertAccess");

test("weekly-task alerts follow current task visibility, including after revocation", () => {
  for (const type of ["weekly_tasks", "weekly_task_added", "weekly_tasks_overdue", "weekly_tasks_greeting"]) {
    assert.equal(canSeeAlertType({ permissions: effectivePermissions({ role: "مرشد" }) }, type), true);
    assert.equal(canSeeAlertType({ permissions: effectivePermissions({ role: "مرشد", permissionRevokes: ["tasks.view"] }) }, type), false);
  }
});

function fixture(entity) {
  const calls = [];
  const noop = (req, res, next) => next();
  const handler = (name) => (req, res) => { calls.push(name); return res.status(200).json({ ok: true }); };
  const controller = new Proxy({}, { get: (_, name) => handler(name) });
  const multer = () => ({ single: () => noop });
  multer.memoryStorage = multer.diskStorage = () => ({});
  const deps = {
    express: require("express"), multer, fs: { mkdirSync() {} }, os: require("node:os"), path,
    "../../middleware/authMiddleware": { requireAuth: noop },
    "../../middleware/permissionMiddleware": { ...pm, loadActor: noop },
    "../../middleware/consentScope": { consentScope: createConsentScope({ visibleStudentIds: async () => new Set(["student"]) }) },
    "../../middleware/rateLimit": { rateLimit: () => noop },
    "../../middleware/logger": { logWithSource() {} },
    "../../services/weeklyTasks": { weeklyTasks: () => new Proxy({}, { get: (_, name) => async () => { calls.push(name); return {}; } }) },
    [`./${entity}.controller`]: controller,
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, `../Entities/${entity}/${entity}.route.js`), "utf8"), {
    module, process: { env: {} }, require: (name) => { assert.ok(deps[name], name); return deps[name]; },
  });
  return { calls, async call(method, routePath, { role = "ادارة", grants = [], revokes = [], studentId = "student" } = {}) {
    const route = module.exports.stack.find((entry) => entry.route?.path === routePath && entry.route.methods[method])?.route;
    assert.ok(route, `${method} ${routePath}`);
    const req = { actor: { id: "owner", permissions: effectivePermissions({ role, permissionGrants: grants, permissionRevokes: revokes }) },
      params: { studentId, id: "task", taskId: "task", groupId: "group" }, body: {}, headers: {}, _body: true };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    for (const layer of route.stack) {
      let next = false;
      await layer.handle(req, res, (error) => { if (error) throw error; next = true; });
      if (!next) break;
    }
    return res;
  } };
}

test("rules are independently grantable; parent-link access cannot read or publish them", async () => {
  const f = fixture("InviteToken");
  assert.equal((await f.call("get", "/rules", { role: "مرشد", grants: ["students.parentLink"] })).statusCode, 403);
  assert.equal((await f.call("get", "/rules", { role: "مرشد", grants: ["rules.view"] })).statusCode, 200);
  assert.equal((await f.call("post", "/rules", { role: "مرشد", grants: ["rules.view"] })).statusCode, 403);
  assert.equal((await f.call("post", "/rules", { role: "مرشد", grants: ["rules.edit"] })).statusCode, 200);
  assert.equal((await f.call("post", "/rules", { revokes: ["rules.edit"] })).statusCode, 403);
  assert.equal(f.calls.filter((name) => name === "publishRules").length, 1);
});

test("posting a notice never bypasses a revoked archive operation", async () => {
  const f = fixture("Notice");
  assert.equal((await f.call("post", "/:id/archive", { revokes: ["notices.archive"] })).statusCode, 403);
  assert.deepEqual(f.calls, []);
  assert.equal((await f.call("post", "/:id/archive")).statusCode, 200);
});

test("signature read, replacement and parent link are separate, and keep the student's scope", async () => {
  const f = fixture("InviteToken");
  assert.equal((await f.call("get", "/consent/:studentId", { role: "مرشد", grants: ["consents.view"] })).statusCode, 200);
  assert.equal((await f.call("post", "/consent/:studentId", { role: "مرشد", grants: ["consents.view"] })).statusCode, 403);
  assert.equal((await f.call("post", "/consent/:studentId/link", { role: "مرشد", grants: ["consents.link"] })).statusCode, 200);
  assert.equal((await f.call("post", "/consent/:studentId/link", { role: "مرشد", grants: ["consents.link"], studentId: "other-student" })).statusCode, 404);
  assert.equal((await f.call("get", "/consent/:studentId", { revokes: ["consents.view"] })).statusCode, 403);
  assert.equal(f.calls.filter((name) => name === "createConsentLink").length, 1);
});

for (const [method, route, key] of [
  ["get", "/me", "view"], ["post", "/me/:taskId", "complete"], ["get", "/board", "viewAll"],
  ["post", "/", "create"], ["put", "/:id", "edit"], ["delete", "/:id", "delete"],
  ["post", "/:id/assign/:groupId", "assign"], ["delete", "/:id/assign/:groupId", "assign"],
  ["post", "/:id/approve/:groupId", "approve"], ["post", "/greetings", "greet"],
]) test(`weekly task ${key}: revoked operation never reaches the service`, async () => {
  const f = fixture("WeeklyTask");
  assert.equal((await f.call(method, route, { revokes: [`tasks.${key}`] })).statusCode, 403);
  assert.deepEqual(f.calls, []);
  assert.equal((await f.call(method, route)).statusCode, 200);
  assert.equal(f.calls.length, 1);
});

for (const [method, route, key] of [
  ["post", "/folder", "createFolder"], ["post", "/upload", "upload"], ["post", "/upload-chunk", "upload"],
  ["post", "/merge-chunks", "upload"], ["patch", "/rename", "rename"],
  ["delete", "/delete", "delete"], ["delete", "/*", "delete"], ["post", "/share", "share"], ["post", "/unshare", "share"],
]) test(`files ${route}: files.use cannot bypass revoked ${key}`, async () => {
  const f = fixture("Storage");
  assert.equal((await f.call(method, route, { revokes: [`files.${key}`] })).statusCode, 403);
  assert.deepEqual(f.calls, []);
  assert.equal((await f.call(method, route)).statusCode, 200);
  assert.equal(f.calls.length, 1);
});

```

## docs/FEATURE_PERMISSIONS.md

```
# Grantable business sections and actions

The owner requires business sections and operations to be grantable/revocable.
`shared/permissions.json` is the catalog for System, IT and the server. Names
alone do not implement authorization: every operation needs its server guard,
its UI gate, record scope checks and a behavioral grant/revoke test.

| Section | Permissions and remaining record restrictions |
| --- | --- |
| Association rules | `rules.view`, `rules.edit` (edit and publish a new version) |
| Parent signatures | `consents.view`, `consents.edit`, `consents.link`; also `students.view` and the same student scope as the student page |
| Registration link | `students.parentLink`; does not grant rules editing or signature access |
| Weekly tasks | `tasks.view`, `tasks.complete`, `tasks.viewAll`, `tasks.manage`, `tasks.create`, `tasks.edit`, `tasks.delete`, `tasks.assign`, `tasks.approve`, `tasks.greet` |
| Files | `files.use` to enter/read; separate `upload`, `createFolder`, `rename`, `delete`, `share`; per-path and sharing ACL remain additional requirements; `manageAll` does not bypass a revoked global operation |
| Main page | `dashboard.view`; each data card additionally checks its own section permission |
| Notices | `notices.view`, `notices.post`, `notices.archive`, `notices.runCheck` |
| Students | `students.view`, `viewAll`, `create`, `edit`, `delete`, `photo`, `parentLink`; existing student scope stays enforced |
| Programs / weekly timetable | `lessons.view`, `viewAll`, `create`, `edit`, `roster`, `delete`, `copyMonth`; ownership, scoped roster and record locks stay enforced |
| Attendance | `attendance.view`, `attendance.record`; existing group/lesson scope stays enforced |
| Reports | `reports.create`, `editOwn`, `viewAll`, `editAll`, `delete`, `exportPdf`; author/record checks stay enforced |
| Vehicles | `vehicles.view`, `edit`, `compliance`, `documents`, `archive`, `delete`; vehicle assignment and record locks stay enforced |
| Staff | `users.view`, `create`, `edit`, `approve`, `delete`, `changeRole`, `resetPassword`; hierarchy/IT protections stay enforced |
| Sports staff | `sports.view`, `sports.coach`, `sports.manage`; sports portal students retain their separate self-only session |
| AI assistant | `ai.use`; proposed actions still recheck their underlying business operation permissions |
| IT administration | Existing IT-only gates, account membership/host checks and catalog keys remain; everyday roles cannot grant themselves IT powers |

Weekly-task management needs `tasks.manage` plus the specific create/edit/
delete/assign/greet permission. Its editor also needs `tasks.viewAll` to load
the board. Board readers can approve only with `tasks.approve`. Personal
completion still checks group ownership, helper assignment and the current week.
Revoking personal task visibility also hides task reminders in the current inbox
and live feed. Task assignment/history is retained when access is revoked.

Built-in role defaults retain previous behavior: management has the new rules,
signature and management operations; guides/helpers keep personal task reading
and completion plus their existing file operations within permitted folders.
Explicit custom role defaults and saved user grants/revokes are not migrated
or broadened. New keys in custom sets must be granted deliberately through IT.
An old explicit `students.parentLink` grant no longer includes rules/signature
administration, and `tasks.manage` alone no longer grants all task operations.

Public parent registration/signing uses scoped token capabilities and consent
validation, not employee permissions. Personal authentication, logout, password,
session management, own alert read-status, push subscription, help and edit-lock
infrastructure retain their explicit self-only/security guards. They are listed
exceptions in the route audit, not unguarded business operations. Existing
time-limited file/share capabilities keep their separate expiry/access checks.
External Google-account permissions remain controlled by Google Drive.

Unknown authenticated frontend business sections fail closed. Add a route rule
before exposing a section. The server route audit checks every non-exempt route
for an actor/permission guard and checks literal guards against the catalog.
New public/self-only exceptions require an explicit security rationale.

No data migration or deployment is performed by these source changes. After
deploying, System and IT show the same generated catalog. Verify with
`npm run verify` and the IT tests/build. See `AI_REVIEW_LOG.md` for actual results
and independent peer-review availability.

```

## Final follow-up: full source takes precedence over earlier diff excerpts

Local review found and fixed two permission edges: a read-only rules viewer
must not be marked as editing the default text; a board-only task viewer must
not see a toggle leading to a revoked personal view. Added focused regressions.
These are the final versions of the two affected production files.

### apps/system/src/Components/Student/RulesEditor.jsx

```
import { canStored } from "../../utils/session";
import React, { useEffect, useState } from "react";
import Button from "../UI/Button.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { ask } from "../Provides/confirmBus.js";
import { getRules, publishRules } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
import { DEFAULT_RULES } from "./defaultRules";
import { setUnsavedChanges } from "../../utils/unsavedChanges";

// The rules a parent signs on the registration link. Publishing makes a new
// version; those who already signed keep the version they signed.
export default function RulesEditor() {
  const canEdit = canStored("rules.edit");
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(0);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (loaded && !error) setUnsavedChanges(canEdit && text !== saved); }, [loaded, error, canEdit, text, saved]);
  useEffect(() => () => setUnsavedChanges(null), []);

  useEffect(() => {
    let alive = true;
    getRules().then((res) => {
      if (!alive) return;
      if (res.ok) {
        setVersion(res.rules?.version || 0);
        setText(res.rules ? (res.rules.text ?? "") : DEFAULT_RULES);
        setSaved(res.rules?.text || "");
      } else setError(res.message || "تعذّر تحميل نظام الجمعية");
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  const publish = async () => {
    if (!canEdit) return;
    let confirmed = false;
    try {
      confirmed = await ask("", {
        title: "نشر نظام الجمعية",
        message: text.trim()
          ? "من الآن سيوقّع الأهل الجدد على هذا النص. من وقّع سابقًا يبقى توقيعه على النص الذي وقّعه."
          : "النص فارغ: سيتوقف رابط التسجيل عن استقبال طلبات الأهل. هل تريد المتابعة؟",
        confirmText: "نشر",
        cancelText: "إلغاء",
      });
    } catch {
      toast.error("تعذّر فتح نافذة التأكيد، حاول مرة أخرى.");
      return;
    }
    if (!confirmed) return;
    setBusy(true);
    const res = await publishRules(text);
    setBusy(false);
    if (!res.ok) return toast.error(res.message);
    setVersion(res.rules.version);
    setSaved(res.rules.text);
    toast.success("تم نشر نظام الجمعية");
  };

  if (!loaded) return null;
  if (error) return <p role="alert">{error}</p>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <h3 style={{ margin: 0 }}>نظام الجمعية{version ? ` (الإصدار ${version})` : ""}</h3>
      <small>يظهر للأهل في رابط «قوانين الجمعية». الموافقة والتوقيع/الختم مطلوبان لإرسال الطلب. يمكن استكمال توقيع طالب أضافته الجمعية من ملفه أو برابط شخصي لولي الأمر. النص الافتراضي متاح ما لم تنشر الإدارة نصًا آخر.</small>
      {!saved.trim() && version > 0 && <strong role="alert" style={{ color: "#b91c1c" }}>النص المنشور فارغ: رابط التسجيل لا يستقبل طلبات.</strong>}
      <textarea readOnly={!canEdit} aria-label="نص نظام الجمعية" rows={8} maxLength={20000} value={text} onChange={(event) => canEdit && setText(event.target.value)} />
      {canEdit && <div>
        <Button size="sm" variant="secondary" disabled={busy || text === DEFAULT_RULES} onClick={() => setText(DEFAULT_RULES)}>استعادة النص الافتراضي</Button>{" "}
        <Button size="sm" loading={busy} disabled={text === saved} onClick={publish}>نشر</Button>
      </div>}
    </div>
  );
}

```

### apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.jsx

```
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { approveTask, getMyTasks, getTaskBoard, setMyTaskDone } from "../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { canStored } from "../../utils/session";
import Button from "../UI/Button.jsx";
import styles from "./WeeklyTasks.module.css";

const TaskCheck = ({ checked, disabled, label, onChange }) => (
  <label className={styles.check}>
    <input type="checkbox" checked={checked} disabled={disabled} aria-label={label} onChange={(event) => onChange(event.target.checked)} />
  </label>
);

const weekLabel = (week) => {
  const [y, m, d] = String(week || "").split("-");
  return y ? `${d}/${m}/${y}` : "";
};

// What the person himself must do this week: to do, then done in green.
function MyTasks({ tasks, onToggle, busy, canComplete }) {
  const [group, setGroup] = useState("");
  const [search, setSearch] = useState("");
  const groups = [...new Map(tasks.map((task) => [String(task.groupId), task.groupName])).entries()];
  const selectedGroup = groups.some(([id]) => id === group) ? group : "";
  const query = search.trim().toLocaleLowerCase();
  const filtered = tasks.filter((task) => (!selectedGroup || String(task.groupId) === selectedGroup)
    && (!query || `${task.title || ""} ${task.groupName || ""}`.toLocaleLowerCase().includes(query)));
  const open = filtered.filter((task) => !task.done);
  const done = filtered.filter((task) => task.done);
  return (
    <section className={styles.panel} aria-label="مهماتي">
      <h2>مهمات مجموعتي هذا الأسبوع</h2>
      <p className={styles.muted}>أكّد إنجاز المهمات حتى نهاية يوم السبت. يبدأ أسبوع جديد بعد ذلك، وتُغلق مهمات الأسبوع السابق.</p>
      <div className={styles.filters}>
        {groups.length > 1 && <label>المجموعة<select value={selectedGroup} onChange={(event) => setGroup(event.target.value)}><option value="">كل مجموعاتي</option>{groups.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
        <label>بحث في مهماتي<input type="search" placeholder="اسم مجموعة أو مهمة" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        {(selectedGroup || search) && <Button variant="secondary" onClick={() => { setGroup(""); setSearch(""); }}>مسح الفلتر</Button>}
      </div>
      {filtered.length === 0 ? <p className={styles.muted}>لا توجد مهمات مطابقة.</p> : open.length === 0 && <p className={styles.muted}>كل المهمات المعروضة منجزة.</p>}
      <ul className={styles.list}>
        {open.map((task) => (
          <li key={`${task.groupId}:${task.taskId}`} className={styles.item}>
            <span className={styles.text}><strong dir="auto">{task.title}</strong><small dir="auto">{task.groupName}</small>{task.details && <small dir="auto">{task.details}</small>}</span>
            <TaskCheck checked={false} disabled={!canComplete || busy === `${task.groupId}:${task.taskId}`} label={`إنجاز ${task.title} — ${task.groupName}`} onChange={(checked) => onToggle(task, checked)} />
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <>
          <h3 className={styles.doneTitle}>تم إنجازها</h3>
          <ul className={styles.list}>
            {done.map((task) => (
              <li key={`${task.groupId}:${task.taskId}`} className={`${styles.item} ${styles.done}`}>
                <span className={styles.text}><strong dir="auto">{task.title}</strong><small dir="auto">{task.groupName}</small>{task.approved && <small>أكّدتها الإدارة</small>}</span>
                <TaskCheck checked disabled={!canComplete || task.approved || busy === `${task.groupId}:${task.taskId}`} label={`إنجاز ${task.title} — ${task.groupName}`} onChange={(checked) => onToggle(task, checked)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// The management's register: each group and its tasks, each with its check.
function Register({ board, onToggle, busy, canApprove }) {
  const groups = useMemo(() => board.groups.map((group) => ({
    ...group,
    tasks: board.assignments
      .filter((row) => row.groupId === group.id)
      .map((row) => {
        const task = board.tasks.find((item) => item.id === row.taskId);
        const status = board.statuses.find((item) => item.taskId === row.taskId && item.groupId === group.id);
        return task ? { ...task, done: Boolean(status?.done), approved: Boolean(status?.approved) } : null;
      })
      .filter(Boolean).sort((a, b) => Number(a.done) - Number(b.done)),
  })).filter((group) => group.tasks.length > 0), [board]);

  return (
    <section className={styles.panel} aria-label="سجل المهمات">
      <h2>سجل المهمات</h2>
      {groups.length === 0 && <p className={styles.muted}>لم تُربط مهمات بالمجموعات بعد.</p>}
      <div className={styles.groups}>
        {groups.map((group) => (
          <div key={group.id} className={styles.group}>
            <h3 dir="auto">{group.name}</h3>
            <small dir="auto">{group.ownerNames?.join("، ")}</small>
            <ul className={styles.list}>
              {group.tasks.map((task) => {
                const key = `${task.id}:${group.id}`;
                return (
                  <li key={key} className={`${styles.item} ${task.done ? styles.done : ""}`}>
                    <TaskCheck
                      checked={task.done}
                      label={`${task.done ? "إلغاء إنجاز" : "تأكيد إنجاز"} ${task.title} — ${group.name}`}
                      disabled={!canApprove || busy === key}
                      onChange={(checked) => onToggle(task, group, checked)}
                    />
                    <span className={styles.text}>
                      <span dir="auto">{task.title}</span>
                      {task.done && !task.approved && <small>أنجزها المسؤول</small>}
                      {task.approved && <small>أكّدتها الإدارة</small>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// «المهمات الأسبوعية»: what one must do, and for the management the register and the
// way to the page where tasks are written and joined to groups.
export default function WeeklyTasksPage() {
  const navigate = useNavigate();
  const canManage = canStored("tasks.manage");
  const canViewAll = canStored("tasks.viewAll");
  const canViewMine = canStored("tasks.view");
  const [mine, setMine] = useState(null);
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    const own = canViewMine ? await getMyTasks() : { ok: true, tasks: [] };
    if (!own.ok) setError(own.message);
    else { setError(""); setMine(own); }
    if (canViewAll && (showAll || !canViewMine)) {
      const res = await getTaskBoard();
      if (res.ok) setBoard(res);
      else setError(res.message);
    }
  }, [canViewAll, canViewMine, showAll]);
  useEffect(() => { load(); }, [load]);

  const toggleMine = async (task, done) => {
    setBusy(`${task.groupId}:${task.taskId}`);
    const res = await setMyTaskDone(task.taskId, task.groupId, done, mine.week);
    setBusy("");
    if (!res.ok) { if (res.code === "WEEK_CLOSED") await load(); return toast.warn(res.message); }
    setMine(res);
    if (canManage) load();
    return undefined;
  };
  const toggleRegister = async (task, group, approved) => {
    const key = `${task.id}:${group.id}`;
    setBusy(key);
    const res = await approveTask(task.id, group.id, approved, board.week || mine?.week);
    setBusy("");
    if (!res.ok) { if (res.code === "WEEK_CLOSED") await load(); return toast.warn(res.message); }
    return load();
  };

  return (
    <div className={styles.page} dir="rtl">
      <header className={styles.head}>
        <div>
          <h1>المهمات الأسبوعية</h1>
          {(mine?.week || board?.week) && <p className={styles.muted}>الأسبوع الذي بدأ في {weekLabel(mine?.week || board.week)}</p>}
        </div>
        {canViewAll && <div className={styles.row}>
          {canViewMine && <Button variant="secondary" onClick={() => setShowAll((shown) => !shown)}>{showAll ? "عرض مهماتي" : "عرض مهمات الجمعية"}</Button>}
          {canManage && (showAll || !canViewMine) && <Button onClick={() => navigate("/weekly-tasks/manage")}>تعديل المهمات والمجموعات</Button>}
        </div>}
      </header>
      {error && <div role="alert" className={styles.error}>{error}</div>}
      {canViewMine && mine && !showAll && <MyTasks canComplete={canStored("tasks.complete")} tasks={mine.tasks} onToggle={toggleMine} busy={busy} />}
      {canViewAll && (showAll || !canViewMine) && board && <Register canApprove={canStored("tasks.approve")} board={board} onToggle={toggleRegister} busy={busy} />}
    </div>
  );
}

```

## Final timetable correction

Audit also found calendar.view was not used to guard the actual weekly view.
The weekly page and new /lesson/week-schedule endpoint now require both
lessons.view and calendar.view. Program-record access remains lessons.view.
Football schedule projection also checks calendar.view. Default roles already
hold calendar.view, so no stored data/default migration is needed. Synthetic
training route is updated. Behavioral revoke coverage confirms the projection
is denied while independent record-list access remains allowed.

```diff
diff --git a/apps/system/src/Components/Lesson/ViewAllLesson.jsx b/apps/system/src/Components/Lesson/ViewAllLesson.jsx
index d9a8b70..d605a40 100644
--- a/apps/system/src/Components/Lesson/ViewAllLesson.jsx
+++ b/apps/system/src/Components/Lesson/ViewAllLesson.jsx
@@ -487,7 +487,7 @@ export default function ViewAllLesson() {
   const loadData = async ({ quiet = false } = {}) => {
     try {
       if (!quiet) setIsLoading(true);
-      const [res, sportRes] = await Promise.all([getAllLesson(), getSportSchedule()]);
+      const [res, sportRes] = await Promise.all([getAllLesson({ weekly: true }), getSportSchedule()]);
       if (!res?.ok) throw new Error(res?.message || "Load failed");

       // Football lessons are extra and read-only: the schedule still loads without them.
diff --git a/apps/system/src/WebServer/services/lesson/functionsLesson.jsx b/apps/system/src/WebServer/services/lesson/functionsLesson.jsx
index 7e262e6..efde21c 100644
--- a/apps/system/src/WebServer/services/lesson/functionsLesson.jsx
+++ b/apps/system/src/WebServer/services/lesson/functionsLesson.jsx
@@ -11,9 +11,9 @@ export const normalizeLesson = (lesson) => {
     };
 };

-export const getAllLesson = async() => {
+export const getAllLesson = async({ weekly = false } = {}) => {
     try{
-        const {data, status} = await api.get('/lesson');
+        const {data, status} = await api.get(weekly ? '/lesson/week-schedule' : '/lesson');
         if(![200,201].includes(status) || !data.ok) throw new Error ('تعذّر تحميل البرامج');
         // names: the staff's full names by user _id (the server's lesson list carries them).
         return {ok: true, lessons: (data.lessons || data.schema || []).map(normalizeLesson).filter(Boolean), names: data.names || {}};
diff --git a/apps/system/src/journey/demoRoutes.js b/apps/system/src/journey/demoRoutes.js
index 7ccf2f6..ca25cca 100644
--- a/apps/system/src/journey/demoRoutes.js
+++ b/apps/system/src/journey/demoRoutes.js
@@ -312,6 +312,7 @@ route("delete", /^\/student\/([^/]+)$/, (s, [key]) => {
 const lessonView = (lesson) => ({ ...lesson, num_in_list: lesson.list_students.length });
 const todayDay = () => new Date().getDay() + 1;
 route("get", /^\/lesson$/, (s) => ok({ lessons: s.lessons.map(lessonView) }));
+route("get", /^\/lesson\/week-schedule$/, (s) => ok({ lessons: s.lessons.map(lessonView) }));
 route("get", /^\/lesson\/today$/, (s) => ok({ lessons: s.lessons.filter((l) => l.date.day === todayDay()).map(lessonView) }));
 route("get", /^\/lesson\/query$/, (s, _, { params }) =>
   ok({
diff --git a/apps/system/src/utils/routeAccess.js b/apps/system/src/utils/routeAccess.js
index 521b723..5ec0b92 100644
--- a/apps/system/src/utils/routeAccess.js
+++ b/apps/system/src/utils/routeAccess.js
@@ -1,12 +1,14 @@
 import { hasPermission } from "./permissionKeys";

-// Pages limited to a permission, checked in order (first match wins). Any other
-// page behind login is open to every signed-in user. These mirror what the
-// menu and the page buttons offer; the server enforces its own rules.
+// Business pages require an explicit permission rule (first match wins).
+// Only listed personal/help pages bypass it; unknown sections fail closed.
+// The server independently enforces permissions and record scope.
 const RESTRICTED = [
-  { pattern: /^\/association-rules(\/|$)/, key: "students.parentLink" },
+  { pattern: /^\/dashboard(\/|$)/, key: "dashboard.view" },
+  { pattern: /^\/association-rules(\/|$)/, key: "rules.view" },
   // The forms: only an admin edits by default (owner, 2026-11-01).
-  { pattern: /^\/weekly-tasks\/manage$/, key: "tasks.manage" },
+  { pattern: /^\/weekly-tasks\/manage$/, all: ["tasks.manage", "tasks.viewAll"] },
+  { pattern: /^\/weekly-tasks(\/|$)/, any: ["tasks.view", "tasks.viewAll"] },
   { pattern: /^\/users\/new$/, key: "users.create" },
   { pattern: /^\/users\/[^/]+\/edit$/, key: "users.edit" },
   { pattern: /^\/students\/[^/]+\/edit$/, key: "students.edit" },
@@ -16,20 +18,21 @@ const RESTRICTED = [
   { pattern: /^\/students\/new$/, key: "students.create" },
   { pattern: /^\/students(\/|$)/, key: "students.view" },
   { pattern: /^\/lessons\/new$/, key: "lessons.create" },
+  { pattern: /^\/lessons$/, all: ["lessons.view", "calendar.view"] },
   { pattern: /^\/vehicles(\/|$)/, key: "vehicles.view" },
   { pattern: /^\/sports(\/|$)/, any: ["sports.view", "sports.coach", "sports.manage"] },
   // A section taken away closes too (owner, 2026-11-03), as on the server.
   { pattern: /^\/calendar(\/|$)/, key: "attendance.view" },
   { pattern: /^\/lessons(\/|$)/, key: "lessons.view" },
   { pattern: /^\/reports(\/|$)/, any: ["reports.create", "reports.editOwn", "reports.viewAll", "reports.editAll", "reports.delete", "reports.exportPdf"] },
-  { pattern: /^\/files(\/|$)/, any: ["files.use", "files.manageAll"] },
+  { pattern: /^\/files(\/|$)/, key: "files.use" },
 ];

 export const canAccessPath = (pathname, permissions) => {
   const path = String(pathname || "").replace(/\/+$/, "") || "/";
   const rule = RESTRICTED.find(({ pattern }) => pattern.test(path));
-  if (!rule) return true;
-  return rule.any ? rule.any.some((key) => hasPermission(permissions, key)) : hasPermission(permissions, rule.key);
+  if (!rule) return ["/", "/profile", "/guide"].includes(path);
+  return rule.all ? rule.all.every((key) => hasPermission(permissions, key)) : rule.any ? rule.any.some((key) => hasPermission(permissions, key)) : hasPermission(permissions, rule.key);
 };

 // Where a blocked page sends the user: their own user page (/users/<own tz>,
@@ -38,5 +41,5 @@ export const canAccessPath = (pathname, permissions) => {
 export const blockedRedirect = (pathname, permissions, ownTz) => {
   if (canAccessPath(pathname, permissions)) return null;
   const own = String(pathname || "").match(/^\/users\/([^/]+)(?:\/edit)?\/?$/);
-  return own && ownTz && own[1] === String(ownTz) ? "/profile" : "/dashboard";
+  return own && ownTz && own[1] === String(ownTz) ? "/profile" : canAccessPath("/dashboard", permissions) ? "/dashboard" : "/profile";
 };
diff --git a/server/Entities/Lesson/Lesson.route.js b/server/Entities/Lesson/Lesson.route.js
index 94bf0f4..8a776a9 100644
--- a/server/Entities/Lesson/Lesson.route.js
+++ b/server/Entities/Lesson/Lesson.route.js
@@ -34,9 +34,10 @@ router.use(protect, loadActor);

 // ملاحظة عربية
 router.get('/', requirePermission('lessons.view'), getAll);
+router.get('/week-schedule', requirePermission('lessons.view'), requirePermission('calendar.view'), getAll);
 router.get('/query', requirePermission('lessons.view'), getLessonsByQuery);
 router.get('/today', requirePermission('lessons.view'), getLessonsByToDay);
-router.get('/sport-schedule', requirePermission('lessons.view'), getSportSchedule);
+router.get('/sport-schedule', requirePermission('lessons.view'), requirePermission('calendar.view'), getSportSchedule);
 router.get('/:id', requirePermission('lessons.view'), getOne);
 // ملاحظة عربية
 router.post('/addToList/:id', requirePermission('lessons.roster'), lockedLesson, addToList);
```

## Final shared-name metadata

The Arabic navigation dictionary also spreads catalog.labels.ar.modules, and
the rules nav item reads t("nav.rules") rather than a duplicated literal. This
keeps the new rules section name synchronized with the IT permission section.
No authorization logic changes in this final text-extraction step.
