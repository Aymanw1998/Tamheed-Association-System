const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const catalog = require("../../shared/permissions.json");
const { PERMISSION_TREE, IT_KEYS, can, effectivePermissions, checkRoleDefaults } = require("../utils/permissions");
const { syncPermissions } = require("../../scripts/syncPermissions");

test("System, IT and server share the complete permission catalog", () => {
  syncPermissions({ check: true });
  assert.deepEqual(PERMISSION_TREE, catalog.tree);
  assert.deepEqual([...IT_KEYS], catalog.itKeys);
  for (const app of ["system", "it"]) {
    assert.deepEqual(require(`../../apps/${app}/src/generated/permissions.json`), catalog);
  }
  assert.ok(catalog.tree.tasks.includes("manage"));
  assert.deepEqual(catalog.tree.rules, ["view", "edit"]);
});

test("new shared labels never grant access or make IT actions role defaults", () => {
  assert.ok(can(effectivePermissions({ role: "ادارة" }), "tasks.manage"));
  assert.ok(!can(effectivePermissions({ role: "مرشد" }), "tasks.manage"));
  assert.equal(checkRoleDefaults(["permissions.manage"]).ok, false);
  assert.equal(checkRoleDefaults(["unknown.manage"]).ok, false);
  assert.equal(checkRoleDefaults(["tasks.manage"]).ok, true);
});

// Users as lesson participants (owner, 2026-11-09): its own key, held by an
// admin through the lessons module and never by a guide or helper by default.
test("lessons.staffRoster exists with its label and is an admin default only", () => {
  assert.ok(catalog.tree.lessons.includes("staffRoster"));
  assert.equal(catalog.labels.ar.leaves.staffRoster, "إضافة موظفين كمشاركين");
  assert.ok(can(effectivePermissions({ role: "ادارة" }), "lessons.staffRoster"));
  assert.ok(!can(effectivePermissions({ role: "مرشد" }), "lessons.staffRoster"));
  assert.ok(!can(effectivePermissions({ role: "مساعد" }), "lessons.staffRoster"));
});

test("changing the canonical catalog updates both clients without hand editing mirrors", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tamheed-catalog-"));
  try {
    const synthetic = JSON.parse(JSON.stringify(catalog));
    synthetic.labels.ar.modules.tasks = "اسم تجريبي";
    synthetic.tree.tasks.push("testOnly");
    synthetic.labels.ar.leavesByModule.tasks.testOnly = "عملية تجريبية";
    fs.mkdirSync(path.join(root, "shared"));
    fs.writeFileSync(path.join(root, "shared/permissions.json"), JSON.stringify(synthetic));
    assert.throws(() => syncPermissions({ root, check: true }), /Stale permission catalog/);
    syncPermissions({ root });
    syncPermissions({ root, check: true });
    for (const app of ["system", "it"]) {
      const generated = JSON.parse(fs.readFileSync(path.join(root, "apps", app, "src/generated/permissions.json"), "utf8"));
      assert.deepEqual(generated, synthetic);
    }
  } finally {
    // Only this freshly allocated synthetic temporary directory.
    fs.rmSync(root, { recursive: true, force: true });
  }
});
