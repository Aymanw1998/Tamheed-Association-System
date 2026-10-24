const assert = require("node:assert/strict");
const test = require("node:test");
const { PassThrough } = require("node:stream");
const jwt = require("jsonwebtoken");

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
      if (k === "members.studentId") return (d.members || []).some((m) => String(m.studentId) === String(v));
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
    set(k, v) { this.headers[k] = v; return this; },
    removeHeader(k) { delete this.headers[k]; },
    text() { return Buffer.concat(this.chunks).toString(); },
  });
};

// Fixture values that must never appear in the portal answer.
const ME = { tz: "100000009", email: "me@example.com", photo: "https://drive.example/d/PHOTOFILEID123/view", birth: "2012-03-15T00:00:00Z" };
const MATE = { tz: "100000017", email: "mate@example.com", photo: "https://drive.example/d/MATEPHOTO12345/view", birth: "2011-07-01T00:00:00Z" };
const COACH = { tz: "100000025", email: "coach@example.com" };

function setup({ students, players, files } = {}) {
  const logs = [];
  const stores = {
    students: store(students || [
      { _id: "s1", tz: ME.tz, email: ME.email, firstname: "علي", lastname: "حداد", photo: ME.photo, birth_date: ME.birth },
      { _id: "s2", tz: MATE.tz, email: MATE.email, firstname: "سامر", lastname: "نصار", photo: MATE.photo, birth_date: MATE.birth },
    ]),
    players: store(players || [{ studentId: "s1", sportId: "sp1", jerseyNumber: 7, position: "حارس" }]),
  };
  const auth = createSportAuth({ ...stores, log: (...a) => logs.push(a) });
  const portal = createSportPortalController({
    ...stores,
    sports: store([{ _id: "sp1", name: "كرة القدم", icon: "⚽", stats: [{ key: "s_aa", label: "أهداف" }] }]),
    teams: store([{
      _id: "t1", name: "الفريق أ", sportId: "sp1", coachIds: ["u1"],
      members: [{ studentId: "s1", joinedAt: "2026-01-01T00:00:00Z" }, { studentId: "s2", joinedAt: "2026-01-01T00:00:00Z" }],
    }]),
    trainings: store([
      { _id: "r1", teamId: "t1", sportId: "sp1", startsAt: "2026-02-01T10:00:00Z", recorded: true, presentIds: ["s1"], place: "الملعب" },
      { _id: "r2", teamId: "t1", sportId: "sp1", startsAt: "2026-12-01T10:00:00Z", recorded: false, presentIds: [], place: "الملعب" },
    ]),
    users: store([{ _id: "u1", firstname: "خالد", lastname: "عمر", tz: COACH.tz, email: COACH.email, password: "x" }]),
    files: files || { extractFileId: () => "PHOTOFILEID123", downloadStream: async () => { const s = new PassThrough(); s.end("IMG"); return s; } },
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
  return { portal, call, logs };
}

test("me returns only the signed-in student's own card data", async () => {
  const { portal, call } = setup();
  const r = await call(portal.me, "s1");
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.ok, true);
  assert.deepEqual(r.body.student, { firstname: "علي", lastname: "حداد", age: 14, hasPhoto: true });
  assert.equal(r.body.cards.length, 1);
  assert.equal(r.body.cards[0].jerseyNumber, 7);
  assert.equal(r.body.cards[0].stats.attendance, 100);
  assert.equal(r.body.nextTraining.place, "الملعب");
  assert.deepEqual(r.body.teams[0].coachNames, ["خالد عمر"]);
  assert.deepEqual(r.body.teams[0].sport, { name: "كرة القدم", icon: "⚽" });
  const text = JSON.stringify(r.body);
  for (const v of [ME.tz, ME.email, ME.photo, "PHOTOFILEID123", "2012-03-15", MATE.tz, MATE.email, MATE.photo, "2011-07-01", COACH.tz, COACH.email]) {
    assert.ok(!text.includes(v), `leaked ${v}`);
  }
  for (const k of ["tz", "email", "photo", "birth_date", "password"]) {
    assert.ok(!text.includes(`"${k}"`), `key ${k}`);
  }
});

test("teammates appear by first and last name only", async () => {
  const { portal, call } = setup();
  const r = await call(portal.me, "s1");
  assert.deepEqual(r.body.teams[0].members, [
    { firstname: "علي", lastname: "حداد" },
    { firstname: "سامر", lastname: "نصار" },
  ]);
});

test("a student removed from sport gets 401", async () => {
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
