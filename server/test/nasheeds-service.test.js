// The nasheed library (owner, 2026-11-27): a title and ordered lines (a verse
// with its صدر and عجز, a centered line, or a break), versioned edits, an
// audit row for every change, and delete to the recycle bin.
// Synthetic titles and words only.
const assert = require("node:assert/strict");
const test = require("node:test");
const { auditStub } = require("./helpers/auditStub");
const { matches } = require("./helpers/memoryModel");
const { createNasheeds, normalizeArabic, LIMITS } = require("../services/nasheeds");

function store(seed = []) {
  let docs = seed.map((d) => JSON.parse(JSON.stringify(d)));
  let next = 1;
  const copy = (d) => JSON.parse(JSON.stringify(d));
  return {
    async get(filter = {}) { return { success: true, result: docs.filter((d) => matches(d, filter)).map(copy) }; },
    async create(data) {
      const doc = { _id: data._id ? String(data._id) : String(next++).padStart(24, "e"), ...copy(data) };
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

function binStub() {
  const rows = [];
  return {
    rows,
    async put(kind, { refId, label, data, actor }) {
      const id = String(rows.length + 1).padStart(24, "b");
      rows.push({ _id: id, kind, refId: String(refId), label, data: JSON.parse(JSON.stringify(data)), actor });
      return id;
    },
    async drop(id) { const i = rows.findIndex((r) => r._id === id); if (i >= 0) rows.splice(i, 1); },
  };
}

function setup(seed = []) {
  const nasheeds = store(seed);
  const audit = auditStub();
  const bin = binStub();
  let clock = Date.parse("2026-11-27T10:00:00Z");
  const svc = createNasheeds({
    nasheeds, bin, audit: audit.deps["../../utils/audit"].audit,
    now: () => new Date((clock += 1000)),
  });
  return { svc, nasheeds, audit, bin };
}

const req = () => ({ actor: { id: "f".repeat(24), tz: "900000009", name: "منشد" }, headers: {} });
const verse = (sadr, ajuz) => ({ kind: "verse", sadr, ajuz });
const LINES = [{ kind: "center", text: "الله الله" }, verse("أَوْقَدْتَ فِي قَلْبِي هَوَاكْ", "وَقُلْتَ لِي إِيَّاكَ تَبُوحْ"), { kind: "break" }];

const status = async (promise) => {
  try { await promise; return 200; } catch (error) { return `${error.status} ${error.code}`; }
};

test("create trims, keeps tashkeel and the order, and drops empty rows", async () => {
  const { svc, audit } = setup();
  const doc = await svc.create({ title: "  أوقدت  ", lines: [{ kind: "center", text: "  " }, ...LINES, verse(" ", "")] }, req());
  assert.equal(doc.title, "أوقدت");
  assert.deepEqual(doc.lines, LINES);
  assert.ok(doc.updatedAt);
  assert.equal(audit.find({ module: "nasheeds", action: "create", targetLabel: "أوقدت" }).length, 1);
});

test("create refuses an empty or too-long title, a half-verse, an unknown kind, too many lines, or no text", async () => {
  const { svc, nasheeds } = setup();
  const long = "ا".repeat(LIMITS.text + 1);
  for (const body of [
    { title: "", lines: LINES },
    { title: "ا".repeat(LIMITS.title + 1), lines: LINES },
    { title: "ن", lines: [verse("صدر", "")] },
    { title: "ن", lines: [verse(long, "عجز")] },
    { title: "ن", lines: [{ kind: "center", text: long }] },
    { title: "ن", lines: [{ kind: "picture", text: "x" }] },
    { title: "ن", lines: [{ kind: "break" }] },
    { title: "ن", lines: [] },
    { title: "ن", lines: "not a list" },
    { title: "ن", lines: Array.from({ length: LIMITS.lines + 1 }, () => ({ kind: "center", text: "س" })) },
  ]) assert.equal(await status(svc.create(body, req())), "400 BAD_INPUT", JSON.stringify(body).slice(0, 80));
  assert.equal(nasheeds.all().length, 0);
});

test("only the known fields are stored", async () => {
  const { svc, nasheeds } = setup();
  await svc.create({ title: "ن", lines: [{ kind: "center", text: "س", color: "red" }], createdBy: "x", _id: "1".repeat(24) }, req());
  const [stored] = nasheeds.all();
  assert.deepEqual(stored.lines, [{ kind: "center", text: "س" }]);
  assert.notEqual(stored._id, "1".repeat(24));
  assert.equal(stored.createdBy?.tz, "900000009");
});

test("update refuses a stale updatedAt with 409 STALE and changes nothing", async () => {
  const { svc, nasheeds } = setup();
  const doc = await svc.create({ title: "ن", lines: LINES }, req());
  await svc.update(doc._id, { title: "ن2", lines: LINES, updatedAt: doc.updatedAt }, req());
  assert.equal(await status(svc.update(doc._id, { title: "ن3", lines: LINES, updatedAt: doc.updatedAt }, req())), "409 STALE");
  assert.equal(nasheeds.all()[0].title, "ن2");
});

test("update stamps a later updatedAt and writes an audit row with the title", async () => {
  const { svc, audit } = setup();
  const doc = await svc.create({ title: "ن", lines: LINES }, req());
  const after = await svc.update(doc._id, { title: "جديد", lines: LINES, updatedAt: doc.updatedAt }, req());
  assert.ok(new Date(after.updatedAt) > new Date(doc.updatedAt));
  assert.equal(audit.find({ module: "nasheeds", action: "update", targetLabel: "جديد" }).length, 1);
  assert.equal(await status(svc.update("9".repeat(24), { title: "x", lines: LINES, updatedAt: doc.updatedAt }, req())), "404 NOT_FOUND");
  assert.equal(await status(svc.get("not-an-id")), "404 NOT_FOUND");
});

test("remove puts the nasheed in the bin and deletes it; restore brings back the same _id", async () => {
  const { svc, nasheeds, bin, audit } = setup();
  const doc = await svc.create({ title: "ن", lines: LINES }, req());
  const { trashId } = await svc.remove(doc._id, req());
  assert.equal(nasheeds.all().length, 0);
  assert.equal(bin.rows[0]._id, trashId);
  assert.equal(bin.rows[0].kind, "nasheed");
  assert.equal(audit.find({ module: "nasheeds", action: "delete" }).length, 1);
  assert.deepEqual(await svc.trashHooks.restore(bin.rows[0], req()), { ok: true });
  assert.equal(nasheeds.all()[0]._id, doc._id);
  assert.deepEqual(nasheeds.all()[0].lines, LINES);
});

test("restore refuses when the _id already exists; purge has nothing to remove", async () => {
  const { svc, bin } = setup();
  const doc = await svc.create({ title: "ن", lines: LINES }, req());
  await svc.remove(doc._id, req());
  await svc.trashHooks.restore(bin.rows[0], req());
  const again = await svc.trashHooks.restore(bin.rows[0], req());
  assert.equal(again.ok, false);
  assert.equal(again.status, 409);
  assert.deepEqual(await svc.trashHooks.purge(bin.rows[0]), { failed: 0 });
});

test("list sorts by title and sends only _id, title, lines and updatedAt", async () => {
  const { svc } = setup();
  for (const title of ["يا", "أوقدت", "بدر"]) await svc.create({ title, lines: LINES }, req());
  const list = await svc.list();
  assert.deepEqual(list.map((n) => n.title), ["أوقدت", "بدر", "يا"]);
  assert.deepEqual(Object.keys(list[0]).sort(), ["_id", "lines", "title", "updatedAt"]);
  assert.deepEqual(Object.keys(await svc.get(list[0]._id)).sort(), ["_id", "lines", "title", "updatedAt"]);
});

test("normalizeArabic folds hamza, ta marbuta and alif maqsura and drops tashkeel", () => {
  assert.equal(normalizeArabic("أُنشودة"), normalizeArabic("انشوده"));
  assert.equal(normalizeArabic("إِلَى"), normalizeArabic("الي"));
  assert.equal(normalizeArabic("آمـــين"), normalizeArabic("امين"));
  assert.equal(normalizeArabic("ABC"), "abc");
});
