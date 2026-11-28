// The nasheed site's shell (owner, 2026-11-27): guests read; adding, editing
// and building a list need the sign-in. Synthetic values only.
import App from "./App.jsx";
import * as api from "./api";
import { act } from "react";
import { mount, unmountAll, ok, fail, button, click, byText, type } from "./testUtils";

jest.mock("./api", () => ({
  ...jest.requireActual("./api"),
  getMe: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  listPublic: jest.fn(),
}));

const NASHEED = { _id: "a".repeat(24), title: "أوقدت في قلبي هواك", lines: [{ kind: "verse", sadr: "ص", ajuz: "ع" }], updatedAt: "2026-11-27T10:00:00.000Z" };

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  api.getMe.mockImplementation(() => fail(401, { code: "NASHEED_SIGNED_OUT" }));
  api.listPublic.mockImplementation(() => ok({ nasheeds: [NASHEED] }));
  api.logout.mockImplementation(() => ok());
});
afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

test("a guest sees the list and a «دخول» link", async () => {
  const c = await mount(<App />);
  expect(c.textContent).toContain(NASHEED.title);
  const signIn = byText(c, "a", "دخول");
  expect(signIn).toBeDefined();
  expect(signIn.getAttribute("href")).toBe("/login?next=%2F");
  expect(byText(c, "a", "إضافة نشيد")).toBeUndefined();
});

test.each(["/new", `/n/${"a".repeat(24)}/edit`, "/build"])("a guest opening %s is sent to /login with next", async (path) => {
  window.history.replaceState(null, "", path);
  const c = await mount(<App />);
  expect(window.location.pathname).toBe("/login");
  expect(new URLSearchParams(window.location.search).get("next")).toBe(path);
  expect(c.querySelector("form")).not.toBeNull();
  expect(c.querySelector("textarea")).toBeNull();
});

test("after sign-in the user returns to next; the form has noValidate", async () => {
  window.history.replaceState(null, "", "/login?next=%2Fbuild");
  api.login.mockImplementation(() => ok({ user: { name: "منشد" } }));
  const c = await mount(<App />);
  const form = c.querySelector("form");
  expect(form.noValidate).toBe(true);
  await type(c.querySelector("#tz"), "900000002");
  await type(c.querySelector("#password"), "synthetic-pass-1");
  await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(api.login).toHaveBeenCalledWith("900000002", "synthetic-pass-1");
  expect(window.location.pathname).toBe("/build");
  expect(c.textContent).toContain("منشد");
});

test("next never leaves the site", async () => {
  window.history.replaceState(null, "", "/login?next=%2F%2Fevil.example");
  api.login.mockImplementation(() => ok({ user: { name: "منشد" } }));
  const c = await mount(<App />);
  await type(c.querySelector("#tz"), "900000002");
  await type(c.querySelector("#password"), "p");
  await act(async () => { c.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(window.location.pathname).toBe("/");
});

test.each([
  ["NO_ACCESS", "ليس لديك صلاحية إدارة الأناشيد"],
  ["PASSWORD_CHANGE", "يجب تغيير كلمة المرور أولًا في النظام الرئيسي"],
])("a %s answer shows its message and stays on the sign-in", async (code, message) => {
  window.history.replaceState(null, "", "/login");
  api.login.mockImplementation(() => fail(403, { code, message }));
  const c = await mount(<App />);
  await type(c.querySelector("#tz"), "900000003");
  await type(c.querySelector("#password"), "p");
  await act(async () => { c.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(c.querySelector("[role=alert]").textContent).toBe(message);
  expect(window.location.pathname).toBe("/login");
});

test("an empty ID number or password is not sent", async () => {
  window.history.replaceState(null, "", "/login");
  const c = await mount(<App />);
  await act(async () => { c.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(api.login).not.toHaveBeenCalled();
  expect(c.querySelector("[role=alert]").textContent).toBe("أدخل رقم الهوية وكلمة المرور");
});

test("a signed-in user sees the staff buttons and can sign out", async () => {
  api.getMe.mockImplementation(() => ok({ user: { name: "منشد" } }));
  const c = await mount(<App />);
  expect(byText(c, "a", "إضافة نشيد")).toBeDefined();
  expect(byText(c, "a", "بناء قائمة")).toBeDefined();
  await click(button(c, "خروج"));
  expect(api.logout).toHaveBeenCalled();
  expect(byText(c, "a", "دخول")).toBeDefined();
});
