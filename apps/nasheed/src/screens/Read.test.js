// The read page (owner, 2026-11-27): one nasheed laid out like the PDF, for
// reading on a phone; edit and delete only for the signed-in manager.
import Read from "./Read.jsx";
import * as api from "../api";
import { SessionProvider } from "../session.jsx";
import { mount, unmountAll, ok, fail, flush, byText } from "../testUtils";

jest.mock("../api", () => ({ ...jest.requireActual("../api"), getMe: jest.fn(), getPublic: jest.fn() }));

const ID = "a".repeat(24);
const NASHEED = { _id: ID, title: "أوقدت في قلبي هواك", lines: [{ kind: "center", text: "الله الله" }, { kind: "verse", sadr: "أَوْقَدْتَ", ajuz: "وَقُلْتَ" }], updatedAt: "2026-11-27T10:00:00.000Z" };

beforeEach(() => {
  window.history.replaceState(null, "", `/n/${ID}`);
  api.getPublic.mockImplementation(() => ok({ nasheed: NASHEED }));
});
afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

const render = async (id = ID) => { const c = await mount(<SessionProvider><Read id={id} /></SessionProvider>); await flush(); return c; };

test("the read page shows the title and the lines, with a reading size of at least 18px", async () => {
  api.getMe.mockImplementation(() => fail(401, {}));
  const c = await render();
  expect(c.querySelector("h1").textContent).toBe(NASHEED.title);
  expect(c.querySelector(".nasheed-lines").textContent).toContain("أَوْقَدْتَ");
  expect(parseFloat(c.querySelector(".nasheed-lines").style.fontSize)).toBeGreaterThanOrEqual(18);
});

test("a guest sees no edit or delete on the read page; staff do", async () => {
  api.getMe.mockImplementation(() => fail(401, {}));
  let c = await render();
  expect(byText(c, "a", "تعديل")).toBeUndefined();
  expect(byText(c, "button", "حذف")).toBeUndefined();
  await unmountAll();

  api.getMe.mockImplementation(() => ok({ user: { name: "منشد" } }));
  c = await render();
  expect(byText(c, "a", "تعديل").getAttribute("href")).toBe(`/n/${ID}/edit`);
  expect(byText(c, "button", "حذف")).toBeDefined();
});

test("an unknown id shows «النشيد غير موجود» with a link back", async () => {
  api.getMe.mockImplementation(() => fail(401, {}));
  api.getPublic.mockImplementation(() => fail(404, { code: "NOT_FOUND", message: "النشيد غير موجود" }));
  const c = await render("b".repeat(24));
  expect(c.textContent).toContain("النشيد غير موجود");
  expect(byText(c, "a", "كل الأناشيد").getAttribute("href")).toBe("/");
});
