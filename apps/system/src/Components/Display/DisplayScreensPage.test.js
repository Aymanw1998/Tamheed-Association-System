import React from "react";
import { act, allByText, byText, cleanup, flush, queryByText, render } from "./displayTestDom";
import DisplayScreensPage from "./DisplayScreensPage";
import {
  createDisplay, deleteDisplay, listDisplays, rotateDisplayLink, updateDisplay,
} from "../../WebServer/services/display/functionsDisplay.jsx";

const mockConfirm = jest.fn();
jest.mock("../Provides/ConfirmContext", () => ({ useConfirm: () => mockConfirm }));
jest.mock("../../ALERT/SystemToasts.jsx", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("../../WebServer/services/display/functionsDisplay.jsx", () => ({
  listDisplays: jest.fn(), createDisplay: jest.fn(), updateDisplay: jest.fn(), rotateDisplayLink: jest.fn(), deleteDisplay: jest.fn(),
  displayLink: jest.requireActual("../../WebServer/services/display/functionsDisplay.jsx").displayLink,
}));

// Managing wall screens (owner, 2026-11-12): the link is shown once, a new
// link or a delete happens only after a confirm.

const TOKEN = "T".repeat(43);
const SCREEN = { id: "a".repeat(24), name: "المدخل", layout: "today", createdAt: "2026-11-10T10:00:00.000Z" };

const setValue = (el, value) => {
  const proto = el.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
};
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await flush(); };
const rowOf = (name) => byText(name).closest("[data-screen]");

beforeEach(() => {
  jest.clearAllMocks();
  listDisplays.mockResolvedValue({ ok: true, screens: [SCREEN] });
});
afterEach(cleanup);

test("lists screens with their layout label", async () => {
  render(<DisplayScreensPage />);
  await flush();
  expect(byText("المدخل")).toBeTruthy();
  const select = rowOf("المدخل").querySelector("select");
  expect(select.value).toBe("today");
  expect([...select.options].map((o) => o.textContent)).toEqual(["كل الأسبوع", "اليوم بالتفصيل", "يومًا بعد يوم"]);
});

test("create shows the link once; reopening the page never shows it again", async () => {
  createDisplay.mockResolvedValue({ ok: true, screen: { ...SCREEN, id: "b".repeat(24), name: "القاعة" }, token: TOKEN });
  render(<DisplayScreensPage />);
  await flush();
  const form = document.querySelector("form[data-new-screen]");
  await act(async () => { setValue(form.querySelector("input"), "القاعة"); setValue(form.querySelector("select"), "rotate"); });
  await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await flush();
  expect(createDisplay).toHaveBeenCalledWith({ name: "القاعة", layout: "rotate" });
  const dialog = document.querySelector("[role=dialog]");
  expect(dialog.textContent).toContain("احفظ الرابط الآن — لن يظهر مرة أخرى.");
  expect(dialog.querySelector("input").value).toBe(`${window.location.origin}/display#${TOKEN}`);
  await click(byText("إغلاق", dialog));
  expect(document.querySelector("[role=dialog]")).toBeNull();
  expect(document.body.textContent).not.toContain(TOKEN);

  cleanup();
  render(<DisplayScreensPage />);
  await flush();
  expect(document.body.textContent).not.toContain(TOKEN);
});

test("changing the layout saves at once", async () => {
  updateDisplay.mockResolvedValue({ ok: true, screen: { ...SCREEN, layout: "week" } });
  render(<DisplayScreensPage />);
  await flush();
  await act(async () => { setValue(rowOf("المدخل").querySelector("select"), "week"); });
  await flush();
  expect(updateDisplay).toHaveBeenCalledWith(SCREEN.id, { layout: "week" });
});

test("a new link is issued only after confirm, then shown once", async () => {
  rotateDisplayLink.mockResolvedValue({ ok: true, token: TOKEN });
  render(<DisplayScreensPage />);
  await flush();
  mockConfirm.mockResolvedValueOnce(false);
  await click(byText("رابط جديد", rowOf("المدخل")));
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  expect(mockConfirm.mock.calls[0][0].message).toContain("الرابط القديم");
  expect(rotateDisplayLink).not.toHaveBeenCalled();
  mockConfirm.mockResolvedValueOnce(true);
  await click(byText("رابط جديد", rowOf("المدخل")));
  expect(rotateDisplayLink).toHaveBeenCalledWith(SCREEN.id);
  expect(document.querySelector("[role=dialog] input").value).toContain(`/display#${TOKEN}`);
});

test("delete happens only after confirm and removes the row", async () => {
  deleteDisplay.mockResolvedValue({ ok: true });
  render(<DisplayScreensPage />);
  await flush();
  mockConfirm.mockResolvedValueOnce(false);
  await click(byText("حذف", rowOf("المدخل")));
  expect(deleteDisplay).not.toHaveBeenCalled();
  mockConfirm.mockResolvedValueOnce(true);
  await click(byText("حذف", rowOf("المدخل")));
  expect(deleteDisplay).toHaveBeenCalledWith(SCREEN.id);
  expect(queryByText("المدخل")).toBeNull();
});

test("rename saves the trimmed name", async () => {
  updateDisplay.mockResolvedValue({ ok: true, screen: { ...SCREEN, name: "البوابة" } });
  render(<DisplayScreensPage />);
  await flush();
  await click(byText("إعادة تسمية", rowOf("المدخل")));
  const field = document.querySelector("[data-rename] input");
  await act(async () => { setValue(field, "  البوابة "); });
  await act(async () => { document.querySelector("[data-rename]").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await flush();
  expect(updateDisplay).toHaveBeenCalledWith(SCREEN.id, { name: "البوابة" });
  expect(allByText("البوابة").length).toBeGreaterThan(0);
});

test("an empty list says how to start", async () => {
  listDisplays.mockResolvedValue({ ok: true, screens: [] });
  render(<DisplayScreensPage />);
  await flush();
  expect(byText(/لا توجد شاشات بعد/)).toBeTruthy();
});
