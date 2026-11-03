import { mergeScan, scanToDraft } from "./vehicleScan";

const proposed = {
  plate: "1234567",
  vehicle: { make: "Ford", model: null, year: 2019, color: null, chassisNumber: null },
  license: { validFrom: "2026-01-01", validUntil: "2026-12-31", feeAmount: 1300 },
  policy: { insurer: "هرئيل", policyNumber: null, type: "mandatory", startDate: "2026-01-01", endDate: "2026-12-31", cost: 1800 },
};

test("maps only the target form's non-empty fields, as form strings", () => {
  expect(scanToDraft("license", proposed)).toEqual({ validFrom: "2026-01-01", validUntil: "2026-12-31", feeAmount: "1300" });
  expect(scanToDraft("policy", proposed)).toEqual({ insurer: "هرئيل", type: "mandatory", startDate: "2026-01-01", endDate: "2026-12-31", cost: "1800" });
  expect(scanToDraft("vehicle", proposed)).toEqual({ plate: "1234567", make: "Ford", year: "2019" });
});

test("never overwrites what the user already typed", () => {
  const { draft, filled, skipped } = mergeScan({ insurer: "منورا", endDate: "" }, { insurer: "هرئيل", endDate: "2026-12-31" });
  expect(draft).toEqual({ insurer: "منورا", endDate: "2026-12-31" });
  expect(filled).toEqual(["endDate"]);
  expect(skipped).toEqual(["insurer"]);
});
