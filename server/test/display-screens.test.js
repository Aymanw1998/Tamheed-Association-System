const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { auditStub } = require("./helpers/auditStub");
const { matches } = require("./helpers/memoryModel");
const { createDisplayScreens, LAYOUTS } = require("../services/displayScreens");

// Wall display screens (owner, 2026-11-12): a screen is a name, a layout and
// the SHA-256 of its secret link. The feed is the whole weekly program with
// lesson name, time, room and guide, and nothing else.

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const TEACHER = "a".repeat(24);
const HELPER = "b".repeat(24);
const IT_ONLY = "c".repeat(24);
const GONE = "d".repeat(24);

function store(seed = []) {
  let docs = seed.map((d) => JSON.parse(JSON.stringify(d)));
  let next = 1;
  const copy = (d) => JSON.parse(JSON.stringify(d));
  return {
    async get(filter = {}) { return { success: true, result: docs.filter((d) => matches(d, filter)).map(copy) }; },
    async create(data) {
      const doc = { _id: String(next++).padStart(24, "e"), ...copy(data) };
      docs.push(doc);
      return { success: true, result: copy(doc) };
    },
    async updateExisting(filter, patch) {
      let hit = null;
      docs = docs.map((d) => (!hit && matches(d, filter) ? (hit = { ...d, ...copy(patch) }) : d));
      return { success: true, result: hit && copy(hit) };
    },
    async delete(filter) {
      const before = docs.length;
      docs = docs.filter((d) => !matches(d, filter));
      return { success: true, result: { deletedCount: before - docs.length } };
    },
    all: () => docs,
  };
}

function setup({ lessons, sport, users } = {}) {
  const screens = store();
  const audit = auditStub();
  const svc = createDisplayScreens({
    screens,
    lessons: store(lessons || []),
    sportLessons: store(sport || []),
    users: store(users || [{ _id: TEACHER, tz: "111111111", firstname: "سامي", lastname: "حداد", role: "مرشد" }]),
    audit: audit.deps["../../utils/audit"].audit,
    now: () => new Date("2026-11-10T14:20:00Z"),
  });
  return { svc, screens, audit };
}

const req = () => ({ actor: { id: "f".repeat(24) }, headers: {} });

test("layouts are week, today and rotate", () => {
  assert.deepEqual(LAYOUTS, ["week", "today", "rotate"]);
});

test("create stores only the digest and returns the secret once", async () => {
  const { svc, screens } = setup();
  const { screen, secret } = await svc.create({ name: " المدخل ", layout: "today" }, req());
  assert.match(secret, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(screen.name, "المدخل");
  assert.equal(screen.layout, "today");
  assert.equal(screens.all()[0].tokenHash, sha256(secret));
  assert.ok(!JSON.stringify(screens.all()).includes(secret));
  const listed = (await svc.list())[0];
  assert.ok(!("tokenHash" in listed));
  assert.deepEqual(Object.keys(listed).sort(), ["createdAt", "id", "layout", "name"]);
  assert.ok(!("tokenHash" in screen));
});

test("bad name or layout is BAD_INPUT", async () => {
  const { svc, screens } = setup();
  for (const body of [{ name: "", layout: "week" }, { name: "   ", layout: "week" }, { name: "x".repeat(61), layout: "week" }, { name: "شاشة", layout: "grid" }, { name: 5, layout: "week" }]) {
    await assert.rejects(svc.create(body, req()), { status: 400, code: "BAD_INPUT" });
  }
  assert.equal(screens.all().length, 0);
  const { screen } = await svc.create({ name: "x".repeat(60), layout: "week" }, req());
  await assert.rejects(svc.update(screen.id, { layout: "grid" }, req()), { status: 400, code: "BAD_INPUT" });
  await assert.rejects(svc.update(screen.id, { name: "" }, req()), { status: 400, code: "BAD_INPUT" });
});

test("unknown screen id is NOT_FOUND", async () => {
  const { svc } = setup();
  const id = "9".repeat(24);
  await assert.rejects(svc.update(id, { layout: "week" }, req()), { status: 404, code: "NOT_FOUND" });
  await assert.rejects(svc.rotate(id, req()), { status: 404, code: "NOT_FOUND" });
  await assert.rejects(svc.remove(id, req()), { status: 404, code: "NOT_FOUND" });
});

test("feed: lessons with guide, sport without guide, nothing else", async () => {
  const { svc } = setup({
    lessons: [{
      name: "رياضيات", teacher: TEACHER, helper: HELPER, list_students: ["s1", "s2"], list_users: [HELPER],
      room: "1", date: { day: 3, startMin: 840, endMin: 900 },
    }],
    sport: [{ name: "كرة قدم", date: { day: 3, startMin: 960, endMin: 1050 }, players: ["p1"] }],
  });
  const { secret } = await svc.create({ name: "المدخل", layout: "week" }, req());
  const feed = await svc.feed(secret);
  assert.deepEqual(Object.keys(feed).sort(), ["layout", "lessons", "name", "serverTime"]);
  assert.equal(feed.name, "المدخل");
  assert.equal(feed.layout, "week");
  assert.equal(feed.serverTime, "2026-11-10T14:20:00.000Z");
  assert.equal(feed.lessons.length, 2);
  assert.deepEqual(feed.lessons[0], { name: "رياضيات", day: 3, startMin: 840, endMin: 900, room: "1", guide: "سامي حداد", kind: "lesson" });
  assert.deepEqual(feed.lessons[1], { name: "كرة قدم", day: 3, startMin: 960, endMin: 1050, room: "9", guide: null, kind: "sport" });
});

test("feed is ordered by day then start", async () => {
  const at = (day, startMin) => ({ name: `${day}-${startMin}`, teacher: TEACHER, room: "2", date: { day, startMin, endMin: startMin + 60 } });
  const { svc } = setup({ lessons: [at(4, 600), at(2, 900), at(2, 600)], sport: [{ name: "كرة", date: { day: 1, startMin: 960, endMin: 1020 } }] });
  const { secret } = await svc.create({ name: "a", layout: "week" }, req());
  assert.deepEqual((await svc.feed(secret)).lessons.map((l) => l.name), ["كرة", "2-600", "2-900", "4-600"]);
});

test("teacher missing, inactive or hidden IT user → guide null", async () => {
  const lesson = (name, teacher) => ({ name, teacher, room: "3", date: { day: 1, startMin: 600, endMin: 660 } });
  const { svc } = setup({
    users: [{ _id: IT_ONLY, tz: "222222222", firstname: "تقني", lastname: "خفي", isIT: true }],
    lessons: [lesson("بلا مرشد", null), lesson("مرشد محذوف", GONE), lesson("مرشد خفي", IT_ONLY), lesson("معرف غريب", "not-an-id")],
  });
  const { secret } = await svc.create({ name: "a", layout: "week" }, req());
  const feed = await svc.feed(secret);
  assert.equal(feed.lessons.length, 4);
  for (const row of feed.lessons) assert.equal(row.guide, null, row.name);
});

test("lesson with day outside 1..7 or no times is left out; room 0 or empty is null", async () => {
  const { svc } = setup({
    lessons: [
      { name: "يوم 0", teacher: TEACHER, room: "1", date: { day: 0, startMin: 600, endMin: 660 } },
      { name: "يوم 8", teacher: TEACHER, room: "1", date: { day: 8, startMin: 600, endMin: 660 } },
      { name: "بلا تاريخ", teacher: TEACHER, room: "1" },
      { name: "بلا وقت", teacher: TEACHER, room: "1", date: { day: 2 } },
      { name: "غرفة 0", teacher: TEACHER, room: "0", date: { day: 2, startMin: 600, endMin: 660 } },
      { name: "بلا غرفة", teacher: TEACHER, date: { day: 2, startMin: 700, endMin: 760 } },
    ],
  });
  const { secret } = await svc.create({ name: "a", layout: "week" }, req());
  const feed = await svc.feed(secret);
  assert.deepEqual(feed.lessons.map((l) => [l.name, l.room]), [["غرفة 0", null], ["بلا غرفة", null]]);
});

test("malformed, unknown, rotated and removed secrets are LINK_CLOSED", async () => {
  const { svc } = setup();
  const closed = { status: 410, code: "LINK_CLOSED" };
  await assert.rejects(svc.feed("x"), closed);
  await assert.rejects(svc.feed(undefined), closed);
  await assert.rejects(svc.feed({ $ne: null }), closed);
  await assert.rejects(svc.feed(crypto.randomBytes(32).toString("base64url")), closed);

  const { screen, secret } = await svc.create({ name: "a", layout: "week" }, req());
  const { secret: fresh } = await svc.rotate(screen.id, req());
  assert.notEqual(fresh, secret);
  await assert.rejects(svc.feed(secret), closed);
  assert.equal((await svc.feed(fresh)).name, "a");

  await svc.remove(screen.id, req());
  await assert.rejects(svc.feed(fresh), closed);
});

test("layout and name change is in the next feed", async () => {
  const { svc } = setup();
  const { screen, secret } = await svc.create({ name: "a", layout: "week" }, req());
  const { screen: changed } = await svc.update(screen.id, { layout: "rotate", name: " b " }, req());
  assert.equal(changed.layout, "rotate");
  assert.equal(changed.name, "b");
  const feed = await svc.feed(secret);
  assert.equal(feed.layout, "rotate");
  assert.equal(feed.name, "b");
});

test("an edit is audited as update, like every other module", async () => {
  const { svc, audit } = setup();
  const { screen } = await svc.create({ name: "a", layout: "week" }, req());
  await svc.update(screen.id, { layout: "today" }, req());
  const row = audit.calls[1];
  assert.equal(row.action, "update");
  assert.deepEqual(row.before, { name: "a", layout: "week" });
  assert.deepEqual(row.after, { name: "a", layout: "today" });
});

test("create, rotate and remove are audited without the secret", async () => {
  const { svc, audit } = setup();
  const { screen, secret } = await svc.create({ name: "المدخل", layout: "week" }, req());
  const { secret: fresh } = await svc.rotate(screen.id, req());
  await svc.remove(screen.id, req());
  const rows = audit.calls.map(({ req: _r, ...rest }) => rest);
  assert.deepEqual(rows.map((r) => r.action), ["create", "rotateLink", "delete"]);
  for (const row of rows) {
    assert.equal(row.module, "displays");
    assert.equal(row.targetId, screen.id);
    const text = JSON.stringify(row);
    assert.ok(!text.includes(secret) && !text.includes(fresh));
    assert.ok(!text.includes("tokenHash"));
  }
});

test("guide names are looked up together, not one after another", async () => {
  const people = [1, 2, 3, 4].map((n) => ({ _id: String(n).repeat(24), firstname: `م${n}`, lastname: "س" }));
  const users = store(people);
  let open = 0;
  let most = 0;
  const slowUsers = {
    async get(filter, scope) {
      open += 1; most = Math.max(most, open);
      await new Promise((r) => setTimeout(r, 5));
      open -= 1;
      return users.get(filter, scope);
    },
  };
  const lessons = people.map((p, i) => ({ name: `ب${i}`, teacher: p._id, room: "1", date: { day: 1, startMin: 600 + i, endMin: 660 } }));
  const svc = createDisplayScreens({
    screens: store(), lessons: store(lessons), sportLessons: store(), users: slowUsers,
    audit: { record: async () => {} }, now: () => new Date("2026-11-10T14:20:00Z"),
  });
  const { secret } = await svc.create({ name: "a", layout: "week" }, req());
  const feed = await svc.feed(secret);
  assert.deepEqual(feed.lessons.map((l) => l.guide), ["م1 س", "م2 س", "م3 س", "م4 س"]);
  assert.ok(most > 1, `lookups ran one at a time (${most})`);
});
