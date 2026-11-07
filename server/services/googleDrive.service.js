// Google Drive-backed storage. One Drive account is connected (via OAuth) for
// the whole app - not per Tamheed user - see GoogleDrive.route.js for the
// admin-only connect flow. The refresh token + cached folder ids are kept in
// the local MongoDB (same generic CRUD used by every other Entity).
const { google } = require("googleapis");
const { Readable } = require("stream");
const api = require("../Entities/api");
const { createDriveLayout } = require("./driveLayout");

const DB_NAME = process.env.DB_NAME || "tamheed_db";
const CONNECTIONS_COLLECTION = "Integrations";
const CONNECTION_KEY = "googleDrive";

const ROOT_FOLDER_NAME = process.env.GOOGLE_DRIVE_ROOT_FOLDER || "Tamheed-System";
const FULL_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
];

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/api/storage/google/callback";

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in env");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

async function getConnection() {
  const result = await api.read({
    dbName: DB_NAME,
    collection: CONNECTIONS_COLLECTION,
    filter: { key: CONNECTION_KEY },
  });
  return result?.result?.[0] || null;
}

async function saveConnection(patch) {
  return api.update({
    dbName: DB_NAME,
    collection: CONNECTIONS_COLLECTION,
    filter: { key: CONNECTION_KEY },
    newData: { key: CONNECTION_KEY, ...patch },
  });
}

function getAuthUrl(state, { fullAccess = false } = {}) {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: fullAccess ? [FULL_DRIVE_SCOPE, "https://www.googleapis.com/auth/userinfo.email"] : SCOPES,
    state,
  });
}

async function handleOAuthCallback(code) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Revoke prior access at https://myaccount.google.com/permissions and try connecting again."
    );
  }

  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data: profile } = await oauth2.userinfo.get();

  const saved = await saveConnection({
    refreshToken: tokens.refresh_token,
    connectedEmail: profile.email || "",
    connectedAt: new Date(),
    rootFolderId: null, // re-resolved on next use in case the account changed
    grantedScopes: String(tokens.scope || "").split(/\s+/).filter(Boolean),
  });

  if (saved?.success === false) {
    throw new Error(`Failed to store Google Drive connection: ${saved.error}`);
  }

  return { email: profile.email };
}

async function getStatus() {
  const conn = await getConnection();
  return { connected: !!conn?.refreshToken, email: conn?.connectedEmail || null, rootName: ROOT_FOLDER_NAME,
    manualFilesAccess: Array.isArray(conn?.grantedScopes) && conn.grantedScopes.includes(FULL_DRIVE_SCOPE) };
}

async function getDriveClient() {
  const conn = await getConnection();
  if (!conn?.refreshToken) {
    throw new Error("Google Drive is not connected yet. An administrator must connect it from the Files page.");
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: conn.refreshToken });
  return google.drive({ version: "v3", auth: oauth2Client });
}

const layoutFor = (drive) => createDriveLayout({ drive, getConnection, saveConnection,
  dbName: DB_NAME, collection: process.env.STORAGE_COLLECTION || "root", rootName: ROOT_FOLDER_NAME });
// Concurrent uploads in one server process must not create duplicate roots or
// branches. File uploads themselves can proceed concurrently after resolution.
let layoutWrites = Promise.resolve();
const serializeLayoutWrite = (operation) => {
  const result = layoutWrites.then(operation);
  layoutWrites = result.catch(() => {});
  return result;
};

// Legacy logical paths remain valid, but new installations store photos in
// Profile-photos and association files in Storages. Existing branches stay
// readable/writable in place until the explicit layout migration is applied.
async function ensureFolderPath(folderPath = "") {
  const drive = await getDriveClient();
  const parentId = await serializeLayoutWrite(() => layoutFor(drive).resolve(folderPath, true));
  return { drive, parentId };
}

// Like ensureFolderPath, but never creates anything. Returns null if any
// segment is missing (used for read-only operations like listing).
async function resolveFolderPath(folderPath = "") {
  const drive = await getDriveClient();
  return { drive, folderId: await layoutFor(drive).resolve(folderPath) };
}

async function reorganizeLayout(options = {}) {
  const connection = await getConnection();
  // A narrow grant cannot reliably see manually created destinations, so its
  // "no conflict" result would be misleading during a move or root rename.
  if (!Array.isArray(connection?.grantedScopes) || !connection.grantedScopes.includes(FULL_DRIVE_SCOPE)) {
    throw Object.assign(new Error("فعّل الوصول للملفات اليدوية بإعادة ربط حساب الجمعية قبل معاينة النقل، حتى يمكن كشف المجلدات الموجودة والتعارضات."), { code: "DRIVE_LAYOUT_SCOPE" });
  }
  const layout = layoutFor(await getDriveClient());
  return options.apply ? serializeLayoutWrite(() => layout.migrate(options)) : layout.migrate(options);
}

async function listChildren(folderPath = "") {
  const { drive, folderId } = await resolveFolderPath(folderPath);
  if (!folderId) return [];

  const files = [];
  let pageToken;
  do {
    const result = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink)",
      spaces: "drive",
      pageSize: 200,
      pageToken,
    });
    files.push(...(result.data.files || []));
    pageToken = result.data.nextPageToken;
  } while (pageToken);

  return files;
}

async function renameById(fileId, newName) {
  const drive = await getDriveClient();
  const updated = await drive.files.update({
    fileId,
    requestBody: { name: newName },
    fields: "id, name",
  });
  return updated.data;
}

async function deleteById(fileId) {
  const drive = await getDriveClient();
  await drive.files.delete({ fileId });
  return { deleted: true, fileId };
}

// Removes a Drive file or folder; a file that is already gone counts as done,
// so a retry after a partial failure can finish the job.
async function deleteByIdIfExists(fileId) {
  try {
    await deleteById(fileId);
    return { deleted: true };
  } catch (err) {
    const code = err?.code || err?.response?.status;
    if (code === 404 || code === "404") return { deleted: false, missing: true };
    throw err;
  }
}

async function getStorageQuota() {
  const drive = await getDriveClient();
  const result = await drive.about.get({ fields: "storageQuota" });
  const quota = result.data.storageQuota || {};
  return {
    limit: Number(quota.limit) || 0, // 0 = unlimited (Workspace) - caller should handle
    usage: Number(quota.usage) || 0,
  };
}

function toViewUrl(fileId) {
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

// lh3.googleusercontent.com only ever renders a flattened preview image, so a
// multi-page file (PDF, Office doc) opened through it shows one static page
// with no way to scroll/page through the rest. Drive's own viewer page
// handles pagination, zoom, etc. natively, so the "open file" route sends
// people there instead - same file, opened through the storage's Drive.
function toDriveViewUrl(fileId) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

function toDriveDownloadUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

// The stored refresh token stops working periodically (7-day expiry while the
// OAuth consent screen is in "Testing" mode, manual revocation, etc.) and
// googleapis then throws a bare "invalid_grant" — meaningless to an end user.
// Every route that talks to Drive should pass its catch-block error through
// this so people see an actionable message instead of an OAuth error code.
const DRIVE_RECONNECT_MESSAGE =
  "انتهى الاتصال مع Google Drive أو تم إلغاؤه. على المدير فتح /api/storage/google/connect من المتصفح لإعادة الربط.";

function translateDriveError(err) {
  const raw = String(err?.message || err?.response?.data?.error || "");
  if (raw.includes("invalid_grant")) {
    const friendly = new Error(DRIVE_RECONNECT_MESSAGE);
    friendly.code = "GOOGLE_DRIVE_DISCONNECTED";
    return friendly;
  }
  return err;
}

async function uploadFile({ buffer, body, name, mimeType, folderPath = "" }) {
  const { drive, parentId } = await ensureFolderPath(folderPath);
  const mediaBody = body || Readable.from(buffer);

  const created = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media: { mimeType: mimeType || "application/octet-stream", body: mediaBody },
    fields: "id, name, webViewLink",
  });

  const fileId = created.data.id;

  // Public "anyone with the link can view" so it can be used directly as an <img src>.
  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
  });

  return { id: fileId, name: created.data.name, viewUrl: toViewUrl(fileId) };
}

// Same as uploadFile but WITHOUT the "anyone with the link" permission: the
// file is reachable only through the Drive account itself, so the app must
// stream it to signed-in users after its own permission check. Used for
// documents (licences, insurance, receipts), never for photos.
async function uploadPrivateFile({ buffer, body, name, mimeType, folderPath = "" }) {
  const { drive, parentId } = await ensureFolderPath(folderPath);
  const { data: parent } = await drive.files.get({ fileId: parentId, fields: "permissions(type,role)" }, { timeout: 15000 });
  if (!Array.isArray(parent.permissions) || parent.permissions.some((permission) => ["anyone", "domain"].includes(permission.type))) {
    throw Object.assign(new Error("مجلد الحفظ في Google مشارك على نطاق عام أو تعذّر التحقق من خصوصيته. اضبط مشاركة المجلد قبل رفع مستند خاص."), { code: "DRIVE_PUBLIC_PARENT" });
  }
  const created = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media: { mimeType: mimeType || "application/octet-stream", body: body || Readable.from(buffer) },
    fields: "id, name",
  });
  return { id: created.data.id, name: created.data.name, viewUrl: toViewUrl(created.data.id) };
}

async function getFileInfo(fileId) {
  const drive = await getDriveClient();
  const { data } = await drive.files.get({ fileId, fields: "id,name,mimeType,size,webViewLink,trashed" }, { timeout: 15000 });
  return data;
}

async function exportStream(fileId, mimeType = "application/pdf") {
  const drive = await getDriveClient();
  const response = await drive.files.export({ fileId, mimeType }, { responseType: "stream", timeout: 30000 });
  return response.data;
}

// Whether a file is an image anyone with the link can already view (as the
// photo uploads are, see uploadFile); false when it is gone. Throws when
// Drive cannot be asked.
async function isPublicImage(fileId) {
  const drive = await getDriveClient();
  let data;
  try {
    ({ data } = await drive.files.get({ fileId, fields: "mimeType, trashed, permissions(type, role)" }, { timeout: 15000 }));
  } catch (err) {
    if (Number(err?.code ?? err?.response?.status) === 404) return false;
    throw err;
  }
  return /^image\//.test(data?.mimeType || "") && !data.trashed
    && (data.permissions || []).some((p) => p.type === "anyone" && ["reader", "commenter", "writer"].includes(p.role));
}

async function downloadStream(fileId) {
  const drive = await getDriveClient();
  const response = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
  return response.data;
}

function extractFileId(urlOrId = "") {
  const str = String(urlOrId);
  const byQuery = str.match(/[?&]id=([^&]+)/);
  if (byQuery) return byQuery[1];
  const byPath = str.match(/\/d\/([^/?]+)/);
  if (byPath) return byPath[1];
  if (/^[\w-]{10,}$/.test(str)) return str; // looks like a bare Drive file id already
  return null;
}

async function deleteFile(urlOrId) {
  const fileId = extractFileId(urlOrId);
  if (!fileId) return null;

  const drive = await getDriveClient();
  await drive.files.delete({ fileId });
  return { deleted: true, fileId };
}

module.exports = {
  isPublicImage,
  getAuthUrl,
  handleOAuthCallback,
  getStatus,
  uploadFile,
  uploadPrivateFile,
  downloadStream,
  deleteFile,
  extractFileId,
  ensureFolderPath,
  resolveFolderPath,
  listChildren,
  renameById,
  deleteById,
  deleteByIdIfExists,
  getStorageQuota,
  toViewUrl,
  toDriveViewUrl,
  toDriveDownloadUrl,
  translateDriveError,
  reorganizeLayout,
  getFileInfo,
  exportStream,
};
