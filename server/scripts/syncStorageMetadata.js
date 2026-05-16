const path = require("path");
const dotenv = require("dotenv");
const axios = require("axios");

dotenv.config({ path: path.resolve(__dirname, "../config/.env") });
dotenv.config();

const { UserModelDef } = require("../Entities/User/User.model");
const { StorageModelDef } = require("../Entities/Storage/Storage.model");
const {
  STORAGE_DB_NAME,
  STORAGE_COLLECTION,
  STORAGE_API_BASE_URL,
  buildUserStorageFolder,
  ensureStorageMetadataForPhysicalItem,
} = require("../Entities/Storage/Storage.controller");

const APPLY = process.argv.includes("--apply");
const USER_FILTER_TZ = String(
  process.argv.find((arg) => arg.startsWith("--tz="))?.slice(5) || ""
).trim();

const normalizeRelativePath = (value = "") =>
  String(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .join("/");

const buildStoragePayload = (folder = "") => ({
  dbName: STORAGE_DB_NAME,
  collection: STORAGE_COLLECTION,
  folder: normalizeRelativePath(folder),
});

const getMetadataByStorageRelativePath = async (relativePath = "") => {
  const result = await StorageModelDef.get({
    relativePath: normalizeRelativePath(relativePath),
  }).catch(() => null);

  if (result?.success && Array.isArray(result.result) && result.result.length > 0) {
    return result.result[0];
  }

  return null;
};

const scanFolder = async (folder = "", ownerUser = null, stats = null) => {
  const { data } = await axios.get(`${STORAGE_API_BASE_URL}/list`, {
    params: buildStoragePayload(folder),
  });
  const items = Array.isArray(data?.items) ? data.items : [];

  for (const item of items) {
    const storageRelativePath = normalizeRelativePath(item?.relativePath || "");
    if (!storageRelativePath) continue;

    stats.discovered += 1;
    const existing = await getMetadataByStorageRelativePath(storageRelativePath);

    if (!existing) {
      stats.missing += 1;
      if (APPLY) {
        await ensureStorageMetadataForPhysicalItem(item, { ownerUser });
        stats.created += 1;
      }
    }

    if (item?.isDirectory) {
      const nextFolder = normalizeRelativePath(
        storageRelativePath.replace(
          new RegExp(`^${STORAGE_DB_NAME}/${STORAGE_COLLECTION}/?`),
          ""
        )
      );
      await scanFolder(nextFolder, ownerUser, stats);
    }
  }
};

async function main() {
  const response = await UserModelDef.get({}, "active");
  const allUsers = response?.success && Array.isArray(response.result) ? response.result : [];
  const users = USER_FILTER_TZ
    ? allUsers.filter((user) => String(user?.tz || "").trim() === USER_FILTER_TZ)
    : allUsers;

  console.log(
    `${APPLY ? "Syncing" : "Scanning"} storage metadata for ${users.length} active users...`
  );

  let discovered = 0;
  let missing = 0;
  let created = 0;

  for (const user of users) {
    const folder = buildUserStorageFolder(user);
    if (!folder) continue;

    const stats = { discovered: 0, missing: 0, created: 0 };
    console.log(`- ${user.tz}: ${folder}`);

    try {
      await scanFolder(folder, user, stats);
      discovered += stats.discovered;
      missing += stats.missing;
      created += stats.created;
      console.log(
        `  discovered=${stats.discovered}, missing=${stats.missing}, created=${stats.created}`
      );
    } catch (error) {
      console.error(`  failed: ${error?.message || error}`);
    }
  }

  console.log(
    `Done. discovered=${discovered}, missing=${missing}, created=${created}, mode=${APPLY ? "apply" : "dry-run"}`
  );
}

main().catch((error) => {
  console.error("storage metadata sync failed:", error?.message || error);
  process.exitCode = 1;
});
