const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../config/.env") });
dotenv.config();

const { UserModelDef } = require("../Entities/User/User.model");
const { StorageModelDef } = require("../Entities/Storage/Storage.model");

const STORAGE_DB_NAME = process.env.DB_NAME || "tamheed_db";
const STORAGE_COLLECTION = process.env.STORAGE_COLLECTION || "root";
const STORAGE_API_BASE_URL = (
  process.env.CENTRAL_STORAGE_API_URL ||
  `${process.env.API_URI || "https://api.wahbani.com"}/api/storage`
).replace(/\/+$/, "");
const STORAGE_FILE_BASE_URL = (
  process.env.CENTRAL_STORAGE_FILE_BASE_URL ||
  `${STORAGE_API_BASE_URL}/file`
).replace(/\/+$/, "");
const STORAGE_SIGNED_URL_SECRET =
  process.env.STORAGE_SIGNED_URL_SECRET ||
  process.env.JWT_ACCESS_SECRET ||
  "storage-temp-secret";
const USER_FILTER_TZ = String(
  process.argv.find((arg) => arg.startsWith("--tz="))?.slice(5) || ""
).trim();
const APPLY = process.argv.includes("--apply");

const normalizeRelativePath = (value = "") =>
  String(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .join("/");

const getStorageRelativePath = (relativePath = "") =>
  normalizeRelativePath(path.posix.join(STORAGE_DB_NAME, STORAGE_COLLECTION, normalizeRelativePath(relativePath)));

const getClientRelativePath = (relativePath = "") =>
  normalizeRelativePath(relativePath).replace(
    new RegExp(`^${STORAGE_DB_NAME}/${STORAGE_COLLECTION}/?`),
    ""
  );

const buildCurrentUserFolder = (user = {}) =>
  normalizeRelativePath(user.storageFolder || user.tz || user._id || "user");

const buildLegacyUserFolder = (user = {}) =>
  normalizeRelativePath(user.tz || user._id || "user");

const buildTargetUserFolder = (user = {}) =>
  normalizeRelativePath(path.posix.join("users", normalizeRelativePath(user.tz || user._id || "user")));

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

const buildSignedFileUrl = (storageRelativePath = "", displayName = "file") => {
  const token = jwt.sign(
    {
      path: normalizeRelativePath(storageRelativePath),
      displayName: String(displayName || path.posix.basename(storageRelativePath) || "file").trim(),
      download: false,
    },
    STORAGE_SIGNED_URL_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "5m",
    }
  );

  const encodedName = encodeURIComponent(String(displayName || "file").trim() || "file");
  return `${STORAGE_FILE_BASE_URL}/${encodedName}?token=${encodeURIComponent(token)}`;
};

const listGlobalFolder = async (folder = "") => {
  const { data } = await axios.get(`${STORAGE_API_BASE_URL}/list`, {
    params: {
      dbName: STORAGE_DB_NAME,
      collection: STORAGE_COLLECTION,
      folder: normalizeRelativePath(folder),
    },
  });

  return Array.isArray(data?.items) ? data.items : [];
};

const ensureGlobalFolder = async (folder = "") => {
  await axios.post(`${STORAGE_API_BASE_URL}/folder`, {
    dbName: STORAGE_DB_NAME,
    collection: STORAGE_COLLECTION,
    folder: normalizeRelativePath(folder),
  });
};

const uploadBufferToGlobalFolder = async ({
  buffer,
  folder = "",
  fileName = "file",
  mimeType = "application/octet-stream",
}) => {
  const form = new FormData();
  form.append("dbName", STORAGE_DB_NAME);
  form.append("collection", STORAGE_COLLECTION);
  form.append("folder", normalizeRelativePath(folder));
  form.append("customFileName", fileName);
  form.append("file", buffer, {
    filename: fileName,
    contentType: mimeType,
  });

  await axios.post(`${STORAGE_API_BASE_URL}/upload`, form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
};

const deleteGlobalPath = async (storageRelativePath = "") => {
  await axios.delete(`${STORAGE_API_BASE_URL}/delete`, {
    data: { relativePath: normalizeRelativePath(storageRelativePath) },
  });
};

const downloadGlobalFile = async (storageRelativePath = "", displayName = "") => {
  const url = buildSignedFileUrl(storageRelativePath, displayName);
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  return Buffer.from(response.data);
};

const migrateFolderTree = async (sourceFolder = "", targetFolder = "") => {
  const source = normalizeRelativePath(sourceFolder);
  const target = normalizeRelativePath(targetFolder);

  await ensureGlobalFolder(target);
  const items = await listGlobalFolder(source);

  for (const item of items) {
    const itemName = String(item?.name || "").trim();
    if (!itemName) continue;

    const sourceChild = normalizeRelativePath(path.posix.join(source, itemName));
    const targetChild = normalizeRelativePath(path.posix.join(target, itemName));
    const sourceStorageRelativePath = normalizeRelativePath(item.relativePath || getStorageRelativePath(sourceChild));

    if (item.isDirectory) {
      await migrateFolderTree(sourceChild, targetChild);
      continue;
    }

    const bytes = await downloadGlobalFile(sourceStorageRelativePath, itemName);
    await uploadBufferToGlobalFolder({
      buffer: bytes,
      folder: target,
      fileName: itemName,
      mimeType: item.mimetype || item.mimeType || "application/octet-stream",
    });
  }
};

const updateStorageMetadataPaths = async (fromFolder = "", toFolder = "") => {
  const oldStoragePrefix = getStorageRelativePath(fromFolder);
  const newStoragePrefix = getStorageRelativePath(toFolder);
  const metadataResponse = await StorageModelDef.get({});
  const items = metadataResponse?.success && Array.isArray(metadataResponse.result)
    ? metadataResponse.result
    : [];

  const affectedItems = items.filter((item) => {
    const relativePath = normalizeRelativePath(item.relativePath || "");
    return relativePath === oldStoragePrefix || relativePath.startsWith(`${oldStoragePrefix}/`);
  });

  for (const item of affectedItems) {
    const nextRelativePath = replacePathPrefix(item.relativePath, oldStoragePrefix, newStoragePrefix);
    const nextParentPath = replacePathPrefix(item.parentPath, oldStoragePrefix, newStoragePrefix);
    const nextUrl = item.url
      ? item.url.replace(normalizeRelativePath(item.relativePath || ""), normalizeRelativePath(nextRelativePath))
      : item.url;

    await StorageModelDef.update(
      { _id: item._id },
      {
        relativePath: nextRelativePath,
        parentPath: nextParentPath,
        url: nextUrl,
      }
    );
  }

  return affectedItems.length;
};

const updateUsersPermissionsPaths = async (fromFolder = "", toFolder = "") => {
  const usersResponse = await UserModelDef.get({}, "active");
  const users = usersResponse?.success && Array.isArray(usersResponse.result)
    ? usersResponse.result
    : [];
  let updatedUsers = 0;

  for (const user of users) {
    const permissions = user.storagePermissions || {};
    let changed = false;
    const nextPermissions = {};

    ["view", "create", "update", "delete"].forEach((action) => {
      const currentPaths = Array.isArray(permissions[action]) ? permissions[action] : [];
      const nextPaths = currentPaths.map((entry) => {
        const replaced = replacePathPrefix(entry, fromFolder, toFolder);
        if (replaced !== normalizeRelativePath(entry)) {
          changed = true;
        }
        return replaced;
      });

      nextPermissions[action] = Array.from(new Set(nextPaths.filter(Boolean)));
    });

    if (!changed) continue;

    await UserModelDef.update(
      { tz: user.tz },
      { storagePermissions: nextPermissions },
      "active"
    );
    updatedUsers += 1;
  }

  return updatedUsers;
};

async function main() {
  const usersResponse = await UserModelDef.get({}, "active");
  const users = usersResponse?.success && Array.isArray(usersResponse.result)
    ? usersResponse.result
    : [];
  const scopedUsers = USER_FILTER_TZ
    ? users.filter((user) => String(user.tz || "").trim() === USER_FILTER_TZ)
    : users;

  const migrations = scopedUsers
    .map((user) => {
      const currentFolder = buildCurrentUserFolder(user);
      const legacyFolder = buildLegacyUserFolder(user);
      const targetFolder = buildTargetUserFolder(user);

      return {
        user,
        currentFolder,
        legacyFolder,
        targetFolder,
        needsMigration:
          Boolean(currentFolder) &&
          currentFolder === legacyFolder &&
          currentFolder !== targetFolder,
      };
    })
    .filter((entry) => entry.needsMigration);

  console.log(`Found ${migrations.length} user storage folders to migrate.`);
  migrations.forEach(({ user, currentFolder, targetFolder }) => {
    console.log(`- ${user.tz}: ${currentFolder} -> ${targetFolder}`);
  });

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to migrate.");
    return;
  }

  if (migrations.length === 0) {
    console.log("Nothing to migrate.");
    return;
  }

  await ensureGlobalFolder("users");

  for (const { user, currentFolder, targetFolder } of migrations) {
    console.log(`Migrating ${user.tz}: ${currentFolder} -> ${targetFolder}`);

    await ensureGlobalFolder(targetFolder);
    await migrateFolderTree(currentFolder, targetFolder);
    const updatedMetadata = await updateStorageMetadataPaths(currentFolder, targetFolder);
    const updatedUsers = await updateUsersPermissionsPaths(currentFolder, targetFolder);
    await UserModelDef.update(
      { tz: user.tz },
      { storageFolder: targetFolder },
      "active"
    );
    await deleteGlobalPath(getStorageRelativePath(currentFolder)).catch(() => null);

    console.log(
      `Migrated ${user.tz}. Metadata updated: ${updatedMetadata}. Users permissions updated: ${updatedUsers}.`
    );
  }

  console.log("Migration completed.");
}

main().catch((error) => {
  console.error("Migration failed:", error?.message || error);
  process.exitCode = 1;
});
