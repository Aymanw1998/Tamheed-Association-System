# Source-only Claude Code review — Drive hierarchy 2026-11-07
Codex is sole implementer. Review only; no editing, tools, recursive review or external operations.
Owner authorized source sharing; this payload contains only code and synthetic tests.
Requested physical tree: Tamheed-System/Profile-photos/{Students,Users}, Storages, Vehicles. Storage API/DB logical paths stay backward-compatible. Existing branches remain readable/writable until explicit operator migration; new installs use canonical paths. Migration preview makes no writes, apply moves the original folders with stable ids, refuses ambiguity and shared parent inheritance changes, is resumable, trashes only an empty legacy structural folder. Apply is an offline maintenance operation, not run during development/tests. Per-process folder creation queue prevents simultaneous uploads making duplicate branches; cross-process migration concurrency is explicitly unsupported.
Manual Google file discovery requires explicit fullAccess boolean and Google reconsent by the storage.drive/system account, account-wide scope described in UI. Default reconnect stays drive.file. New general-storage uploads are private; photos stay on public image path, vehicle documents stay private. Valid expiring JWT grants stream ordinary files, render safe media/PDF, attach active HTML/SVG, redirect native editing only to allowed Google domains, and export native downloads as PDF. Existing public file shares are not revoked by migration. Found/fixed pre-existing dot-segment scope escape before posix normalization. Examine permissions, aliases, partial migration/races, stale paths/id preservation, token streaming and regressions. Explain concrete findings with file/line evidence. No agreement should be inferred from this request.
Final safeguards: migration preview/apply requires recorded full Drive scope so manual destination conflicts cannot be invisible. Private uploads refuse public/domain-shared or unknown parent permissions before file creation. No actual Google/migration/deployment operation occurred.

diff --git a/apps/it/src/api.js b/apps/it/src/api.js
index 9e334dd..35586cc 100644
--- a/apps/it/src/api.js
+++ b/apps/it/src/api.js
@@ -101,7 +101,7 @@ export const getAudit = (filters = {}, page = 1) => {
   return call(`/audit?${query}`);
 };
 export const getDriveStatus = () => call("/storage/google/status");
-export const getDriveConnectUrl = () => send("POST", "/storage/google/connect-url");
+export const getDriveConnectUrl = (options = {}) => send("POST", "/storage/google/connect-url", { fullAccess: options.fullAccess === true });
 export const forceReleaseLock = (key) => send("POST", "/locks/force-release", { key });
 export const getPushSettings = () => call("/push/settings");
 export const setPushEnabled = (enabled) => send("PUT", "/push/settings", { enabled });
diff --git a/apps/it/src/screens/Storage.test.js b/apps/it/src/screens/Storage.test.js
index fa3636a..1d5c614 100644
--- a/apps/it/src/screens/Storage.test.js
+++ b/apps/it/src/screens/Storage.test.js
@@ -51,3 +51,22 @@ test("Storage: a failed status call", async () => {
   const c = await mount(<Storage />);
   expect(c.querySelector("[role=alert]")).not.toBeNull();
 });
+
+test("manual Drive discovery is opt-in and describes the account-wide Google permission", async () => {
+  api.getDriveStatus.mockImplementation(() => ok({ connected: true, email: "files@example.org", canConnect: true, manualFilesAccess: false }));
+  api.getDriveConnectUrl.mockImplementation(() => ok({ url: "https://accounts.example.org/consent" }));
+  const c = await mount(<Storage />);
+  const checkbox = c.querySelector('input[type="checkbox"]');
+  expect(checkbox.checked).toBe(false);
+  expect(c.textContent).toContain("قراءة وإدارة ملفات الحساب");
+  expect(c.textContent).toContain("Tamheed-System");
+  expect(c.textContent).toContain("Storages");
+  await click(checkbox);
+  await click(button(c, "تغيير الحساب"));
+  expect(api.getDriveConnectUrl).not.toHaveBeenCalled();
+  const dialog = document.querySelector('[role="dialog"]');
+  expect(dialog.textContent).toContain("اختر حساب الجمعية نفسه");
+  await click(button(dialog, "تأكيد"));
+  expect(api.getDriveConnectUrl).toHaveBeenCalledWith({ fullAccess: true });
+  expect(siteLink.goTo).toHaveBeenCalledWith("https://accounts.example.org/consent");
+});
diff --git a/apps/it/src/ui/DriveCard.jsx b/apps/it/src/ui/DriveCard.jsx
index 6548dd1..c48adea 100644
--- a/apps/it/src/ui/DriveCard.jsx
+++ b/apps/it/src/ui/DriveCard.jsx
@@ -31,6 +31,7 @@ export default function DriveCard() {
   const [error, setError] = useState("");
   const [busy, setBusy] = useState(false);
   const [asking, setAsking] = useState(false);
+  const [fullAccess, setFullAccess] = useState(false);
 
   useEffect(() => {
     const params = new URLSearchParams(window.location.search);
@@ -45,7 +46,8 @@ export default function DriveCard() {
     getDriveStatus().then((res) => {
       if (!live) return;
       if (!res.ok) return setError(errorText(res));
-      setStatus({ connected: Boolean(res.data.connected), email: res.data.email || "", canConnect: Boolean(res.data.canConnect) });
+      setStatus({ connected: Boolean(res.data.connected), email: res.data.email || "", canConnect: Boolean(res.data.canConnect), manualFilesAccess: Boolean(res.data.manualFilesAccess), rootName: res.data.rootName || "Tamheed-System" });
+      setFullAccess(Boolean(res.data.manualFilesAccess));
     });
     return () => { live = false; };
   }, []);
@@ -54,7 +56,7 @@ export default function DriveCard() {
     setAsking(false);
     setBusy(true);
     setError("");
-    const res = await getDriveConnectUrl();
+    const res = await getDriveConnectUrl({ fullAccess });
     if (!res.ok || !res.data.url) {
       setBusy(false);
       return toast.error("تعذّر بدء الربط، حاول مرة أخرى.");
@@ -86,10 +88,16 @@ export default function DriveCard() {
           </div>
         )}
       </section>
+      <p>مجلد النظام: <b dir="ltr">{status.rootName}</b>. ملفات الجمعية داخل <b dir="ltr">Storages</b>، والصور ومستندات المركبات في مجلداتها المنفصلة.</p>
+      {status.canConnect && <label style={{ display: "flex", alignItems: "start", gap: 8 }}>
+        <input type="checkbox" checked={fullAccess} onChange={(event) => setFullAccess(event.target.checked)} style={{ width: "auto", marginTop: 5 }} />
+        <span>إظهار الملفات التي تُضاف يدويًا من Google Drive.<small style={{ display: "block" }}>عند الربط سيطلب Google السماح للتطبيق بقراءة وإدارة ملفات الحساب. استخدم حساب الجمعية المخصص. تُعرض ملفات الجمعية من Storages حسب صلاحيات النظام.</small></span>
+      </label>}
+      {status.canConnect && status.connected && !status.manualFilesAccess && <p>الاتصال الحالي يحفظ ملفات النظام؛ لتفعيل ظهور الملفات اليدوية، اختر الخيار أعلاه ثم أعد ربط حساب الجمعية نفسه.</p>}
       {asking && (
         <ConfirmDialog
           title="تغيير حساب Google Drive"
-          message="ستُحفظ الملفات الجديدة في الحساب الذي تختاره. هل تريد المتابعة؟"
+          message={fullAccess ? "اختر حساب الجمعية نفسه لتفعيل الوصول للملفات اليدوية، ثم راجع صلاحيات Google المطلوبة. اختيار حساب آخر يغيّر مكان حفظ الملفات الجديدة." : "ستُحفظ الملفات الجديدة في الحساب الذي تختاره. هل تريد المتابعة؟"}
           onCancel={() => setAsking(false)}
           onConfirm={connect}
         />
diff --git a/server/Entities/Storage/CentralStorageBackend.route.js b/server/Entities/Storage/CentralStorageBackend.route.js
index db7d503..00f9def 100644
--- a/server/Entities/Storage/CentralStorageBackend.route.js
+++ b/server/Entities/Storage/CentralStorageBackend.route.js
@@ -14,6 +14,7 @@ const path = require("path");
 const { StorageModelDef } = require("./Storage.model");
 const googleDrive = require("../../services/googleDrive.service");
 const { repairMisencodedText } = require("../../utils/textEncoding");
+const { pipeline } = require("stream/promises");
 
 const router = express.Router();
 
@@ -73,7 +74,7 @@ const driveFileToItem = (file, storageFolder) => {
     size: isDirectory ? null : Number(file.size) || 0,
     modifiedAt: file.modifiedTime || null,
     url: isDirectory ? null : googleDrive.toViewUrl(file.id),
-    mimeType: isDirectory ? undefined : undefined,
+    mimeType: isDirectory ? undefined : file.mimeType,
   };
 };
 
@@ -138,7 +139,7 @@ router.post("/upload", singleUpload.single("file"), async (req, res) => {
     req.file.originalname = repairMisencodedText(req.file.originalname);
     const storageFolder = joinStoragePath(dbName, collection, folder);
     const stream = fs.createReadStream(req.file.path);
-    const uploaded = await googleDrive.uploadFile({
+    const uploaded = await googleDrive.uploadPrivateFile({
       body: stream,
       name: req.file.originalname,
       mimeType: req.file.mimetype,
@@ -224,7 +225,7 @@ router.post("/merge-chunks", express.json(), async (req, res) => {
     const storageFolder = joinStoragePath(dbName, collection, folder);
     const stream = fs.createReadStream(mergedPath);
     const stat = await fs.promises.stat(mergedPath);
-    const uploaded = await googleDrive.uploadFile({
+    const uploaded = await googleDrive.uploadPrivateFile({
       body: stream,
       name: fileName,
       mimeType: mimeType || "application/octet-stream",
@@ -375,12 +376,28 @@ router.get("/file/:name", async (req, res) => {
       return res.status(404).json({ success: false, error: "file not found" });
     }
 
-    const driveUrl = payload?.download
-      ? googleDrive.toDriveDownloadUrl(target.fileId)
-      : googleDrive.toDriveViewUrl(target.fileId);
-
-    return res.redirect(302, driveUrl);
+    const info = await googleDrive.getFileInfo(target.fileId);
+    if (info.trashed) return res.status(404).json({ success: false, error: "file not found" });
+    const native = String(info.mimeType || "").startsWith("application/vnd.google-apps.");
+    // Native editing is done by Google's editor and requires the viewer's own
+    // authorized Google account. Never turn a private document into a public link.
+    if (native && !payload.download) {
+      const editor = String(info.webViewLink || "");
+      if (!/^https:\/\/(docs|drive)\.google\.com\//.test(editor)) return res.status(400).json({ success: false, error: "Google editor unavailable" });
+      return res.redirect(302, editor);
+    }
+    const mime = native ? "application/pdf" : info.mimeType || "application/octet-stream";
+    const name = `${info.name || req.params.name}${native ? ".pdf" : ""}`;
+    const inline = !payload.download && /^(application\/pdf|image\/(png|jpeg|gif|webp|avif)|audio\/|video\/)/.test(mime);
+    res.setHeader("Content-Type", mime);
+    res.setHeader("Cache-Control", "private, no-store");
+    res.setHeader("X-Content-Type-Options", "nosniff");
+    res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`);
+    const stream = native ? await googleDrive.exportStream(target.fileId) : await googleDrive.downloadStream(target.fileId);
+    await pipeline(stream, res);
+    return undefined;
   } catch (error) {
+    if (res.headersSent) { res.destroy(); return undefined; }
     const status = error?.name === "TokenExpiredError" || error?.name === "JsonWebTokenError" ? 401 : 500;
     return res.status(status).json({ success: false, error: googleDrive.translateDriveError(error).message });
   }
diff --git a/server/Entities/Storage/GoogleDrive.route.js b/server/Entities/Storage/GoogleDrive.route.js
index 2ec28b9..91dbeae 100644
--- a/server/Entities/Storage/GoogleDrive.route.js
+++ b/server/Entities/Storage/GoogleDrive.route.js
@@ -43,14 +43,14 @@ function createGoogleDriveRouter({
       : res.status(403).json({ code: "FORBIDDEN", message: "ربط Google Drive متاح لحساب النظام ولمن منحه الصلاحية" });
 
   if (withConnect) {
-    router.post("/connect-url", requireAuth, requireDriveAccess, (req, res) => {
+    router.post("/connect-url", requireAuth, requireDriveAccess, express.json(), (req, res) => {
       try {
         // The callback is a public redirect with no signed-in user, so the state
         // carries who started the flow (for the audit log) and on which site.
         const actor = who(req);
         const tz = String(actor.tz || "");
         const token = state.issue(actor.id, Date.now(), { tz, name: actor.name || tz, isSystem: isSystem(actor), site });
-        return res.json({ ok: true, url: drive.getAuthUrl(token) });
+        return res.json({ ok: true, url: drive.getAuthUrl(token, { fullAccess: req.body?.fullAccess === true }) });
       } catch (err) {
         return res.status(500).json({ ok: false, message: err.message });
       }
diff --git a/server/Entities/Storage/Storage.controller.js b/server/Entities/Storage/Storage.controller.js
index d412700..bda9800 100644
--- a/server/Entities/Storage/Storage.controller.js
+++ b/server/Entities/Storage/Storage.controller.js
@@ -442,6 +442,13 @@ const hasAnySharedAccess = (user = {}, requestedPath = "") => {
 };
 
 const getStorageScope = async (req, action = "view", requestedPath = "") => {
+  // Validate before posix.join can erase traversal segments and escape the
+  // caller's personal folder or the association's Storages namespace.
+  if (String(requestedPath || "").split(/[\\/]/).some((part) => part === "." || part === ".." || part.includes("\0"))) {
+    const error = new Error("مسار الملفات غير صالح");
+    error.status = 400;
+    throw error;
+  }
   // req.actor (permissionMiddleware.loadActor) already holds the active user.
   const user = req.actor?.user || (await getActiveUserByTz(req.user?.tz)) || { tz: req.user?.tz };
   const requested = getClientRelativePath(requestedPath);
@@ -1356,7 +1363,7 @@ const getStorageStats = async (req, res) => {
 const createFolder = async (req, res) => {
   try {
     const folderName = normalizeRelativePath(req.body.name || "");
-    if (!folderName || folderName.includes("/")) {
+    if (!folderName || folderName.includes("/") || folderName === "." || folderName === ".." || folderName.includes("\0")) {
       return res.status(400).json({ success: false, message: "Folder name is required" });
     }
 
diff --git a/server/services/googleDrive.service.js b/server/services/googleDrive.service.js
index f093bef..ef22929 100644
--- a/server/services/googleDrive.service.js
+++ b/server/services/googleDrive.service.js
@@ -5,12 +5,14 @@
 const { google } = require("googleapis");
 const { Readable } = require("stream");
 const api = require("../Entities/api");
+const { createDriveLayout } = require("./driveLayout");
 
 const DB_NAME = process.env.DB_NAME || "tamheed_db";
 const CONNECTIONS_COLLECTION = "Integrations";
 const CONNECTION_KEY = "googleDrive";
 
-const ROOT_FOLDER_NAME = process.env.GOOGLE_DRIVE_ROOT_FOLDER || "Tamheed";
+const ROOT_FOLDER_NAME = process.env.GOOGLE_DRIVE_ROOT_FOLDER || "Tamheed-System";
+const FULL_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
 const SCOPES = [
   "https://www.googleapis.com/auth/drive.file",
   "https://www.googleapis.com/auth/userinfo.email",
@@ -47,12 +49,12 @@ async function saveConnection(patch) {
   });
 }
 
-function getAuthUrl(state) {
+function getAuthUrl(state, { fullAccess = false } = {}) {
   const oauth2Client = getOAuth2Client();
   return oauth2Client.generateAuthUrl({
     access_type: "offline",
     prompt: "consent",
-    scope: SCOPES,
+    scope: fullAccess ? [FULL_DRIVE_SCOPE, "https://www.googleapis.com/auth/userinfo.email"] : SCOPES,
     state,
   });
 }
@@ -76,6 +78,7 @@ async function handleOAuthCallback(code) {
     connectedEmail: profile.email || "",
     connectedAt: new Date(),
     rootFolderId: null, // re-resolved on next use in case the account changed
+    grantedScopes: String(tokens.scope || "").split(/\s+/).filter(Boolean),
   });
 
   if (saved?.success === false) {
@@ -87,7 +90,8 @@ async function handleOAuthCallback(code) {
 
 async function getStatus() {
   const conn = await getConnection();
-  return { connected: !!conn?.refreshToken, email: conn?.connectedEmail || null };
+  return { connected: !!conn?.refreshToken, email: conn?.connectedEmail || null, rootName: ROOT_FOLDER_NAME,
+    manualFilesAccess: Array.isArray(conn?.grantedScopes) && conn.grantedScopes.includes(FULL_DRIVE_SCOPE) };
 }
 
 async function getDriveClient() {
@@ -101,81 +105,42 @@ async function getDriveClient() {
   return google.drive({ version: "v3", auth: oauth2Client });
 }
 
-async function findOrCreateFolder(drive, name, parentId) {
-  const safeName = String(name).replace(/'/g, "\\'");
-  const parentClause = parentId ? ` and '${parentId}' in parents` : "";
-
-  const existing = await drive.files.list({
-    q: `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentClause}`,
-    fields: "files(id, name)",
-    spaces: "drive",
-  });
-
-  if (existing.data.files?.length) return existing.data.files[0].id;
-
-  const created = await drive.files.create({
-    requestBody: {
-      name,
-      mimeType: "application/vnd.google-apps.folder",
-      ...(parentId ? { parents: [parentId] } : {}),
-    },
-    fields: "id",
-  });
-
-  return created.data.id;
-}
-
-async function ensureRootFolder(drive) {
-  const conn = await getConnection();
-  if (conn?.rootFolderId) return conn.rootFolderId;
-
-  const folderId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME, null);
-  await saveConnection({ rootFolderId: folderId });
-  return folderId;
-}
+const layoutFor = (drive) => createDriveLayout({ drive, getConnection, saveConnection,
+  dbName: DB_NAME, collection: process.env.STORAGE_COLLECTION || "root", rootName: ROOT_FOLDER_NAME });
+// Concurrent uploads in one server process must not create duplicate roots or
+// branches. File uploads themselves can proceed concurrently after resolution.
+let layoutWrites = Promise.resolve();
+const serializeLayoutWrite = (operation) => {
+  const result = layoutWrites.then(operation);
+  layoutWrites = result.catch(() => {});
+  return result;
+};
 
-// folderPath like "tamheed_db/Users" -> Tamheed/tamheed_db/Users in Drive
+// Legacy logical paths remain valid, but new installations store photos in
+// Profile-photos and association files in Storages. Existing branches stay
+// readable/writable in place until the explicit layout migration is applied.
 async function ensureFolderPath(folderPath = "") {
   const drive = await getDriveClient();
-  const segments = String(folderPath).split(/[\\/]/).filter(Boolean);
-
-  let parentId = await ensureRootFolder(drive);
-  for (const segment of segments) {
-    parentId = await findOrCreateFolder(drive, segment, parentId);
-  }
-
+  const parentId = await serializeLayoutWrite(() => layoutFor(drive).resolve(folderPath, true));
   return { drive, parentId };
 }
 
-async function findChildFolder(drive, name, parentId) {
-  const safeName = String(name).replace(/'/g, "\\'");
-  const result = await drive.files.list({
-    q: `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${parentId}' in parents`,
-    fields: "files(id, name)",
-    spaces: "drive",
-  });
-  return result.data.files?.[0]?.id || null;
-}
-
 // Like ensureFolderPath, but never creates anything. Returns null if any
 // segment is missing (used for read-only operations like listing).
 async function resolveFolderPath(folderPath = "") {
   const drive = await getDriveClient();
-  const conn = await getConnection();
-  let parentId = conn?.rootFolderId || null;
-
-  if (!parentId) {
-    parentId = await findChildFolder(drive, ROOT_FOLDER_NAME, "root").catch(() => null);
-    if (!parentId) return { drive, folderId: null };
-  }
+  return { drive, folderId: await layoutFor(drive).resolve(folderPath) };
+}
 
-  const segments = String(folderPath).split(/[\\/]/).filter(Boolean);
-  for (const segment of segments) {
-    parentId = await findChildFolder(drive, segment, parentId);
-    if (!parentId) return { drive, folderId: null };
+async function reorganizeLayout(options = {}) {
+  const connection = await getConnection();
+  // A narrow grant cannot reliably see manually created destinations, so its
+  // "no conflict" result would be misleading during a move or root rename.
+  if (!Array.isArray(connection?.grantedScopes) || !connection.grantedScopes.includes(FULL_DRIVE_SCOPE)) {
+    throw Object.assign(new Error("فعّل الوصول للملفات اليدوية بإعادة ربط حساب الجمعية قبل معاينة النقل، حتى يمكن كشف المجلدات الموجودة والتعارضات."), { code: "DRIVE_LAYOUT_SCOPE" });
   }
-
-  return { drive, folderId: parentId };
+  const layout = layoutFor(await getDriveClient());
+  return options.apply ? serializeLayoutWrite(() => layout.migrate(options)) : layout.migrate(options);
 }
 
 async function listChildren(folderPath = "") {
@@ -187,7 +152,7 @@ async function listChildren(folderPath = "") {
   do {
     const result = await drive.files.list({
       q: `'${folderId}' in parents and trashed = false`,
-      fields: "nextPageToken, files(id, name, mimeType, size, modifiedTime)",
+      fields: "nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink)",
       spaces: "drive",
       pageSize: 200,
       pageToken,
@@ -298,14 +263,30 @@ async function uploadFile({ buffer, body, name, mimeType, folderPath = "" }) {
 // file is reachable only through the Drive account itself, so the app must
 // stream it to signed-in users after its own permission check. Used for
 // documents (licences, insurance, receipts), never for photos.
-async function uploadPrivateFile({ buffer, name, mimeType, folderPath = "" }) {
+async function uploadPrivateFile({ buffer, body, name, mimeType, folderPath = "" }) {
   const { drive, parentId } = await ensureFolderPath(folderPath);
+  const { data: parent } = await drive.files.get({ fileId: parentId, fields: "permissions(type,role)" }, { timeout: 15000 });
+  if (!Array.isArray(parent.permissions) || parent.permissions.some((permission) => ["anyone", "domain"].includes(permission.type))) {
+    throw Object.assign(new Error("مجلد الحفظ في Google مشارك على نطاق عام أو تعذّر التحقق من خصوصيته. اضبط مشاركة المجلد قبل رفع مستند خاص."), { code: "DRIVE_PUBLIC_PARENT" });
+  }
   const created = await drive.files.create({
     requestBody: { name, parents: [parentId] },
-    media: { mimeType: mimeType || "application/octet-stream", body: Readable.from(buffer) },
+    media: { mimeType: mimeType || "application/octet-stream", body: body || Readable.from(buffer) },
     fields: "id, name",
   });
-  return { id: created.data.id, name: created.data.name };
+  return { id: created.data.id, name: created.data.name, viewUrl: toViewUrl(created.data.id) };
+}
+
+async function getFileInfo(fileId) {
+  const drive = await getDriveClient();
+  const { data } = await drive.files.get({ fileId, fields: "id,name,mimeType,size,webViewLink,trashed" }, { timeout: 15000 });
+  return data;
+}
+
+async function exportStream(fileId, mimeType = "application/pdf") {
+  const drive = await getDriveClient();
+  const response = await drive.files.export({ fileId, mimeType }, { responseType: "stream", timeout: 30000 });
+  return response.data;
 }
 
 // Whether a file is an image anyone with the link can already view (as the
@@ -370,4 +351,7 @@ module.exports = {
   toDriveViewUrl,
   toDriveDownloadUrl,
   translateDriveError,
+  reorganizeLayout,
+  getFileInfo,
+  exportStream,
 };
diff --git a/server/test/drive-connect.test.js b/server/test/drive-connect.test.js
index 8a2f83f..8a6db37 100644
--- a/server/test/drive-connect.test.js
+++ b/server/test/drive-connect.test.js
@@ -30,7 +30,7 @@ function startApp({ tz = "000000000", permissions = [] } = {}) {
   const calls = { authUrlState: null, callbackCode: null };
   const audit = auditStub();
   const drive = {
-    getAuthUrl(stateToken) { calls.authUrlState = stateToken; return `https://accounts.google.test/auth?state=${stateToken}`; },
+    getAuthUrl(stateToken, options) { calls.authUrlState = stateToken; calls.authOptions = options; return `https://accounts.google.test/auth?state=${stateToken}`; },
     async handleOAuthCallback(code) { calls.callbackCode = code; return { email: "org@example.org" }; },
     async getStatus() { return { connected: true, email: "org@example.org" }; },
   };
@@ -52,6 +52,22 @@ function startApp({ tz = "000000000", permissions = [] } = {}) {
 
 const request = (url, options = {}) => fetch(url, { redirect: "manual", ...options });
 
+test("full-account Drive access requires an explicit boolean opt-in behind the connect permission", async () => {
+  const { server, base, calls } = await startApp();
+  try {
+    for (const [body, expected] of [[{}, false], [{ fullAccess: "true" }, false], [{ fullAccess: true }, true]]) {
+      const response = await request(`${base}/connect-url`, { method: "POST", headers: { authorization: "Bearer ok", "Content-Type": "application/json" }, body: JSON.stringify(body) });
+      assert.equal(response.status, 200);
+      assert.equal(calls.authOptions.fullAccess, expected);
+    }
+  } finally { server.close(); }
+  const denied = await startApp({ tz: "other" });
+  try {
+    assert.equal((await request(`${denied.base}/connect-url`, { method: "POST", headers: { authorization: "Bearer ok", "Content-Type": "application/json" }, body: JSON.stringify({ fullAccess: true }) })).status, 403);
+    assert.equal(denied.calls.authOptions, undefined);
+  } finally { denied.server.close(); }
+});
+
 test("the old open /connect link no longer starts a connection", async () => {
   const { server, base } = await startApp();
   try {
### server/services/driveLayout.js
// Physical Drive folders are independent of the legacy storage API paths.
// No database, credentials or Google client is loaded by this module.
const FOLDER = "application/vnd.google-apps.folder";
const fail = (code, message) => Object.assign(new Error(message), { code });
const parts = (value) => {
  const segments = String(value || "").split(/[\\/]/).filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === ".." || segment.includes("\0"))) throw fail("DRIVE_LAYOUT_PATH", "مسار المجلد غير صالح");
  return segments;
};
const quote = (value) => String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

function describePath(value, dbName, collection) {
  const path = parts(value);
  const aliases = [
    { physical: ["Storages"], legacy: [dbName, collection] },
    { physical: ["Profile-photos", "Students"], legacy: [dbName, "Students"] },
    { physical: ["Profile-photos", "Users"], legacy: [dbName, "Users"] },
  ];
  for (const alias of aliases) {
    for (const prefix of [alias.physical, alias.legacy]) {
      if (prefix.every((segment, i) => path[i] === segment)) return { ...alias, tail: path.slice(prefix.length) };
    }
  }
  return { physical: [], legacy: [], tail: path };
}

function createDriveLayout({ drive, getConnection, saveConnection, dbName = "tamheed_db", collection = "root", rootName = "Tamheed-System", legacyRootName = "Tamheed" }) {
  const call = (method, input) => drive.files[method](input, { timeout: 15000 });
  async function child(parent, name) {
    const { data } = await call("list", {
      q: `name = '${quote(name)}' and mimeType = '${FOLDER}' and trashed = false and '${quote(parent)}' in parents`,
      fields: "files(id, name)", spaces: "drive", pageSize: 2,
    });
    if (data.files?.length > 1) throw fail("DRIVE_LAYOUT_AMBIGUOUS", `يوجد أكثر من مجلد باسم ${name}. يلزم تحديد المجلد الصحيح قبل المتابعة.`);
    return data.files?.[0]?.id || null;
  }
  async function create(parent, name) {
    const { data } = await call("create", { requestBody: { name, mimeType: FOLDER, parents: [parent] }, fields: "id" });
    return data.id;
  }
  async function walk(rootId, segments, ensure = false) {
    let id = rootId;
    for (const segment of segments) {
      const found = await child(id, segment);
      if (!found && !ensure) return null;
      id = found || await create(id, segment);
    }
    return id;
  }
  async function root(ensure = false) {
    const connection = await getConnection();
    if (connection?.rootFolderId) return connection.rootFolderId;
    const current = await child("root", rootName);
    const old = rootName === legacyRootName ? current : await child("root", legacyRootName);
    if (current && old && current !== old) throw fail("DRIVE_LAYOUT_AMBIGUOUS", "يوجد مجلد قديم وجديد للجمعية. حدّد مجلد الحساب المرتبط قبل النقل.");
    const found = current || old;
    if (found) {
      if (ensure) await saveConnection({ rootFolderId: found });
      return found;
    }
    if (!ensure) return null;
    const id = await create("root", rootName);
    await saveConnection({ rootFolderId: id });
    return id;
  }

  async function resolve(folderPath, ensure = false) {
    const rootId = await root(ensure);
    if (!rootId) return null;
    const path = describePath(folderPath, dbName, collection);
    let base = rootId;
    if (path.physical.length) {
      const canonical = await walk(rootId, path.physical);
      const legacy = await walk(rootId, path.legacy);
      if (canonical && legacy && canonical !== legacy) throw fail("DRIVE_LAYOUT_CONFLICT", "توجد ملفات في المسار القديم والجديد. يلزم حل التعارض قبل المتابعة.");
      base = canonical || legacy;
      if (!base) {
        if (!ensure) return null;
        base = await walk(rootId, path.physical, true);
      }
    }
    return walk(base, path.tail, ensure);
  }

  // Preview is strictly read-only. Apply is an explicit operator action.
  // Move folders with stable ids rather than recreating/copying their files.
  async function migrate({ apply = false } = {}) {
    let rootId = await root(false);
    const plan = { rootName, existingRoot: Boolean(rootId), moves: [], create: [], cleanup: [], applied: false };
    if (!rootId) {
      plan.create = [rootName, "Profile-photos/Students", "Profile-photos/Users", "Storages", "Vehicles"];
      if (apply) {
        rootId = await root(true);
        for (const folder of plan.create.slice(1)) await walk(rootId, parts(folder), true);
        plan.applied = true;
      }
      return plan;
    }
    const { data: rootInfo } = await call("get", { fileId: rootId, fields: "id,name,mimeType,trashed,parents,permissions(role,type)" });
    if (rootInfo.trashed || rootInfo.mimeType !== FOLDER) throw fail("DRIVE_LAYOUT_ROOT", "مجلد الجمعية المرتبط غير متاح.");
    // A top-level destination with the same name must never be silently merged.
    const named = await child("root", rootName);
    if (named && named !== rootId) throw fail("DRIVE_LAYOUT_CONFLICT", "مجلد Tamheed-System آخر موجود بالفعل. لم تُنقل الملفات.");
    plan.renameRoot = rootInfo.name !== rootName;
    const dbFolder = await walk(rootId, [dbName]);
    const profileFolder = await walk(rootId, ["Profile-photos"]);
    const mappings = [
      { from: [dbName, "Students"], to: ["Profile-photos", "Students"] },
      { from: [dbName, "Users"], to: ["Profile-photos", "Users"] },
      { from: [dbName, collection], to: ["Storages"] },
    ];
    for (const mapping of mappings) {
      const source = await walk(rootId, mapping.from);
      const target = await walk(rootId, mapping.to);
      if (source && target && source !== target) throw fail("DRIVE_LAYOUT_CONFLICT", `المساران ${mapping.from.join("/")} و${mapping.to.join("/")} موجودان. لم تُنقل الملفات.`);
      if (source && source !== target) plan.moves.push({ id: source, from: mapping.from.join("/"), to: mapping.to.join("/") });
      else if (!target) plan.create.push(mapping.to.join("/"));
    }
    if (!await walk(rootId, ["Vehicles"])) plan.create.push("Vehicles");
    // Moving beneath shared parents can change inherited access. Fail closed
    // until the operator has dealt with those shares separately.
    if (plan.moves.length || plan.create.length) {
      for (const id of new Set([rootId, dbFolder, profileFolder].filter(Boolean))) {
        const info = id === rootId ? rootInfo : (await call("get", { fileId: id, fields: "permissions(role,type)" })).data;
        if (!Array.isArray(info.permissions) || info.permissions.some((permission) => permission.role !== "owner")) {
          throw fail("DRIVE_LAYOUT_SHARED_PARENT", "أحد المجلدات الأب مشترَك. راجع الصلاحيات الموروثة قبل النقل؛ لم تُنقل الملفات.");
        }
      }
    }
    if (!apply) return plan;
    // Re-check each source/target immediately before mutation; a failed run is
    // resumable because every completed move keeps its original Drive id.
    for (const move of plan.moves) {
      const source = await walk(rootId, parts(move.from));
      const target = await walk(rootId, parts(move.to));
      if (source !== move.id || target) throw fail("DRIVE_LAYOUT_CHANGED", "تغيّرت المجلدات منذ المعاينة. أعد تشغيل المعاينة قبل النقل.");
      const destination = parts(move.to);
      const name = destination.pop();
      const parent = await walk(rootId, destination, true);
      const { data: sourceInfo } = await call("get", { fileId: source, fields: "parents" });
      await call("update", { fileId: source, addParents: parent, removeParents: (sourceInfo.parents || []).join(","), requestBody: { name }, fields: "id" });
    }
    for (const folder of plan.create) await walk(rootId, parts(folder), true);
    if (plan.renameRoot) await call("update", { fileId: rootId, requestBody: { name: rootName }, fields: "id" });
    // Trash only the now-empty legacy structural folder; never its contents.
    if (dbFolder) {
      const remaining = await call("list", { q: `'${quote(dbFolder)}' in parents and trashed = false`, fields: "files(id)", pageSize: 1 });
      if (!remaining.data.files?.length) {
        await call("update", { fileId: dbFolder, requestBody: { trashed: true }, fields: "id" });
        plan.cleanup.push(dbName);
      }
    }
    await saveConnection({ rootFolderId: rootId, layoutVersion: 2 });
    plan.applied = true;
    return plan;
  }
  return { resolve, migrate };
}

module.exports = { createDriveLayout, describePath };

### server/scripts/reorganizeDrive.js
// Operator maintenance tool, never imported or executed by the application.
// Preview by default; --apply moves existing folders with their original ids.
async function main(args = process.argv.slice(2)) {
  if (args.some((arg) => !["--apply", "--dry-run"].includes(arg)) || (args.includes("--apply") && args.includes("--dry-run"))) {
    throw new Error("Usage: node scripts/reorganizeDrive.js [--dry-run | --apply]");
  }
  const path = require("path");
  require("dotenv").config({ path: path.resolve(__dirname, "../config/.env"), quiet: true });
  const mongoose = require("mongoose");
  try {
    const result = await require("../services/googleDrive.service").reorganizeLayout({ apply: args.includes("--apply") });
    // Folder structure only, no file names, account email, tokens or records.
    const { moves, ...summary } = result;
    process.stdout.write(JSON.stringify({ ...summary, moves: moves.map(({ from, to }) => ({ from, to })) }, null, 2) + "\n");
  } finally { await mongoose.disconnect(); }
}
if (require.main === module) main().catch((error) => { process.stderr.write(`${error.code || "DRIVE_LAYOUT_ERROR"}: ${error.message}\n`); process.exitCode = 1; });
module.exports = { main };

### server/test/drive-layout.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { createDriveLayout, describePath } = require("../services/driveLayout");
const FOLDER = "application/vnd.google-apps.folder";

function fixture(legacy = false) {
  const nodes = [], writes = [], connection = {};
  let next = 0;
  const add = (name, parent = "root", mimeType = FOLDER, id = `id${++next}`) => {
    nodes.push({ id, name, parents: [parent], mimeType, permissions: [{ role: "owner", type: "user" }] });
    return id;
  };
  const located = (path) => {
    let parent = "root";
    for (const name of path.split("/")) {
      const found = nodes.find((node) => !node.trashed && node.name === name && node.parents.includes(parent));
      if (!found) return null;
      parent = found.id;
    }
    return nodes.find((node) => node.id === parent);
  };
  if (legacy) {
    const root = add("Tamheed"); connection.rootFolderId = root;
    const db = add("tamheed_db", root);
    add("Students", db, FOLDER, "students-folder"); add("Users", db, FOLDER, "users-folder");
    const storage = add("root", db, FOLDER, "storage-folder");
    add("student.png", "students-folder", "image/png", "student-photo");
    add("user.png", "users-folder", "image/png", "user-photo");
    add("plan.pdf", storage, "application/pdf", "storage-file");
    const vehicles = add("Vehicles", root); add("licence.pdf", vehicles, "application/pdf", "vehicle-document");
  }
  const drive = { files: {
    async list({ q, pageSize = 1000 }) {
      const parent = q.match(/'([^']+)' in parents/)?.[1];
      const name = q.match(/name = '([^']+)'/)?.[1];
      const files = nodes.filter((node) => !node.trashed && (!parent || node.parents.includes(parent))
        && (!name || node.name === name) && (!q.includes("mimeType =") || node.mimeType === FOLDER));
      return { data: { files: structuredClone(files.slice(0, pageSize)) } };
    },
    async get({ fileId }) {
      const node = nodes.find((item) => item.id === fileId);
      if (!node) throw new Error("missing fake file");
      return { data: structuredClone(node) };
    },
    async create({ requestBody }) { writes.push(["create", structuredClone(requestBody)]); return { data: { id: add(requestBody.name, requestBody.parents[0], requestBody.mimeType) } }; },
    async update({ fileId, requestBody, addParents, removeParents }) {
      writes.push(["update", fileId]);
      const node = nodes.find((item) => item.id === fileId);
      if (removeParents) node.parents = node.parents.filter((id) => !removeParents.split(",").includes(id));
      if (addParents && !node.parents.includes(addParents)) node.parents.push(addParents);
      Object.assign(node, requestBody);
      return { data: structuredClone(node) };
    },
  } };
  const layout = createDriveLayout({ drive, getConnection: async () => connection, saveConnection: async (patch) => Object.assign(connection, patch) });
  return { nodes, writes, connection, drive, layout, add, located };
}

test("a new installation stores photos, association files and vehicles in the requested branches", async () => {
  const f = fixture();
  await f.layout.resolve("tamheed_db/Students", true);
  await f.layout.resolve("tamheed_db/Users", true);
  await f.layout.resolve("tamheed_db/root/users/person/docs", true);
  await f.layout.resolve("Vehicles/car", true);
  for (const path of ["Profile-photos/Students", "Profile-photos/Users", "Storages/users/person/docs", "Vehicles/car"]) assert.ok(f.located(`Tamheed-System/${path}`), path);
  assert.equal(f.located("Tamheed-System/tamheed_db"), null);
  assert.ok(f.connection.rootFolderId);
});

test("read-only lookup creates neither a root nor empty folders", async () => {
  const f = fixture();
  assert.equal(await f.layout.resolve("tamheed_db/root"), null);
  assert.deepEqual(f.writes, []);
});

test("new nested uploads stay in the legacy branch until migration, avoiding a split store", async () => {
  const f = fixture(true);
  const id = await f.layout.resolve("tamheed_db/root/new/subfolder", true);
  assert.equal(f.located("Tamheed/tamheed_db/root/new/subfolder").id, id);
  assert.equal(f.located("Tamheed/Storages"), null);
  assert.equal(await f.layout.resolve("Storages/new/subfolder"), id);
});

test("preview is read-only; apply preserves root, folder and every file id and its permissions", async () => {
  const f = fixture(true);
  const originalRoot = f.connection.rootFolderId;
  const permissions = f.nodes.filter((node) => node.mimeType !== FOLDER).map((node) => [node.id, structuredClone(node.permissions)]);
  const plan = await f.layout.migrate();
  assert.equal(plan.moves.length, 3);
  assert.equal(plan.renameRoot, true);
  assert.equal(plan.applied, false);
  assert.deepEqual(f.writes, []);
  const applied = await f.layout.migrate({ apply: true });
  assert.equal(applied.applied, true);
  assert.equal(f.located("Tamheed-System").id, originalRoot);
  assert.equal(f.located("Tamheed-System/Profile-photos/Students/student.png").id, "student-photo");
  assert.equal(f.located("Tamheed-System/Profile-photos/Users/user.png").id, "user-photo");
  assert.equal(f.located("Tamheed-System/Storages/plan.pdf").id, "storage-file");
  assert.equal(f.located("Tamheed-System/Vehicles/licence.pdf").id, "vehicle-document");
  for (const [id, before] of permissions) assert.deepEqual(f.nodes.find((node) => node.id === id).permissions, before);
  assert.equal(await f.layout.resolve("tamheed_db/root"), "storage-folder");
  assert.equal(await f.layout.resolve("tamheed_db/Students"), "students-folder");
  assert.equal(f.located("Tamheed-System/tamheed_db"), null, "only the empty structural folder is trashed");
  assert.equal(f.connection.layoutVersion, 2);
  const writesBefore = f.writes.length;
  assert.equal((await f.layout.migrate({ apply: true })).moves.length, 0);
  assert.equal(f.writes.length, writesBefore, "a repeat does not move or create anything");
});

test("destination conflict refuses reads, writes and migration without merging or deleting either tree", async () => {
  const f = fixture(true); f.add("Storages", f.connection.rootFolderId);
  for (const action of [() => f.layout.resolve("tamheed_db/root"), () => f.layout.resolve("tamheed_db/root/new", true), () => f.layout.migrate({ apply: true })]) {
    await assert.rejects(action, { code: "DRIVE_LAYOUT_CONFLICT" });
  }
  assert.deepEqual(f.writes, []);
  assert.ok(f.located("Tamheed/tamheed_db/root/plan.pdf"));
});

test("shared source or destination parents stop migration before inherited access could change", async () => {
  for (const shared of ["Tamheed", "Tamheed/tamheed_db"]) {
    const f = fixture(true); f.located(shared).permissions.push({ role: "reader", type: "anyone" });
    await assert.rejects(() => f.layout.migrate({ apply: true }), { code: "DRIVE_LAYOUT_SHARED_PARENT" });
    assert.deepEqual(f.writes, []);
  }
});

test("permission/API failures propagate, rather than being mistaken for an empty folder", async () => {
  const f = fixture(); f.drive.files.list = async () => { throw new Error("Drive unavailable"); };
  await assert.rejects(() => f.layout.resolve("Storages", true), /Drive unavailable/);
  assert.deepEqual(f.writes, []);
});

test("duplicate folder names or competing roots never select an arbitrary tree", async () => {
  const f = fixture(); f.add("Tamheed-System"); f.add("Tamheed-System");
  await assert.rejects(() => f.layout.resolve("Storages", true), { code: "DRIVE_LAYOUT_AMBIGUOUS" });
  assert.deepEqual(f.writes, []);
  const g = fixture(true); g.add("Tamheed-System");
  await assert.rejects(() => g.layout.migrate({ apply: true }), { code: "DRIVE_LAYOUT_CONFLICT" });
  assert.deepEqual(g.writes, []);
});

test("a partially completed move can be resumed without duplicate folders or changed file ids", async () => {
  const f = fixture(true), update = f.drive.files.update;
  let failOnce = true;
  f.drive.files.update = async (request) => {
    if (failOnce && request.fileId === "users-folder") { failOnce = false; throw new Error("temporary failure"); }
    return update(request);
  };
  await assert.rejects(() => f.layout.migrate({ apply: true }), /temporary failure/);
  assert.equal(await f.layout.resolve("tamheed_db/Students"), "students-folder");
  assert.equal(await f.layout.resolve("tamheed_db/Users"), "users-folder");
  await f.layout.migrate({ apply: true });
  assert.equal(f.located("Tamheed-System/Profile-photos/Users/user.png").id, "user-photo");
  assert.equal(f.nodes.filter((node) => node.id === "student-photo").length, 1);
});

test("initialization preview creates nothing; explicit apply initializes all requested empty folders", async () => {
  const f = fixture();
  const preview = await f.layout.migrate();
  assert.equal(preview.existingRoot, false); assert.deepEqual(f.writes, []);
  await f.layout.migrate({ apply: true });
  for (const name of ["Profile-photos/Students", "Profile-photos/Users", "Storages", "Vehicles"]) assert.ok(f.located(`Tamheed-System/${name}`));
});

test("legacy storage namespace maps only to Storages; profile/vehicle branches cannot enter that listing", () => {
  assert.deepEqual(describePath("tamheed_db/root", "tamheed_db", "root"), { physical: ["Storages"], legacy: ["tamheed_db", "root"], tail: [] });
  assert.deepEqual(describePath("tamheed_db/root/Profile-photos", "tamheed_db", "root").tail, ["Profile-photos"]);
  for (const path of ["tamheed_db/root/../Students", "Storages/../../Vehicles", "Storages\\..\\Profile-photos"]) assert.throws(() => describePath(path, "tamheed_db", "root"), { code: "DRIVE_LAYOUT_PATH" });
});

### server/test/google-drive-service.test.js
// Exercise the actual service with fake OAuth/Drive/database dependencies.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const FULL = "https://www.googleapis.com/auth/drive";
function fixture() {
  const connection = { refreshToken: "synthetic-refresh", rootFolderId: "synthetic-root" };
  const authRequests = [], events = [], uploads = [], shares = [];
  let active = 0, maxActive = 0, failOnce = false;
  let parentPermissions = [{ type: "user", role: "owner" }];
  class OAuth2 {
    generateAuthUrl(options) { authRequests.push(options); return "https://accounts.google.test/consent"; }
    setCredentials() {}
    async getToken() { return { tokens: { refresh_token: "synthetic-new-refresh", scope: `${FULL} https://www.googleapis.com/auth/userinfo.email` } }; }
  }
  const deps = {
    googleapis: { google: { auth: { OAuth2 }, drive: () => ({ files: { get: async () => ({ data: { permissions: parentPermissions } }), create: async (options) => { uploads.push(options); return { data: { id: "synthetic-file", name: "file" } }; } }, permissions: { create: async (options) => { shares.push(options); } } }), oauth2: () => ({ userinfo: { get: async () => ({ data: { email: "synthetic@example.test" } }) } }) } },
    stream: require("node:stream"),
    "../Entities/api": { read: async () => ({ result: [connection] }), update: async ({ newData }) => { Object.assign(connection, newData); return { success: true }; } },
    "./driveLayout": { createDriveLayout: () => ({
      migrate: async ({ apply = false }) => ({ applied: apply }),
      async resolve(folder) {
        active++; maxActive = Math.max(maxActive, active); events.push(`start:${folder}`);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active--; events.push(`end:${folder}`);
        if (failOnce) { failOnce = false; throw new Error("transient"); }
        return "folder-id";
      },
    }) },
  };
  const module = { exports: {} }, filename = path.join(__dirname, "../services/googleDrive.service.js");
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), { module, require: (name) => {
    assert.ok(Object.hasOwn(deps, name), `Unexpected dependency ${name}`); return deps[name];
  }, process: { env: { GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret" } } }, { filename });
  return { service: module.exports, connection, authRequests, events, uploads, shares, setParentPermissions: (value) => { parentPermissions = value; }, max: () => maxActive, fail: () => { failOnce = true; } };
}
test("normal reconnect remains narrow; manual-file opt-in requests the full Drive scope", () => {
  const f = fixture();
  f.service.getAuthUrl("state"); f.service.getAuthUrl("state", { fullAccess: true });
  assert.ok(f.authRequests[0].scope.includes("https://www.googleapis.com/auth/drive.file"));
  assert.ok(!f.authRequests[0].scope.includes(FULL));
  assert.ok(f.authRequests[1].scope.includes(FULL));
  assert.equal(f.authRequests[1].state, "state");
});
test("connection status reports the requested root and actual recorded scopes without exposing tokens", async () => {
  const f = fixture();
  assert.equal((await f.service.getStatus()).rootName, "Tamheed-System");
  assert.equal((await f.service.getStatus()).manualFilesAccess, false);
  await f.service.handleOAuthCallback("synthetic-code");
  const status = await f.service.getStatus();
  assert.equal(status.manualFilesAccess, true);
  assert.equal(status.refreshToken, undefined);
  assert.equal(f.connection.rootFolderId, null, "a changed Google account is resolved again");
});
test("migration preview refuses a narrow grant that could hide conflicting manually created folders", async () => {
  const f = fixture();
  await assert.rejects(() => f.service.reorganizeLayout(), { code: "DRIVE_LAYOUT_SCOPE" });
  assert.deepEqual(f.events, []);
  await f.service.handleOAuthCallback("synthetic-code");
  assert.equal((await f.service.reorganizeLayout()).applied, false);
});
test("concurrent uploads serialize folder creation and recover the queue after a failure", async () => {
  const f = fixture();
  await Promise.all([f.service.ensureFolderPath("one"), f.service.ensureFolderPath("two")]);
  assert.equal(f.max(), 1);
  assert.deepEqual(f.events, ["start:one", "end:one", "start:two", "end:two"]);
  f.fail();
  await assert.rejects(() => f.service.ensureFolderPath("broken"), /transient/);
  assert.equal((await f.service.ensureFolderPath("recovered")).parentId, "folder-id");
});
test("private association uploads accept streams without public shares; profile-photo uploads keep their existing public image behavior", async () => {
  const f = fixture(), body = require("node:stream").Readable.from([Buffer.from("synthetic")]);
  await f.service.uploadPrivateFile({ body, name: "file.pdf", folderPath: "tamheed_db/root" });
  assert.equal(f.uploads[0].media.body, body);
  assert.equal(f.shares.length, 0);
  await f.service.uploadFile({ buffer: Buffer.from("synthetic"), name: "photo.png", folderPath: "tamheed_db/Students" });
  assert.equal(f.shares.length, 1);
  assert.equal(f.shares[0].requestBody.type, "anyone");
});
test("private uploads refuse inherited public access or unknown parent permissions before creating a file", async () => {
  const f = fixture();
  for (const permissions of [[{ type: "anyone", role: "reader" }], [{ type: "domain", role: "reader" }], undefined]) {
    f.setParentPermissions(permissions);
    await assert.rejects(() => f.service.uploadPrivateFile({ buffer: Buffer.from("synthetic"), name: "private.pdf", folderPath: "Storages" }), { code: "DRIVE_PUBLIC_PARENT" });
  }
  assert.equal(f.uploads.length, 0);
  assert.equal(f.shares.length, 0);
});

### server/test/storage-path-scope.test.js
const assert = require("node:assert/strict");
const test = require("node:test");
const { actorFor } = require("./helpers/actors");
const { loadStorageController, ADMIN, OTHER } = require("./helpers/storageController");
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } });

test("dot segments cannot escape personal folders or expose sibling profile/vehicle branches", async () => {
  for (const user of [ADMIN, OTHER]) {
    for (const path of ["../", "../../", "users/me/../../../Vehicles", "..\\..\\Profile-photos", "a/./b"]) {
      const { controller, calls } = loadStorageController();
      const req = { user: { tz: user.tz }, actor: actorFor(user), query: { path }, params: {}, body: {} };
      const res = response();
      await controller.listStorage(req, res);
      assert.equal(res.statusCode, 400, `${user.tz}: ${path}`);
      assert.equal(calls.length, 0, "invalid paths never reach storage");
    }
  }
});
test("folder creation rejects dot names before they are normalized into a parent path", async () => {
  const { controller, calls } = loadStorageController();
  for (const name of [".", ".."]) {
    const res = response();
    await controller.createFolder({ user: { tz: OTHER.tz }, actor: actorFor(OTHER), query: {}, params: {}, body: { name } }, res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(calls.length, 0);
});

### server/test/central-storage-private.test.js
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const express = require("express");
const jwt = require("jsonwebtoken");
const { Readable } = require("node:stream");
const SECRET = "synthetic-storage-test-secret";
async function fixture({ mime = "application/pdf", nativeLink = "https://docs.google.com/document/d/synthetic/edit" } = {}) {
  const calls = [];
  const info = { name: "ملف تجريبي.pdf", mimeType: mime, webViewLink: nativeLink };
  const drive = {
    async uploadPrivateFile(options) { calls.push(["private-upload", options.folderPath]); return { id: "file-id", viewUrl: "https://drive.google.test/file-id" }; },
    async uploadFile() { throw new Error("public upload must not be used for Storages"); },
    extractFileId: () => "file-id",
    getFileInfo: async () => info,
    downloadStream: async () => { calls.push(["download"]); return Readable.from([Buffer.from("synthetic bytes")]); },
    exportStream: async () => { calls.push(["export"]); return Readable.from([Buffer.from("synthetic export")]); },
    translateDriveError: (err) => err,
  };
  const dependencies = {
    express, fs: { mkdirSync() {}, createReadStream: () => Readable.from([Buffer.from("synthetic upload")]), promises: { unlink: async () => {} } },
    jsonwebtoken: jwt, os: require("node:os"), path,
    multer: Object.assign(() => ({ single: () => (req, res, next) => { req.file = { path: "synthetic", originalname: "file.pdf", mimetype: "application/pdf", size: 10 }; next(); } }), { memoryStorage: () => ({}) }),
    "./Storage.model": { StorageModelDef: { get: async ({ relativePath }) => ({ success: true, result: relativePath === "tamheed_db/root/file.pdf" ? [{ type: "file", url: "https://drive.google.test/file-id" }] : [] }) } },
    "../../services/googleDrive.service": drive,
    "../../utils/textEncoding": { repairMisencodedText: (value) => value },
    "stream/promises": require("node:stream/promises"),
  };
  const module = { exports: {} }, filename = path.join(__dirname, "../Entities/Storage/CentralStorageBackend.route.js");
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), { module, Buffer, process: { env: { STORAGE_SIGNED_URL_SECRET: SECRET } }, require(name) {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name];
  } }, { filename });
  const app = express(); app.use(express.json()); app.use("/storage", module.exports);
  const server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/storage`;
  const signed = (download = false) => `${base}/file/file.pdf?token=${jwt.sign({ path: "tamheed_db/root/file.pdf", download }, SECRET, { expiresIn: "2m" })}`;
  return { base, signed, calls, close: () => server.close(), info };
}
test("new association uploads use private Drive storage while retaining the logical API path", async () => {
  const f = await fixture();
  try {
    const result = await fetch(`${f.base}/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dbName: "tamheed_db", collection: "root", folder: "docs" }) });
    assert.equal(result.status, 201);
    assert.deepEqual(f.calls, [["private-upload", "tamheed_db/root/docs"]]);
    assert.ok((await result.json()).url);
  } finally { f.close(); }
});
test("ordinary private files stream only with a valid short-lived capability; full PDF bytes stay available", async () => {
  const f = await fixture();
  try {
    assert.equal((await fetch(`${f.base}/file/file.pdf`)).status, 400);
    assert.equal((await fetch(`${f.base}/file/file.pdf?token=forged`)).status, 401);
    const expired = jwt.sign({ path: "tamheed_db/root/file.pdf", exp: 1 }, SECRET);
    assert.equal((await fetch(`${f.base}/file/file.pdf?token=${expired}`)).status, 401);
    assert.deepEqual(f.calls, []);
    const result = await fetch(f.signed());
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("Content-Type"), "application/pdf");
    assert.equal(result.headers.get("Cache-Control"), "private, no-store");
    assert.ok(result.headers.get("Content-Disposition").startsWith("inline;"));
    assert.equal(await result.text(), "synthetic bytes");
    const download = await fetch(f.signed(true));
    assert.ok(download.headers.get("Content-Disposition").startsWith("attachment;"));
  } finally { f.close(); }
});
test("active uploaded HTML/SVG files are attachments rather than executable pages on the application origin", async () => {
  for (const mime of ["text/html", "image/svg+xml"]) {
    const f = await fixture({ mime });
    try {
      const result = await fetch(f.signed());
      assert.ok(result.headers.get("Content-Disposition").startsWith("attachment;"));
      assert.equal(result.headers.get("X-Content-Type-Options"), "nosniff");
    } finally { f.close(); }
  }
});
test("native Google documents open their editor and download via authenticated PDF export", async () => {
  const f = await fixture({ mime: "application/vnd.google-apps.document" });
  try {
    const opened = await fetch(f.signed(), { redirect: "manual" });
    assert.equal(opened.status, 302);
    assert.equal(opened.headers.get("Location"), f.info.webViewLink);
    assert.deepEqual(f.calls, []);
    const downloaded = await fetch(f.signed(true));
    assert.equal(downloaded.headers.get("Content-Type"), "application/pdf");
    assert.equal(await downloaded.text(), "synthetic export");
    assert.deepEqual(f.calls, [["export"]]);
  } finally { f.close(); }
});
