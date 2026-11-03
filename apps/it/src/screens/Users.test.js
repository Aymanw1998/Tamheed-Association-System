import Users from "./Users.jsx";
import * as api from "../api";
import { mount, unmountAll, ok, button, click, type, byText } from "../testUtils";

jest.mock("../api", () => ({ ...jest.requireActual("../api"), getUsers: jest.fn() }));

const ROWS = [
  { tz: "100000001", firstname: "سامر", lastname: "الأول", role: "ادارة", isIT: false, photo: "https://example.org/a.jpg", lockedAt: null, room: "active" },
  { tz: "100000002", firstname: "ليلى", lastname: "الثانية", role: "مرشد", isIT: false, photo: null, lockedAt: "2026-11-01T10:00:00Z", room: "waiting" },
  { tz: "100000003", firstname: "نادر", lastname: "الثالث", role: null, isIT: true, photo: null, lockedAt: null, room: "noActive" },
];

beforeEach(() => { api.getUsers.mockImplementation(() => ok({ users: ROWS })); });
afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

const rows = (c) => [...c.querySelectorAll("li[data-user]")].map((li) => li.getAttribute("data-user"));

test("Users: lists every room with photos and a «فلتر» window", async () => {
  const c = await mount(<Users />);
  expect(api.getUsers).toHaveBeenCalledWith();
  // Every room, one list.
  expect(rows(c)).toEqual(["100000001", "100000002", "100000003"]);
  expect(c.textContent).toContain("بانتظار القبول");
  expect(c.textContent).toContain("غير نشط");
  expect(c.textContent).toContain("مقفل");

  // A small round photo, loaded lazily; the first letter when there is none.
  const photo = c.querySelector('li[data-user="100000001"] img');
  expect(photo.getAttribute("loading")).toBe("lazy");
  expect(photo.getAttribute("src")).toBe("https://example.org/a.jpg");
  expect(c.querySelector('li[data-user="100000002"] img')).toBeNull();
  expect(c.querySelector('li[data-user="100000002"]').textContent).toContain("ل");

  // The «فلتر» window: closed until opened, then filters by room and by role.
  expect(c.querySelector("[role=dialog]")).toBeNull();
  await click(button(c, "فلتر"));
  const dialog = c.querySelector("[role=dialog]");
  expect(dialog).not.toBeNull();
  await type(dialog.querySelector('select[name="room"]'), "waiting");
  expect(rows(c)).toEqual(["100000002"]);
  expect(c.querySelector("button[aria-haspopup]").textContent).toContain("1");
  await click(byText(dialog, "button", "مسح الفلتر"));
  expect(rows(c)).toHaveLength(3);

  await type(dialog.querySelector('select[name="role"]'), "none");
  expect(rows(c)).toEqual(["100000003"]);
});

test("Users: search by name or ID number", async () => {
  const c = await mount(<Users />);
  await type(c.querySelector('input[type="search"]'), "ليلى");
  expect(rows(c)).toEqual(["100000002"]);
  await type(c.querySelector('input[type="search"]'), "100000003");
  expect(rows(c)).toEqual(["100000003"]);
});

test("Users: each row opens the user page", async () => {
  const c = await mount(<Users />);
  expect(c.querySelector('li[data-user="100000001"] a').getAttribute("href")).toBe("/users/100000001");
});
