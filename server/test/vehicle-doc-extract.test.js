const assert = require("node:assert/strict");
const test = require("node:test");
const ex = require("../services/vehicleDocExtract.service");

const raw = (extra = {}) => ({
  documentType: "policy", plate: "12-345-67",
  vehicle: { make: "Ford", model: "Transit", year: 2019, color: null, chassisNumber: null },
  license: { validFrom: null, validUntil: null, feeAmount: null },
  policy: { insurer: "הראל", policyNumber: "A1", type: "mandatory", startDate: "2026-01-01", endDate: "2026-12-31", cost: 1800 },
  notes: null, ...extra,
});

test("valid fields pass through, plate normalised", () => {
  const out = ex.sanitizeExtraction(raw());
  assert.equal(out.documentType, "policy");
  assert.equal(out.proposed.plate, "1234567");
  assert.equal(out.proposed.policy.endDate, "2026-12-31");
  assert.deepEqual(out.warnings, []);
});

test("impossible dates become null with a warning", () => {
  const out = ex.sanitizeExtraction(raw({ policy: { ...raw().policy, endDate: "2026-02-30" } }));
  assert.equal(out.proposed.policy.endDate, null);
  assert.ok(out.warnings.includes("invalid_date:policy.endDate"));
});

test("swapped start/end dates are flagged", () => {
  const out = ex.sanitizeExtraction(raw({ policy: { ...raw().policy, startDate: "2027-01-01", endDate: "2026-12-31" } }));
  assert.ok(out.warnings.includes("dates_reversed:policy"));
});

test("unknown policy type falls back to other; plate mismatch is flagged", () => {
  const out = ex.sanitizeExtraction(raw({ policy: { ...raw().policy, type: "super" } }), { expectedPlate: "7654321" });
  assert.equal(out.proposed.policy.type, "other");
  assert.ok(out.warnings.includes("plate_mismatch"));
});

test("no API key means not configured, no throw", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const out = await ex.extractVehicleDocument({ buffer: Buffer.from("x"), mime: "image/png" });
  assert.deepEqual(out, { available: false, reason: "not_configured" });
  if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
});

test("sends a document block for PDFs and parses the JSON reply", async () => {
  let sent;
  const client = { beta: { messages: { async create(params) { sent = params; return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(raw()) }] }; } } } };
  const out = await ex.extractVehicleDocument({ buffer: Buffer.from("%PDF-1.4"), mime: "application/pdf", client });
  assert.equal(out.available, true);
  assert.equal(out.proposed.policy.insurer, "הראל");
  assert.equal(sent.model, "claude-opus-5-5");
  assert.equal(sent.messages[0].content[0].type, "document");
  assert.equal(sent.fallbacks, "default");
  assert.equal(sent.output_config.format.type, "json_schema");
});

test("a refusal is reported, not parsed", async () => {
  const client = { beta: { messages: { async create() { return { stop_reason: "refusal", content: [] }; } } } };
  const out = await ex.extractVehicleDocument({ buffer: Buffer.from("x"), mime: "image/jpeg", client });
  assert.deepEqual(out, { available: false, reason: "refused" });
});

const { createExtractController } = require("../Entities/Vehicle/VehicleExtract.controller");
const res = () => ({ statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

test("extract endpoint rejects a missing or disallowed file", async () => {
  const { extractDocument } = createExtractController({ extract: async () => ({ available: true }), findVehicle: async () => null });
  const r1 = res(); await extractDocument({ body: {} }, r1);
  assert.equal(r1.statusCode, 400);
  const r2 = res(); await extractDocument({ body: {}, file: { buffer: Buffer.from("hello") } }, r2);
  assert.equal(r2.statusCode, 400);
});

test("extract endpoint passes the vehicle plate and returns the proposal", async () => {
  let args;
  const { extractDocument } = createExtractController({
    extract: async (a) => { args = a; return { available: true, documentType: "license", proposed: {}, warnings: [], source: {} }; },
    findVehicle: async (id) => (id === "a".repeat(24) ? { plate: "1234567" } : null),
  });
  const r = res();
  await extractDocument({ body: { vehicleId: "a".repeat(24), expected: "license" }, file: { buffer: PNG } }, r);
  assert.equal(r.statusCode, 200);
  assert.equal(args.expectedPlate, "1234567");
  assert.equal(args.mime, "image/png");
  assert.equal(args.expected, "license");
});

test("extract endpoint reports 503 when not configured", async () => {
  const { extractDocument } = createExtractController({ extract: async () => ({ available: false, reason: "not_configured" }), findVehicle: async () => null });
  const r = res(); await extractDocument({ body: {}, file: { buffer: PNG } }, r);
  assert.equal(r.statusCode, 503);
  assert.equal(r.body.reason, "not_configured");
});

test("a max_tokens stop is unreadable and the answering model is recorded", async () => {
  const cut = { beta: { messages: { async create() { return { stop_reason: "max_tokens", content: [{ type: "text", text: "{" }] }; } } } };
  assert.deepEqual(await ex.extractVehicleDocument({ buffer: Buffer.from("x"), mime: "image/png", client: cut }), { available: false, reason: "unreadable" });
  const ok = { beta: { messages: { async create() { return { stop_reason: "end_turn", model: "other-model", content: [{ type: "text", text: JSON.stringify(raw()) }] }; } } } };
  const out = await ex.extractVehicleDocument({ buffer: Buffer.from("x"), mime: "image/png", client: ok });
  assert.equal(out.source.model, "other-model");
});

test("extract endpoint rejects documents over 5MB or 5 PDF pages", async () => {
  let called = false;
  const { extractDocument } = createExtractController({ extract: async () => { called = true; return { available: true }; }, findVehicle: async () => null });
  const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
  const r1 = res(); await extractDocument({ body: {}, file: { buffer: big } }, r1);
  assert.equal(r1.statusCode, 400);
  assert.match(r1.body.message, /المستند كبير جدًا/);
  const pdf = (n) => Buffer.from("%PDF-1.4\n1 0 obj << /Type /Pages >> endobj\n" + "<< /Type /Page >>\n".repeat(n) + "%%EOF");
  const r2 = res(); await extractDocument({ body: {}, file: { buffer: pdf(6) } }, r2);
  assert.equal(r2.statusCode, 400);
  assert.equal(called, false);
  const r3 = res(); await extractDocument({ body: {}, file: { buffer: pdf(5) } }, r3);
  assert.equal(r3.statusCode, 200);
});
