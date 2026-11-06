# Actual Claude review: vehicle version timestamp collision

Codex implements; actual Claude Code reviews without editing or running tools.
Review only the included source patch. Do not access services, files, real data,
environment, runtime logs, or another reviewer.

While checking the desktop-only patch, CI exposed an existing concurrent vehicle
save regression: two writes with the same baseVersion could both succeed if the
first write's updatedAt equaled the read version within the same millisecond.
This is source-confirmed and deterministically reproduced with a frozen clock.

The fix advances updatedAt beyond the read version (max of now and previous+1ms)
while retaining the existing atomic updateExisting/sameVersion predicate. The
shared vehicle save helper handles guarded and unguarded writes. No permission,
schema, migration, route, live database or API payload shape change is made.

Two isolated VM-clock tests fail before the fix and pass after: same-millisecond
parallel requests accept one and reject the other with 409; backwards-clock
writes still advance the version. Both check preservation of the winning data,
rejection of stale retries and acceptance of a fresh-version edit. All focused
vehicle-controller checks passed; full npm run verify is in progress.

Please report concrete risks with file/line and failure scenario or explicitly
no findings. This is a separate bounded stability patch from desktop navigation.

The final patch reuses the existing nextStamp(current, nowMs) helper from lockGuard.
It returns new Date(max(nowMs, finite(previous updatedAt) + 1)). Vehicle keeps
its ISO string field; passing Date.now() explicitly keeps clock behavior at the
caller and allows deterministic isolated clock tests.

```diff
diff --git a/server/Entities/Vehicle/Vehicle.controller.js b/server/Entities/Vehicle/Vehicle.controller.js
index a1a8f0d..ef87a02 100644
--- a/server/Entities/Vehicle/Vehicle.controller.js
+++ b/server/Entities/Vehicle/Vehicle.controller.js
@@ -8,7 +8,7 @@ const { can, isSystemTz, actorRef, actorDisplayName, SYSTEM_ACTOR_NAME, isHidden
 const { inspectDocument, buildDocumentName } = require("../../utils/vehicleFiles.js");
 const { lookupByPlate } = require("../../services/vehicleLookup.service.js");
 const { audit: auditLog } = require("../../utils/audit.js");
-const { checkVersion, editorStamp, sameVersion, raceLost } = require("../../middleware/lockGuard.js");
+const { checkVersion, editorStamp, sameVersion, nextStamp, raceLost } = require("../../middleware/lockGuard.js");
 const { notifyChange } = require("../../services/liveHub.js");
 const recordAlerts = require("../../services/recordAlerts.js");

@@ -92,7 +92,10 @@ const syncAlerts = (vehicle) => Promise.resolve()
   .catch((err) => logWithSource("Vehicle.syncAlerts", err));

 async function saveVehicle(vehicle, patch, actor, { guarded = false } = {}) {
-  const data = { ...patch, updatedBy: actorId(actor), updatedByName: actorId(actor) === "system" ? SYSTEM_ACTOR_NAME : String(actor?.name ?? ""), updatedAt: new Date().toISOString() };
+  // updatedAt is the compare-and-swap version: even a same-tick save or a
+  // backwards clock must consume the old version so it cannot be reused.
+  const updatedAt = nextStamp(vehicle, Date.now()).toISOString();
+  const data = { ...patch, updatedBy: actorId(actor), updatedByName: actorId(actor) === "system" ? SYSTEM_ACTOR_NAME : String(actor?.name ?? ""), updatedAt };
   if (guarded) {
     const written = await VehicleModelDef.updateExisting(sameVersion({ _id: String(vehicle._id) }, vehicle), data);
     if (!written?.result) return null;
diff --git a/server/test/vehicle-controller.test.js b/server/test/vehicle-controller.test.js
index a108bc5..6d756ef 100644
--- a/server/test/vehicle-controller.test.js
+++ b/server/test/vehicle-controller.test.js
@@ -51,7 +51,7 @@ const FOUR = { _id: "5".padStart(24, "c"), tz: "555555550", firstname: "Fo", las

 const lookupStub = { lookupByPlate: async (plate) => ({ available: true, found: false, reason: "stub", plate }) };

-function setup({ vehicles = [], extraUsers = [] } = {}) {
+function setup({ vehicles = [], extraUsers = [], clock } = {}) {
   const vehicleStore = createStore(vehicles);
   const auditStore = createStore();
   const userStore = createStore([ADMIN, GUIDE, VIEWER, DOCS, FOUR, FIVE, ...extraUsers]);
@@ -99,6 +99,7 @@ function setup({ vehicles = [], extraUsers = [] } = {}) {
     module,
     process,
     Buffer,
+    ...(clock ? { Date: clock } : {}),
     require(name) {
       if (!Object.hasOwn(dependencies, name) && Object.hasOwn(live.deps, name)) return live.deps[name];
       assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
@@ -849,6 +850,39 @@ test("two vehicle saves on the same version at once: one is written, the other i
   assert.equal(vehicleStore.all().find((v) => String(v._id) === String(id)).make, winner);
 });

+for (const shift of [0, -60_000]) {
+  test(`concurrent vehicle saves reject a reused version when the clock ${shift ? "moves backwards" : "stays in the same millisecond"}`, async () => {
+    let now = Date.parse("2026-01-01T12:00:00.000Z");
+    class Clock extends Date {
+      constructor(...args) { super(...(args.length ? args : [now])); }
+      static now() { return now; }
+    }
+    const { controller, vehicleStore } = setup({ clock: Clock });
+    const created = await createVehicle(controller);
+    const id = created.body.vehicle._id;
+    const base = created.body.vehicle.updatedAt;
+    now += shift;
+    const { req } = await guard(controller, "edit", ADMIN);
+    const a = createRes(), b = createRes();
+    await Promise.all([
+      controller.update({ ...req, params: { id }, body: { make: "Mazda", baseVersion: base } }, a),
+      controller.update({ ...req, params: { id }, body: { make: "Honda", baseVersion: base } }, b),
+    ]);
+    assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 409]);
+    assert.equal((a.statusCode === 409 ? a : b).body.code, "STALE");
+    const saved = vehicleStore.all().find((v) => String(v._id) === String(id));
+    assert.equal(saved.make, a.statusCode === 200 ? "Mazda" : "Honda");
+    assert.ok(Date.parse(saved.updatedAt) > Date.parse(base));
+    const stale = createRes();
+    await controller.update({ ...req, params: { id }, body: { make: "Stale", baseVersion: base } }, stale);
+    assert.equal(stale.statusCode, 409);
+    const fresh = createRes();
+    await controller.update({ ...req, params: { id }, body: { make: "Fresh", baseVersion: saved.updatedAt } }, fresh);
+    assert.equal(fresh.statusCode, 200);
+    assert.ok(Date.parse(fresh.body.vehicle.updatedAt) > Date.parse(saved.updatedAt));
+  });
+}
+
 // Owner, 2026-11-02: deleting a vehicle removes every alert and notice about
 // it; saving one keeps only the alerts of its current stages, so a renewal
 // removes the old alert at once.
```
