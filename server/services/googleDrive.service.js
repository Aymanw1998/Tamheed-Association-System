// Google Drive-backed storage. One Drive account is connected (via OAuth) for
// the whole app - not per Tamheed user - see GoogleDrive.route.js for the
// one-time /connect flow. The refresh token + cached folder ids are kept in
// the local MongoDB (same generic CRUD used by every other Entity).
const { google } = require("googleapis");
const { Readable } = require("stream");
const api = require("../Entities/api");

const DB_NAME = process.env.DB_NAME || "tamheed_db";
const CONNECTIONS_COLLECTION = "Integrations";
const CONNECTION_KEY = "googleDrive";

const ROOT_FOLDER_NAME = process.env.GOOGLE_DRIVE_ROOT_FOLDER || "Tamheed";
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

function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
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
  });

  if (saved?.success === false) {
    throw new Error(`Failed to store Google Drive connection: ${saved.error}`);
  }

  return { email: profile.email };
}

async function getStatus() {
  const conn = await getConnection();
  return { connected: !!conn?.refreshToken, email: conn?.connectedEmail || null };
}

async function getDriveClient() {
  const conn = await getConnection();
  if (!conn?.refreshToken) {
    throw new Error("Google Drive is not connected yet. Open /api/storage/google/connect first.");
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: conn.refreshToken });
  return google.drive({ version: "v3", auth: oauth2Client });
}

async function findOrCreateFolder(drive, name, parentId) {
  const safeName = String(name).replace(/'/g, "\\'");
  const parentClause = parentId ? ` and '${parentId}' in parents` : "";

  const existing = await drive.files.list({
    q: `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentClause}`,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (existing.data.files?.length) return existing.data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: "id",
  });

  return created.data.id;
}

async function ensureRootFolder(drive) {
  const conn = await getConnection();
  if (conn?.rootFolderId) return conn.rootFolderId;

  const folderId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME, null);
  await saveConnection({ rootFolderId: folderId });
  return folderId;
}

// folderPath like "tamheed_db/Users" -> Tamheed/tamheed_db/Users in Drive
async function ensureFolderPath(folderPath = "") {
  const drive = await getDriveClient();
  const segments = String(folderPath).split(/[\\/]/).filter(Boolean);

  let parentId = await ensureRootFolder(drive);
  for (const segment of segments) {
    parentId = await findOrCreateFolder(drive, segment, parentId);
  }

  return { drive, parentId };
}

function toViewUrl(fileId) {
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

async function uploadFile({ buffer, name, mimeType, folderPath = "" }) {
  const { drive, parentId } = await ensureFolderPath(folderPath);

  const created = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media: { mimeType: mimeType || "application/octet-stream", body: Readable.from(buffer) },
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
  getAuthUrl,
  handleOAuthCallback,
  getStatus,
  uploadFile,
  deleteFile,
  extractFileId,
};
