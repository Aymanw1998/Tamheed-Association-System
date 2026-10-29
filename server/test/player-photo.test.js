const assert = require("node:assert/strict");
const test = require("node:test");
const { PassThrough } = require("node:stream");
const sharp = require("sharp");

const {
  makePlayerPhoto, keepMainPerson, keepRowsUnder, personBox, frameFor, modelSize, PhotoError, OUT_W, OUT_H,
} = require("../services/playerPhoto.service");
const { createPlayerPhotoJob, cutoutReady } = require("../services/playerPhotoJob");
const { photoVersion } = require("../utils/photoVersion");

// An alpha plane with the given rectangles opaque.
const plane = (width, height, rects) => {
  const a = Buffer.alloc(width * height);
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) a[y * width + x] = 255;
  }
  return a;
};
const opaque = (a, width, x, y) => a[y * width + x] > 0;

test("the model gets a shortest side of 512 and sides in multiples of 32", () => {
  assert.deepEqual(modelSize(1024, 768), { width: 672, height: 512 });
  assert.deepEqual(modelSize(363, 550), { width: 512, height: 768 });
});

test("a second figure apart from the player is dropped", () => {
  // Player 20 wide, a smaller figure at the far right.
  const a = plane(60, 40, [[10, 5, 29, 39], [50, 20, 55, 39]]);
  const kept = keepMainPerson(a, 60, 40);
  assert.ok(opaque(kept, 60, 20, 20));
  assert.ok(!opaque(kept, 60, 52, 30));
});

test("a neighbour's arm touching the player lower down is dropped row by row", () => {
  // Head at 15-25, body 5-35 from row 20; an arm at 45-50 from row 10 that
  // joins the body through a strip on rows 34-39.
  const a = plane(60, 40, [[15, 2, 25, 19], [5, 20, 35, 39], [45, 10, 50, 39], [35, 34, 45, 39]]);
  const box = personBox(keepMainPerson(a, 60, 40), 60, 40);
  const kept = keepRowsUnder(a, 60, 40, box.headX);
  assert.ok(opaque(kept, 60, 20, 10), "head stays");
  assert.ok(!opaque(kept, 60, 47, 15), "arm above the join goes");
  assert.ok(opaque(kept, 60, 47, 36), "where they merge the row stays whole");
});

test("a close photo is framed inside the picture's width", () => {
  const frame = frameFor({ top: 10, bottom: 399, left: 0, right: 299, headX: 150 }, 300);
  assert.ok(frame.width <= 300);
  assert.ok(frame.left >= 0 && frame.left + frame.width <= 300);
  assert.equal(Math.round((frame.width * OUT_H) / OUT_W), frame.height);
});

test("a full-length photo is framed head and upper body", () => {
  const box = { top: 20, bottom: 819, left: 150, right: 249, headX: 200 };
  const frame = frameFor(box, 400);
  assert.ok(frame.height <= 800 * 0.6, "not the whole figure");
  assert.ok(frame.top < box.top, "a little room above the head");
});

test("makePlayerPhoto returns a 600x750 WebP with transparency around the person", async () => {
  const photo = await sharp({ create: { width: 300, height: 400, channels: 3, background: "#4a7" } }).jpeg().toBuffer();
  const out = await makePlayerPhoto(photo, {
    matte: async ({ width, height }) => plane(width, height, [[110, 40, 190, 120], [60, 120, 240, height - 1]]),
  });
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, OUT_W);
  assert.equal(meta.height, OUT_H);
  assert.equal(meta.hasAlpha, true);
  const { data } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[3], 0, "the top-left corner is transparent");
});

test("no person, or a 'person' filling the picture, is refused", async () => {
  const photo = await sharp({ create: { width: 120, height: 160, channels: 3, background: "#888" } }).png().toBuffer();
  for (const matte of [
    async ({ width, height }) => Buffer.alloc(width * height),
    async ({ width, height }) => Buffer.alloc(width * height, 255),
  ]) {
    await assert.rejects(makePlayerPhoto(photo, { matte }), (e) => e instanceof PhotoError && e.code === "NO_PERSON");
  }
});

test("something that is not an image is refused as BAD_IMAGE", async () => {
  await assert.rejects(
    makePlayerPhoto(Buffer.from("not an image"), { matte: async () => { throw new Error("unreachable"); } }),
    (e) => e.code === "BAD_IMAGE",
  );
});

/* ---------- the job ---------- */

const SID = "a".repeat(24);
const LINK = "https://drive.example/d/PHOTO1/view";
const V = photoVersion(LINK);

function world({ photo = LINK, player = {}, make, files } = {}) {
  const student = { _id: SID, photo };
  const players = [{ _id: "p1", studentId: SID, sportId: "sp1", ...player }];
  const photos = [];
  const changed = [];
  const logs = [];
  const rows = (list) => ({ success: true, result: list.map((d) => ({ ...d })) });
  const job = createPlayerPhotoJob({
    ensureSport: async () => ({ _id: "sp1" }),
    students: { get: async ({ _id }) => rows(_id === SID ? [student] : []) },
    players: {
      get: async ({ studentId }) => rows(players.filter((p) => p.studentId === studentId)),
      updateExisting: async ({ _id }, data) => {
        const p = players.find((x) => x._id === _id);
        if (!p) return { success: true, result: null };
        Object.assign(p, data);
        return { success: true, result: { ...p } };
      },
    },
    photos: {
      get: async (f) => rows(photos.filter((d) => d.studentId === f.studentId && d.sportId === f.sportId)),
      put: async (f, data) => {
        const at = photos.findIndex((d) => d.studentId === f.studentId && d.sportId === f.sportId);
        if (at >= 0) photos.splice(at, 1);
        photos.push({ ...data });
        return { success: true };
      },
      delete: async (f) => {
        for (let i = photos.length - 1; i >= 0; i -= 1) if (photos[i].studentId === f.studentId) photos.splice(i, 1);
        return { success: true };
      },
    },
    files: files || {
      extractFileId: () => "PHOTO1",
      downloadStream: async () => { const s = new PassThrough(); s.end("JPEG"); return s; },
    },
    make: make || (async (buf) => Buffer.from(`cut:${buf}`)),
    changed: (id) => changed.push(id),
    log: (...a) => logs.push(a),
  });
  return { job, student, players, photos, changed, logs };
}

test("a player with a photo gets a player photo, marked with the photo's version", async () => {
  const w = world();
  assert.equal(await w.job.refresh(SID), "made");
  assert.equal(w.photos.length, 1);
  assert.equal(w.photos[0].sourceVersion, V);
  assert.equal(String(w.photos[0].image), "cut:JPEG");
  assert.equal(w.players[0].photoCutout, V);
  assert.deepEqual(w.changed, [SID]);
  const read = await w.job.read(SID, LINK);
  assert.equal(String(read.image), "cut:JPEG");
  assert.equal(read.contentType, "image/webp");
});

test("an up-to-date or failed photo is not made again", async () => {
  let made = 0;
  const make = async () => { made += 1; return Buffer.from("x"); };
  assert.equal(await world({ player: { photoCutout: V }, make }).job.refresh(SID), "current");
  assert.equal(await world({ player: { photoCutoutFailed: V }, make }).job.refresh(SID), "current");
  assert.equal(made, 0);
});

test("a student without a photo has no player photo; one made before is removed", async () => {
  const w = world({ photo: "", player: { photoCutout: V } });
  w.photos.push({ studentId: SID, sportId: "sp1", sourceVersion: V, image: Buffer.from("old") });
  assert.equal(await w.job.refresh(SID), "removed");
  assert.equal(w.photos.length, 0);
  assert.equal(w.players[0].photoCutout, null);
  assert.deepEqual(w.changed, [SID]);
});

test("a student who is not a player has no player photo", async () => {
  const w = world();
  w.players.length = 0;
  w.photos.push({ studentId: SID, sportId: "sp1", sourceVersion: V, image: Buffer.from("old") });
  assert.equal(await w.job.refresh(SID), "removed");
  assert.equal(w.photos.length, 0);
});

test("a photo with nobody in it is marked failed and not retried; Drive errors are retried", async () => {
  const noPerson = world({ make: async () => { throw new PhotoError("NO_PERSON"); } });
  assert.equal(await noPerson.job.refresh(SID), "failed");
  assert.equal(noPerson.players[0].photoCutoutFailed, V);
  assert.equal(noPerson.photos.length, 0);

  const drive = world({ files: { extractFileId: () => "PHOTO1", downloadStream: async () => { throw new Error("drive down"); } } });
  assert.equal(await drive.job.refresh(SID), "error");
  assert.equal(drive.players[0].photoCutoutFailed, undefined);
  assert.equal(drive.logs.length, 1);
});

test("without the model nothing is marked, and the warning is logged once", async () => {
  const w = world({ make: async () => { throw new PhotoError("NO_MODEL"); } });
  assert.equal(await w.job.refresh(SID), "no-model");
  assert.equal(await w.job.refresh(SID), "no-model");
  assert.equal(w.players[0].photoCutoutFailed, undefined);
  assert.equal(w.logs.length, 1);
});

test("a player deleted while the photo was being made leaves no photo behind", async () => {
  let w;
  const make = async () => { w.players.length = 0; return Buffer.from("x"); };
  w = world({ make });
  assert.equal(await w.job.refresh(SID), "removed");
  assert.equal(w.photos.length, 0);
});

test("a stored photo made from an older photo is never served", async () => {
  const w = world();
  await w.job.refresh(SID);
  assert.equal(await w.job.read(SID, "https://drive.example/d/OTHER/view"), null);
  assert.equal(await w.job.read(SID, ""), null);
});

test("jobs run one at a time and a waiting student is not queued twice", async () => {
  let running = 0;
  let most = 0;
  let calls = 0;
  const make = async () => {
    calls += 1;
    running += 1;
    most = Math.max(most, running);
    await new Promise((r) => setTimeout(r, 5));
    running -= 1;
    return Buffer.from("x");
  };
  const w = world({ make });
  w.job.schedule(SID);
  w.job.schedule(SID);
  await w.job.schedule(SID);
  assert.equal(calls, 1);
  assert.equal(most, 1);
});

test("cutoutReady only for the current photo", () => {
  assert.equal(cutoutReady({ photoCutout: V }, LINK), true);
  assert.equal(cutoutReady({ photoCutout: V }, "https://drive.example/d/NEW/view"), false);
  assert.equal(cutoutReady({}, LINK), false);
  assert.equal(cutoutReady({ photoCutout: V }, ""), false);
});

/* ---------- after the review ---------- */

test("an extreme shape never reaches the model at a huge size", async () => {
  assert.deepEqual(modelSize(1024, 1), { width: 1024, height: 32 });
  const strip = await sharp({ create: { width: 1000, height: 100, channels: 3, background: "#888" } }).png().toBuffer();
  await assert.rejects(makePlayerPhoto(strip, { matte: async () => { throw new Error("unreachable"); } }), (e) => e.code === "BAD_IMAGE");
});

test("a photo over the size limit is marked failed, not downloaded again and again", async () => {
  const big = { extractFileId: () => "PHOTO1", downloadStream: async () => { const s = new PassThrough(); s.end(Buffer.alloc(16 * 1024 * 1024)); return s; } };
  const w = world({ files: big });
  assert.equal(await w.job.refresh(SID), "failed");
  assert.equal(w.players[0].photoCutoutFailed, V);
});

test("after a Drive failure the photo waits before it is tried again", async () => {
  let downloads = 0;
  const files = { extractFileId: () => "PHOTO1", downloadStream: async () => { downloads += 1; throw new Error("drive down"); } };
  const w = world({ files });
  assert.equal(await w.job.refresh(SID), "error");
  assert.equal(await w.job.refresh(SID), "later");
  assert.equal(downloads, 1);
});

test("a stalled download is cut off and the queue moves on", async () => {
  const stalled = { extractFileId: () => "PHOTO1", downloadStream: async () => new PassThrough() };
  const { download } = require("../services/playerPhotoJob");
  await assert.rejects(download(stalled, "PHOTO1", { ms: 20 }), (e) => e.code === "TIMEOUT");
});

test("remove deletes the student's player photos at once", async () => {
  const w = world();
  await w.job.refresh(SID);
  assert.equal(w.photos.length, 1);
  await w.job.remove(SID);
  assert.equal(w.photos.length, 0);
});

test("a student deleted while the photo was being made leaves no photo behind", async () => {
  let w;
  const make = async () => { w.student.photo = ""; return Buffer.from("x"); };
  w = world({ make });
  assert.equal(await w.job.refresh(SID), "removed");
  assert.equal(w.photos.length, 0);
});

test("a deletion that lands after the photo is stored still removes it", async () => {
  const w = world();
  const put = w.photos.push.bind(w.photos);
  w.photos.push = (doc) => { const n = put(doc); w.student.photo = ""; return n; };
  assert.equal(await w.job.refresh(SID), "removed");
  assert.equal(w.photos.length, 0);
});
