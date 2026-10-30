// Keeps a passport version (white background, 35:45, see makePassportPhoto)
// of every student's and user's photo. Made when a photo is uploaded, and by
// a sweep at start and every half hour that also makes the ones still
// missing (photos from before this existed, one at a time) and drops those
// whose photo is gone. Rows are keyed by the original's Drive file id: a new
// photo is a new file, so a row never shows an old photo. Each sweep also
// checks every row's original is still a public picture in Drive (not made
// private, trashed or deleted, however that happened); a row not confirmed
// within VALID_MS is not served.
const { download } = require("./playerPhotoJob");
const { logWithSource } = require("../middleware/logger");

const RETRY_AFTER_MS = 10 * 60 * 1000; // a Drive or network failure waits this long
const SWEEP_MS = 30 * 60 * 1000;
const FIRST_SWEEP_MS = 60 * 1000; // after start, once the server has settled
const VALID_MS = 2 * 60 * 60 * 1000; // a row is served this long after its original was last confirmed public
const CHECK_MS = 15 * 1000; // a Drive check that takes longer counts as failed (tried again later)
const FILE_ID = /^[\w-]{10,200}$/;
const rows = (r) => (r?.success && Array.isArray(r.result) ? r.result : []);

// The photo links of every student and every user (all rooms).
async function allPhotoLinks() {
  const api = require("../Entities/api");
  const { StudentModelDef } = require("../Entities/Student/Student.model");
  const { UserModelDef } = require("../Entities/User/User.model");
  const sources = [
    [StudentModelDef.dbName, StudentModelDef.collections.active],
    ...Object.values(UserModelDef.collections).map((c) => [UserModelDef.dbName, c]),
  ];
  const links = [];
  for (const [dbName, collection] of sources) {
    const r = await api.readPage({
      dbName, collection, filter: { photo: { $nin: [null, ""] } }, limit: 0, projection: { photo: 1 },
    });
    for (const row of r?.result || []) links.push(String(row.photo));
  }
  return links;
}

function createPassportPhotoJob(deps = {}) {
  const d = () => ({
    store: deps.store || require("../Entities/Photo/PassportPhoto.model").PassportPhotoModelDef,
    files: deps.files || require("./googleDrive.service"),
    make: deps.make || ((photo) => require("./playerPhoto.service").makeInWorker(photo, { kind: "passport" })),
    links: deps.links || allPhotoLinks,
    log: deps.log || logWithSource,
    now: deps.now || Date.now,
  });

  const fileIdOf = (link) => {
    const id = link ? d().files.extractFileId(link) : null;
    return id && FILE_ID.test(id) ? id : null;
  };

  let warnedNoModel = false;
  const backoff = new Map(); // fileId -> retry not before
  // Photos removed (their Drive file deleted): never made again, and one
  // being made meanwhile is not kept. A Drive file id is never reused, and
  // the process runs alone (deploy/ecosystem.config.js).
  const forgotten = new Set();

  // Whether the original is a picture anyone with its link can already see.
  // Throws (a retryable failure) when Drive does not answer in time.
  const isPublic = (x, fileId) => {
    let timer;
    const late = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("Drive check timed out"), { code: "TIMEOUT" })), CHECK_MS);
    });
    return Promise.race([x.files.isPublicImage(fileId), late]).finally(() => clearTimeout(timer));
  };

  // Makes the passport version of one Drive file, unless there is one. Never throws.
  const refresh = async (fileId) => {
    const x = d();
    try {
      if (!FILE_ID.test(String(fileId || "")) || forgotten.has(fileId)) return "skipped";
      if (rows(await x.store.get({ fileId })).length) return "current";
      const until = backoff.get(fileId);
      if (until && x.now() < until) return "later";

      let image;
      try {
        // Only a picture anyone with its link can already see: a photo field
        // pointing at a private Drive file never makes it public here.
        if (!(await isPublic(x, fileId))) throw Object.assign(new Error("not a public image"), { code: "NOT_PUBLIC" });
        image = await x.make(await download(x.files, fileId));
      } catch (err) {
        if (err?.code === "NO_MODEL") {
          if (!warnedNoModel) x.log("passportPhoto", err);
          warnedNoModel = true;
          return "no-model";
        }
        // Not public (now): nothing stored, asked again by a later sweep, so
        // it is made once the original is public again.
        if (err?.code === "NOT_PUBLIC") {
          backoff.set(fileId, x.now() + RETRY_AFTER_MS);
          return "not-public";
        }
        // No picture at all, or too large: not tried again.
        if (["BAD_IMAGE", "TOO_LARGE"].includes(err?.code)) {
          if (!forgotten.has(fileId)) await x.store.put(fileId, { failed: true, image: null, contentType: null, createdAt: new Date() });
          return "failed";
        }
        backoff.set(fileId, x.now() + RETRY_AFTER_MS);
        throw err;
      }
      backoff.delete(fileId);
      if (forgotten.has(fileId)) return "removed";
      await x.store.put(fileId, { failed: false, image, contentType: "image/jpeg", createdAt: new Date(), checkedAt: new Date(x.now()) });
      // Removed while it was being stored: the removal wins.
      if (forgotten.has(fileId)) {
        await x.store.delete({ fileId });
        return "removed";
      }
      return "made";
    } catch (err) {
      x.log("passportPhoto", err);
      return "error";
    }
  };

  // One at a time (the model needs most of the 2GB server); a file already
  // waiting is not queued twice.
  const waiting = new Set();
  let chain = Promise.resolve();
  const enqueue = (fileId) => {
    if (waiting.has(fileId)) return chain;
    waiting.add(fileId);
    chain = chain.then(() => {
      waiting.delete(fileId);
      return refresh(fileId);
    });
    return chain;
  };

  // A photo link was stored: its passport version is made in the background.
  const schedule = (link) => {
    const fileId = fileIdOf(link);
    return fileId ? enqueue(fileId) : Promise.resolve("skipped");
  };

  // A photo is gone (its Drive file deleted): so is its passport version, at once.
  const forget = async (link) => {
    const fileId = fileIdOf(link);
    if (!fileId) return;
    forgotten.add(fileId);
    await d().store.delete({ fileId });
  };

  // The passport picture of a Drive file, or null (not made yet, or failed).
  const read = async (fileId) => {
    if (!FILE_ID.test(String(fileId || "")) || forgotten.has(String(fileId))) return null;
    const x = d();
    const doc = rows(await x.store.get({ fileId: String(fileId) }))[0];
    if (!doc || doc.failed || !doc.image) return null;
    // Not confirmed public lately (Drive unreachable, or the sweep stopped):
    // the photo link itself is shown instead, with Google's own access rules.
    const checked = doc.checkedAt ? new Date(doc.checkedAt).getTime() : 0;
    if (!(x.now() - checked < VALID_MS)) return null;
    const image = Buffer.isBuffer(doc.image) ? doc.image : Buffer.from(doc.image.buffer ?? doc.image);
    return { image, contentType: doc.contentType || "image/jpeg" };
  };

  // Drops the rows no photo uses any more, checks the others' originals
  // are still public, then queues the missing ones. A row is dropped as unused
  // only when two sweeps in a row found no photo using it: the reads are not
  // one snapshot (a user moving between rooms can be missed once).
  let sweeping = false;
  let unusedBefore = new Set();
  const sweep = async () => {
    if (sweeping) return { removed: 0, revoked: 0, queued: 0 };
    sweeping = true;
    const x = d();
    try {
      // Rows first, then the photos: a row is only made after its photo link
      // is stored, so a photo uploaded meanwhile is never taken for unused.
      const stored = new Set(await x.store.listFileIds());
      const wanted = new Set((await x.links()).map(fileIdOf).filter(Boolean));
      let removed = 0;
      let revoked = 0;
      const unused = new Set();
      for (const fileId of stored) {
        if (wanted.has(fileId) || waiting.has(fileId)) {
          let ok;
          try {
            ok = await isPublic(x, fileId);
          } catch (err) {
            x.log("passportPhoto.check", err);
            continue; // not confirmed: stops being served after VALID_MS
          }
          if (ok) {
            await x.store.touch(fileId, { checkedAt: new Date(x.now()) });
          } else {
            // Not forgotten: made again once it is public again (the
            // check runs before any download).
            await x.store.delete({ fileId });
            revoked += 1;
          }
          continue;
        }
        if (!unusedBefore.has(fileId)) {
          unused.add(fileId);
          continue;
        }
        await x.store.delete({ fileId });
        removed += 1;
      }
      unusedBefore = unused;
      let queued = 0;
      for (const fileId of wanted) {
        if (stored.has(fileId) || waiting.has(fileId) || forgotten.has(fileId)) continue;
        enqueue(fileId);
        queued += 1;
      }
      return { removed, revoked, queued };
    } catch (err) {
      x.log("passportPhoto.sweep", err);
      return { removed: 0, revoked: 0, queued: 0 };
    } finally {
      sweeping = false;
    }
  };

  const start = () => {
    setTimeout(sweep, FIRST_SWEEP_MS).unref?.();
    setInterval(sweep, SWEEP_MS).unref?.();
  };

  return { refresh, schedule, forget, read, sweep, start, idle: () => chain };
}

const passportPhotoJob = createPassportPhotoJob();

module.exports = { createPassportPhotoJob, passportPhotoJob };
