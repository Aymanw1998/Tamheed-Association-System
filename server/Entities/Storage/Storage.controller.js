const axios = require("axios");
const FormData = require("form-data");
const path = require("path");
const { UserModelDef } = require("../User/User.model");
const { broadcast } = require("../../utils/sse");

const STORAGE_DB_NAME = process.env.DB_NAME || "tamheed_db";
const STORAGE_COLLECTION = process.env.STORAGE_COLLECTION || "root";
const STORAGE_API_BASE_URL = (
  process.env.CENTRAL_STORAGE_API_URL ||
  `${process.env.API_URI || "https://api.wahbani.com"}/api/storage`
).replace(/\/+$/, "");

const ADMIN_ROLES = new Set(["ادارة", "إدارة", "الادارة", "الإدارة", "admin", "administrator"]);

const normalizeRelativePath = (value = "") => {
  return String(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .join("/");
};

const getErrorMessage = (error) => {
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

const buildUserStorageFolder = (user = {}) => {
  return normalizeRelativePath(user.storageFolder || user.tz || user._id || "user");
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

const hasSharedPermission = (user = {}, action = "view", requestedPath = "") => {
  const permissions = user.storagePermissions || {};
  const allowedPaths = Array.isArray(permissions[action]) ? permissions[action] : [];
  const safeRequestedPath = normalizeRelativePath(requestedPath);

  return allowedPaths.some((allowedPath) => {
    const safeAllowedPath = normalizeRelativePath(allowedPath);
    return safeRequestedPath === safeAllowedPath || safeRequestedPath.startsWith(`${safeAllowedPath}/`);
  });
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

  return {
    ...item,
    name: item.name || path.posix.basename(relativePath),
    filename: relativePath,
    path: clientPath,
    type: isDirectory ? "folder" : item.ext || item.type || "file",
    isDirectory,
    size: isDirectory ? null : item.size ?? null,
    date: item.modifiedAt || item.date || item.createdAt || null,
    url: isDirectory ? null : item.url,
  };
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
    const { data } = await axios.get(`${STORAGE_API_BASE_URL}/list`, {
      params: buildStoragePayload(scope.folder),
    });

    const items = (data?.items || []).map((item) => mapStorageItem(item, {
      userRoot: scope.isAdmin ? "" : scope.userRoot,
    }));

    return res.json({
      ok: data?.success !== false,
      success: data?.success !== false,
      path: scope.isAdmin ? scope.folder : stripUserRoot(scope.folder, scope.userRoot),
      folders: items.filter((entry) => entry.isDirectory),
      files: items.filter((entry) => !entry.isDirectory),
      items,
    });
  } catch (error) {
    return res.status(error?.response?.status || error.status || 500).json({
      success: false,
      message: getErrorMessage(error),
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
    const form = new FormData();
    form.append("dbName", STORAGE_DB_NAME);
    form.append("collection", STORAGE_COLLECTION);
    form.append("folder", scope.folder);
    form.append("file", req.file.buffer, {
      filename: uploadName,
      contentType: req.file.mimetype,
      knownLength: req.file.size,
    });

    const { data } = await axios.post(`${STORAGE_API_BASE_URL}/upload`, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
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
    return res.status(error?.response?.status || error.status || 500).json({
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
    const deleteResponse = await axios.delete(`${STORAGE_API_BASE_URL}/delete`, {
      data: { relativePath: storageRelativePath },
    });
    const { data } = deleteResponse;
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

    const relativePath = normalizeRelativePath(STORAGE_DB_NAME + "/" + STORAGE_COLLECTION + "/" + (
      req.body?.relativePath ||
      req.body?.path ||
      req.body?.filename ||
      ""
    ));

    const newName = normalizeUploadFileName(
      req.body?.newName || req.body?.name || "",
      path.posix.basename(relativePath)
    );

    console.log("renameFile relativePath", relativePath, "newName", newName);
    if (!relativePath) {
      return res.status(400).json({
        success: false,
        message: "relativePath is required",
      });
    }

    if (!newName) {
      return res.status(400).json({
        success: false,
        message: "newName is required",
      });
    }

    const scope = await getStorageScope(req, "update", relativePath);

    const storageRelativePath = getStorageRelativePath(scope.folder);
    const oldClientPath = getClientRelativePath(storageRelativePath);

    const parentFolder =
      path.posix.dirname(oldClientPath) === "."
        ? ""
        : path.posix.dirname(oldClientPath);
    console.log(storageRelativePath, newName);
    const renameResponse = await axios.put(`${STORAGE_API_BASE_URL}/renameF`, {
      oldPath: storageRelativePath,
      newName,
    });

    const newStorageRelativePath =
      renameResponse.data?.newPath ||
      path.posix.join(parentFolder, newName);

    const mappedFile = mapStorageItem(
      {
        ...renameResponse.data,
        isDirectory: renameResponse.data?.isDirectory ?? false,
        name: renameResponse.data?.name || newName,
        filename: renameResponse.data?.name || newName,
        path: newStorageRelativePath,
        relativePath: newStorageRelativePath,
        url: getPublicStorageUrl(newStorageRelativePath),
        modifiedAt: new Date(),
      },
      { userRoot: scope.isAdmin ? "" : scope.userRoot }
    );

    broadcastStorageChange("file_renamed", {
      path: relativePath,
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

module.exports = {
  STORAGE_API_BASE_URL,
  STORAGE_COLLECTION,
  STORAGE_DB_NAME,
  buildUserStorageFolder,
  ensureUserStorageFolder,
  listStorage,
  createFolder,
  uploadFile,
  deleteEntry,
  renameFile,
};
