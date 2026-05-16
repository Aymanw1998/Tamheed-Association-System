const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const path = require("path");
const { UserModelDef } = require("../User/User.model");
const { StorageModelDef } = require("./Storage.model");
const { broadcast } = require("../../utils/sse");

const STORAGE_DB_NAME = process.env.DB_NAME || "tamheed_db";
const STORAGE_COLLECTION = process.env.STORAGE_COLLECTION || "root";
const STORAGE_API_BASE_URL = (
  process.env.CENTRAL_STORAGE_API_URL ||
  `${process.env.API_URI || "https://api.wahbani.com"}/api/storage`
).replace(/\/+$/, "");
const STORAGE_FILE_BASE_URL = (
  process.env.CENTRAL_STORAGE_FILE_BASE_URL ||
  STORAGE_API_BASE_URL
).replace(/\/+$/, "");
const STORAGE_FILE_ACCESS_MODE = String(
  process.env.CENTRAL_STORAGE_FILE_ACCESS_MODE || "path"
).trim().toLowerCase();
const STORAGE_FILE_ACCESS_PARAM = process.env.CENTRAL_STORAGE_FILE_ACCESS_PARAM || "relativePath";
const STORAGE_SIGNED_URL_SECRET =
  process.env.STORAGE_SIGNED_URL_SECRET ||
  process.env.JWT_ACCESS_SECRET ||
  "storage-temp-secret";
const STORAGE_SIGNED_URL_TTL = process.env.STORAGE_SIGNED_URL_TTL || "2m";
const STORAGE_SHARE_LINK_SECRET =
  process.env.STORAGE_SHARE_LINK_SECRET ||
  STORAGE_SIGNED_URL_SECRET;
const STORAGE_SHARE_LINK_TTL = process.env.STORAGE_SHARE_LINK_TTL || "30d";
const CLIENT_APP_URL = (process.env.CLIENT_URL || "").replace(/\/+$/, "");
const MAX_CHUNKS_PER_UPLOAD = Number(process.env.STORAGE_MAX_UPLOAD_CHUNKS || 2000);
const UPLOAD_SESSION_DIR = process.env.STORAGE_UPLOAD_SESSION_DIR || path.join(process.cwd(), "storage-upload-sessions");
const UPLOAD_SESSION_TTL_MS = Number(process.env.STORAGE_UPLOAD_SESSION_TTL_HOURS || 24) * 60 * 60 * 1000;

const ADMIN_ROLES = new Set(["ادارة", "إدارة", "الادارة", "الإدارة", "admin", "administrator"]);

const normalizeRelativePath = (value = "") => {
  return String(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .join("/");
};

const safeUploadId = (value = "") =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 180);

const safeFileName = (value = "file") => {
  const basename = path.basename(String(value || "file")).trim() || "file";
  return basename.replace(/[^\p{L}\p{N}._ -]/gu, "_").replace(/\s+/g, " ").slice(0, 180);
};

fs.mkdirSync(UPLOAD_SESSION_DIR, { recursive: true });

const getErrorMessage = (error) => {
    console.log("Storage error:", { error });
  if (error?.response?.status === 413) {
    return "الملف كبير جدًا بالنسبة لخدمة التخزين. تأكد من رفع حد الطلبات في الخادم أو الـ proxy.";
  }

  return (
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error.message ||
    "Storage server error"
  );
};

const buildStoragePayload = (folder = "") => ({
  dbName: STORAGE_DB_NAME,
  collection: STORAGE_COLLECTION,
  folder: normalizeRelativePath(folder),
});

const getFormLength = (form) =>
  new Promise((resolve) => {
    form.getLength((error, length) => {
      resolve(error ? null : length);
    });
  });

const getUploadSessionPath = (uploadId = "") => path.join(UPLOAD_SESSION_DIR, `${safeUploadId(uploadId)}.json`);

const readUploadSession = async (uploadId = "") => {
  const safeId = safeUploadId(uploadId);
  if (!safeId) return null;

  try {
    const raw = await fs.promises.readFile(getUploadSessionPath(safeId), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

const writeUploadSession = async (session = {}) => {
  const uploadId = safeUploadId(session.uploadId);
  if (!uploadId) throw new Error("invalid uploadId");

  const receivedChunks = Array.from(new Set((session.receivedChunks || []).map(Number)))
    .filter((index) => Number.isInteger(index) && index >= 0)
    .sort((a, b) => a - b);
  const now = new Date().toISOString();
  const nextSession = {
    ...session,
    uploadId,
    receivedChunks,
    createdAt: session.createdAt || now,
    updatedAt: now,
  };

  await fs.promises.mkdir(UPLOAD_SESSION_DIR, { recursive: true });
  await fs.promises.writeFile(getUploadSessionPath(uploadId), JSON.stringify(nextSession, null, 2));
  return nextSession;
};

const removeUploadSession = async (uploadId = "") => {
  const safeId = safeUploadId(uploadId);
  if (!safeId) return;
  await fs.promises.unlink(getUploadSessionPath(safeId)).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
};

const getMissingChunks = (receivedChunks = [], totalChunks = 0) => {
  const receivedSet = new Set(receivedChunks.map(Number));
  const missing = [];

  for (let index = 0; index < totalChunks; index += 1) {
    if (!receivedSet.has(index)) missing.push(index);
  }

  return missing;
};

const cleanupOldUploadSessions = async () => {
  const now = Date.now();
  const entries = await fs.promises.readdir(UPLOAD_SESSION_DIR, { withFileTypes: true }).catch(() => []);

  await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map(async (entry) => {
      const fullPath = path.join(UPLOAD_SESSION_DIR, entry.name);
      try {
        const raw = await fs.promises.readFile(fullPath, "utf8");
        const session = JSON.parse(raw);
        const updatedAt = new Date(session.updatedAt || session.createdAt || 0).getTime();
        if (session.status !== "completed" && Number.isFinite(updatedAt) && now - updatedAt > UPLOAD_SESSION_TTL_MS) {
          await fs.promises.unlink(fullPath);
          await axios.post(`${STORAGE_API_BASE_URL}/cancel-upload`, { uploadId: session.uploadId }, { timeout: 60 * 1000 }).catch(() => null);
        }
      } catch (error) {
        console.warn("[storage] upload-session:cleanup:error", {
          file: entry.name,
          message: error.message,
        });
      }
    }));
};

setInterval(cleanupOldUploadSessions, 60 * 60 * 1000).unref?.();
cleanupOldUploadSessions().catch((error) => {
  console.warn("[storage] upload-session:startup-cleanup:error", error.message);
});

const isAdminUser = (user = {}) => {
  return (user.roles || []).some((role) => ADMIN_ROLES.has(String(role).trim()));
};

const getActiveUserByTz = async (tz) => {
  const result = await UserModelDef.get({ tz }, "active");
  if (result?.success && Array.isArray(result.result) && result.result.length > 0) {
    return result.result[0];
  }

  return null;
};

const getActiveUserByIdentifier = async (identifier) => {
  const safeIdentifier = String(identifier || "").trim();
  if (!safeIdentifier) return null;

  const byTz = await UserModelDef.get({ tz: safeIdentifier }, "active").catch(() => null);
  if (byTz?.success && Array.isArray(byTz.result) && byTz.result.length > 0) {
    return byTz.result[0];
  }

  const byId = await UserModelDef.get({ _id: safeIdentifier }, "active").catch(() => null);
  if (byId?.success && Array.isArray(byId.result) && byId.result.length > 0) {
    return byId.result[0];
  }

  return null;
};

const buildUserDisplayName = (user = {}) => {
  const fullName = [user.firstname, user.lastname]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || String(user.tz || user.storageFolder || user._id || "user").trim();
};

const buildUserStorageFolder = (user = {}) => {
  const explicitFolder = normalizeRelativePath(user.storageFolder || "");
  if (explicitFolder) {
    return explicitFolder;
  }

  const identityFolder = normalizeRelativePath(user.tz || user._id || "user");
  return normalizeRelativePath(path.posix.join("users", identityFolder));
};

const buildStorageFolderDisplayMap = async () => {
  const result = await UserModelDef.get({}, "active").catch(() => null);
  const users = result?.success && Array.isArray(result.result) ? result.result : [];
  const displayMap = new Map();

  users.forEach((user) => {
    const displayName = buildUserDisplayName(user);
    const folderCandidates = buildUserFolderCandidates(user);

    folderCandidates.forEach((folder) => {
      const safeFolder = normalizeRelativePath(folder);
      if (!safeFolder || !displayName) return;

      displayMap.set(safeFolder, displayName);
      displayMap.set(getStorageRelativePath(safeFolder), displayName);
      displayMap.set(path.posix.basename(safeFolder), displayName);
    });

    const defaultFolder = buildUserStorageFolder({
      ...user,
      storageFolder: "",
    });
    if (defaultFolder && displayName) {
      displayMap.set(defaultFolder, displayName);
      displayMap.set(getStorageRelativePath(defaultFolder), displayName);
    }

    const safeTz = normalizeRelativePath(user.tz || "");
    if (safeTz && displayName) {
      displayMap.set(safeTz, displayName);
    }
  });

  return displayMap;
};

const buildActiveUsersLookup = async () => {
  const result = await UserModelDef.get({}, "active").catch(() => null);
  const users = result?.success && Array.isArray(result.result) ? result.result : [];
  const lookup = new Map();

  users.forEach((user) => {
    const displayName = buildUserDisplayName(user);
    const safeId = String(user?._id || "").trim();
    const safeTz = String(user?.tz || "").trim();

    if (safeId) lookup.set(safeId, displayName);
    if (safeTz) lookup.set(safeTz, displayName);
  });

  return lookup;
};

const getClientRelativePath = (relativePath = "") => {
  return normalizeRelativePath(relativePath).replace(
    new RegExp(`^${STORAGE_DB_NAME}/${STORAGE_COLLECTION}/?`),
    ""
  );
};

const stripUserRoot = (relativePath = "", userRoot = "") => {
  const safePath = getClientRelativePath(relativePath);
  const safeRoot = normalizeRelativePath(userRoot);

  if (!safeRoot) return safePath;
  if (safePath === safeRoot) return "";
  if (safePath.startsWith(`${safeRoot}/`)) return safePath.slice(safeRoot.length + 1);

  return safePath;
};

const applyUserRoot = (relativePath = "", userRoot = "") => {
  const safePath = normalizeRelativePath(relativePath);
  const safeRoot = normalizeRelativePath(userRoot);

  if (!safeRoot) return safePath;
  if (!safePath) return safeRoot;
  if (safePath === safeRoot || safePath.startsWith(`${safeRoot}/`)) return safePath;

  return normalizeRelativePath(path.posix.join(safeRoot, safePath));
};

const getStorageRelativePath = (relativePath = "") => {
  const safeRelativePath = normalizeRelativePath(relativePath);

  if (safeRelativePath.startsWith(`${STORAGE_DB_NAME}/${STORAGE_COLLECTION}/`)) {
    return safeRelativePath;
  }

  return normalizeRelativePath(path.posix.join(STORAGE_DB_NAME, STORAGE_COLLECTION, safeRelativePath));
};

const getPublicStorageUrl = (relativePath = "") => {
  const safePath = normalizeRelativePath(relativePath)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `${STORAGE_API_BASE_URL}/${safePath}`;
};

const buildCentralFileUrl = (relativePath = "", options = {}) => {
  const safePath = normalizeRelativePath(relativePath);
  const encodedPath = safePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  if (STORAGE_FILE_ACCESS_MODE === "query") {
    const url = new URL(STORAGE_FILE_BASE_URL);
    url.searchParams.set(STORAGE_FILE_ACCESS_PARAM, safePath);
    if (options.download) {
      url.searchParams.set("download", "1");
    }
    return url.toString();
  }

  const baseUrl = STORAGE_FILE_BASE_URL.replace(/\/+$/, "");
  return options.download
    ? `${baseUrl}/${encodedPath}?download=1`
    : `${baseUrl}/${encodedPath}`;
};

const signStorageAccessToken = (payload = {}) =>
  jwt.sign(payload, STORAGE_SIGNED_URL_SECRET, {
    algorithm: "HS256",
    expiresIn: STORAGE_SIGNED_URL_TTL,
  });

const verifyStorageAccessToken = (token) =>
  jwt.verify(token, STORAGE_SIGNED_URL_SECRET, {
    algorithms: ["HS256"],
  });

const signStorageShareLinkToken = (payload = {}) =>
  jwt.sign(payload, STORAGE_SHARE_LINK_SECRET, {
    algorithm: "HS256",
    expiresIn: STORAGE_SHARE_LINK_TTL,
  });

const verifyStorageShareLinkToken = (token) =>
  jwt.verify(token, STORAGE_SHARE_LINK_SECRET, {
    algorithms: ["HS256"],
  });

const hasSharedPermission = (user = {}, action = "view", requestedPath = "") => {
  const permissions = user.storagePermissions || {};
  const allowedPaths = Array.isArray(permissions[action]) ? permissions[action] : [];
  const safeRequestedPath = normalizeRelativePath(requestedPath);

  return allowedPaths.some((allowedPath) => {
    const safeAllowedPath = normalizeRelativePath(allowedPath);
    return safeRequestedPath === safeAllowedPath || safeRequestedPath.startsWith(`${safeAllowedPath}/`);
  });
};

const hasAnySharedAccess = (user = {}, requestedPath = "") => {
  const safeRequestedPath = normalizeRelativePath(requestedPath);
  return ["view", "create", "update", "delete"].some((action) =>
    hasSharedPermission(user, action, safeRequestedPath)
  );
};

const getStorageScope = async (req, action = "view", requestedPath = "") => {
  const dbUser = await getActiveUserByTz(req.user?.tz);
  const user = dbUser || { tz: req.user?.tz, roles: req.user?.roles || [] };
  const requested = getClientRelativePath(requestedPath);

  if (isAdminUser(user)) {
    return { user, isAdmin: true, folder: requested, userRoot: "" };
  }

  if (!user?.tz) {
    const error = new Error("User not found");
    error.status = 401;
    throw error;
  }

  const userRoot = buildUserStorageFolder(user);

  if (hasSharedPermission(user, action, requested)) {
    return { user, isAdmin: false, folder: requested, userRoot };
  }

  if (hasAnySharedAccess(user, requested)) {
    const error = new Error("You only have view access to this shared item");
    error.status = 403;
    throw error;
  }

  return {
    user,
    isAdmin: false,
    folder: applyUserRoot(requested, userRoot),
    userRoot,
  };
};

const mapStorageItem = (item = {}, options = {}) => {
  const relativePath = normalizeRelativePath(item.relativePath || item.path || item.filename || item.name);
  const isDirectory = Boolean(item.isDirectory);
  const clientPath = options.userRoot ? stripUserRoot(relativePath, options.userRoot) : getClientRelativePath(relativePath);
  const safeName = item.name || path.posix.basename(relativePath);
  let displayName = item.displayName || safeName;

  if (isDirectory && options.folderDisplayMap instanceof Map) {
    const candidates = [
      normalizeRelativePath(clientPath),
      normalizeRelativePath(relativePath),
      normalizeRelativePath(getClientRelativePath(relativePath)),
      normalizeRelativePath(safeName),
    ].filter(Boolean);

    const matchedDisplayName = candidates.find((candidate) => options.folderDisplayMap.has(candidate));
    if (matchedDisplayName) {
      displayName = options.folderDisplayMap.get(matchedDisplayName) || displayName;
    }
  }

  return {
    ...item,
    name: safeName,
    displayName,
    filename: relativePath,
    path: clientPath,
    type: isDirectory ? "folder" : item.ext || item.type || "file",
    isDirectory,
    size: item.size ?? null,
    date: item.modifiedAt || item.date || item.createdAt || null,
    url: isDirectory ? null : item.url,
  };
};

const calculateFolderSize = async (folder = "", cache = new Map()) => {
  const safeFolder = normalizeRelativePath(folder);
  const cacheKey = safeFolder || "__root__";
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const pending = (async () => {
    const { data } = await axios.get(`${STORAGE_API_BASE_URL}/list`, {
      params: buildStoragePayload(safeFolder),
    });

    const childItems = data?.items || [
      ...(data?.folders || []),
      ...(data?.files || []),
    ];

    let total = 0;
    for (const item of childItems) {
      const isDirectory = Boolean(item?.isDirectory || item?.type === "folder");
      if (isDirectory) {
        const childPath = normalizeRelativePath(item.relativePath || item.path || item.filename || item.name);
        total += await calculateFolderSize(childPath, cache);
      } else {
        total += Number(item?.size ?? item?.bytes ?? 0) || 0;
      }
    }

    return total;
  })();

  cache.set(cacheKey, pending);
  return pending;
};

const enrichFolderSizes = async (items = []) => {
  const folderSizeCache = new Map();

  return Promise.all(
    items.map(async (item) => {
      if (!item.isDirectory) return item;

      const folderPath = normalizeRelativePath(item.filename || item.path || item.name);
      return {
        ...item,
        size: await calculateFolderSize(folderPath, folderSizeCache),
      };
    })
  );
};

const normalizeUploadFileName = (requestedName = "", originalName = "file") => {
  const trimmedName = String(requestedName).trim();
  const fallbackName = String(originalName || "file").trim() || "file";
  const selectedName = trimmedName || fallbackName;

  if (selectedName.includes("/") || selectedName.includes("\\")) {
    const error = new Error("File name cannot include folders");
    error.status = 400;
    throw error;
  }

  const originalExt = path.extname(fallbackName);
  const selectedExt = path.extname(selectedName);

  if (!selectedExt && originalExt) {
    return `${selectedName}${originalExt}`;
  }

  return selectedName;
};

const ensureUserStorageFolder = async (user = {}) => {
  const folder = buildUserStorageFolder(user);
  if (!folder) return null;

  await axios.post(`${STORAGE_API_BASE_URL}/folder`, buildStoragePayload(folder));
  return folder;
};

const buildStorageMetadataPayload = ({
  type = "file",
  name = "",
  ownerId = "",
  relativePath = "",
  url = null,
  mimeType = "",
  size = null,
}) => {
  const safeRelativePath = normalizeRelativePath(relativePath);
  const safeParentPath =
    path.posix.dirname(safeRelativePath) === "."
      ? ""
      : normalizeRelativePath(path.posix.dirname(safeRelativePath));

  return {
    type,
    name: String(name || path.posix.basename(safeRelativePath)).trim(),
    ownerId: String(ownerId || "").trim(),
    relativePath: safeRelativePath,
    parentPath: safeParentPath,
    url,
    visibility: "private",
    sharedWith: [],
    mimeType,
    size: type === "folder" ? null : size,
  };
};

const buildUserFolderCandidates = (user = {}) => {
  const candidates = new Set();
  const explicitFolder = normalizeRelativePath(user?.storageFolder || "");
  const defaultFolder = buildUserStorageFolder(user);
  const legacyFolder = normalizeRelativePath(user?.tz || user?._id || "");

  if (explicitFolder) candidates.add(explicitFolder);
  if (defaultFolder) candidates.add(defaultFolder);
  if (legacyFolder) candidates.add(legacyFolder);

  return Array.from(candidates).filter(Boolean);
};

const inferStorageOwnerId = async (relativePath = "", fallbackUser = null) => {
  const safeRelativePath = normalizeRelativePath(relativePath);
  if (!safeRelativePath) {
    return String(fallbackUser?._id || fallbackUser?.tz || "").trim();
  }

  const result = await UserModelDef.get({}, "active").catch(() => null);
  const users = result?.success && Array.isArray(result.result) ? result.result : [];

  for (const user of users) {
    const matched = buildUserFolderCandidates(user).some((folder) => {
      const safeFolder = normalizeRelativePath(folder);
      return (
        safeRelativePath === safeFolder ||
        safeRelativePath.startsWith(`${safeFolder}/`) ||
        safeFolder.startsWith(`${safeRelativePath}/`)
      );
    });

    if (matched) {
      return String(user?._id || user?.tz || "").trim();
    }
  }

  return String(fallbackUser?._id || fallbackUser?.tz || "").trim();
};

const enrichItemsWithOwner = async (items = []) => {
  if (!Array.isArray(items) || !items.length) return items;

  const [metadataResult, userLookup] = await Promise.all([
    StorageModelDef.get({}).catch(() => null),
    buildActiveUsersLookup(),
  ]);
  const metadataItems =
    metadataResult?.success && Array.isArray(metadataResult.result) ? metadataResult.result : [];
  const metadataByPath = new Map(
    metadataItems.map((item) => [normalizeRelativePath(item?.relativePath || ""), item])
  );

  return items.map((item) => {
    const itemPath = normalizeRelativePath(item?.relativePath || item?.filename || "");
    const metadata = metadataByPath.get(itemPath);
    const ownerId = String(metadata?.ownerId || "").trim();
    const ownerName = ownerId ? userLookup.get(ownerId) || ownerId : "";

    return {
      ...item,
      ownerId,
      ownerName: ownerName || item.ownerName || "",
    };
  });
};

const createStorageMetadata = async (payload = {}) => {
  const result = await StorageModelDef.create(payload);

  if (result?.success === false) {
    throw new Error(result.message || "Storage metadata create failed");
  }

  return result;
};

const ensureStorageMetadataRecord = async ({
  relativePath = "",
  type = "file",
  name = "",
  ownerId = "",
  url = null,
  mimeType = "",
  size = null,
} = {}) => {
  const safeRelativePath = normalizeRelativePath(relativePath);
  if (!safeRelativePath) return null;

  const existing = await getStorageMetadataByPath(safeRelativePath);
  if (existing) return existing;

  await createStorageMetadata(
    buildStorageMetadataPayload({
      type,
      name: name || path.posix.basename(safeRelativePath),
      ownerId,
      relativePath: safeRelativePath,
      url,
      mimeType,
      size,
    })
  );

  return getStorageMetadataByPath(safeRelativePath);
};

const ensureStorageMetadataForPhysicalItem = async (item = {}, options = {}) => {
  const storageRelativePath = normalizeRelativePath(
    item?.relativePath || item?.filename || item?.path || item?.name || ""
  );
  if (!storageRelativePath) return null;

  const ownerId =
    String(options.ownerId || "").trim() ||
    (await inferStorageOwnerId(storageRelativePath, options.ownerUser || null));

  return ensureStorageMetadataRecord({
    relativePath: storageRelativePath,
    type: item?.isDirectory || item?.type === "folder" ? "folder" : "file",
    name: item?.name || path.posix.basename(storageRelativePath),
    ownerId,
    url: item?.isDirectory ? null : item?.url || null,
    mimeType: item?.mimeType || item?.mimetype || "",
    size:
      item?.isDirectory || item?.type === "folder"
        ? null
        : item?.size ?? null,
  });
};

const ensureStorageMetadataForItems = async (items = [], options = {}) => {
  const ensured = [];

  for (const item of items) {
    ensured.push(
      await ensureStorageMetadataForPhysicalItem(item, options).catch(() => null)
    );
  }

  return ensured;
};

const getStorageMetadataByPath = async (relativePath = "") => {
  const safeRelativePath = normalizeRelativePath(relativePath);
  const result = await StorageModelDef.get({ relativePath: safeRelativePath });

  if (result?.success && Array.isArray(result.result) && result.result.length > 0) {
    return result.result[0];
  }

  return null;
};

const getStorageMetadataTree = async (relativePath = "") => {
  const safeRelativePath = normalizeRelativePath(relativePath);
  const result = await StorageModelDef.get({});
  const items = result?.success && Array.isArray(result.result) ? result.result : [];

  return items.filter((item) => {
    const itemPath = normalizeRelativePath(item?.relativePath || "");
    return itemPath === safeRelativePath || itemPath.startsWith(`${safeRelativePath}/`);
  });
};

const replacePathPrefix = (value = "", fromPrefix = "", toPrefix = "") => {
  const safeValue = normalizeRelativePath(value);
  const safeFrom = normalizeRelativePath(fromPrefix);
  const safeTo = normalizeRelativePath(toPrefix);

  if (!safeFrom) return safeValue;
  if (safeValue === safeFrom) return safeTo;
  if (safeValue.startsWith(`${safeFrom}/`)) {
    return normalizeRelativePath(path.posix.join(safeTo, safeValue.slice(safeFrom.length + 1)));
  }

  return safeValue;
};

const replacePermissionPathPrefix = (permissions = {}, fromPrefix = "", toPrefix = "") => {
  const next = {};

  ["view", "create", "update", "delete"].forEach((action) => {
    const currentPaths = Array.isArray(permissions[action]) ? permissions[action] : [];
    next[action] = Array.from(
      new Set(
        currentPaths
          .map((entry) => replacePathPrefix(entry, fromPrefix, toPrefix))
          .filter(Boolean)
      )
    );
  });

  return next;
};

const getSharedStorageItemsForUser = async (user = {}) => {
  const identifiers = [user?._id, user?.tz]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (!identifiers.length) return [];

  const results = await Promise.all(
    identifiers.map((identifier) =>
      StorageModelDef.get({ "sharedWith.userId": identifier }).catch(() => null)
    )
  );

  const merged = new Map();
  for (const result of results) {
    if (result?.success && Array.isArray(result.result)) {
      for (const item of result.result) {
        const key = normalizeRelativePath(item.relativePath || "");
        if (key && !merged.has(key)) {
          merged.set(key, item);
        }
      }
    }
  }

  return Array.from(merged.values());
};

const filterExistingSharedItems = async (items = []) => {
  if (!items.length) return [];

  const existing = [];

  for (const item of items) {
    const relativePath = normalizeRelativePath(item?.relativePath || "");
    if (!relativePath) continue;

    try {
      const storagePath = getStorageRelativePath(relativePath);
      const parentFolder =
        path.posix.dirname(relativePath) === "."
          ? ""
          : normalizeRelativePath(path.posix.dirname(relativePath));
      const parentPayload = buildStoragePayload(parentFolder);
      const { data } = await axios.get(`${STORAGE_API_BASE_URL}/list`, {
        params: parentPayload,
      });
      const parentItems = Array.isArray(data?.items) ? data.items : [];
      const exists = parentItems.some((entry) => {
        const entryPath = normalizeRelativePath(entry?.relativePath || "");
        return entryPath === storagePath;
      });

      if (exists) {
        existing.push(item);
      } else {
        await StorageModelDef.delete({ relativePath }).catch(() => null);
      }
    } catch {
      await StorageModelDef.delete({ relativePath }).catch(() => null);
    }
  }

  return existing;
};

const mergeUniquePaths = (...groups) => {
  const merged = new Set();
  groups.flat().forEach((value) => {
    const safeValue = normalizeRelativePath(value);
    if (safeValue) merged.add(safeValue);
  });
  return Array.from(merged);
};

const mergeStoragePermissionsForShare = (permissions = {}, relativePath = "", role = "read", isDirectory = false) => {
  const safePath = normalizeRelativePath(relativePath);
  const next = {
    view: Array.isArray(permissions.view) ? [...permissions.view] : [],
    create: Array.isArray(permissions.create) ? [...permissions.create] : [],
    update: Array.isArray(permissions.update) ? [...permissions.update] : [],
    delete: Array.isArray(permissions.delete) ? [...permissions.delete] : [],
  };

  next.view = mergeUniquePaths(next.view, [safePath]);

  return next;
};

const arraysEqual = (left = [], right = []) => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

const syncStorageViewPermissionsForUser = async (user = {}, preloadedSharedItems = null) => {
  const safeTz = String(user?.tz || "").trim();
  if (!safeTz) return user?.storagePermissions || {};

  const existingUser = user?._id ? user : await getActiveUserByTz(safeTz);
  if (!existingUser) return user?.storagePermissions || {};

  const sharedItems = Array.isArray(preloadedSharedItems)
    ? preloadedSharedItems
    : await filterExistingSharedItems(await getSharedStorageItemsForUser(existingUser));

  const nextView = Array.from(
    new Set(
      sharedItems
        .map((item) => getClientRelativePath(item?.relativePath || ""))
        .map((entry) => normalizeRelativePath(entry))
        .filter(Boolean)
        .sort()
    )
  );

  const currentPermissions = existingUser.storagePermissions || {};
  const currentView = Array.isArray(currentPermissions.view)
    ? currentPermissions.view.map((entry) => normalizeRelativePath(entry)).filter(Boolean).sort()
    : [];
  const nextPermissions = {
    view: nextView,
    create: Array.isArray(currentPermissions.create) ? currentPermissions.create : [],
    update: Array.isArray(currentPermissions.update) ? currentPermissions.update : [],
    delete: Array.isArray(currentPermissions.delete) ? currentPermissions.delete : [],
  };

  if (!arraysEqual(currentView, nextView)) {
    await UserModelDef.update(
      { tz: existingUser.tz },
      { storagePermissions: nextPermissions },
      "active"
    );
  }

  return nextPermissions;
};

const removePathFromPermissions = (permissions = {}, relativePath = "") => {
  const safePath = normalizeRelativePath(relativePath);
  const shouldKeep = (value) => {
    const safeValue = normalizeRelativePath(value);
    return !(safeValue === safePath || safeValue.startsWith(`${safePath}/`));
  };

  return {
    view: (Array.isArray(permissions.view) ? permissions.view : []).filter(shouldKeep),
    create: (Array.isArray(permissions.create) ? permissions.create : []).filter(shouldKeep),
    update: (Array.isArray(permissions.update) ? permissions.update : []).filter(shouldKeep),
    delete: (Array.isArray(permissions.delete) ? permissions.delete : []).filter(shouldKeep),
  };
};

const cleanupSharedAccessForMetadataItems = async (items = []) => {
  const byUser = new Map();

  for (const item of items) {
    const itemPath = getClientRelativePath(item?.relativePath || "");
    const sharedWith = Array.isArray(item?.sharedWith) ? item.sharedWith : [];

    for (const entry of sharedWith) {
      const userId = String(entry?.userId || "").trim();
      if (!userId) continue;

      if (!byUser.has(userId)) {
        byUser.set(userId, []);
      }
      byUser.get(userId).push(itemPath);
    }
  }

  for (const [userId, paths] of byUser.entries()) {
    const targetUser = await getActiveUserByIdentifier(userId);
    if (!targetUser) continue;
    await syncStorageViewPermissionsForUser(targetUser);
  }
};

const deleteStorageMetadataItems = async (items = []) => {
  await Promise.all(
    items.map((item) => {
      const itemId = String(item?._id || "").trim();
      if (itemId) {
        return StorageModelDef.delete({ _id: itemId }).catch(() => null);
      }

      return StorageModelDef.delete({
        relativePath: normalizeRelativePath(item?.relativePath || ""),
      }).catch(() => null);
    })
  );
};

const renameStorageMetadataTree = async ({
  oldStorageRelativePath = "",
  newStorageRelativePath = "",
  newName = "",
}) => {
  const tree = await getStorageMetadataTree(oldStorageRelativePath);
  if (!tree.length) return [];

  const updatedItems = [];

  for (const item of tree) {
    const nextRelativePath = replacePathPrefix(
      item.relativePath,
      oldStorageRelativePath,
      newStorageRelativePath
    );
    const nextParentPath = replacePathPrefix(
      item.parentPath,
      oldStorageRelativePath,
      newStorageRelativePath
    );
    const nextUrl =
      typeof item.url === "string" && item.url
        ? item.url.replace(normalizeRelativePath(item.relativePath || ""), nextRelativePath)
        : item.url;
    const patch = {
      relativePath: nextRelativePath,
      parentPath: nextParentPath,
      url: nextUrl,
    };

    if (normalizeRelativePath(item.relativePath || "") === normalizeRelativePath(oldStorageRelativePath)) {
      patch.name = String(newName || path.posix.basename(newStorageRelativePath)).trim();
    }

    await StorageModelDef.update(
      item?._id ? { _id: String(item._id).trim() } : { relativePath: normalizeRelativePath(item.relativePath || "") },
      patch
    );

    updatedItems.push({
      ...item,
      ...patch,
    });
  }

  return updatedItems;
};

const renameSharedAccessForMetadataItems = async ({
  items = [],
  oldClientRelativePath = "",
  newClientRelativePath = "",
}) => {
  const affectedUserIds = new Set();

  items.forEach((item) => {
    const sharedWith = Array.isArray(item?.sharedWith) ? item.sharedWith : [];
    sharedWith.forEach((entry) => {
      const userId = String(entry?.userId || "").trim();
      if (userId) {
        affectedUserIds.add(userId);
      }
    });
  });

  for (const userId of affectedUserIds) {
    const targetUser = await getActiveUserByIdentifier(userId);
    if (!targetUser) continue;
    await syncStorageViewPermissionsForUser(targetUser);
  }
};

const getShareRole = (value = "") => {
  const role = String(value || "read").trim().toLowerCase();
  return ["read", "write", "manage"].includes(role) ? role : "read";
};

const getClientAppBaseUrl = (req) => {
  if (CLIENT_APP_URL) {
    return CLIENT_APP_URL;
  }

  const origin = String(req.headers.origin || "").trim();
  if (origin) return origin.replace(/\/+$/, "");

  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${protocol}://${req.get("host")}`;
};

const buildShareLinkItem = (item = {}, rootPath = "") => {
  const safeRoot = normalizeRelativePath(rootPath);
  const safeRelativePath = normalizeRelativePath(item.relativePath || item.path || item.filename || item.name);
  let clientPath = safeRelativePath;

  if (safeRoot) {
    if (safeRelativePath === safeRoot) {
      clientPath = "";
    } else if (safeRelativePath.startsWith(`${safeRoot}/`)) {
      clientPath = safeRelativePath.slice(safeRoot.length + 1);
    }
  }

  return {
    ...item,
    filename: safeRelativePath,
    path: clientPath,
    name: item.name || path.posix.basename(safeRelativePath),
    type: item.isDirectory ? "folder" : item.type || item.ext || "file",
    size: item.isDirectory ? null : item.size ?? null,
    date: item.modifiedAt || item.updatedAt || item.createdAt || item.date || null,
  };
};

const resolveSharedLinkTargetPath = (payload = {}, requestedPath = "") => {
  const rootPath = normalizeRelativePath(payload?.path || "");
  const subPath = normalizeRelativePath(requestedPath);

  if (!rootPath) {
    const error = new Error("Invalid share link root");
    error.status = 400;
    throw error;
  }

  if (!subPath) return rootPath;

  if (subPath === rootPath || subPath.startsWith(`${rootPath}/`)) {
    return subPath;
  }

  return normalizeRelativePath(path.posix.join(rootPath, subPath));
};

const broadcastStorageChange = (action, payload = {}) => {
  try {
    broadcast({
      type: "storage",
      module: "storage",
      action,
      ts: Date.now(),
      ...payload,
    });
  } catch (error) {
    console.error("broadcastStorageChange error:", error.message);
  }
};

const listStorage = async (req, res) => {
  try {
    const scope = await getStorageScope(req, "view", req.query.path || req.query.folder || "");
    const folderDisplayMap = scope.isAdmin ? await buildStorageFolderDisplayMap() : null;
    const { data } = await axios.get(`${STORAGE_API_BASE_URL}/list`, {
      params: buildStoragePayload(scope.folder),
    });
    await ensureStorageMetadataForItems(data?.items || [], {
      ownerUser: scope.user,
      ownerId: scope.isAdmin ? "" : String(scope.user?._id || scope.user?.tz || "").trim(),
    });

    const items = (data?.items || []).map((item) => mapStorageItem(item, {
      userRoot: scope.isAdmin ? "" : scope.userRoot,
      folderDisplayMap,
    }));
    const merged = new Map(
      items.map((item) => [normalizeRelativePath(item.path || item.filename || item.name), item])
    );

    if (!scope.isAdmin && !normalizeRelativePath(req.query.path || req.query.folder || "")) {
      const sharedItems = await filterExistingSharedItems(
        await getSharedStorageItemsForUser(scope.user)
      );
      await syncStorageViewPermissionsForUser(scope.user, sharedItems);
      for (const sharedItem of sharedItems) {
        const mapped = mapStorageItem(
          {
            ...sharedItem,
            isDirectory: sharedItem.type === "folder",
            modifiedAt: sharedItem.updatedAt || sharedItem.createdAt || null,
          },
          { userRoot: "", folderDisplayMap }
        );
        const key = normalizeRelativePath(mapped.path || mapped.filename || mapped.name);
        if (key && !merged.has(key)) {
          merged.set(key, {
            ...mapped,
            shared: true,
            sharedRole:
              (sharedItem.sharedWith || []).find((entry) =>
                [String(scope.user?._id || "").trim(), String(scope.user?.tz || "").trim()].includes(
                  String(entry?.userId || "").trim()
                )
              )?.role || "read",
          });
        }
      }
    }

    const mergedItems = await enrichItemsWithOwner(
      await enrichFolderSizes(Array.from(merged.values()))
    );

    return res.json({
      ok: data?.success !== false,
      success: data?.success !== false,
      path: scope.isAdmin ? scope.folder : stripUserRoot(scope.folder, scope.userRoot),
      folders: mergedItems.filter((entry) => entry.isDirectory),
      files: mergedItems.filter((entry) => !entry.isDirectory),
      items: mergedItems,
    });
  } catch (error) {
    return res.status(error?.response?.status || error.status || 500).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
};

const getStorageStats = async (req, res) => {
  try {
    const scope = await getStorageScope(req, "view", req.query.path || req.query.folder || "");
    const { data } = await axios.get(`${STORAGE_API_BASE_URL}/stats`, {
      params: buildStoragePayload(""),
      timeout: 30000,
    });
    const serverTotalBytes = Number(data?.serverTotalBytes ?? data?.totalBytes ?? 0) || 0;
    const serverFreeBytes = Number(data?.serverFreeBytes ?? data?.freeBytes ?? 0) || 0;
    const serverUsedBytes =
      Number(data?.serverUsedBytes ?? data?.usedBytes) ||
      Math.max(serverTotalBytes - serverFreeBytes, 0);
    const reportedTamheedUsedBytes = Number(data?.tamheedUsedBytes ?? data?.storageUsedBytes);
    const statsFolder = normalizeRelativePath(scope.folder);
    const canUseReportedTamheedUsage = scope.isAdmin && !statsFolder && Number.isFinite(reportedTamheedUsedBytes);
    const scopedUsedBytes = canUseReportedTamheedUsage
      ? reportedTamheedUsedBytes
      : await calculateFolderSize(statsFolder);
    const scopedAvailableBytes = serverFreeBytes;
    const scopedTotalBytes = scopedUsedBytes + scopedAvailableBytes;

    return res.json({
      ok: true,
      success: true,
      source: "global-storage",
      storageApiBaseUrl: STORAGE_API_BASE_URL,
      scope: scope.isAdmin ? "global" : "user",
      path: scope.isAdmin ? statsFolder : stripUserRoot(statsFolder, scope.userRoot),
      storageRoot: statsFolder,
      serverTotalBytes,
      serverFreeBytes,
      serverUsedBytes,
      tamheedUsedBytes: scopedUsedBytes,
      tamheedAvailableBytes: scopedAvailableBytes,
      tamheedTotalBytes: scopedTotalBytes,
      displayTotalBytes: scopedTotalBytes || serverTotalBytes,
      displayUsedBytes: scopedUsedBytes,
      displayAvailableBytes: scopedAvailableBytes,
      global: data,
    });
  } catch (error) {
    return res.status(error?.response?.status || error.status || 500).json({
      success: false,
      message: `Global storage stats failed: ${getErrorMessage(error)}`,
    });
  }
};

const createFolder = async (req, res) => {
  try {
    const folderName = normalizeRelativePath(req.body.name || "");
    if (!folderName || folderName.includes("/")) {
      return res.status(400).json({ success: false, message: "Folder name is required" });
    }

    const scope = await getStorageScope(req, "create", req.body.path || req.body.folder || "");
    const folder = normalizeRelativePath(path.posix.join(scope.folder, folderName));
    const { data } = await axios.post(`${STORAGE_API_BASE_URL}/folder`, buildStoragePayload(folder));
    await createStorageMetadata(
      buildStorageMetadataPayload({
        type: "folder",
        name: folderName,
        ownerId: scope.user?._id || scope.user?.tz || req.user?.tz || "",
        relativePath: folder,
      })
    );
    const clientPath = scope.isAdmin ? folder : stripUserRoot(folder, scope.userRoot);
    broadcastStorageChange("folder_created", {
      path: clientPath,
      scope: scope.isAdmin ? "global" : "user",
    });

    return res.status(201).json({
      ok: data?.success !== false,
      success: data?.success !== false,
      folder: {
        name: folderName,
        filename: folder,
        path: clientPath,
        type: "folder",
        isDirectory: true,
      },
      storage: data,
    });
    
  } catch (error) {
    return res.status(error?.response?.status || error.status || 500).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
};

const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    const scope = await getStorageScope(req, "create", req.body.path || req.body.folder || req.query.path || "");
    const uploadName = normalizeUploadFileName(
      req.body.name || req.body.filename || "",
      req.file.originalname
    );
    console.info("[storage] upload:normal:start", {
      fileName: uploadName,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      requestedPath: req.body.path || req.body.folder || req.query.path || "",
      scopeFolder: scope.folder,
      userTz: req.user?.tz,
    });
    const form = new FormData();
    form.append("dbName", STORAGE_DB_NAME);
    form.append("collection", STORAGE_COLLECTION);
    form.append("folder", scope.folder);
    const fileBody = req.file.path ? fs.createReadStream(req.file.path) : req.file.buffer;
    form.append("file", fileBody, {
      filename: uploadName,
      contentType: req.file.mimetype,
      knownLength: req.file.size,
    });
    const formLength = await getFormLength(form);
    console.info("[storage] upload:normal:forward", {
      target: `${STORAGE_API_BASE_URL}/upload`,
      fileName: uploadName,
      size: req.file.size,
      formLength,
      scopeFolder: scope.folder,
    });
    const headers = {
      ...form.getHeaders(),
      ...(formLength ? { "Content-Length": formLength } : {}),
    };
    const { data } = await axios.post(`${STORAGE_API_BASE_URL}/upload`, form, {
      headers,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 30 * 60 * 1000,
    });
    console.info("[storage] upload:normal:global-success", {
      fileName: data?.filename || uploadName,
      relativePath: data?.relativePath,
      size: data?.size,
    });
    const storageRelativePath = normalizeRelativePath(
      data?.relativePath
        ? getClientRelativePath(data.relativePath)
        : path.posix.join(scope.folder, data?.filename || uploadName)
    );
    await createStorageMetadata(
      buildStorageMetadataPayload({
        type: "file",
        name: data?.filename || uploadName,
        ownerId: scope.user?._id || scope.user?.tz || req.user?.tz || "",
        relativePath: storageRelativePath,
        url: data?.url || data?.secure_url || null,
        mimeType: data?.mimetype || req.file.mimetype || "",
        size: data?.size ?? req.file.size ?? null,
      })
    );
    const mappedFile = mapStorageItem({
      ...data,
      isDirectory: false,
      name: data.filename,
      size: data.size,
      modifiedAt: new Date(),
    }, { userRoot: scope.isAdmin ? "" : scope.userRoot });
    broadcastStorageChange("file_uploaded", {
      path: mappedFile.path,
      name: mappedFile.name,
      scope: scope.isAdmin ? "global" : "user",
    });

    return res.status(201).json({
      ok: data?.success !== false,
      success: data?.success !== false,
      file: mappedFile,
      storage: data,
    });
  } catch (error) {
    console.error("[storage] upload:normal:error", {
      status: error?.response?.status || error.status,
      message: getErrorMessage(error),
      response: error?.response?.data,
      userTz: req.user?.tz,
    });
    return res.status(error?.response?.status || error.status || 500).json({
      success: false,
      message: getErrorMessage(error),
    });
  } finally {
    if (req.file?.path) {
      fs.promises.unlink(req.file.path).catch(() => {});
    }
  }
};

const uploadChunk = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, success: false, message: "chunk required" });
    }

    const uploadId = safeUploadId(req.body.uploadId);
    const fileName = safeFileName(req.body.fileName || "file");
    const chunkIndex = Number(req.body.chunkIndex);
    const totalChunks = Number(req.body.totalChunks);
    const chunkSize = Number(req.body.chunkSize || req.file?.size || 0);
    console.info("[storage] upload-chunk:received", {
      uploadId,
      chunkIndex,
      totalChunks,
      size: req.file?.size,
      fileName,
      path: req.body.path || req.body.folder || "",
      userTz: req.user?.tz,
    });

    if (
      !uploadId ||
      !Number.isInteger(chunkIndex) ||
      !Number.isInteger(totalChunks) ||
      totalChunks <= 0 ||
      totalChunks > MAX_CHUNKS_PER_UPLOAD
    ) {
      return res.status(400).json({ ok: false, success: false, message: "invalid chunk metadata" });
    }

    if (chunkIndex < 0 || chunkIndex >= totalChunks) {
      return res.status(400).json({ ok: false, success: false, message: "invalid chunk index" });
    }

    const scope = await getStorageScope(req, "create", req.body.path || req.body.folder || "");
    const previousSession = await readUploadSession(uploadId);
    if (previousSession?.status === "canceled") {
      return res.status(409).json({ ok: false, success: false, message: "upload was canceled" });
    }

    await writeUploadSession({
      ...(previousSession || {}),
      uploadId,
      fileName,
      totalChunks,
      chunkSize,
      path: scope.folder,
      targetPath: req.body.path || req.body.folder || "",
      status: "uploading",
      userId: String(req.user?._id || req.user?.tz || ""),
      receivedChunks: previousSession?.receivedChunks || [],
    });
    console.info("[storage] upload-chunk:forward", {
      uploadId,
      chunkIndex,
      totalChunks,
      target: `${STORAGE_API_BASE_URL}/upload-chunk`,
      scopeFolder: scope.folder,
      size: req.file.size,
    });
    const form = new FormData();
    form.append("chunk", req.file.buffer, {
      filename: `${chunkIndex}.part`,
      contentType: req.file.mimetype || "application/octet-stream",
      knownLength: req.file.size,
    });
    form.append("dbName", STORAGE_DB_NAME);
    form.append("collection", STORAGE_COLLECTION);
    form.append("folder", scope.folder);
    form.append("path", scope.folder);
    form.append("uploadId", uploadId);
    form.append("fileName", fileName);
    form.append("chunkIndex", String(chunkIndex));
    form.append("totalChunks", String(totalChunks));
    form.append("chunkSize", String(chunkSize));

    const formLength = await getFormLength(form);
    const { data } = await axios.post(`${STORAGE_API_BASE_URL}/upload-chunk`, form, {
      headers: {
        ...form.getHeaders(),
        ...(formLength ? { "Content-Length": formLength } : {}),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 30 * 60 * 1000,
    });
    console.info("[storage] upload-chunk:global-success", {
      uploadId,
      chunkIndex,
      totalChunks,
      response: data,
    });
    const currentSession = await readUploadSession(uploadId);
    const receivedChunks = new Set(currentSession?.receivedChunks || []);
    receivedChunks.add(chunkIndex);
    await writeUploadSession({
      ...(currentSession || {}),
      uploadId,
      fileName,
      totalChunks,
      chunkSize,
      path: scope.folder,
      targetPath: req.body.path || req.body.folder || "",
      status: "uploading",
      userId: String(req.user?._id || req.user?.tz || ""),
      receivedChunks: Array.from(receivedChunks),
    });

    return res.json({
      ...(data || {}),
      ok: true,
      success: true,
      uploadId,
      chunkIndex,
      totalChunks,
      receivedBytes: req.file.size,
    });
  } catch (error) {
    console.error("[storage] upload-chunk:error", {
      status: error?.response?.status || error.status,
      message: getErrorMessage(error),
      response: error?.response?.data,
      uploadId: req.body?.uploadId,
      chunkIndex: req.body?.chunkIndex,
      userTz: req.user?.tz,
    });
    return res.status(error?.response?.status || error.status || 500).json({
      ok: false,
      success: false,
      message: getErrorMessage(error),
    });
  }
};

const getUploadStatus = async (req, res) => {
  try {
    const uploadId = safeUploadId(req.query.uploadId || req.body?.uploadId);
    if (!uploadId) {
      return res.status(400).json({ ok: false, success: false, message: "uploadId is required" });
    }

    const localSession = await readUploadSession(uploadId);
    let remoteStatus = null;

    try {
      const { data } = await axios.get(`${STORAGE_API_BASE_URL}/upload-status`, {
        params: { uploadId },
        timeout: 60 * 1000,
      });
      remoteStatus = data;
    } catch (error) {
      if (error?.response?.status && error.response.status !== 404) {
        console.warn("[storage] upload-status:global-error", {
          uploadId,
          status: error.response.status,
          message: getErrorMessage(error),
        });
      }
    }

    const totalChunks = Number(remoteStatus?.totalChunks ?? localSession?.totalChunks ?? 0) || 0;
    const receivedChunks = Array.from(new Set([
      ...((localSession?.receivedChunks || []).map(Number)),
      ...((remoteStatus?.receivedChunks || []).map(Number)),
    ])).filter((index) => Number.isInteger(index) && index >= 0).sort((a, b) => a - b);
    const missingChunks = remoteStatus?.missingChunks || getMissingChunks(receivedChunks, totalChunks);
    const status = remoteStatus?.status || localSession?.status || "not_found";

    return res.json({
      ok: true,
      success: true,
      uploadId,
      fileName: remoteStatus?.fileName || localSession?.fileName || "",
      totalChunks,
      chunkSize: Number(remoteStatus?.chunkSize ?? localSession?.chunkSize ?? 0) || 0,
      path: remoteStatus?.path || localSession?.path || "",
      receivedChunks,
      missingChunks,
      status,
      createdAt: remoteStatus?.createdAt || localSession?.createdAt || null,
      updatedAt: remoteStatus?.updatedAt || localSession?.updatedAt || null,
    });
  } catch (error) {
    console.error("[storage] upload-status:error", {
      uploadId: req.query?.uploadId || req.body?.uploadId,
      message: getErrorMessage(error),
    });
    return res.status(error?.response?.status || error.status || 500).json({
      ok: false,
      success: false,
      message: getErrorMessage(error),
    });
  }
};

const cancelUpload = async (req, res) => {
  try {
    const uploadId = safeUploadId(req.body?.uploadId || req.query?.uploadId);
    if (!uploadId) {
      return res.status(400).json({ ok: false, success: false, message: "uploadId is required" });
    }

    const session = await readUploadSession(uploadId);
    await writeUploadSession({
      ...(session || {}),
      uploadId,
      status: "canceled",
      receivedChunks: session?.receivedChunks || [],
    });

    let remote = null;
    try {
      const { data } = await axios.post(`${STORAGE_API_BASE_URL}/cancel-upload`, { uploadId }, { timeout: 60 * 1000 });
      remote = data;
    } catch (error) {
      if (error?.response?.status && error.response.status !== 404) {
        console.warn("[storage] cancel-upload:global-error", {
          uploadId,
          status: error.response.status,
          message: getErrorMessage(error),
        });
      }
    }

    return res.json({
      ok: true,
      success: true,
      uploadId,
      status: "canceled",
      remote,
    });
  } catch (error) {
    console.error("[storage] cancel-upload:error", {
      uploadId: req.body?.uploadId || req.query?.uploadId,
      message: getErrorMessage(error),
    });
    return res.status(error?.response?.status || error.status || 500).json({
      ok: false,
      success: false,
      message: getErrorMessage(error),
    });
  }
};

const mergeChunks = async (req, res) => {
  try {
    const uploadId = safeUploadId(req.body.uploadId);
    const fileName = safeFileName(req.body.fileName || req.body.name || "file");
    const totalChunks = Number(req.body.totalChunks);
    console.info("[storage] merge-chunks:start", {
      uploadId,
      fileName,
      totalChunks,
      path: req.body.path || req.body.folder || "",
      size: req.body.size,
      userTz: req.user?.tz,
    });

    if (
      !uploadId ||
      !fileName ||
      !Number.isInteger(totalChunks) ||
      totalChunks <= 0 ||
      totalChunks > MAX_CHUNKS_PER_UPLOAD
    ) {
      return res.status(400).json({ ok: false, success: false, message: "invalid merge metadata" });
    }

    const scope = await getStorageScope(req, "create", req.body.path || req.body.folder || "");
    console.info("[storage] merge-chunks:forward", {
      uploadId,
      fileName,
      totalChunks,
      target: `${STORAGE_API_BASE_URL}/merge-chunks`,
      scopeFolder: scope.folder,
    });
    const { data } = await axios.post(
      `${STORAGE_API_BASE_URL}/merge-chunks`,
      {
        dbName: STORAGE_DB_NAME,
        collection: STORAGE_COLLECTION,
        folder: scope.folder,
        path: scope.folder,
        uploadId,
        fileName,
        totalChunks,
        mimeType: req.body.mimeType || "",
      },
      {
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 30 * 60 * 1000,
      }
    );
    console.info("[storage] merge-chunks:global-success", {
      uploadId,
      fileName: data?.fileName || data?.filename || fileName,
      relativePath: data?.relativePath,
      size: data?.size,
    });
    const previousSession = await readUploadSession(uploadId);
    await writeUploadSession({
      ...(previousSession || {}),
      uploadId,
      fileName,
      totalChunks,
      chunkSize: Number(previousSession?.chunkSize || req.body.chunkSize || 0) || 0,
      path: previousSession?.path || req.body.path || req.body.folder || "",
      status: "completed",
      receivedChunks: Array.from({ length: totalChunks }, (_, index) => index),
    });
    const storageRelativePath = normalizeRelativePath(
      data?.relativePath
        ? getClientRelativePath(data.relativePath)
        : path.posix.join(scope.folder, data?.fileName || data?.filename || fileName)
    );
    const fileSize = Number(data?.size ?? data?.bytes ?? req.body.size ?? 0) || null;

    await createStorageMetadata(
      buildStorageMetadataPayload({
        type: "file",
        name: data?.fileName || data?.filename || fileName,
        ownerId: scope.user?._id || scope.user?.tz || req.user?.tz || "",
        relativePath: storageRelativePath,
        url: data?.url || data?.secure_url || null,
        mimeType: data?.mimeType || data?.mimetype || req.body.mimeType || "",
        size: fileSize,
      })
    );

    const mappedFile = mapStorageItem(
      {
        ...data,
        filename: storageRelativePath,
        relativePath: storageRelativePath,
        name: data?.fileName || data?.filename || fileName,
        size: fileSize,
        modifiedAt: new Date(),
        isDirectory: false,
        type: data?.mimeType || data?.mimetype || req.body.mimeType || "file",
      },
      { userRoot: scope.isAdmin ? "" : scope.userRoot }
    );

    broadcastStorageChange("file_uploaded", {
      path: mappedFile.path,
      name: mappedFile.name,
      scope: scope.isAdmin ? "global" : "user",
    });

    return res.status(201).json({
      ...(data || {}),
      ok: true,
      success: true,
      fileName: data?.fileName || data?.filename || fileName,
      relativePath: storageRelativePath,
      path: mappedFile.path,
      file: mappedFile,
    });
  } catch (error) {
    console.error("[storage] merge-chunks:error", {
      status: error?.response?.status || error.status,
      message: getErrorMessage(error),
      response: error?.response?.data,
      uploadId: req.body?.uploadId,
      userTz: req.user?.tz,
    });
    return res.status(error?.response?.status || error.status || 500).json({
      ok: false,
      success: false,
      message: getErrorMessage(error),
    });
  }
};

const deleteEntry = async (req, res) => {
  try {
    const relativePath = normalizeRelativePath(
      req.body?.relativePath ||
      req.body?.url ||
      req.params[0] ||
      req.params.filename ||
      ""
    );
    
    if (!relativePath) {
      return res.status(400).json({ success: false, message: "relativePath is required" });
    }

    const scope = await getStorageScope(req, "delete", relativePath);
    const storageRelativePath = getStorageRelativePath(scope.folder);
    await ensureStorageMetadataRecord({
      type: req.body?.isDirectory ? "folder" : "file",
      name: req.body?.name || path.posix.basename(storageRelativePath),
      ownerId: scope.user?._id || scope.user?.tz || req.user?.tz || "",
      relativePath: storageRelativePath,
      url: req.body?.url || null,
      mimeType: req.body?.mimeType || "",
      size: req.body?.size ?? null,
    });
    const metadataTree = await getStorageMetadataTree(storageRelativePath);
    const deleteResponse = await axios.delete(`${STORAGE_API_BASE_URL}/delete`, {
      data: { relativePath: storageRelativePath },
    });
    const { data } = deleteResponse;

    if (metadataTree.length > 0) {
      await cleanupSharedAccessForMetadataItems(metadataTree);
      await deleteStorageMetadataItems(metadataTree);
    }

    broadcastStorageChange("entry_deleted", {
      path: relativePath,
      scope: scope.isAdmin ? "global" : "user",
    });

    return res.json({
      ok: data?.success !== false,
      success: data?.success !== false,
      deleted: data?.deleted !== false,
      storage: data,
    });
  } catch (error) {
    return res.status(error?.response?.status || error.status || 500).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
};

const renameFile = async (req, res) => {
  try {
    const requestedRelativePath = normalizeRelativePath(
      req.body?.relativePath ||
      req.body?.path ||
      req.body?.filename ||
      ""
    );

    if (!requestedRelativePath) {
      return res.status(400).json({
        success: false,
        message: "relativePath is required",
      });
    }

    const scope = await getStorageScope(req, "update", requestedRelativePath);
    const storageRelativePath = getStorageRelativePath(scope.folder);
    await ensureStorageMetadataRecord({
      type: req.body?.isDirectory ? "folder" : "file",
      name: req.body?.name || path.posix.basename(storageRelativePath),
      ownerId: scope.user?._id || scope.user?.tz || req.user?.tz || "",
      relativePath: storageRelativePath,
      url: req.body?.url || null,
      mimeType: req.body?.mimeType || "",
      size: req.body?.size ?? null,
    });
    const newName = normalizeUploadFileName(
      req.body?.newName || req.body?.name || "",
      path.posix.basename(storageRelativePath)
    );

    if (!newName) {
      return res.status(400).json({
        success: false,
        message: "newName is required",
      });
    }

    console.log("renameFile relativePath", storageRelativePath, "newName", newName);

    const parentFolder =
      path.posix.dirname(storageRelativePath) === "."
        ? ""
        : path.posix.dirname(storageRelativePath);
    const oldClientRelativePath = getClientRelativePath(storageRelativePath);

    const renameResponse = await axios.patch(`${STORAGE_API_BASE_URL}/rename`, {
      relativePath: storageRelativePath,
      newName,
    });

    const newStorageRelativePath =
      normalizeRelativePath(
        renameResponse.data?.newRelativePath ||
        renameResponse.data?.relativePath ||
        ""
      ) ||
      path.posix.join(parentFolder, newName);
    const newClientRelativePath = getClientRelativePath(newStorageRelativePath);

    const renamedMetadataItems = await renameStorageMetadataTree({
      oldStorageRelativePath: storageRelativePath,
      newStorageRelativePath: newStorageRelativePath,
      newName,
    });

    if (renamedMetadataItems.length > 0) {
      await renameSharedAccessForMetadataItems({
        items: renamedMetadataItems,
        oldClientRelativePath,
        newClientRelativePath,
      });
    }

    const mappedFile = mapStorageItem(
      {
        ...renameResponse.data,
        isDirectory: renameResponse.data?.type === "directory",
        name: renameResponse.data?.name || newName,
        filename: renameResponse.data?.name || newName,
        path: newStorageRelativePath,
        relativePath: newStorageRelativePath,
        url: renameResponse.data?.url || null,
        modifiedAt: new Date(),
      },
      { userRoot: scope.isAdmin ? "" : scope.userRoot }
    );

    broadcastStorageChange("file_renamed", {
      path: requestedRelativePath,
      newPath: mappedFile.path,
      name: mappedFile.name,
      scope: scope.isAdmin ? "global" : "user",
    });

    return res.json({
      ok: renameResponse.data?.success !== false,
      success: renameResponse.data?.success !== false,
      file: mappedFile,
      storage: renameResponse.data,
    });
  } catch (error) {
    return res.status(error?.response?.status || error.status || 500).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
};

const shareEntry = async (req, res) => {
  try {
    const requestedRelativePath = normalizeRelativePath(
      req.body?.relativePath ||
      req.body?.path ||
      req.body?.filename ||
      ""
    );
    const targetTz = String(req.body?.targetTz || req.body?.tz || "").trim();
    const role = "read";

    if (!requestedRelativePath) {
      return res.status(400).json({
        success: false,
        message: "relativePath is required",
      });
    }

    if (!targetTz) {
      return res.status(400).json({
        success: false,
        message: "targetTz is required",
      });
    }

    const scope = await getStorageScope(req, "update", requestedRelativePath);
    const storageRelativePath = normalizeRelativePath(scope.folder);
    const ownerIdentifiers = [
      String(scope.user?._id || "").trim(),
      String(scope.user?.tz || "").trim(),
    ].filter(Boolean);

    let metadata = await getStorageMetadataByPath(storageRelativePath);
    if (!metadata) {
      metadata = await ensureStorageMetadataRecord({
        type: req.body?.isDirectory ? "folder" : "file",
        name: req.body?.name || path.posix.basename(storageRelativePath),
        ownerId: ownerIdentifiers[0] || req.user?.tz || "",
        relativePath: storageRelativePath,
        url: req.body?.url || null,
        mimeType: req.body?.mimeType || "",
        size: req.body?.size ?? null,
      });
    }

    const ownerId = String(metadata?.ownerId || "").trim();
    if (!scope.isAdmin && ownerId && !ownerIdentifiers.includes(ownerId)) {
      return res.status(403).json({
        success: false,
        message: "Only the owner can share this item",
      });
    }

    const targetUser = await getActiveUserByTz(targetTz);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "Target user not found",
      });
    }

    const targetUserId = String(targetUser._id || targetUser.tz || "").trim();
    const nextSharedWith = [
      ...(Array.isArray(metadata?.sharedWith) ? metadata.sharedWith : []).filter(
        (entry) => String(entry?.userId || "").trim() !== targetUserId
      ),
      { userId: targetUserId, role },
    ];

    await StorageModelDef.update(
      { relativePath: storageRelativePath },
      { sharedWith: nextSharedWith }
    );

    await syncStorageViewPermissionsForUser(targetUser);

    broadcastStorageChange("entry_shared", {
      path: getClientRelativePath(storageRelativePath),
      targetTz: targetUser.tz,
      role,
      scope: scope.isAdmin ? "global" : "user",
    });

    return res.json({
      success: true,
      ok: true,
      sharedWith: nextSharedWith,
      targetUser: {
        tz: targetUser.tz,
        firstname: targetUser.firstname,
        lastname: targetUser.lastname,
      },
      role,
    });
  } catch (error) {
    return res.status(error?.response?.status || error.status || 500).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
};

const getShareStatus = async (req, res) => {
  try {
    const requestedRelativePath = normalizeRelativePath(
      req.query?.relativePath ||
      req.query?.path ||
      req.query?.filename ||
      ""
    );

    if (!requestedRelativePath) {
      return res.status(400).json({
        success: false,
        message: "relativePath is required",
      });
    }

    const scope = await getStorageScope(req, "view", requestedRelativePath);
    const storageRelativePath = normalizeRelativePath(scope.folder);
    const metadata =
      (await getStorageMetadataByPath(storageRelativePath)) ||
      (await ensureStorageMetadataRecord({
        type: req.query?.isDirectory === "true" ? "folder" : "file",
        name: req.query?.name || path.posix.basename(storageRelativePath),
        ownerId: scope.user?._id || scope.user?.tz || req.user?.tz || "",
        relativePath: storageRelativePath,
      }));
    const sharedWith = Array.isArray(metadata?.sharedWith) ? metadata.sharedWith : [];

    const users = [];
    for (const entry of sharedWith) {
      const user = await getActiveUserByIdentifier(entry.userId);
      if (user) {
        users.push({
          userId: String(user._id || entry.userId || "").trim(),
          tz: user.tz,
          firstname: user.firstname,
          lastname: user.lastname,
          role: entry.role || "read",
        });
      }
    }

    return res.json({
      success: true,
      ok: true,
      sharedWith: users,
    });
  } catch (error) {
    return res.status(error?.response?.status || error.status || 500).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
};

const unshareEntry = async (req, res) => {
  try {
    const requestedRelativePath = normalizeRelativePath(
      req.body?.relativePath ||
      req.body?.path ||
      req.body?.filename ||
      ""
    );
    const targetTz = String(req.body?.targetTz || req.body?.tz || "").trim();

    if (!requestedRelativePath) {
      return res.status(400).json({
        success: false,
        message: "relativePath is required",
      });
    }

    if (!targetTz) {
      return res.status(400).json({
        success: false,
        message: "targetTz is required",
      });
    }

    const scope = await getStorageScope(req, "update", requestedRelativePath);
    const storageRelativePath = normalizeRelativePath(scope.folder);
    const metadata = await getStorageMetadataByPath(storageRelativePath);

    if (!metadata) {
      return res.status(404).json({
        success: false,
        message: "Storage metadata not found",
      });
    }

    const targetUser = await getActiveUserByTz(targetTz);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "Target user not found",
      });
    }

    const targetUserId = String(targetUser._id || targetUser.tz || "").trim();
    const nextSharedWith = (Array.isArray(metadata.sharedWith) ? metadata.sharedWith : []).filter(
      (entry) => String(entry?.userId || "").trim() !== targetUserId
    );

    await StorageModelDef.update(
      { relativePath: storageRelativePath },
      { sharedWith: nextSharedWith }
    );

    await syncStorageViewPermissionsForUser(targetUser);

    broadcastStorageChange("entry_unshared", {
      path: getClientRelativePath(storageRelativePath),
      targetTz: targetUser.tz,
      scope: scope.isAdmin ? "global" : "user",
    });

    return res.json({
      success: true,
      ok: true,
      sharedWith: nextSharedWith,
      targetUser: {
        tz: targetUser.tz,
        firstname: targetUser.firstname,
        lastname: targetUser.lastname,
      },
    });
  } catch (error) {
    return res.status(error?.response?.status || error.status || 500).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
};

const createShareLink = async (req, res) => {
  try {
    const requestedRelativePath = normalizeRelativePath(
      req.body?.relativePath ||
      req.body?.path ||
      req.body?.filename ||
      ""
    );

    if (!requestedRelativePath) {
      return res.status(400).json({
        success: false,
        message: "relativePath is required",
      });
    }

    const scope = await getStorageScope(req, "view", requestedRelativePath);
    const storageRelativePath = normalizeRelativePath(scope.folder);
    let metadata = await getStorageMetadataByPath(storageRelativePath);

    if (!metadata) {
      metadata = await ensureStorageMetadataRecord({
        type: req.body?.isDirectory ? "folder" : "file",
        name: req.body?.name || path.posix.basename(storageRelativePath),
        ownerId: scope.user?._id || scope.user?.tz || req.user?.tz || "",
        relativePath: storageRelativePath,
        url: req.body?.url || null,
        mimeType: req.body?.mimeType || "",
        size: req.body?.size ?? null,
      });
    }

    const token = signStorageShareLinkToken({
      path: storageRelativePath,
      type: metadata?.type || (req.body?.isDirectory ? "folder" : "file"),
      name: metadata?.name || path.posix.basename(storageRelativePath),
      mode: "view",
    });

    const clientBaseUrl = getClientAppBaseUrl(req);
    const shareUrl = `${clientBaseUrl}/files?shareToken=${encodeURIComponent(token)}`;

    return res.json({
      success: true,
      ok: true,
      url: shareUrl,
      token,
      expiresIn: STORAGE_SHARE_LINK_TTL,
      item: {
        type: metadata?.type || "file",
        name: metadata?.name || path.posix.basename(storageRelativePath),
        path: getClientRelativePath(storageRelativePath),
      },
    });
  } catch (error) {
    return res.status(error?.response?.status || error.status || 500).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
};

const getShareLinkInfo = async (req, res) => {
  try {
    const token = String(req.params?.token || "").trim();
    if (!token) {
      return res.status(400).json({
        success: false,
        message: "token is required",
      });
    }

    const payload = verifyStorageShareLinkToken(token);
    const metadata = await getStorageMetadataByPath(payload.path);

    return res.json({
      success: true,
      ok: true,
      token,
      rootPath: normalizeRelativePath(payload.path),
      item: buildShareLinkItem(
        {
          ...(metadata || {}),
          type: metadata?.type || payload.type || "file",
          name: metadata?.name || payload.name || path.posix.basename(payload.path),
          relativePath: payload.path,
          isDirectory: (metadata?.type || payload.type) === "folder",
        },
        normalizeRelativePath(payload.path)
      ),
      mode: "view",
      expiresIn: STORAGE_SHARE_LINK_TTL,
    });
  } catch (error) {
    const status =
      error?.name === "TokenExpiredError" || error?.name === "JsonWebTokenError"
        ? 401
        : error?.response?.status || error.status || 500;

    return res.status(status).json({
      success: false,
      message:
        error?.name === "TokenExpiredError"
          ? "Share link expired"
          : error?.name === "JsonWebTokenError"
            ? "Invalid share link"
            : getErrorMessage(error),
    });
  }
};

const listSharedLinkItems = async (req, res) => {
  try {
    const token = String(req.params?.token || "").trim();
    const payload = verifyStorageShareLinkToken(token);
    const rootPath = normalizeRelativePath(payload.path);
    const requestedSubPath = normalizeRelativePath(req.query?.path || "");

    if ((payload.type || "file") !== "folder") {
      const metadata =
        (await getStorageMetadataByPath(rootPath)) ||
        (await ensureStorageMetadataRecord({
          type: payload.type || "file",
          name: payload.name || path.posix.basename(rootPath),
          ownerId: "",
          relativePath: rootPath,
        }));
      const item = buildShareLinkItem(
        {
          ...(metadata || {}),
          type: metadata?.type || payload.type || "file",
          name: metadata?.name || payload.name || path.posix.basename(rootPath),
          relativePath: rootPath,
          isDirectory: false,
        },
        rootPath
      );

      return res.json({
        success: true,
        ok: true,
        path: "",
        items: [item],
      });
    }

    const targetPath = resolveSharedLinkTargetPath(payload, requestedSubPath);
    const { data } = await axios.get(`${STORAGE_API_BASE_URL}/list`, {
      params: buildStoragePayload(targetPath),
    });
    await ensureStorageMetadataForItems(data?.items || [], { ownerId: "" });

    const items = (data?.items || []).map((item) =>
      buildShareLinkItem(
        {
          ...item,
          isDirectory: Boolean(item.isDirectory),
        },
        rootPath
      )
    );

    return res.json({
      success: true,
      ok: true,
      path: requestedSubPath,
      items,
      folders: items.filter((item) => item.isDirectory),
      files: items.filter((item) => !item.isDirectory),
    });
  } catch (error) {
    const status =
      error?.name === "TokenExpiredError" || error?.name === "JsonWebTokenError"
        ? 401
        : error?.response?.status || error.status || 500;

    return res.status(status).json({
      success: false,
      message:
        error?.name === "TokenExpiredError"
          ? "Share link expired"
          : error?.name === "JsonWebTokenError"
            ? "Invalid share link"
            : getErrorMessage(error),
    });
  }
};

const getSharedLinkOpenLink = async (req, res) => {
  try {
    const token = String(req.params?.token || "").trim();
    const payload = verifyStorageShareLinkToken(token);
    const requestedSubPath = normalizeRelativePath(req.body?.path || req.query?.path || "");
    const targetPath = resolveSharedLinkTargetPath(payload, requestedSubPath);
    const displayName = path.posix.basename(targetPath);
    const signedFileToken = signStorageAccessToken({
      path: targetPath,
      download: false,
      displayName,
      sharedLink: true,
    });
    const targetUrl = new URL(
      `${STORAGE_FILE_BASE_URL.replace(/\/+$/, "")}/${encodeURIComponent(displayName || "file")}`
    );
    targetUrl.searchParams.set("token", signedFileToken);

    return res.json({
      success: true,
      ok: true,
      url: targetUrl.toString(),
    });
  } catch (error) {
    const status =
      error?.name === "TokenExpiredError" || error?.name === "JsonWebTokenError"
        ? 401
        : error?.response?.status || error.status || 500;

    return res.status(status).json({
      success: false,
      message:
        error?.name === "TokenExpiredError"
          ? "Share link expired"
          : error?.name === "JsonWebTokenError"
            ? "Invalid share link"
            : getErrorMessage(error),
    });
  }
};

const openEntry = async (req, res) => {
  try {
    const requestedRelativePath = normalizeRelativePath(
      req.query?.path ||
      req.query?.relativePath ||
      req.params?.path ||
      ""
    );

    if (!requestedRelativePath) {
      return res.status(400).json({
        success: false,
        message: "path is required",
      });
    }

    const scope = await getStorageScope(req, "view", requestedRelativePath);
    const storageRelativePath = getStorageRelativePath(scope.folder);
    await ensureStorageMetadataRecord({
      type: req.query?.isDirectory === "true" ? "folder" : "file",
      name: req.query?.name || path.posix.basename(storageRelativePath),
      ownerId: scope.user?._id || scope.user?.tz || req.user?.tz || "",
      relativePath: storageRelativePath,
    });
    const targetUrl = buildCentralFileUrl(storageRelativePath, {
      download: req.query?.download === "1" || req.path.endsWith("/download"),
    });

    return res.redirect(302, targetUrl);
  } catch (error) {
    return res.status(error?.response?.status || error.status || 500).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
};

const getSignedOpenLink = async (req, res) => {
  try {
    const requestedRelativePath = normalizeRelativePath(
      req.body?.path ||
      req.body?.relativePath ||
      req.query?.path ||
      req.query?.relativePath ||
      ""
    );

    if (!requestedRelativePath) {
      return res.status(400).json({
        success: false,
        message: "path is required",
      });
    }

    const download = req.body?.download === true || req.query?.download === "1";
    const scope = await getStorageScope(req, "view", requestedRelativePath);
    const storageRelativePath = getStorageRelativePath(scope.folder);
    await ensureStorageMetadataRecord({
      type: req.body?.isDirectory ? "folder" : "file",
      name: req.body?.name || path.posix.basename(storageRelativePath),
      ownerId: scope.user?._id || scope.user?.tz || req.user?.tz || "",
      relativePath: storageRelativePath,
      url: req.body?.url || null,
      mimeType: req.body?.mimeType || "",
      size: req.body?.size ?? null,
    });
    const displayName = path.posix.basename(storageRelativePath);
    const token = signStorageAccessToken({
      path: storageRelativePath,
      download,
      displayName,
      tz: req.user?.tz || "",
    });
    const encodedName = encodeURIComponent(displayName || "file");
    const targetUrl = new URL(
      `${STORAGE_FILE_BASE_URL.replace(/\/+$/, "")}/${encodedName}`
    );
    targetUrl.searchParams.set("token", token);
    if (download) {
      targetUrl.searchParams.set("download", "1");
    }

    return res.json({
      success: true,
      url: targetUrl.toString(),
      expiresIn: STORAGE_SIGNED_URL_TTL,
    });
  } catch (error) {
    return res.status(error?.response?.status || error.status || 500).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
};

const openSignedEntry = async (req, res) => {
  try {
    const token = String(req.query?.token || "").trim();

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "token is required",
      });
    }

    const payload = verifyStorageAccessToken(token);
    const storageRelativePath = normalizeRelativePath(payload?.path || "");

    if (!storageRelativePath) {
      return res.status(400).json({
        success: false,
        message: "Invalid token payload",
      });
    }

    const targetUrl = buildCentralFileUrl(storageRelativePath, {
      download: Boolean(payload?.download) || req.path.endsWith("/download-signed"),
    });

    return res.redirect(302, targetUrl);
  } catch (error) {
    const status =
      error?.name === "TokenExpiredError" || error?.name === "JsonWebTokenError"
        ? 401
        : error?.response?.status || error.status || 500;

    return res.status(status).json({
      success: false,
      message:
        error?.name === "TokenExpiredError"
          ? "Signed link expired"
          : error?.name === "JsonWebTokenError"
            ? "Invalid signed link"
            : getErrorMessage(error),
    });
  }
};

module.exports = {
  STORAGE_API_BASE_URL,
  STORAGE_FILE_BASE_URL,
  STORAGE_COLLECTION,
  STORAGE_DB_NAME,
  buildUserStorageFolder,
  ensureStorageMetadataForPhysicalItem,
  ensureUserStorageFolder,
  syncStorageViewPermissionsForUser,
  listStorage,
  getStorageStats,
  getSignedOpenLink,
  getUploadStatus,
  cancelUpload,
  uploadChunk,
  mergeChunks,
  createShareLink,
  getShareStatus,
  unshareEntry,
  getShareLinkInfo,
  listSharedLinkItems,
  getSharedLinkOpenLink,
  createFolder,
  uploadFile,
  deleteEntry,
  renameFile,
  shareEntry,
  openEntry,
  openSignedEntry,
};
