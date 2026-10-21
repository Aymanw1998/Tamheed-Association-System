import { TOURS, PENDING_TOURS } from "./registry";
import { RELEASES } from "./releases";
import { SECTIONS, SECTION_OF } from "./sections";
import { tourForPath, tourTabs } from "./logic";

const LANGS = ["ar", "he", "en"];
const filled = (t) => LANGS.every((l) => typeof t?.[l] === "string" && t[l].trim().length > 0);

test("tour ids are unique and well formed", () => {
  const ids = TOURS.map((t) => t.id);
  expect(new Set(ids).size).toBe(ids.length);
  ids.forEach((id) => expect(id).toMatch(/^[a-z][a-zA-Z0-9-]{0,39}$/));
});

test("every step has text in all languages, bodies up to 220 chars", () => {
  TOURS.forEach((tour) => tour.steps.forEach((s) => {
    expect(filled(s.title)).toBe(true);
    expect(filled(s.body)).toBe(true);
    LANGS.forEach((l) => expect(s.body[l].length).toBeLessThanOrEqual(220));
  }));
});

test("every section tour exists or is pending", () => {
  const ids = new Set(TOURS.map((t) => t.id));
  Object.values(SECTIONS).forEach(({ tourId }) => {
    expect(ids.has(tourId) || PENDING_TOURS.includes(tourId)).toBe(true);
  });
});

test("no tour is both pending and written", () => {
  const ids = new Set(TOURS.map((t) => t.id));
  PENDING_TOURS.forEach((id) => expect(ids.has(id)).toBe(false));
});

test("list tours are anchored and detail tours match one record", () => {
  TOURS.filter((t) => t.route).forEach((t) => {
    expect(t.route.source.startsWith("^")).toBe(true);
    expect(t.route.source.endsWith("$")).toBe(true);
  });
});

test("modules map to known sections or null", () => {
  Object.values(SECTION_OF).forEach((s) => expect(s === null || SECTIONS[s]).toBeTruthy());
});

test("releases are well formed", () => {
  const ids = RELEASES.map((r) => r.id);
  expect(new Set(ids).size).toBe(ids.length);
  const tourIds = new Set(TOURS.map((t) => t.id));
  RELEASES.forEach((r) => {
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(r.date))).toBe(false);
    expect(r.tourId === null || tourIds.has(r.tourId)).toBe(true);
    expect(filled(r.title)).toBe(true);
    expect(filled(r.body)).toBe(true);
  });
});

test("detail tours match one record, never /new or the parent sign-up page", () => {
  expect(tourForPath("/students/abc")?.id).toBe("student");
  expect(tourForPath("/students/new")).toBeNull();
  expect(tourForPath("/register-student/abc")).toBeNull();
  expect(tourForPath("/users")?.id).toBe("users");
  expect(tourForPath("/users/123")?.id).toBe("user");
  expect(tourForPath("/users/new")).toBeNull();
  expect(tourForPath("/profile")?.id).toBe("profile");
});

test("the user tour only switches to the tabs EditUser has", () => {
  const user = TOURS.find((t) => t.id === "user");
  expect(tourTabs(user)).toEqual(["permissions"]);
});

test("menu steps belong to the welcome tour and target menu entries", () => {
  TOURS.forEach((tour) => tour.steps.filter((s) => s.menu).forEach((s) => {
    expect(tour.id).toBe("welcome");
    expect(s.target).toMatch(/^menu(-[a-z]+)?$/);
  }));
  const welcome = TOURS.find((t) => t.id === "welcome");
  // The first targeted step is always on the page (desktop and phone), so the tour starts at once.
  expect(welcome.steps.find((s) => s.target).target).toBe("menu");
});
