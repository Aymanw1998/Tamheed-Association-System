// IT's switch for the administrators' powers.
const assert = require("node:assert/strict");
const test = require("node:test");
const { createAdminPowers } = require("../Entities/It/AdminPowers.controller");
const { adminPowersOn, setAdminPowers } = require("../utils/permissionRules");

const store = (rows = []) => ({
  rows,
  async readKey(key) { return rows.find((r) => r.key === key) || null; },
  async write(key, data) { rows.splice(0, rows.length, { key, ...data }); },
});
const res = () => ({ statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });
const audited = () => { const calls = []; return { calls, record: async (_r, row) => calls.push(row) }; };

test.afterEach(() => setAdminPowers(true));

test("the stored value is applied at start; with no row the powers stay on", async () => {
  await createAdminPowers({ model: store(), audit: audited() }).load();
  assert.equal(adminPowersOn(), true);
  await createAdminPowers({ model: store([{ key: "adminPowers", enabled: false }]), audit: audited() }).load();
  assert.equal(adminPowersOn(), false);
});

test("GET answers the state, PUT saves it, applies it and writes the audit log", async () => {
  const model = store();
  const audit = audited();
  const ctl = createAdminPowers({ model, audit });
  const read = res();
  await ctl.get({}, read);
  assert.deepEqual(read.body, { ok: true, enabled: true });
  const put = res();
  await ctl.put({ body: { enabled: false } }, put);
  assert.deepEqual(put.body, { ok: true, enabled: false });
  assert.equal(adminPowersOn(), false);
  assert.equal(model.rows[0].enabled, false);
  assert.equal(audit.calls[0].action, "admin_powers_change");
});

test("PUT refuses anything but a boolean", async () => {
  const out = res();
  await createAdminPowers({ model: store(), audit: audited() }).put({ body: { enabled: "no" } }, out);
  assert.equal(out.statusCode, 400);
  assert.equal(adminPowersOn(), true);
});
