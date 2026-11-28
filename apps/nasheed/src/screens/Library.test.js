// The library list (owner, 2026-11-27): titles A–Z, search over the title and
// every text in the lines, across spellings and without tashkeel.
import Library from "./Library.jsx";
import * as api from "../api";
import { SessionProvider } from "../session.jsx";
import { mount, unmountAll, ok, fail, type, flush } from "../testUtils";

jest.mock("../api", () => ({ ...jest.requireActual("../api"), getMe: jest.fn(), listPublic: jest.fn() }));

const n = (id, title, lines) => ({ _id: String(id).repeat(24), title, lines, updatedAt: "2026-11-27T10:00:00.000Z" });
const LIST = [
  n("b", "يا رسول الله", [{ kind: "center", text: "صلوا عليه" }]),
  n("a", "أُنشودة الفجر", [{ kind: "verse", sadr: "طَلَعَ البَدْرُ عَلَيْنَا", ajuz: "مِنْ ثَنِيَّاتِ الوَدَاعْ" }]),
  n("c", "بدر", [{ kind: "break" }, { kind: "center", text: "الله الله" }]),
];

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  api.getMe.mockImplementation(() => fail(401, { code: "NASHEED_SIGNED_OUT" }));
  api.listPublic.mockImplementation(() => ok({ nasheeds: LIST }));
});
afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

const shown = (c) => [...c.querySelectorAll("ul.list a")].map((a) => a.textContent.trim());
const render = async () => { const c = await mount(<SessionProvider><Library /></SessionProvider>); await flush(); return c; };

test("the list shows titles sorted and each opens its read page", async () => {
  const c = await render();
  expect(shown(c)).toEqual(["أُنشودة الفجر", "بدر", "يا رسول الله"]);
  expect(c.querySelector("ul.list a").getAttribute("href")).toBe(`/n/${"a".repeat(24)}`);
});

test("an empty library says «لا توجد أناشيد بعد»", async () => {
  api.listPublic.mockImplementation(() => ok({ nasheeds: [] }));
  const c = await render();
  expect(c.textContent).toContain("لا توجد أناشيد بعد");
});

test("a failed load says why and offers to try again", async () => {
  api.listPublic.mockImplementation(() => fail(500, { message: "خطأ" }));
  const c = await render();
  expect(c.querySelector("[role=alert]").textContent).toContain("خطأ");
  expect([...c.querySelectorAll("button")].some((b) => b.textContent === "إعادة المحاولة")).toBe(true);
});

test("search matches the title across spellings (انشوده finds أُنشودة)", async () => {
  const c = await render();
  await type(c.querySelector("input[type=search]"), "انشوده");
  expect(shown(c)).toEqual(["أُنشودة الفجر"]);
});

test("search matches any text in the lines and ignores tashkeel", async () => {
  const c = await render();
  await type(c.querySelector("input[type=search]"), "ثنيات الوداع");
  expect(shown(c)).toEqual(["أُنشودة الفجر"]);
  await type(c.querySelector("input[type=search]"), "صلوا");
  expect(shown(c)).toEqual(["يا رسول الله"]);
  await type(c.querySelector("input[type=search]"), "لا شيء هنا");
  expect(c.textContent).toContain("لا توجد نتائج");
});
