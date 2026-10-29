// Keeps each player's cut-out photo in step with the student's photo:
// made when a student with a photo becomes a player (or changes photo),
// removed when the player or the photo goes. Jobs run one at a time, in the
// background, so a save never waits for the model and the 2GB server never
// runs two at once.
const { photoVersion } = require("../utils/photoVersion");
const { logWithSource } = require("../middleware/logger");

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const DOWNLOAD_MS = 30 * 1000;
const RETRY_AFTER_MS = 10 * 60 * 1000; // a Drive or network failure waits this long
const OBJECT_ID = /^[a-f0-9]{24}$/i;
const rows = (r) => (r?.success && Array.isArray(r.result) ? r.result : []);

const failure = (code, message) => Object.assign(new Error(message || code), { code });

// The whole photo, from the request to the last byte, within `ms`; a stalled
// download is cut so the queue moves on.
const download = (files, fileId, { ms = DOWNLOAD_MS, limit = MAX_PHOTO_BYTES } = {}) =>
  new Promise((resolve, reject) => {
    let stream = null;
    let done = false;
    const end = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (fn === reject) stream?.destroy?.();
      fn(value);
    };
    const timer = setTimeout(() => end(reject, failure("TIMEOUT", "photo download timed out")), ms);
    (async () => {
      stream = await files.downloadStream(fileId);
      if (done) return stream.destroy?.();
      const parts = [];
      let size = 0;
      for await (const chunk of stream) {
        size += chunk.length;
        if (size > limit) throw failure("TOO_LARGE", "photo too large");
        parts.push(chunk);
      }
      return end(resolve, Buffer.concat(parts));
    })().catch((err) => end(reject, err));
  });

// Dependencies are injectable so the job can be tested without a database,
// Drive or the model. Defaults are required late: Sport.controller requires
// this file.
function createPlayerPhotoJob(deps = {}) {
  const d = () => ({
    ensureSport: deps.ensureSport || require("../Entities/Sport/Sport.controller").ensureFootball,
    players: deps.players || require("../Entities/Sport/SportPlayer.model").SportPlayerModelDef,
    photos: deps.photos || require("../Entities/Sport/SportPlayerPhoto.model").SportPlayerPhotoModelDef,
    students: deps.students || require("../Entities/Student/Student.model").StudentModelDef,
    files: deps.files || require("./googleDrive.service"),
    make: deps.make || require("./playerPhoto.service").makeInWorker,
    changed: deps.changed || ((studentId) => {
      const { notifyChange, liveHub } = require("./liveHub");
      notifyChange("player", studentId);
      liveHub.toStudents([studentId], "me");
    }),
    log: deps.log || logWithSource,
    now: deps.now || Date.now,
  });

  let warnedNoModel = false;
  // studentId -> { version, until }: a failed download is not tried again
  // before `until`.
  const backoff = new Map();

  // Brings one student's player photo up to date. Never throws.
  const refresh = async (studentId) => {
    const x = d();
    try {
      const id = String(studentId);
      if (!OBJECT_ID.test(id)) return "skipped";
      const sport = await x.ensureSport();
      const sportId = String(sport._id);
      const key = { studentId: id, sportId };
      const [studentRows, playerRows] = await Promise.all([x.students.get({ _id: id }), x.players.get(key)]);
      const student = rows(studentRows)[0];
      const player = rows(playerRows)[0];
      const version = photoVersion(student?.photo);

      // Not a player, or no photo: no player photo either.
      if (!player || !version) {
        await x.photos.delete(key);
        if (player?.photoCutout) {
          await x.players.updateExisting({ _id: player._id }, { photoCutout: null, photoCutoutFailed: null });
          x.changed(id);
        }
        return "removed";
      }
      if (player.photoCutout === version || player.photoCutoutFailed === version) return "current";
      const wait = backoff.get(id);
      if (wait && wait.version === version && x.now() < wait.until) return "later";

      const fileId = x.files.extractFileId(student.photo);
      if (!fileId) return "skipped";
      let image;
      try {
        image = await x.make(await download(x.files, fileId));
      } catch (err) {
        if (err?.code === "NO_MODEL") {
          if (!warnedNoModel) x.log("playerPhoto", err);
          warnedNoModel = true;
          return "no-model";
        }
        // This photo cannot be cut out (no person found, not an image, too
        // large): not tried again until the photo changes.
        if (["NO_PERSON", "BAD_IMAGE", "TOO_LARGE"].includes(err?.code)) {
          await x.players.updateExisting({ _id: player._id }, { photoCutoutFailed: version });
          return "failed";
        }
        // A Drive or network failure: tried again after a while.
        backoff.set(id, { version, until: x.now() + RETRY_AFTER_MS });
        throw err;
      }
      backoff.delete(id);

      // The model took a while: the student, the player or the photo may be
      // gone by now. Checked before storing and again after, so a deletion
      // that lands in between still wins.
      const stillWanted = async () => {
        const [s, p] = await Promise.all([x.students.get({ _id: id }), x.players.get(key)]);
        return Boolean(rows(p)[0]) && photoVersion(rows(s)[0]?.photo) === version;
      };
      if (!(await stillWanted())) return "removed";
      await x.photos.put(key, { ...key, sourceVersion: version, image, contentType: "image/webp", createdAt: new Date() });
      const marked = await x.players.updateExisting(
        { _id: player._id },
        { photoCutout: version, photoCutoutFailed: null },
      );
      if (!marked?.result || !(await stillWanted())) {
        await x.photos.delete(key);
        return "removed";
      }
      x.changed(id);
      return "made";
    } catch (err) {
      x.log("playerPhoto", err);
      return "error";
    }
  };

  // One at a time; a student already waiting is not queued twice.
  const waiting = new Set();
  let chain = Promise.resolve();
  const schedule = (studentId) => {
    const id = String(studentId);
    if (waiting.has(id)) return chain;
    waiting.add(id);
    chain = chain.then(() => {
      waiting.delete(id);
      return refresh(id);
    });
    return chain;
  };

  // Removes a student's player photos at once, without the queue: a deleted
  // student or photo must not wait behind other jobs (or a restart).
  const remove = async (studentId) => {
    const x = d();
    await x.photos.delete({ studentId: String(studentId) });
  };

  // The stored picture, only when it matches the student's current photo.
  const read = async (studentId, photoLink) => {
    const x = d();
    const version = photoVersion(photoLink);
    if (!version) return null;
    const sport = await x.ensureSport();
    const doc = rows(await x.photos.get({ studentId: String(studentId), sportId: String(sport._id) }))[0];
    if (!doc || doc.sourceVersion !== version || !doc.image) return null;
    const image = Buffer.isBuffer(doc.image) ? doc.image : Buffer.from(doc.image.buffer ?? doc.image);
    return { image, contentType: doc.contentType || "image/webp" };
  };

  return { refresh, schedule, remove, read };
}

const playerPhotoJob = createPlayerPhotoJob();

// What a card needs to know: whether the cut-out matches the current photo.
const cutoutReady = (player, photoLink) => Boolean(player?.photoCutout) && player.photoCutout === photoVersion(photoLink);

module.exports = { createPlayerPhotoJob, playerPhotoJob, cutoutReady, download };
