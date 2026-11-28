// Building a list for a performance (owner, 2026-11-27): pick from the
// library, order, add a heading, get the PDF. The list is never stored.
import Build from "./Build.jsx";
import * as api from "../api";
import * as pdf from "../pdf";
import { mount, unmountAll, ok, flush, type, click, button, toastText } from "../testUtils";

jest.mock("../api", () => ({ ...jest.requireActual("../api"), listPublic: jest.fn() }));
jest.mock("../pdf", () => ({ ...jest.requireActual("../pdf"), buildNasheedPdf: jest.fn(), sharePdf: jest.fn(), printPdf: jest.fn() }));

const n = (id, title) => ({ _id: String(id).repeat(24), title, lines: [{ kind: "center", text: `سطر ${title}` }], updatedAt: "2026-11-27T10:00:00.000Z" });
const LIST = [n("a", "أوقدت"), n("b", "بدر"), n("c", "يا رسول الله")];

beforeEach(() => {
  api.listPublic.mockImplementation(() => ok({ nasheeds: LIST }));
  pdf.buildNasheedPdf.mockImplementation(async () => new Blob(["%PDF"]));
  pdf.sharePdf.mockImplementation(async () => "shared");
});
afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

const render = async () => { const c = await mount(<Build />); await flush(); return c; };
const picked = (c) => [...c.querySelectorAll(".picked li .grow")].map((el) => el.textContent);
const addButton = (c, title) => c.querySelector(`[aria-label="إضافة «${title}» إلى القائمة"]`);

test("pick from the library with search, move up/down, remove; the PDF button is disabled while the list is empty", async () => {
  const c = await render();
  expect(button(c, "إنشاء PDF").disabled).toBe(true);
  await type(c.querySelector("input[type=search]"), "بدر");
  expect(addButton(c, "أوقدت")).toBeNull();
  await click(addButton(c, "بدر"));
  await type(c.querySelector("input[type=search]"), "");
  await click(addButton(c, "يا رسول الله"));
  await click(addButton(c, "أوقدت"));
  expect(picked(c)).toEqual(["بدر", "يا رسول الله", "أوقدت"]);
  await click(c.querySelector('[aria-label="تحريك «أوقدت» للأعلى"]'));
  expect(picked(c)).toEqual(["بدر", "أوقدت", "يا رسول الله"]);
  await click(c.querySelector('[aria-label="تحريك «بدر» للأسفل"]'));
  expect(picked(c)).toEqual(["أوقدت", "بدر", "يا رسول الله"]);
  await click(c.querySelector('[aria-label="إزالة «بدر» من القائمة"]'));
  expect(picked(c)).toEqual(["أوقدت", "يا رسول الله"]);
  expect(button(c, "إنشاء PDF").disabled).toBe(false);
});

test("the PDF receives the nasheeds in the chosen order and the typed heading, then is shared", async () => {
  const c = await render();
  await click(addButton(c, "يا رسول الله"));
  await click(addButton(c, "أوقدت"));
  await type(c.querySelector("#heading"), "حفل الختام");
  await click(button(c, "إنشاء PDF"));
  const arg = pdf.buildNasheedPdf.mock.calls[0][0];
  expect(arg.heading).toBe("حفل الختام");
  expect(arg.nasheeds.map((x) => x.title)).toEqual(["يا رسول الله", "أوقدت"]);
  expect(arg.nasheeds[0].lines).toEqual(LIST[2].lines);
  expect(pdf.sharePdf).toHaveBeenCalledWith(expect.any(Blob), "أناشيد - حفل الختام.pdf");
});

test("a nasheed deleted meanwhile still prints from the lines already loaded", async () => {
  const c = await render();
  await click(addButton(c, "بدر"));
  api.listPublic.mockImplementation(() => ok({ nasheeds: [] }));
  await click(button(c, "إنشاء PDF"));
  expect(pdf.buildNasheedPdf.mock.calls[0][0].nasheeds[0].lines).toEqual(LIST[1].lines);
  expect(toastText()).not.toContain("خطأ");
});

test("share cancelled shows nothing; a download says where the file went", async () => {
  const c = await render();
  await click(addButton(c, "بدر"));
  pdf.sharePdf.mockImplementation(async () => "cancelled");
  await click(button(c, "إنشاء PDF"));
  expect(toastText()).toBe("");
  pdf.sharePdf.mockImplementation(async () => "downloaded");
  await click(button(c, "إنشاء PDF"));
  expect(toastText()).toContain("نُزّل ملف PDF");
});

test("a failed PDF says so", async () => {
  const c = await render();
  await click(addButton(c, "بدر"));
  pdf.buildNasheedPdf.mockImplementation(async () => { throw new Error("canvas"); });
  await click(button(c, "إنشاء PDF"));
  expect(toastText()).toContain("تعذّر إنشاء ملف PDF");
});

test("leaving the screen and coming back starts an empty list (nothing stored)", async () => {
  let c = await render();
  await click(addButton(c, "بدر"));
  expect(picked(c)).toEqual(["بدر"]);
  await unmountAll();
  c = await render();
  expect(picked(c)).toEqual([]);
  expect(window.localStorage.length).toBe(0);
});
