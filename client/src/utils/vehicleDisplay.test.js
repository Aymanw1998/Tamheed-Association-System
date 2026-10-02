import {
  countVehicles,
  documentIssues,
  expiryText,
  expiryTone,
  buildDownloadName,
  buildSuggestions,
  fillText,
  filterVehicles,
  formatDateOnly,
  formatInstant,
  instantDate,
  formatPlate,
  insuranceTone,
  personOptionLabel,
} from "./vehicleDisplay";
import { vehicleStrings } from "../i18n/vehicleStrings";

const labels = vehicleStrings.en.expiry;
const summary = (license, test, insurance) => ({ license, test, insurance });
const known = { state: "ok", daysLeft: 200, bucket: null };
const unknown = { state: "unknown", daysLeft: null, bucket: null };
const insActive = { status: "active", state: "ok", daysLeft: 200, bucket: null };

const car = (overrides = {}) => ({
  _id: "1",
  plate: "1234567",
  type: "vehicle",
  status: "active",
  nickname: "",
  make: "Toyota",
  model: "Hilux",
  summary: summary(known, known, insActive),
  ...overrides,
});

test("fillText substitutes placeholders and leaves unknown ones alone", () => {
  expect(fillText("In {n} days", { n: 5 })).toBe("In 5 days");
  expect(fillText("{a}-{b}", { a: 1 })).toBe("1-{b}");
});

test("formatDateOnly never goes through a Date object", () => {
  expect(formatDateOnly("2026-10-02")).toBe("02/10/2026");
  expect(formatDateOnly("")).toBe("");
  expect(formatDateOnly("2026-10-02T21:00:00Z")).toBe("");
});

test("formatInstant shows stored UTC instants on the Jerusalem calendar", () => {
  expect(formatInstant("2026-09-30T22:30:00.000Z")).toBe("01/10/2026 01:30");
  expect(instantDate("2026-09-30T22:30:00.000Z")).toBe("01/10/2026");
  expect(formatInstant("2026-01-15T10:00:00.000Z")).toBe("15/01/2026 12:00");
  expect(formatInstant("nope")).toBe("");
});

test("formatPlate groups Israeli plates and keeps leading zeros", () => {
  expect(formatPlate("1234567")).toBe("12-345-67");
  expect(formatPlate("12345678")).toBe("123-45-678");
  expect(formatPlate("0123456")).toBe("01-234-56");
  expect(formatPlate("AB123")).toBe("AB123");
});

test("expiryText covers expired, today, upcoming and unknown", () => {
  expect(expiryText({ state: "expired", daysLeft: -10 }, labels)).toBe("Expired 10 days ago");
  expect(expiryText({ state: "expired", daysLeft: -1 }, labels)).toBe("Expired yesterday");
  expect(expiryText({ state: "due", daysLeft: 0 }, labels)).toBe("Expires today");
  expect(expiryText({ state: "due", daysLeft: 5 }, labels)).toBe("In 5 days");
  expect(expiryText({ state: "ok", daysLeft: 90 }, labels)).toBe("In 90 days");
  expect(expiryText(unknown, labels)).toBe(labels.unknown);
});

test("missing information is never shown as healthy", () => {
  expect(expiryTone(unknown)).toBe("neutral");
  expect(expiryTone({ state: "ok" })).toBe("success");
  expect(expiryTone({ state: "expired" })).toBe("danger");
  expect(expiryTone({ state: "due", bucket: 7 })).toBe("danger");
  expect(expiryTone({ state: "due", bucket: 30 })).toBe("warning");
  expect(insuranceTone({ status: "none" })).toBe("warning");
  expect(insuranceTone({ status: "incomplete" })).toBe("warning");
  expect(insuranceTone({ status: "future" })).toBe("info");
  expect(insuranceTone({ status: "expired" })).toBe("danger");
  expect(insuranceTone({ status: "cancelled" })).toBe("neutral");
  expect(insuranceTone(insActive)).toBe("success");
});

test("documentIssues flags expired, soon and unknown independently", () => {
  expect(documentIssues(car())).toEqual({ expired: false, soon: false, unknown: false });
  expect(documentIssues(car({ summary: summary({ state: "expired" }, known, insActive) })).expired).toBe(true);
  expect(documentIssues(car({ summary: summary(known, { state: "due", bucket: 7 }, insActive) })).soon).toBe(true);
  expect(documentIssues(car({ summary: summary(known, known, { status: "none", state: "unknown" }) })).unknown).toBe(true);
});

test("filterVehicles searches plates regardless of separators, and names", () => {
  const list = [car(), car({ _id: "2", plate: "7654321", make: "Brenderup", nickname: "مقطورة المعدات", type: "trailer" })];
  expect(filterVehicles(list, { search: "12-345-67" }).map((v) => v._id)).toEqual(["1"]);
  expect(filterVehicles(list, { search: "345" }).map((v) => v._id)).toEqual(["1"]);
  expect(filterVehicles(list, { search: "المعدات" }).map((v) => v._id)).toEqual(["2"]);
  expect(filterVehicles(list, { search: "brender" }).map((v) => v._id)).toEqual(["2"]);
  expect(filterVehicles(list, { type: "trailer" }).map((v) => v._id)).toEqual(["2"]);
});

test("filterVehicles hides archived unless asked, and filters by document state", () => {
  const list = [
    car({ _id: "a" }),
    car({ _id: "b", status: "archived" }),
    car({ _id: "c", status: "out_of_service", summary: summary({ state: "expired" }, known, insActive) }),
    car({ _id: "d", summary: summary(known, { state: "due", bucket: 14 }, insActive) }),
    car({ _id: "e", summary: summary(unknown, known, insActive) }),
  ];
  expect(filterVehicles(list).map((v) => v._id)).toEqual(["a", "c", "d", "e"]);
  expect(filterVehicles(list, { status: "archived" }).map((v) => v._id)).toEqual(["b"]);
  expect(filterVehicles(list, { status: "out_of_service" }).map((v) => v._id)).toEqual(["c"]);
  expect(filterVehicles(list, { docs: "expired" }).map((v) => v._id)).toEqual(["c"]);
  expect(filterVehicles(list, { docs: "soon" }).map((v) => v._id)).toEqual(["d"]);
  expect(filterVehicles(list, { docs: "unknown" }).map((v) => v._id)).toEqual(["e"]);
  expect(filterVehicles(list, { docs: "attention" }).map((v) => v._id)).toEqual(["c", "d"]);
});

test("countVehicles ignores archived vehicles", () => {
  const list = [
    car(),
    car({ _id: "2", status: "archived", summary: summary({ state: "expired" }, known, insActive) }),
    car({ _id: "3", summary: summary({ state: "expired" }, known, insActive) }),
    car({ _id: "4", status: "out_of_service", summary: summary(unknown, known, insActive) }),
  ];
  expect(countVehicles(list)).toEqual({ total: 3, active: 2, expired: 1, soon: 0, unknown: 1 });
});

test("personOptionLabel tells people with the same name apart", () => {
  expect(personOptionLabel({ name: "علي أحمد", tzSuffix: "1234" })).toBe("علي أحمد (1234)");
  expect(personOptionLabel({ name: "علي أحمد" })).toBe("علي أحمد");
});

test("every language defines exactly the same vehicle text keys", () => {
  const flatten = (object, prefix = "") =>
    Object.entries(object).flatMap(([key, value]) =>
      value && typeof value === "object" ? flatten(value, `${prefix}${key}.`) : [`${prefix}${key}`]
    );
  const ar = flatten(vehicleStrings.ar).sort();
  expect(flatten(vehicleStrings.he).sort()).toEqual(ar);
  expect(flatten(vehicleStrings.en).sort()).toEqual(ar);
});

test("buildSuggestions ticks empty fields only and never replaces entered data silently", () => {
  const form = { make: "Toyota", model: "", year: "2019", color: "", chassisNumber: "ABC" };
  const proposed = { make: "toyota", model: "Hilux", year: 2020, color: "", chassisNumber: "XYZ" };
  const rows = buildSuggestions(form, proposed);
  expect(rows.map((row) => row.field)).toEqual(["model", "year", "chassisNumber"]);
  const byField = Object.fromEntries(rows.map((row) => [row.field, row]));
  expect(byField.model).toMatchObject({ conflict: false, defaultChecked: true });
  expect(byField.year).toMatchObject({ conflict: true, defaultChecked: false });
  expect(byField.chassisNumber).toMatchObject({ conflict: true, defaultChecked: false });
  expect(buildSuggestions({ make: "A" }, {})).toEqual([]);
});

test("buildDownloadName uses the user's name, the plate and the real extension", () => {
  const stored = "83104204_test_20261002151656.pdf";
  expect(buildDownloadName({ title: "إيصال الرخصة 2026", kindLabel: "رخصة", plate: "83104204", storedName: stored })).toBe(
    "83104204 - إيصال الرخصة 2026.pdf"
  );
  expect(buildDownloadName({ kindLabel: "نتيجة فحص", plate: "83104204", storedName: stored })).toBe("83104204 - نتيجة فحص.pdf");
  expect(buildDownloadName({ title: 'a/b:c*"d?<e>|f', plate: "1", storedName: "x.PNG" })).toBe("1 - a b c d e f.png");
  expect(buildDownloadName({ title: "  ...  ", kindLabel: "Receipt", storedName: "x.jpg" })).toBe("Receipt.jpg");
  expect(buildDownloadName({ storedName: "noext" })).toBe("document");
  expect(buildDownloadName({ title: "x".repeat(300), storedName: "a.pdf" }).length).toBe(124);
});
