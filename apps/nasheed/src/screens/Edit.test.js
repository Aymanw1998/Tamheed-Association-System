// Adding and editing a nasheed (owner, 2026-11-27): the title, then one row
// per line (a verse with صدر and عجز, a centered line, a break), each moved up
// or down or removed; delete with «تراجع». Synthetic values only.
import Edit from "./Edit.jsx";
import * as api from "../api";
import { SessionProvider } from "../session.jsx";
import { act } from "react";
import { mount, unmountAll, ok, fail, flush, type, click, button, toastText } from "../testUtils";

jest.mock("../api", () => ({
  ...jest.requireActual("../api"),
  getMe: jest.fn(), getPublic: jest.fn(), createNasheed: jest.fn(), updateNasheed: jest.fn(), deleteNasheed: jest.fn(), restoreNasheed: jest.fn(),
}));

const ID = "a".repeat(24);
const STORED = {
  _id: ID, title: "أوقدت", updatedAt: "2026-11-27T10:00:00.000Z",
  lines: [{ kind: "center", text: "الله الله" }, { kind: "verse", sadr: "أَوْقَدْتَ", ajuz: "وَقُلْتَ" }, { kind: "break" }],
};

beforeEach(() => {
  window.history.replaceState(null, "", "/new");
  api.getMe.mockImplementation(() => ok({ user: { name: "منشد" } }));
  api.getPublic.mockImplementation(() => ok({ nasheed: STORED }));
});
afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

const render = async (id) => { const c = await mount(<SessionProvider><Edit id={id} /></SessionProvider>); await flush(); return c; };
const rows = (c) => [...c.querySelectorAll(".line-row")];
const kinds = (c) => rows(c).map((r) => r.dataset.kind);
const save = (c) => act(async () => { c.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });

test("a new nasheed starts with one verse row; «بيت», «سطر في الوسط» and «فاصل» add a row at the end", async () => {
  const c = await render();
  expect(kinds(c)).toEqual(["verse"]);
  await click(button(c, "+ سطر في الوسط"));
  await click(button(c, "+ فاصل"));
  await click(button(c, "+ بيت"));
  expect(kinds(c)).toEqual(["verse", "center", "break", "verse"]);
  const verse = rows(c)[0];
  const [sadr, ajuz] = verse.querySelectorAll("input");
  expect(sadr.getAttribute("aria-label")).toBe("صدر البيت 1");
  expect(ajuz.getAttribute("aria-label")).toBe("عجز البيت 1");
  expect(rows(c)[2].textContent).toContain("***");
});

test("each row moves up or down or is removed", async () => {
  const c = await render(ID);
  expect(kinds(c)).toEqual(["center", "verse", "break"]);
  await click(rows(c)[1].querySelector('[aria-label="تحريك السطر 2 للأعلى"]'));
  expect(kinds(c)).toEqual(["verse", "center", "break"]);
  await click(rows(c)[0].querySelector('[aria-label="تحريك السطر 1 للأسفل"]'));
  expect(kinds(c)).toEqual(["center", "verse", "break"]);
  expect(rows(c)[0].querySelector('[aria-label="تحريك السطر 1 للأعلى"]').disabled).toBe(true);
  await click(rows(c)[2].querySelector('[aria-label="حذف السطر 3"]'));
  expect(kinds(c)).toEqual(["center", "verse"]);
});

test("editing loads the stored lines into rows in order", async () => {
  const c = await render(ID);
  expect(c.querySelector("#title").value).toBe("أوقدت");
  expect(rows(c)[0].querySelector("input").value).toBe("الله الله");
  expect([...rows(c)[1].querySelectorAll("input")].map((i) => i.value)).toEqual(["أَوْقَدْتَ", "وَقُلْتَ"]);
});

test("an empty title shows the field error, focuses it, and sends nothing", async () => {
  const c = await render();
  const [sadr, ajuz] = rows(c)[0].querySelectorAll("input");
  await type(sadr, "صدر");
  await type(ajuz, "عجز");
  await save(c);
  expect(api.createNasheed).not.toHaveBeenCalled();
  expect(c.querySelector("[role=alert]").textContent).toBe("العنوان مطلوب");
  expect(document.activeElement).toBe(c.querySelector("#title"));
});

test("no line with text, or a verse missing a half, shows the error on that field and sends nothing", async () => {
  const c = await render();
  await type(c.querySelector("#title"), "نشيد");
  await save(c);
  expect(c.querySelector("[role=alert]").textContent).toBe("اكتب سطرًا واحدًا على الأقل");
  await type(rows(c)[0].querySelectorAll("input")[0], "صدر فقط");
  await save(c);
  expect(c.querySelector("[role=alert]").textContent).toBe("البيت 1 يحتاج الصدر والعجز");
  expect(document.activeElement).toBe(rows(c)[0].querySelectorAll("input")[1]);
  expect(api.createNasheed).not.toHaveBeenCalled();
});

test("save sends the trimmed title and lines (empty rows dropped) and opens the read page", async () => {
  api.createNasheed.mockImplementation(() => ok({ nasheed: { ...STORED, _id: "b".repeat(24) } }));
  const c = await render();
  await type(c.querySelector("#title"), "  نشيد جديد  ");
  const [sadr, ajuz] = rows(c)[0].querySelectorAll("input");
  await type(sadr, " صَدْرٌ ");
  await type(ajuz, "عَجُزٌ");
  await click(button(c, "+ سطر في الوسط"));
  await save(c);
  expect(api.createNasheed).toHaveBeenCalledWith({ title: "نشيد جديد", lines: [{ kind: "verse", sadr: "صَدْرٌ", ajuz: "عَجُزٌ" }] });
  expect(window.location.pathname).toBe(`/n/${"b".repeat(24)}`);
});

test("an edit sends the loaded updatedAt; a STALE answer keeps the typed text", async () => {
  api.updateNasheed.mockImplementation(() => fail(409, { code: "STALE", message: "تغيّر النشيد في هذه الأثناء. أعد التحميل." }));
  window.history.replaceState(null, "", `/n/${ID}/edit`);
  const c = await render(ID);
  await type(c.querySelector("#title"), "عنوان آخر");
  await save(c);
  expect(api.updateNasheed).toHaveBeenCalledWith(ID, expect.objectContaining({ title: "عنوان آخر", updatedAt: STORED.updatedAt }));
  expect(c.querySelector("[role=alert]").textContent).toBe("تغيّر النشيد في هذه الأثناء. أعد التحميل.");
  expect(c.querySelector("#title").value).toBe("عنوان آخر");
  expect(window.location.pathname).toBe(`/n/${ID}/edit`);
});

test("delete asks first, then goes to the list with «تراجع» for 8 seconds; تراجع restores and opens the nasheed", async () => {
  window.history.replaceState(null, "", `/n/${ID}/edit`);
  const confirm = jest.spyOn(window, "confirm");
  confirm.mockReturnValueOnce(false);
  api.deleteNasheed.mockImplementation(() => ok({ trashId: "t1" }));
  api.restoreNasheed.mockImplementation(() => ok({ id: ID }));
  const c = await render(ID);
  await click(button(c, "حذف النشيد"));
  expect(api.deleteNasheed).not.toHaveBeenCalled();

  confirm.mockReturnValueOnce(true);
  await click(button(c, "حذف النشيد"));
  expect(api.deleteNasheed).toHaveBeenCalledWith(ID);
  expect(window.location.pathname).toBe("/");
  expect(toastText()).toContain("نُقل النشيد إلى سلة المحذوفات");
  const undo = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "تراجع");
  await click(undo);
  expect(api.restoreNasheed).toHaveBeenCalledWith("t1");
  expect(window.location.pathname).toBe(`/n/${ID}`);
  confirm.mockRestore();
});
