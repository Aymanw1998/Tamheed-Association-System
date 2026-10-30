const assert = require("node:assert/strict");
const test = require("node:test");
const http = require("node:http");
const { PassThrough } = require("node:stream");
const express = require("express");
const sharp = require("sharp");

const { makePassportPhoto, passportFrame, headOf, PASS_W, PASS_H, personBox } = require("../services/playerPhoto.service");
const { createPassportPhotoJob } = require("../services/passportPhotoJob");
const { createPhotoRouter } = require("../Entities/Photo/Photo.route");
const files = require("../services/googleDrive.service");

// An alpha plane with the given rectangles opaque.
const plane = (width, height, rects) => {
  const a = Buffer.alloc(width * height);
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) a[y * width + x] = 255;
  }
  return a;
};
const pixel = async (jpeg, x, y) => {
  const { data, info } = await sharp(jpeg).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 3;
  return [data[i], data[i + 1], data[i + 2]];
};

/* ---------- the picture ---------- */

test("a passport photo is a 420x540 JPEG, the person on white", async () => {
  const photo = await sharp({ create: { width: 300, height: 400, channels: 3, background: "#2a6" } }).jpeg().toBuffer();
  // A head and shoulders running off the bottom.
  const out = await makePassportPhoto(photo, {
    matte: async ({ width, height }) => plane(width, height, [[120, 60, 180, 140], [60, 140, 240, height - 1]]),
  });
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.width, PASS_W);
  assert.equal(meta.height, PASS_H);
  assert.ok((await pixel(out, 5, 5)).every((c) => c > 245), "the background is white");
  const body = await pixel(out, PASS_W / 2, PASS_H - 10);
  assert.ok(body[1] > body[0] + 40, "the person keeps their colour");
});

test("with nobody found, the photo itself is cropped to passport size", async () => {
  const photo = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#2a6" } }).jpeg().toBuffer();
  const out = await makePassportPhoto(photo, { matte: async ({ width, height }) => Buffer.alloc(width * height) });
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, PASS_W);
  assert.equal(meta.height, PASS_H);
  const corner = await pixel(out, 5, 5);
  assert.ok(corner[1] > corner[0] + 40, "the background is left as it was");
});

test("something that is not an image is refused as BAD_IMAGE", async () => {
  await assert.rejects(makePassportPhoto(Buffer.from("nope"), { matte: async () => { throw new Error("unreachable"); } }), (e) => e.code === "BAD_IMAGE");
});

test("the frame is 35:45, centred on the head, a little room above it", () => {
  const box = { top: 100, bottom: 700, left: 300, right: 500, headX: 400 };
  const f = passportFrame(box, 1000, 1000);
  assert.ok(Math.abs(f.width / f.height - PASS_W / PASS_H) < 0.01);
  assert.ok(Math.abs(f.left + f.width / 2 - 400) <= 1);
  assert.ok(f.top < 100 && f.top > 100 - f.height * 0.2);
});

test("a body running off the bottom is not followed by a white strip", () => {
  const box = { top: 80, bottom: 599, left: 0, right: 799, headX: 400 };
  const f = passportFrame(box, 800, 600);
  assert.ok(f.top + f.height <= 601, `frame ends at ${f.top + f.height}`);
  assert.ok(f.left >= 0 && f.left + f.width <= 801);
});

test("a whole figure is framed head and upper body, not all of it", () => {
  const a = plane(400, 1000, [[180, 50, 220, 120], [80, 120, 320, 950]]);
  const box = personBox(a, 400, 1000);
  const f = passportFrame(box, 400, 1000);
  assert.ok(f.height <= (box.bottom - box.top + 1) * 0.5 + 1);
});

/* ---------- the job ---------- */

const ID = "1AbCdEfGhIjK";
const LINK = `https://lh3.googleusercontent.com/d/${ID}`;

function world({ links = [LINK], make, download, isPublic, now } = {}) {
  const rows = new Map();
  const logs = [];
  const store = {
    get: async ({ fileId }) => ({ success: true, result: rows.has(fileId) ? [rows.get(fileId)] : [] }),
    listFileIds: async () => [...rows.keys()],
    put: async (fileId, data) => { rows.set(fileId, { ...data, fileId }); return { success: true }; },
    touch: async (fileId, data) => { if (rows.has(fileId)) rows.set(fileId, { ...rows.get(fileId), ...data }); return { success: true }; },
    delete: async ({ fileId }) => { rows.delete(fileId); return { success: true }; },
  };
  const drive = {
    extractFileId: files.extractFileId,
    isPublicImage: isPublic || (async () => true),
    downloadStream: download || (async () => { const s = new PassThrough(); s.end("JPEG"); return s; }),
  };
  const job = createPassportPhotoJob({
    store, files: drive, links: async () => links, log: (...a) => logs.push(a), now,
    make: make || (async (buf) => Buffer.from(`passport:${buf}`)),
  });
  return { job, rows, logs };
}

test("an uploaded photo gets its passport version, served by its Drive file id", async () => {
  const w = world();
  assert.equal(await w.job.schedule(LINK), "made");
  assert.equal(String((await w.job.read(ID)).image), "passport:JPEG");
  assert.equal(await w.job.schedule(LINK), "current");
});

test("a link that is no Drive photo is skipped", async () => {
  const w = world();
  assert.equal(await w.job.schedule("https://example.com/me.jpg"), "skipped");
  assert.equal(await w.job.schedule(""), "skipped");
  assert.equal(w.rows.size, 0);
});

test("no picture at all is marked failed (the photo itself shows) and not tried again", async () => {
  let made = 0;
  const w = world({ make: async () => { made += 1; throw Object.assign(new Error("bad"), { code: "BAD_IMAGE" }); } });
  assert.equal(await w.job.refresh(ID), "failed");
  assert.equal(await w.job.read(ID), null);
  assert.equal(await w.job.refresh(ID), "current");
  assert.equal(made, 1);
});

test("without the model nothing is stored and the warning is logged once", async () => {
  const w = world({ make: async () => { throw Object.assign(new Error("no model"), { code: "NO_MODEL" }); } });
  assert.equal(await w.job.refresh(ID), "no-model");
  assert.equal(await w.job.refresh(ID), "no-model");
  assert.equal(w.rows.size, 0);
  assert.equal(w.logs.length, 1);
});

test("a Drive failure waits before the photo is tried again", async () => {
  let downloads = 0;
  const w = world({ download: async () => { downloads += 1; throw new Error("drive down"); } });
  assert.equal(await w.job.refresh(ID), "error");
  assert.equal(await w.job.refresh(ID), "later");
  assert.equal(downloads, 1);
});

test("a photo removed while its passport version was being made leaves nothing behind, and is never made again", async () => {
  let release;
  const w = world({ make: () => new Promise((r) => { release = r; }) });
  const running = w.job.refresh(ID);
  await new Promise((r) => setImmediate(r));
  await w.job.forget(LINK);
  release(Buffer.from("late"));
  assert.equal(await running, "removed");
  assert.equal(w.rows.size, 0);
  assert.equal(await w.job.refresh(ID), "skipped");
});

test("forget removes a made passport photo at once", async () => {
  const w = world();
  await w.job.schedule(LINK);
  await w.job.forget(LINK);
  assert.equal(await w.job.read(ID), null);
});

test("the sweep drops rows no photo uses and queues the missing ones", async () => {
  const other = "2ZyXwVuTsRqP";
  const w = world({ links: [LINK, `https://lh3.googleusercontent.com/d/${other}`, "", "https://example.com/x.jpg"] });
  w.rows.set("3OldOldOldOld", { fileId: "3OldOldOldOld", image: Buffer.from("x") });
  // Unused in one sweep is not enough (the reads are no snapshot); in two it is.
  assert.deepEqual(await w.job.sweep(), { removed: 0, revoked: 0, queued: 2 });
  await w.job.idle();
  assert.deepEqual(await w.job.sweep(), { removed: 1, revoked: 0, queued: 0 });
  assert.deepEqual([...w.rows.keys()].sort(), [ID, other].sort());
});

test("jobs run one at a time", async () => {
  let running = 0;
  let most = 0;
  const w = world({
    make: async (buf) => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
      return buf;
    },
  });
  await Promise.all([w.job.schedule(LINK), w.job.schedule("https://lh3.googleusercontent.com/d/2ZyXwVuTsRqP")]);
  await w.job.idle();
  assert.equal(most, 1);
  assert.equal(w.rows.size, 2);
});

/* ---------- the route ---------- */

async function serve(passport) {
  const app = express();
  app.use("/api/photos", createPhotoRouter({ passport, files }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/api/photos`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

test("the route serves a made passport photo and caches it", async () => {
  const s = await serve({ read: async (id) => (id === ID ? { image: Buffer.from("JPEGDATA"), contentType: "image/jpeg" } : null) });
  try {
    const r = await fetch(`${s.base}/passport/${ID}`, { redirect: "manual" });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/jpeg");
    assert.match(r.headers.get("cache-control"), /max-age=3600/);
    assert.equal(await r.text(), "JPEGDATA");
  } finally {
    await s.close();
  }
});

test("until it is made, the route sends the photo itself, never cached", async () => {
  const s = await serve({ read: async () => null });
  try {
    const r = await fetch(`${s.base}/passport/${ID}`, { redirect: "manual" });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get("location"), `https://lh3.googleusercontent.com/d/${ID}`);
    assert.equal(r.headers.get("cache-control"), "no-store");
  } finally {
    await s.close();
  }
});

test("a read failure still sends the photo itself; a bad id is not found", async () => {
  const s = await serve({ read: async () => { throw new Error("db down"); } });
  try {
    assert.equal((await fetch(`${s.base}/passport/${ID}`, { redirect: "manual" })).status, 302);
    assert.equal((await fetch(`${s.base}/passport/short`, { redirect: "manual" })).status, 404);
    assert.equal((await fetch(`${s.base}/passport/${"x".repeat(9)}%2F..`, { redirect: "manual" })).status, 404);
  } finally {
    await s.close();
  }
});

/* ---------- review round 1 ---------- */

test("a photo field pointing at a private Drive file is never downloaded nor published", async () => {
  let downloads = 0;
  const w = world({ isPublic: async () => false, download: async () => { downloads += 1; throw new Error("unreachable"); } });
  assert.equal(await w.job.refresh(ID), "not-public");
  assert.equal(downloads, 0);
  assert.equal(w.rows.size, 0, "nothing stored, so it is asked again later");
  assert.equal(await w.job.read(ID), null);
});

test("private through several sweeps, then public again: the passport version comes back", async () => {
  let t = 1_000_000;
  let open = true;
  const w = world({ now: () => t, isPublic: async () => open });
  await w.job.schedule(LINK);
  open = false;
  for (let i = 0; i < 3; i += 1) {
    t += 31 * 60 * 1000;
    await w.job.sweep();
    await w.job.idle();
  }
  assert.equal(await w.job.read(ID), null);
  open = true;
  t += 31 * 60 * 1000;
  await w.job.sweep();
  await w.job.idle();
  assert.ok(await w.job.read(ID));
});

test("a removed photo is never served, even when deleting its row failed", async () => {
  const w = world();
  await w.job.schedule(LINK);
  const realDelete = w.rows.delete.bind(w.rows);
  w.rows.delete = () => { throw new Error("db down"); };
  await assert.rejects(w.job.forget(LINK));
  w.rows.delete = realDelete;
  assert.equal(await w.job.read(ID), null);
});

test("the sweep keeps a photo uploaded while it ran", async () => {
  const fresh = "4NeWnEwNeWnE";
  const links = [LINK];
  const w = world({ links });
  await w.job.schedule(LINK);
  // The upload stores its link and its row is made after the sweep listed
  // the rows, but before it read the photo links.
  const sweep = w.job.sweep();
  links.push(`https://lh3.googleusercontent.com/d/${fresh}`);
  w.rows.set(fresh, { fileId: fresh, image: Buffer.from("x") });
  await sweep;
  assert.ok(w.rows.has(fresh));
  assert.ok(w.rows.has(ID));
});

test("a very wide picture still gets a passport-size version (the photo itself)", async () => {
  const wide = await sharp({ create: { width: 1000, height: 250, channels: 3, background: "#2a6" } }).jpeg().toBuffer();
  const out = await makePassportPhoto(wide, { matte: async () => { throw new Error("unreachable"); } });
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, PASS_W);
  assert.equal(meta.height, PASS_H);
});

test("a bust with a little room below keeps the whole head and shoulders", () => {
  // Head 160-240 x 60-180, shoulders 80-320 x 180-590 in a 400x600 picture.
  const a = plane(400, 600, [[160, 60, 240, 180], [80, 180, 320, 590]]);
  const box = personBox(a, 400, 600);
  const f = passportFrame(box, 400, 600);
  // Under the old half-height cap it ended at about 294, inside the shoulders' top.
  assert.ok(f.top + f.height >= 300, `frame ends at ${f.top + f.height}`);
});

/* ---------- review round 2 ---------- */

test("a row whose original became private or gone is dropped by the sweep", async () => {
  let open = true;
  const w = world({ isPublic: async () => open });
  await w.job.schedule(LINK);
  assert.ok(await w.job.read(ID));
  open = false;
  assert.deepEqual(await w.job.sweep(), { removed: 0, revoked: 1, queued: 0 });
  assert.equal(await w.job.read(ID), null);
  // Public again: the next sweep makes it again.
  open = true;
  assert.deepEqual(await w.job.sweep(), { removed: 0, revoked: 0, queued: 1 });
  await w.job.idle();
  assert.ok(await w.job.read(ID));
});

test("a row not confirmed public lately is not served; a confirming sweep serves it again", async () => {
  let t = 1_000_000;
  let reachable = true;
  const w = world({ now: () => t, isPublic: async () => { if (!reachable) throw new Error("drive down"); return true; } });
  await w.job.schedule(LINK);
  assert.ok(await w.job.read(ID));
  reachable = false;
  t += 3 * 60 * 60 * 1000;
  await w.job.sweep();
  assert.equal(await w.job.read(ID), null);
  reachable = true;
  await w.job.sweep();
  assert.ok(await w.job.read(ID));
});

test("a Drive check that never answers does not stall the queue", { timeout: 30000 }, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const w = world({ isPublic: () => new Promise(() => {}) });
  const running = w.job.refresh(ID);
  await new Promise((r) => setImmediate(r));
  t.mock.timers.tick(16 * 1000);
  assert.equal(await running, "error");
  assert.equal(w.rows.size, 0);
});

test("a whole figure with arms out is framed head and shoulders, not to the feet", () => {
  // 800x1000: head 370-430 x 50-130, neck 385-415 x 130-150, arms out 100-700 x 150-210, body 300-500 x 150-950.
  const a = plane(800, 1000, [[370, 50, 430, 130], [385, 130, 415, 150], [100, 150, 700, 210], [300, 150, 500, 950]]);
  const box = personBox(a, 800, 1000);
  const f = passportFrame(box, 800, 1000, headOf(a, 800, 1000, box));
  assert.ok(f.top + f.height < 400, `frame ends at ${f.top + f.height}`);
  assert.ok(f.top + f.height > 150, "the shoulders are in");
});

/* ---------- review round 3 ---------- */

test("arms raised to one side do not pull the frame off the head", () => {
  const a = plane(800, 1000, [[370, 50, 430, 130], [385, 130, 415, 150], [400, 150, 790, 210], [300, 150, 500, 950]]);
  const box = personBox(a, 800, 1000);
  const head = headOf(a, 800, 1000, box);
  assert.ok(head && Math.abs(head.x - 400) <= 2, `head column ${head?.x}`);
  const f = passportFrame(box, 800, 1000, head);
  assert.ok(f.top + f.height < 400, `frame ends at ${f.top + f.height}`);
  assert.ok(Math.abs(f.left + f.width / 2 - 400) <= 2);
});
