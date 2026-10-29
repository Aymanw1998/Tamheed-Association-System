const assert = require("node:assert/strict");
const test = require("node:test");
const { PassThrough } = require("node:stream");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");

process.env.PASSWORD_ENC_KEY_HEX = process.env.PASSWORD_ENC_KEY_HEX || "0".repeat(64);
process.env.SPORT_SESSION_SECRET = "test-sport-session-secret";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

const { createSportAuth } = require("../Entities/SportPortal/SportPortal.auth");
const { createSportPortalController } = require("../Entities/SportPortal/SportPortal.controller");

const store = (seed) => {
  const docs = seed.map((d, i) => ({ _id: d._id || `d${i}`, ...d }));
  const matches = (d, f = {}) =>
    Object.entries(f).every(([k, v]) => {
      if (k === "players.studentId") return (d.players || []).some((m) => String(m.studentId) === String(v));
      return String(d[k]) === String(v);
    });
  return { async get(f) { return { success: true, result: docs.filter((d) => matches(d, f)).map((d) => ({ ...d })) }; } };
};

// A response that is also a writable stream, so a streamed photo can be piped into it.
const res = () => {
  const out = new PassThrough();
  out.chunks = [];
  out.on("data", (c) => out.chunks.push(c));
  return Object.assign(out, {
    statusCode: 200, body: undefined, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(v) { this.body = v; this.headersSent = true; this.end(); return this; },
    send(v) { this.sent = v; this.headersSent = true; this.end(); return this; },
    set(k, v) { this.headers[k] = v; return this; },
    removeHeader(k) { delete this.headers[k]; },
    text() { return Buffer.concat(this.chunks).toString(); },
  });
};

// Fixture values that must never appear in the portal answer.
const ME = { tz: "100000009", email: "me@example.com", photo: "https://drive.example/d/PHOTOFILEID123/view", birth: "2012-03-15T00:00:00Z" };
const MATE = { tz: "100000017", email: "mate@example.com", photo: "https://drive.example/d/MATEPHOTO12345/view", birth: "2011-07-01T00:00:00Z" };
const COACH = { tz: "100000025", email: "coach@example.com" };

const LESSONS = [
  { _id: "l1", sportId: "sp1", name: "تدريب الأحد", date: { day: 1, startMin: 960, endMin: 1020 }, room: "9",
    players: [{ studentId: "s1", joinedAt: new Date("2026-01-01T00:00:00Z") }, { studentId: "s2", joinedAt: new Date("2026-01-01T00:00:00Z") }] },
  { _id: "l2", sportId: "sp1", name: "تدريب الأربعاء", date: { day: 4, startMin: 1020, endMin: 1080 }, room: "9",
    players: [{ studentId: "s1", joinedAt: new Date("2026-01-01T00:00:00Z") }] },
  { _id: "l3", sportId: "sp1", name: "تدريب الخميس", date: { day: 5, startMin: 600, endMin: 660 }, room: "9",
    players: [{ studentId: "s2", joinedAt: new Date("2026-01-01T00:00:00Z") }] },
];
const rec = (sportLessonId, date, status, studentId = "s1") => ({ sportLessonId, studentId, date, status });
const RECORDS = [
  rec("l1", "2026-05-03", "حاضر"), rec("l1", "2026-05-10", "غائب"), rec("l2", "2026-05-06", "متأخر"),
  rec("l1", "2026-05-03", "غائب", "s2"), rec("l3", "2026-05-07", "حاضر", "s2"),
];

function setup({ students, players, lessons, records, files, playerPhotos, notices } = {}) {
  const logs = [];
  const scheduled = [];
  const stores = {
    students: store(students || [
      { _id: "s1", tz: ME.tz, email: ME.email, firstname: "علي", gender: "ذكر", lastname: "حداد", photo: ME.photo, birth_date: ME.birth },
      { _id: "s2", tz: MATE.tz, email: MATE.email, firstname: "سامر", lastname: "نصار", photo: MATE.photo, birth_date: MATE.birth },
    ]),
    players: store(players || [
      { studentId: "s1", sportId: "sp1", jerseyNumber: 7, position: "حارس", stats: { s_aa: 3 } },
      { studentId: "s2", sportId: "sp1", jerseyNumber: 9, position: "مهاجم", stats: { s_aa: 11 } },
    ]),
  };
  const auth = createSportAuth({ ...stores, ensureSport: async () => ({ _id: "sp1" }), log: (...a) => logs.push(a) });
  const portal = createSportPortalController({
    ...stores,
    ensureSport: async () => ({ _id: "sp1", name: "كرة القدم", icon: "⚽", stats: [{ key: "s_aa", label: "أهداف" }] }),
    lessons: store(lessons || LESSONS),
    attendance: store(records || RECORDS),
    files: files || { extractFileId: () => "PHOTOFILEID123", downloadStream: async () => { const s = new PassThrough(); s.end("IMG"); return s; } },
    notices: store(notices || []),
    users: store([{ _id: "c".repeat(24), firstname: "إبراهيم", lastname: "الوهباني", tz: COACH.tz, email: COACH.email }]),
    playerPhotos: playerPhotos || { schedule: (id) => scheduled.push(String(id)), read: async () => null },
    log: (...a) => logs.push(a),
    now: () => new Date("2026-06-01T00:00:00Z"),
  });
  // Runs the real guard first, then the handler, as the router does.
  const call = async (handler, sub) => {
    const r = res();
    const token = jwt.sign({ sub, typ: "sport-student" }, process.env.SPORT_SESSION_SECRET, { algorithm: "HS256" });
    const req = { cookies: { tamheed_sport: token } };
    let passed = false;
    await auth.requireSportStudent(req, r, () => { passed = true; });
    if (passed) await handler(req, r);
    return r;
  };
  return { portal, call, logs, scheduled };
}

test("me returns the card, lessons, next lesson and history of the signed-in student", async () => {
  const { portal, call } = setup();
  const r = await call(portal.me, "s1");
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, {
    ok: true,
    student: { key: crypto.createHash("sha1").update("sport-student:s1").digest("hex").slice(0, 12), firstname: "علي", lastname: "حداد", gender: "ذكر", age: 14, birthDate: "2012-03-15", hasPhoto: true, photoVersion: crypto.createHash("sha1").update(ME.photo).digest("hex").slice(0, 10), photoCutout: false, mentor: "" },
    card: {
      sport: { name: "كرة القدم", icon: "⚽" },
      jerseyNumber: 7,
      position: "حارس",
      statDefs: [{ key: "s_aa", label: "أهداف" }],
      values: { s_aa: 3 },
      attendance: { rate: 67, present: 1, absent: 1, late: 1 },
    },
    lessons: [
      { name: "تدريب الأحد", day: 1, startMin: 960, endMin: 1020 },
      { name: "تدريب الأربعاء", day: 4, startMin: 1020, endMin: 1080 },
    ],
    nextLesson: { name: "تدريب الأربعاء", day: 4, startMin: 1020, endMin: 1080 },
    history: [
      { date: "2026-05-10", lessonName: "تدريب الأحد", status: "غائب" },
      { date: "2026-05-06", lessonName: "تدريب الأربعاء", status: "متأخر" },
      { date: "2026-05-03", lessonName: "تدريب الأحد", status: "حاضر" },
    ],
  });
});

test("photoVersion changes when the photo changes, and is null with no photo", async () => {
  const base = { _id: "s1", tz: ME.tz, email: ME.email, firstname: "علي", lastname: "حداد", birth_date: ME.birth };
  const s1 = setup({ students: [{ ...base, photo: ME.photo }] });
  const first = (await s1.call(s1.portal.me, "s1")).body.student.photoVersion;
  const s2 = setup({ students: [{ ...base, photo: "https://drive.example/d/NEWPHOTO99/view" }] });
  const second = (await s2.call(s2.portal.me, "s1")).body.student.photoVersion;
  const s3 = setup({ students: [{ ...base, photo: "" }] });
  const none = (await s3.call(s3.portal.me, "s1")).body.student;
  assert.match(first, /^[0-9a-f]{10}$/);
  assert.notEqual(first, second);
  assert.equal(none.photoVersion, null);
  assert.equal(none.hasPhoto, false);
});

test("the response holds nothing about other students", async () => {
  const { portal, call } = setup();
  const r = await call(portal.me, "s1");
  const text = JSON.stringify(r.body);
  for (const v of ["سامر", "نصار", "s2", "تدريب الخميس", ME.tz, ME.email, ME.photo, "PHOTOFILEID123", MATE.tz, MATE.email, MATE.photo, "2011-07-01"]) {
    assert.ok(!text.includes(v), `leaked ${v}`);
  }
  for (const k of ["tz", "email", "photo", "birth_date", "password", "studentId", "_id"]) {
    assert.ok(!text.includes(`"${k}"`), `key ${k}`);
  }
});

test("history is newest first, capped at 60, and skips records of deleted lessons", async () => {
  const dated = Array.from({ length: 70 }, (_, i) => rec("l1", new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), "حاضر"));
  const { portal, call } = setup({ records: [...dated, rec("gone", "2026-05-30", "حاضر")] });
  const r = await call(portal.me, "s1");
  assert.equal(r.body.history.length, 60);
  assert.equal(r.body.history[0].date, dated[69].date);
  assert.ok(r.body.history.every((h, i, a) => i === 0 || a[i - 1].date >= h.date));
  assert.ok(r.body.history.every((h) => h.lessonName === "تدريب الأحد"));
});

test("a student with no lessons or records gets empty lists and a null rate", async () => {
  const { portal, call } = setup({ lessons: [], records: [] });
  const r = await call(portal.me, "s1");
  assert.deepEqual(r.body.lessons, []);
  assert.equal(r.body.nextLesson, null);
  assert.deepEqual(r.body.history, []);
  assert.deepEqual(r.body.card.attendance, { rate: null, present: 0, absent: 0, late: 0 });
});

test("a student whose player row was deleted gets 401", async () => {
  const { portal, call } = setup({ players: [{ studentId: "s2", sportId: "sp1" }] });
  const r = await call(portal.me, "s1");
  assert.equal(r.statusCode, 401);
  assert.deepEqual(r.body, { ok: false, code: "SPORT_AUTH" });
});

test("a deleted student gets 401", async () => {
  const { portal, call } = setup();
  const r = await call(portal.me, "gone");
  assert.equal(r.statusCode, 401);
  assert.deepEqual(r.body, { ok: false, code: "SPORT_AUTH" });
});

test("photo streams through the server and never redirects", async () => {
  const { portal, call } = setup();
  const r = await call(portal.photo, "s1");
  await new Promise((resolve) => r.on("end", resolve));
  assert.equal(r.statusCode, 200);
  assert.equal(r.text(), "IMG");
  assert.equal(r.headers["Cache-Control"], "private, max-age=3600");
  assert.equal(r.headers["Content-Type"], "image/jpeg");
  assert.equal(r.headers.Location, undefined);
  assert.equal(r.headers["X-Content-Type-Options"], "nosniff");
});

test("photo answers 404 when there is none, and when the download fails", async () => {
  const none = setup({ students: [{ _id: "s1", firstname: "a", lastname: "b" }] });
  const r1 = await none.call(none.portal.photo, "s1");
  assert.equal(r1.statusCode, 404);
  assert.deepEqual(r1.body, { ok: false });

  const broken = setup({
    files: { extractFileId: () => "X123456789012", downloadStream: async () => { throw new Error("drive down"); } },
  });
  const r2 = await broken.call(broken.portal.photo, "s1");
  assert.equal(r2.statusCode, 404);
  assert.deepEqual(r2.body, { ok: false });
  assert.equal(broken.logs.length, 1);
  assert.equal(r2.headers.Location, undefined);
});

test("me answers 401 for a student whose only player row belongs to another sport", async () => {
  const { call, portal } = setup({
    students: [{ _id: "s9", tz: "100000041", email: "old@example.com", firstname: "قديم", lastname: "لاعب" }],
    players: [{ studentId: "s9", sportId: "old", jerseyNumber: 3 }],
  });
  const r = await call(portal.me, "s9");
  assert.equal(r.statusCode, 401);
  assert.deepEqual(r.body, { ok: false, code: "SPORT_AUTH" });
});

test("me does not read another sport's row when the student has both", async () => {
  const { call, portal } = setup({
    players: [
      { studentId: "s1", sportId: "old", jerseyNumber: 99, position: "قديم", stats: {} },
      { studentId: "s1", sportId: "sp1", jerseyNumber: 7, position: "حارس", stats: { s_aa: 3 } },
    ],
  });
  const r = await call(portal.me, "s1");
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.card.jerseyNumber, 7);
});

test("the sign-in check and the player card read together: two rounds of database reads, not five", async () => {
  const DELAY = 40;
  let reads = 0;
  // Each read takes DELAY ms; reads that run together overlap.
  const slow = (s) => ({ async get(f) { reads += 1; await new Promise((r) => setTimeout(r, DELAY)); return s.get(f); } });
  const stores = {
    students: slow(store([{ _id: "s1", tz: ME.tz, email: ME.email, firstname: "علي", lastname: "حداد", birth_date: ME.birth }])),
    players: slow(store([{ studentId: "s1", sportId: "sp1", jerseyNumber: 7, position: "حارس", stats: {} }])),
  };
  const sport = async () => ({ _id: "sp1", name: "كرة القدم", icon: "⚽", stats: [] });
  const auth = createSportAuth({ ...stores, ensureSport: sport, log: () => {} });
  const portal = createSportPortalController({
    ...stores, ensureSport: sport, lessons: slow(store(LESSONS)), attendance: slow(store(RECORDS)), log: () => {},
    now: () => new Date("2026-06-01T00:00:00Z"),
  });
  const r = res();
  const req = { cookies: { tamheed_sport: jwt.sign({ sub: "s1", typ: "sport-student" }, process.env.SPORT_SESSION_SECRET, { algorithm: "HS256" }) } };
  const started = Date.now();
  let passed = false;
  await auth.requireSportStudent(req, r, () => { passed = true; });
  assert.ok(passed);
  await portal.me(req, r);
  const took = Date.now() - started;
  assert.equal(r.statusCode, 200);
  assert.equal(reads, 5, "the same five reads");
  assert.ok(took < 3.5 * DELAY, `two rounds (~${2 * DELAY} ms), took ${took} ms`);
});

test("with its player photo made, me points the app at the cut-out; without it, the photo is queued", async () => {
  const version = crypto.createHash("sha1").update(ME.photo).digest("hex").slice(0, 10);
  const withCut = setup({ players: [{ studentId: "s1", sportId: "sp1", stats: {}, photoCutout: version }] });
  const a = (await withCut.call(withCut.portal.me, "s1")).body.student;
  assert.equal(a.photoCutout, true);
  assert.equal(a.photoVersion, `${version}c`);
  assert.deepEqual(withCut.scheduled, []);

  const failed = setup({ players: [{ studentId: "s1", sportId: "sp1", stats: {}, photoCutoutFailed: version }] });
  assert.equal((await failed.call(failed.portal.me, "s1")).body.student.photoCutout, false);
  assert.deepEqual(failed.scheduled, []);

  const none = setup();
  await none.call(none.portal.me, "s1");
  assert.deepEqual(none.scheduled, ["s1"]);
});

test("the photo route sends the cut-out when there is one, and the Drive photo otherwise", async () => {
  const cut = setup({ playerPhotos: { schedule() {}, read: async (id, link) => (id === "s1" && link === ME.photo ? { image: Buffer.from("CUT"), contentType: "image/webp" } : null) } });
  const a = await cut.call(cut.portal.photo, "s1");
  assert.equal(a.headers["Content-Type"], "image/webp");
  assert.equal(String(a.sent), "CUT");

  const plain = setup();
  const b = await plain.call(plain.portal.photo, "s1");
  await new Promise((r) => setImmediate(r));
  assert.equal(b.headers["Content-Type"], "image/jpeg");
  assert.equal(b.text(), "IMG");
});

test("me names the student's mentor and nothing else about them", async () => {
  const base = { _id: "s1", tz: ME.tz, email: ME.email, firstname: "علي", lastname: "حداد", birth_date: ME.birth, photo: "" };
  const s = setup({ students: [{ ...base, main_teacher: "c".repeat(24) }] });
  const r = await s.call(s.portal.me, "s1");
  assert.equal(r.body.student.mentor, "إبراهيم الوهباني");
  const text = JSON.stringify(r.body);
  for (const v of [COACH.tz, COACH.email, "c".repeat(24)]) assert.ok(!text.includes(v), v);
});

test("/id answers only the signed-in student's own ID number, never to be stored", async () => {
  const { portal, call } = setup();
  const r = await call(portal.idNumber, "s1");
  assert.deepEqual(r.body, { ok: true, tz: ME.tz });
  assert.equal(r.headers["Cache-Control"], "no-store");
  const other = await call(portal.idNumber, "s2");
  assert.equal(other.body.tz, MATE.tz);
});

test("notices: to everyone and to the student's own lessons, not expired, newest first, no other sport", async () => {
  const n = (id, extra) => ({ _id: id, sportId: "sp1", title: id, body: "", createdAt: new Date("2026-05-0" + id.slice(1) + "T10:00:00Z"), ...extra });
  const { portal, call } = setup({ notices: [
    n("n1"),
    n("n2", { lessonId: "l2" }),
    n("n3", { lessonId: "l3" }),
    n("n4", { expiresOn: "2026-05-31" }),
    n("n5", { expiresOn: "2026-06-01" }),
    n("n6", { sportId: "other" }),
  ] });
  const r = await call(portal.notices, "s1");
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers["Cache-Control"], "no-store");
  assert.deepEqual(r.body.notices.map((x) => x.id), ["n5", "n2", "n1"]);
  assert.equal(r.body.key, crypto.createHash("sha1").update("sport-student:s1").digest("hex").slice(0, 12));
  assert.equal(r.body.notices[1].lessonName, "تدريب الأربعاء");
  assert.equal(r.body.notices[2].lessonName, null);
  const mate = await call(portal.notices, "s2");
  assert.deepEqual(mate.body.notices.map((x) => x.id), ["n5", "n3", "n1"]);
});

test("notices answer 401 to a student who is no longer a player", async () => {
  const { portal, call } = setup({ players: [{ studentId: "s2", sportId: "sp1", stats: {} }] });
  const r = await call(portal.notices, "s1");
  assert.equal(r.statusCode, 401);
});
