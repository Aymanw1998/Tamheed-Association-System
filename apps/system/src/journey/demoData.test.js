import { createDemoStore, demoUploadFile, DEMO_UPLOAD_NAME } from "./demoData";
import { isValidIsraeliId } from "../utils/israeliId";

const ARABIC = /[؀-ۿ]/;
const PHONE = /^050-000-00\d\d$/;
const PHONE_FIELDS = ["phone", "father_phone", "mother_phone"];
const NAME_FIELDS = ["firstname", "lastname", "father_name", "mother_name"];

const people = (store) => [...store.users, ...store.students];

test("the store holds every entity the screens need", () => {
  const store = createDemoStore();
  const roles = store.users.map((u) => u.role);
  expect(roles).toEqual(expect.arrayContaining(["ادارة", "مرشد", "مساعد"]));
  expect(store.students.length).toBeGreaterThanOrEqual(6);
  expect(new Set(store.students.map((s) => s.status)).size).toBeGreaterThan(1);
  expect(store.lessons.length).toBeGreaterThan(0);
  expect(store.lessons.every((l) => l.list_students.length > 0)).toBe(true);
  expect(store.attendance.length).toBeGreaterThan(0);
  expect(store.reports).toHaveLength(2);
  expect(store.vehicles).toHaveLength(1);
  expect(store.vehicles[0].documents.length).toBeGreaterThan(0);
  expect(store.files.some((f) => f.isDirectory)).toBe(true);
  expect(store.files.some((f) => !f.isDirectory)).toBe(true);
  expect(store.notices.length).toBeGreaterThan(0);
  expect(store.audit.length).toBeGreaterThan(0);
  expect(store.alerts.length).toBeGreaterThan(0);
});

test("a lesson falls on today so the dashboard has something to show", () => {
  const store = createDemoStore();
  const today = new Date().getDay() + 1;
  expect(store.lessons.some((l) => l.date.day === today)).toBe(true);
});

test("the vehicle has a document near expiry", () => {
  const store = createDemoStore();
  const [vehicle] = store.vehicles;
  const days = (date) => Math.round((new Date(`${date}T00:00:00Z`) - new Date(`${store.today}T00:00:00Z`)) / 86400000);
  expect(vehicle.licenses.some((l) => days(l.validUntil) >= 0 && days(l.validUntil) <= 30)).toBe(true);
});

test("every demo ID fails isValidIsraeliId", () => {
  const ids = people(createDemoStore()).map((p) => p.tz);
  expect(ids.length).toBeGreaterThan(0);
  ids.forEach((id) => expect(isValidIsraeliId(id)).toBe(false));
});

test("all names contain Arabic letters", () => {
  people(createDemoStore()).forEach((person) => {
    NAME_FIELDS.filter((field) => person[field] !== undefined).forEach((field) => {
      expect(person[field]).toMatch(ARABIC);
    });
  });
});

test("phones match 050-000-00NN", () => {
  people(createDemoStore()).forEach((person) => {
    PHONE_FIELDS.filter((field) => person[field]).forEach((field) => expect(person[field]).toMatch(PHONE));
  });
});

test("emails use the reserved example.com domain", () => {
  people(createDemoStore())
    .filter((p) => p.email)
    .forEach((p) => expect(p.email).toMatch(/@example\.com$/));
});

test("the signed-in user's id replaces the demo user of the same role", () => {
  const store = createDemoStore({ meId: "me-1", meTz: "123", role: "مرشد" });
  const guide = store.users.find((u) => u.role === "مرشد");
  expect(guide._id).toBe("me-1");
  expect(store.lessons.some((l) => l.teacher === "me-1")).toBe(true);
  expect(isValidIsraeliId(guide.tz)).toBe(false);
});

test("two accounts wait for approval with no role yet (dashboard and users chapters)", () => {
  const store = createDemoStore({ meId: "me-1", role: null });
  const waiting = store.users.filter((u) => u.room === "waiting");
  expect(waiting).toHaveLength(2);
  waiting.forEach((user) => {
    expect(user.role).toBeNull();
    expect(user._id).not.toBe("me-1");
  });
});

test("the store remembers the signed-in user's permissions, starts with no shares or uploads", () => {
  const store = createDemoStore({ meId: "me-1", role: "ادارة", permissions: ["users.view"], isSystem: false });
  expect(store.me.permissions).toEqual(["users.view"]);
  expect(store.me.isSystem).toBe(false);
  expect(createDemoStore().me.permissions).toEqual([]);
  expect(store.shares).toEqual([]);
  expect(store.uploads).toEqual({});
});

test("the guide's upload is a tiny synthetic file that is not in the store yet", () => {
  const file = demoUploadFile();
  expect(file).toBeInstanceOf(File);
  expect(file.name).toBe(DEMO_UPLOAD_NAME);
  expect(file.size).toBeLessThan(100);
  expect(createDemoStore().files.some((f) => f.name === DEMO_UPLOAD_NAME)).toBe(false);
});
