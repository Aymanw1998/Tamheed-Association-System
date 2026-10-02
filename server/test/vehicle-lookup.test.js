const assert = require("node:assert/strict");
const test = require("node:test");

const { buildProposal, lookupByPlate, plateToNumber } = require("../services/vehicleLookup.service");

const record = {
  mispar_rechev: 1234567,
  tozeret_nm: "טויוטה יפן",
  degem_nm: "TGN121",
  kinuy_mishari: "היילקס",
  shnat_yitzur: 2019,
  tzeva_rechev: "לבן",
  misgeret: "abc123def456",
  baalut: "פרטי",
  tokef_dt: "2027-01-01",
  mivchan_acharon_dt: "2026-01-01",
  kvutzat_zihum: 5,
  ignored_field: "x",
};
const fixedNow = () => new Date("2026-10-02T10:00:00.000Z");
const reply = (data) => ({ get: async () => ({ data }) });

test("only digit plates of 5-8 characters can be looked up", () => {
  assert.equal(plateToNumber("1234567"), 1234567);
  assert.equal(plateToNumber("AB123"), null);
  assert.equal(plateToNumber("12"), null);
  assert.equal(plateToNumber(""), null);
});

test("a found record becomes a pending proposal with its source and time", async () => {
  const result = await lookupByPlate("1234567", { http: reply({ success: true, result: { records: [record] } }), now: fixedNow });
  assert.equal(result.available, true);
  assert.equal(result.found, true);
  const { proposal } = result;
  assert.equal(proposal.status, "pending_review");
  assert.equal(proposal.fetchedAt, "2026-10-02T10:00:00.000Z");
  assert.equal(proposal.source.name, "data.gov.il");
  assert.deepEqual(proposal.proposed, { make: "טויוטה יפן", model: "היילקס", year: 2019, color: "לבן", chassisNumber: "ABC123DEF456" });
});

test("dates and ownership from the source are information only, never proposed fields", () => {
  const proposal = buildProposal(record, { plateKey: "1234567", fetchedAt: "t" });
  assert.deepEqual(Object.keys(proposal.proposed).sort(), ["chassisNumber", "color", "make", "model", "year"]);
  assert.equal(proposal.informational.tokef_dt, "2027-01-01");
  assert.equal(proposal.informational.mivchan_acharon_dt, "2026-01-01");
  assert.equal(proposal.informational.ignored_field, undefined);
});

test("the query filters on the plate number and is bounded", async () => {
  let seen;
  const http = { get: async (url, options) => { seen = { url, options }; return { data: { success: true, result: { records: [] } } }; } };
  await lookupByPlate("1234567", { http });
  assert.match(seen.url, /^https:\/\/data\.gov\.il\//);
  assert.deepEqual(JSON.parse(seen.options.params.filters), { mispar_rechev: 1234567 });
  assert.ok(seen.options.params.limit <= 2);
  assert.ok(seen.options.timeout <= 10000);
});

test("not found, ambiguous and unusable plates are ordinary answers", async () => {
  const empty = await lookupByPlate("1234567", { http: reply({ success: true, result: { records: [] } }) });
  assert.deepEqual([empty.available, empty.found, empty.reason], [true, false, "not_found"]);
  const two = await lookupByPlate("1234567", { http: reply({ success: true, result: { records: [record, record] } }) });
  assert.deepEqual([two.found, two.reason], [false, "ambiguous"]);
  const letters = await lookupByPlate("AB123", { http: reply({}) });
  assert.deepEqual([letters.found, letters.reason], [false, "not_applicable"]);
});

test("a failing or odd service never throws and never blocks manual entry", async () => {
  const down = await lookupByPlate("1234567", { http: { get: async () => { throw new Error("ECONNRESET"); } } });
  assert.deepEqual([down.available, down.reason], [false, "unreachable"]);
  const odd = await lookupByPlate("1234567", { http: reply({ success: false }) });
  assert.deepEqual([odd.available, odd.reason], [false, "bad_response"]);
  const html = await lookupByPlate("1234567", { http: reply("<html>") });
  assert.equal(html.available, false);
});
