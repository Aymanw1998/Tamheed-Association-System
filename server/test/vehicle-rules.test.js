const assert = require("node:assert/strict");
const test = require("node:test");

const rules = require("../utils/vehicleRules");

const TODAY = "2026-10-02";

test("normalizePlate unifies formatting and keeps leading zeros as text", () => {
  assert.equal(normalize("12-345-67"), "1234567");
  assert.equal(normalize(" 12 345 67 "), "1234567");
  assert.equal(normalize("012.345.67"), "01234567");
  assert.equal(normalize("ab-123"), "AB123");
  assert.equal(typeof normalize("0012345"), "string");
  assert.equal(normalize("0012345"), "0012345");

  function normalize(value) {
    return rules.normalizePlate(value);
  }
});

test("validatePlate rejects empty and malformed plates", () => {
  assert.notEqual(rules.validatePlate(""), "");
  assert.notEqual(rules.validatePlate("12"), "");
  assert.notEqual(rules.validatePlate("12/345/67"), "");
  assert.equal(rules.validatePlate("12-345-67"), "");
});

test("todayInJerusalem uses the Jerusalem calendar date, not UTC", () => {
  // 22:30 UTC on 30 Sep is already 1 Oct in Israel (UTC+3 in summer).
  assert.equal(rules.todayInJerusalem(new Date("2026-09-30T22:30:00Z")), "2026-10-01");
  // 21:30 UTC in winter (UTC+2) is 23:30 the same day.
  assert.equal(rules.todayInJerusalem(new Date("2026-01-15T21:30:00Z")), "2026-01-15");
  // 22:30 UTC in winter is already the next day.
  assert.equal(rules.todayInJerusalem(new Date("2026-01-15T22:30:00Z")), "2026-01-16");
});

test("isValidDateOnly accepts real calendar dates only", () => {
  assert.equal(rules.isValidDateOnly("2026-02-28"), true);
  assert.equal(rules.isValidDateOnly("2024-02-29"), true);
  assert.equal(rules.isValidDateOnly("2026-02-29"), false);
  assert.equal(rules.isValidDateOnly("2026-13-01"), false);
  assert.equal(rules.isValidDateOnly("01/02/2026"), false);
  assert.equal(rules.isValidDateOnly(""), false);
  assert.equal(rules.isValidDateOnly(undefined), false);
});

test("daysBetween counts whole calendar days across month and DST boundaries", () => {
  assert.equal(rules.daysBetween("2026-10-02", "2026-10-02"), 0);
  assert.equal(rules.daysBetween("2026-10-02", "2026-11-01"), 30);
  assert.equal(rules.daysBetween("2026-03-26", "2026-03-30"), 4);
  assert.equal(rules.daysBetween("2026-10-05", "2026-10-02"), -3);
});

test("expiryStatus: valid through the end date, expired the day after", () => {
  assert.equal(rules.expiryStatus("2026-10-02", TODAY).state, "due");
  assert.equal(rules.expiryStatus("2026-10-02", TODAY).bucket, 7);
  assert.equal(rules.expiryStatus("2026-10-01", TODAY).state, "expired");
});

test("expiryStatus buckets at 30, 14 and 7 days and is ok beyond", () => {
  assert.equal(rules.expiryStatus("2026-11-01", TODAY).bucket, 30);
  assert.equal(rules.expiryStatus("2026-11-02", TODAY).state, "ok");
  assert.equal(rules.expiryStatus("2026-10-16", TODAY).bucket, 14);
  assert.equal(rules.expiryStatus("2026-10-17", TODAY).bucket, 30);
  assert.equal(rules.expiryStatus("2026-10-09", TODAY).bucket, 7);
  assert.equal(rules.expiryStatus("2026-10-10", TODAY).bucket, 14);
});

test("expiryStatus: a missing or malformed date is unknown, never ok", () => {
  assert.equal(rules.expiryStatus("", TODAY).state, "unknown");
  assert.equal(rules.expiryStatus(undefined, TODAY).state, "unknown");
  assert.equal(rules.expiryStatus("soon", TODAY).state, "unknown");
});

test("policyStatus follows recorded data: future is not active, cancelled never is", () => {
  const policy = { startDate: "2026-01-01", endDate: "2026-12-31" };
  assert.equal(rules.policyStatus(policy, TODAY), "active");
  assert.equal(rules.policyStatus({ startDate: "2026-11-01", endDate: "2027-10-31" }, TODAY), "future");
  assert.equal(rules.policyStatus({ startDate: "2025-01-01", endDate: "2025-12-31" }, TODAY), "expired");
  // Dates say "active", but it was cancelled.
  assert.equal(rules.policyStatus({ ...policy, cancelledAt: "2026-06-01" }, TODAY), "cancelled");
  assert.equal(rules.policyStatus({ startDate: "2026-01-01" }, TODAY), "incomplete");
  assert.equal(rules.policyStatus({ endDate: "2026-12-31" }, TODAY), "incomplete");
  assert.equal(rules.policyStatus({ startDate: "2026-12-31", endDate: "2026-01-01" }, TODAY), "incomplete");
  // Start and end days themselves are covered.
  assert.equal(rules.policyStatus({ startDate: TODAY, endDate: TODAY }, TODAY), "active");
});

test("insuranceSummary uses only the vehicle's own policies", () => {
  assert.equal(rules.insuranceSummary([], TODAY).status, "none");
  assert.equal(rules.insuranceSummary(undefined, TODAY).status, "none");

  const expired = { startDate: "2025-01-01", endDate: "2025-12-31" };
  const future = { startDate: "2026-11-01", endDate: "2027-10-31" };
  const cancelled = { startDate: "2026-01-01", endDate: "2026-12-31", cancelledAt: "2026-02-01" };
  const incomplete = { startDate: "2026-01-01" };

  assert.equal(rules.insuranceSummary([expired], TODAY).status, "expired");
  assert.equal(rules.insuranceSummary([expired, future], TODAY).status, "future");
  assert.equal(rules.insuranceSummary([cancelled], TODAY).status, "cancelled");
  assert.equal(rules.insuranceSummary([expired, incomplete], TODAY).status, "incomplete");

  const activeShort = { startDate: "2026-01-01", endDate: "2026-12-01" };
  const activeLong = { startDate: "2026-01-01", endDate: "2027-03-01" };
  const summary = rules.insuranceSummary([activeShort, expired, activeLong, cancelled], TODAY);
  assert.equal(summary.status, "active");
  assert.equal(summary.endDate, "2027-03-01");
});

test("currentLicense picks the furthest validity and ignores payment status", () => {
  const records = [
    { validUntil: "2025-05-01", feeStatus: "paid" },
    { validUntil: "2026-05-01", feeStatus: "unpaid" },
    { validUntil: "2027-05-01", voidedAt: "2026-01-01" },
  ];
  assert.equal(rules.currentLicense(records).validUntil, "2026-05-01");
  assert.equal(rules.currentLicense([]), null);
  assert.equal(rules.currentLicense([{ feeStatus: "paid" }]), null);
});

test("effectiveTestDue uses the documented date and never adds a year", () => {
  const vehicle = {
    nextTestDate: "2027-03-10",
    tests: [{ result: "passed", testDate: "2026-03-10", recordedAt: "2026-03-11T08:00:00Z" }],
  };
  assert.deepEqual(rules.effectiveTestDue(vehicle), { dueDate: "2027-03-10", source: "official" });
  // No official date recorded: nothing is invented from the test date.
  assert.equal(rules.effectiveTestDue({ tests: vehicle.tests }).dueDate, "");
});

test("a failed test with a retest date makes the retest the due date", () => {
  const vehicle = {
    nextTestDate: "2027-03-10",
    tests: [
      { result: "passed", testDate: "2025-03-10", recordedAt: "2025-03-10T08:00:00Z" },
      { result: "failed", testDate: "2026-09-20", retestDate: "2026-10-20", recordedAt: "2026-09-20T08:00:00Z" },
    ],
  };
  assert.deepEqual(rules.effectiveTestDue(vehicle), { dueDate: "2026-10-20", source: "retest" });
});

test("buildAlerts raises one alert per kind at the right level", () => {
  const vehicle = {
    _id: "v1",
    plate: "1234567",
    status: "active",
    responsibleId: "u1",
    licenses: [{ validUntil: "2026-10-12" }], // 10 days -> due14
    nextTestDate: "2026-09-30", // expired
    policies: [{ startDate: "2026-01-01", endDate: "2026-10-05" }], // 3 days -> due7
  };
  const alerts = rules.buildAlerts(vehicle, TODAY);
  const byKind = Object.fromEntries(alerts.map((alert) => [alert.kind, alert]));
  assert.equal(byKind.license.level, "due14");
  assert.equal(byKind.test.level, "expired");
  assert.equal(byKind.insurance.level, "due7");
  assert.equal(alerts.length, 3);
  assert.equal(new Set(alerts.map((alert) => alert.key)).size, 3);
});

test("buildAlerts treats missing data as unknown, not as healthy", () => {
  const alerts = rules.buildAlerts({ _id: "v2", plate: "7654321", status: "active" }, TODAY);
  assert.equal(alerts.length, 3);
  assert.ok(alerts.every((alert) => alert.level === "missing"));
});

test("buildAlerts is quiet when everything is far from expiry, and for archived vehicles", () => {
  const healthy = {
    _id: "v3",
    plate: "1111111",
    status: "active",
    licenses: [{ validUntil: "2027-06-01" }],
    nextTestDate: "2027-06-01",
    policies: [{ startDate: "2026-01-01", endDate: "2027-06-01" }],
  };
  assert.deepEqual(rules.buildAlerts(healthy, TODAY), []);
  assert.deepEqual(rules.buildAlerts({ ...healthy, status: "archived", licenses: [] }, TODAY), []);
});

test("renewing a document moves its alert instead of repeating it", () => {
  const before = { _id: "v4", plate: "2222222", status: "active", licenses: [{ validUntil: "2026-10-05" }],
    nextTestDate: "2027-06-01", policies: [{ startDate: "2026-01-01", endDate: "2027-06-01" }] };
  const after = { ...before, licenses: [...before.licenses, { validUntil: "2027-10-05" }] };
  assert.equal(rules.buildAlerts(before, TODAY).length, 1);
  assert.equal(rules.buildAlerts(after, TODAY).length, 0);
});

test("a future-only policy raises a missing-cover alert instead of looking covered", () => {
  const vehicle = { _id: "v5", plate: "3333333", status: "active", licenses: [{ validUntil: "2027-06-01" }],
    nextTestDate: "2027-06-01", policies: [{ startDate: "2026-11-01", endDate: "2027-10-31" }] };
  const alerts = rules.buildAlerts(vehicle, TODAY);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].kind, "insurance");
  assert.equal(alerts[0].level, "missing");
});

test("filterAlertsForUser: administrators see all, others only their assigned vehicles", () => {
  const alerts = [
    { key: "a", responsibleId: "u1" },
    { key: "b", responsibleId: "u2" },
    { key: "c", responsibleId: "" },
  ];
  assert.equal(rules.filterAlertsForUser(alerts, { id: "x", roles: ["ادارة"] }).length, 3);
  assert.deepEqual(rules.filterAlertsForUser(alerts, { id: "u1", roles: ["مرشد"] }).map((a) => a.key), ["a"]);
  assert.deepEqual(rules.filterAlertsForUser(alerts, { roles: ["مرشد"] }), []);
});

test("hasVehiclePermission: admin has all, others need explicit grants and view", () => {
  const admin = { roles: ["ادارة"] };
  const guide = { roles: ["مرشد"] };
  for (const permission of rules.PERMISSIONS) {
    assert.equal(rules.hasVehiclePermission(admin, permission), true);
    assert.equal(rules.hasVehiclePermission(guide, permission), false);
  }
  const viewer = { roles: ["مرشد"], vehiclePermissions: ["view"] };
  assert.equal(rules.hasVehiclePermission(viewer, "view"), true);
  assert.equal(rules.hasVehiclePermission(viewer, "edit"), false);
  // Edit without view does not work: you cannot change what you cannot see.
  const editorOnly = { roles: ["مرشد"], vehiclePermissions: ["edit"] };
  assert.equal(rules.hasVehiclePermission(editorOnly, "edit"), false);
  const editor = { roles: ["مرشد"], vehiclePermissions: ["view", "edit"] };
  assert.equal(rules.hasVehiclePermission(editor, "edit"), true);
  assert.equal(rules.hasVehiclePermission(editor, "archive"), false);
  assert.equal(rules.hasVehiclePermission(admin, "unknown"), false);
});

test("sanitizeVehiclePermissions keeps only known permissions", () => {
  assert.deepEqual(rules.sanitizeVehiclePermissions(["view", "root", "edit", "edit"]), ["view", "edit"]);
  assert.deepEqual(rules.sanitizeVehiclePermissions("view"), []);
});

test("validateVehicle checks plate, type, year and trailer weights", () => {
  const ok = { plate: "12-345-67", type: "trailer", year: 2018,
    trailer: { selfWeightKg: 400, grossWeightKg: 750, payloadKg: 350, brakes: "no" } };
  assert.deepEqual(rules.validateVehicle(ok, { today: TODAY }), {});

  const bad = rules.validateVehicle(
    { plate: "", type: "boat", year: 1800,
      trailer: { selfWeightKg: -1, grossWeightKg: "abc", brakes: "maybe" } },
    { today: TODAY }
  );
  assert.ok(bad.plate && bad.type && bad.year);
  assert.ok(bad["trailer.selfWeightKg"] && bad["trailer.grossWeightKg"] && bad["trailer.brakes"]);

  const lighter = rules.validateVehicle(
    { plate: "1234567", type: "trailer", trailer: { selfWeightKg: 900, grossWeightKg: 750 } },
    { today: TODAY }
  );
  assert.ok(lighter["trailer.grossWeightKg"]);
  // Next year's model is allowed, two years ahead is not.
  assert.deepEqual(rules.validateVehicle({ plate: "1234567", type: "vehicle", year: 2027 }, { today: TODAY }), {});
  assert.ok(rules.validateVehicle({ plate: "1234567", type: "vehicle", year: 2028 }, { today: TODAY }).year);
});

test("validateLicense requires a real end date and consistent range, amount", () => {
  assert.deepEqual(rules.validateLicense({ validUntil: "2027-01-01", feeStatus: "paid", feeAmount: "1500.5" }), {});
  assert.ok(rules.validateLicense({}).validUntil);
  assert.ok(rules.validateLicense({ validFrom: "2027-02-01", validUntil: "2027-01-01" }).validUntil);
  assert.ok(rules.validateLicense({ validUntil: "2027-01-01", feeAmount: -5 }).feeAmount);
  assert.ok(rules.validateLicense({ validUntil: "2027-01-01", feeStatus: "maybe" }).feeStatus);
});

test("validateTest requires a reason for exemption and dates for results", () => {
  assert.deepEqual(rules.validateTest({ result: "not_done" }), {});
  assert.ok(rules.validateTest({ result: "exempt" }).exemptionReason);
  assert.deepEqual(rules.validateTest({ result: "exempt", exemptionReason: "مقطورة خفيفة" }), {});
  assert.ok(rules.validateTest({ result: "passed" }).testDate);
  assert.ok(rules.validateTest({ result: "failed", testDate: "2026-09-20", retestDate: "2026-09-01" }).retestDate);
  assert.ok(rules.validateTest({ result: "good" }).result);
});

test("validatePolicy checks type, insurer, range, amounts and driver age", () => {
  const ok = { type: "mandatory", insurer: "הראל", policyNumber: "A1", startDate: "2026-01-01",
    endDate: "2026-12-31", cost: 2400, deductible: 0, minDriverAge: 24 };
  assert.deepEqual(rules.validatePolicy(ok), {});
  assert.ok(rules.validatePolicy({ ...ok, type: "x" }).type);
  assert.ok(rules.validatePolicy({ ...ok, insurer: " " }).insurer);
  assert.ok(rules.validatePolicy({ ...ok, endDate: "2025-12-31" }).endDate);
  assert.ok(rules.validatePolicy({ ...ok, cost: -1 }).cost);
  assert.ok(rules.validatePolicy({ ...ok, minDriverAge: 10 }).minDriverAge);
  // Missing dates are accepted (saved as incomplete), not rejected.
  assert.deepEqual(rules.validatePolicy({ type: "other", insurer: "x" }), {});
});

test("diffFields reports only the values that changed", () => {
  const before = { plate: "1234567", trailer: { brakes: "no" }, notes: "" };
  const after = { plate: "1234567", trailer: { brakes: "yes" }, notes: "" };
  assert.deepEqual(rules.diffFields(before, after, ["plate", "trailer.brakes", "notes"]), [
    { field: "trailer.brakes", from: "no", to: "yes" },
  ]);
});
