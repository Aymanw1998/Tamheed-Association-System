const assert = require("node:assert/strict");
const test = require("node:test");
const job = require("../services/vehicleExpiryJob");

const NOW = new Date("2026-10-13T22:30:00Z"); // 01:30 on 2026-10-14 in Jerusalem

function fakeDeps({ vehicles = [], admins = [{ id: "a", name: "A", email: "a@x.org" }], smtp = true, failEmailFor = "" } = {}) {
  const notices = [];
  const runs = [];
  const mails = [];
  return {
    notices, runs, mails,
    async loadVehicles() { return vehicles; },
    async existingDedupKeys() { return new Set(notices.map((n) => n.dedupKey)); },
    async publishNotice(n) {
      if (notices.some((x) => x.dedupKey === n.dedupKey)) return { created: false };
      notices.push(n); return { created: true, notice: n };
    },
    async listRecipients() { return admins; },
    smtpConfigured: () => smtp,
    async sendDigest(to, digest) { if (to === failEmailFor) throw new Error("smtp down"); mails.push({ to, digest }); },
    async findRun(jobName, date) { return runs.find((r) => r.job === jobName && r.date === date) || null; },
    async saveRun(row) { runs.push(row); },
    log() {},
  };
}

const vehicle = { _id: "v1", plate: "1234567", status: "active", licenses: [{ validUntil: "2026-11-13" }], nextTestDate: "2027-05-01", policies: [{ startDate: "2026-01-01", endDate: "2026-12-10" }] }; // licence 30 days, insurance 57 days

test("creates notices for new alerts and mails each admin once", async () => {
  const deps = fakeDeps({ vehicles: [vehicle], admins: [{ id: "a", email: "a@x.org" }, { id: "b", email: "b@x.org" }] });
  const result = await job.runVehicleExpiryCheck({ now: NOW, deps });
  assert.equal(result.today, "2026-10-14");
  assert.equal(result.created, 2); // licence due30 + insurance due60 (test date is > 60 days away)
  assert.equal(result.emailed, 2);
  assert.equal(deps.runs.length, 1);
});

test("a second run the same day creates nothing and sends no mail", async () => {
  const deps = fakeDeps({ vehicles: [vehicle] });
  await job.runVehicleExpiryCheck({ now: NOW, deps });
  const second = await job.runVehicleExpiryCheck({ now: NOW, deps });
  assert.equal(second.created, 0);
  assert.equal(deps.mails.length, 1);
});

test("without SMTP or with a failing address, notices still land and other admins get mail", async () => {
  const noSmtp = fakeDeps({ vehicles: [vehicle], smtp: false });
  const r1 = await job.runVehicleExpiryCheck({ now: NOW, deps: noSmtp });
  assert.equal(r1.created, 2);
  assert.equal(r1.emailed, 0);

  const partial = fakeDeps({ vehicles: [vehicle], admins: [{ id: "a", email: "bad@x.org" }, { id: "b", email: "b@x.org" }], failEmailFor: "bad@x.org" });
  const r2 = await job.runVehicleExpiryCheck({ now: NOW, deps: partial });
  assert.equal(r2.emailed, 1);
  assert.equal(r2.emailErrors, 1);
});

test("catch-up runs once after 01:00 and never twice on the same day", async () => {
  const deps = fakeDeps({ vehicles: [vehicle] });
  const before = await job.catchUpVehicleExpiryCheck({ now: new Date("2026-10-13T21:30:00Z"), deps }); // 00:30 local
  assert.equal(before, null);
  const first = await job.catchUpVehicleExpiryCheck({ now: NOW, deps });
  assert.equal(first.trigger, "catch-up");
  const second = await job.catchUpVehicleExpiryCheck({ now: NOW, deps });
  assert.equal(second, null);
});

test("a failing vehicle query records the error and publishes a system notice", async () => {
  const deps = fakeDeps();
  deps.loadVehicles = async () => { throw new Error("db down"); };
  const result = await job.runVehicleExpiryCheck({ now: NOW, deps });
  assert.match(result.error, /db down/);
  assert.equal(deps.notices[0].category, "system");
  assert.equal(deps.notices[0].dedupKey, "system:vehicleExpiry:failed:2026-10-14");
  assert.match(deps.runs[0].error, /db down/);
});

test("concurrent runs: the second one is skipped", async () => {
  const deps = fakeDeps({ vehicles: [vehicle] });
  const [a, b] = await Promise.all([
    job.runVehicleExpiryCheck({ now: NOW, deps }),
    job.runVehicleExpiryCheck({ now: NOW, deps }),
  ]);
  assert.deepEqual([a.skipped, b.skipped].filter(Boolean), ["running"]);
});

test("one failing publish does not stop the others and the digest lists only created notices", async () => {
  const deps = fakeDeps({ vehicles: [vehicle] });
  const real = deps.publishNotice;
  let calls = 0;
  deps.publishNotice = async (n) => {
    calls += 1;
    if (calls === 1) throw new Error("write failed");
    return real(n);
  };
  const result = await job.runVehicleExpiryCheck({ now: NOW, deps });
  assert.equal(result.created, 1);
  assert.equal(deps.notices.length, 1);
  assert.equal(result.emailed, 1);
  assert.equal(deps.mails.length, 1);
  assert.equal(result.error, undefined);
});

test("each new notice also raises a personal alert (same dedup key); a failing alert changes nothing", async () => {
  const deps = fakeDeps({ vehicles: [vehicle] });
  const raised = [];
  deps.raiseVehicleAlert = async (alert, notice) => { raised.push({ alert, notice }); };
  await job.runVehicleExpiryCheck({ now: NOW, deps });
  assert.equal(raised.length, 2);
  assert.deepEqual(raised.map((r) => r.notice.dedupKey).sort(), deps.notices.map((n) => n.dedupKey).sort());
  assert.ok(raised.every((r) => r.alert.vehicleId === "v1" && ["license", "insurance"].includes(r.alert.kind)));

  await job.runVehicleExpiryCheck({ now: NOW, deps });
  assert.equal(raised.length, 2, "no new notice, no new alert");

  const failing = fakeDeps({ vehicles: [vehicle] });
  failing.raiseVehicleAlert = async () => { throw new Error("alerts down"); };
  const result = await job.runVehicleExpiryCheck({ now: NOW, deps: failing });
  assert.equal(result.created, 2);
  assert.equal(result.error, undefined);
  assert.equal(failing.mails.length, 1);
});
