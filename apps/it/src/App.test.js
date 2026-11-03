import App from "./App.jsx";
import * as api from "./api";
import * as nav from "./siteLink";
import { mount, unmountAll, ok, fail, button, click, byText } from "./testUtils";

jest.mock("./api", () => ({
  ...jest.requireActual("./api"),
  getMe: jest.fn(),
  systemPass: jest.fn(),
  loginPass: jest.fn(),
  logout: jest.fn(),
  getUsers: jest.fn(),
  getMembers: jest.fn(),
}));
jest.mock("./siteLink", () => ({ ...jest.requireActual("./siteLink"), goTo: jest.fn() }));

const ME = { tz: "100000001", name: "مستخدم تجريبي", isSystem: false, photo: null };

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  api.getUsers.mockImplementation(() => ok({ users: [] }));
  api.getMembers.mockImplementation(() => ok({ members: [] }));
  api.logout.mockImplementation(() => ok());
});
afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

test("the button shows only for a user with both sides", async () => {
  api.getMe.mockImplementation(() => ok({ ...ME, hasEverydayRole: true }));
  let c = await mount(<App />);
  expect(button(c, "النظام")).toBeDefined();
  await unmountAll();

  api.getMe.mockImplementation(() => ok({ ...ME, hasEverydayRole: false }));
  c = await mount(<App />);
  expect(button(c, "النظام")).toBeUndefined();
});

test("no /system-pass request is made on load, only when the button is clicked", async () => {
  api.getMe.mockImplementation(() => ok({ ...ME, hasEverydayRole: true }));
  api.systemPass.mockImplementation(() => ok({ pass: "p1" }));
  const c = await mount(<App />);
  expect(api.systemPass).not.toHaveBeenCalled();
  await click(button(c, "النظام"));
  expect(api.systemPass).toHaveBeenCalledTimes(1);
});

test("a refused pass on click hides the button", async () => {
  api.getMe.mockImplementation(() => ok({ ...ME, hasEverydayRole: true }));
  api.systemPass.mockImplementation(() => fail(403, { code: "FORBIDDEN" }));
  const c = await mount(<App />);
  await click(button(c, "النظام"));
  expect(nav.goTo).not.toHaveBeenCalled();
  expect(button(c, "النظام")).toBeUndefined();
});

test("the button opens the everyday site with a fresh pass in the fragment", async () => {
  api.getMe.mockImplementation(() => ok({ ...ME, hasEverydayRole: true }));
  api.systemPass.mockImplementation(() => ok({ pass: "fresh-pass" }));
  const c = await mount(<App />);
  await click(button(c, "النظام"));
  expect(api.systemPass).toHaveBeenCalledTimes(1);
  expect(nav.goTo).toHaveBeenCalledTimes(1);
  const url = nav.goTo.mock.calls[0][0];
  expect(url).toMatch(/#pass=fresh-pass$/);
  expect(url).not.toContain("?");
});

test("the pass is removed from the address", async () => {
  window.history.replaceState(null, "", "/#pass=abc_DEF-123");
  api.getMe.mockImplementation(() => fail(401, { code: "IT_SIGNED_OUT" }));
  api.loginPass.mockImplementation(() => ok({ message: "تم.", tz: ME.tz }));
  const c = await mount(<App />);
  expect(window.location.hash).toBe("");
  expect(window.location.href).not.toContain("abc_DEF-123");
  expect(api.loginPass).toHaveBeenCalledWith("abc_DEF-123");
  // Waiting for the email code, not asking for the password again.
  expect(c.querySelector('input[name="code"]')).not.toBeNull();
});

test("a pass in the address is dropped when already signed in", async () => {
  window.history.replaceState(null, "", "/#pass=abc_DEF-123");
  api.getMe.mockImplementation(() => ok(ME));
  api.systemPass.mockImplementation(() => fail(403, {}));
  await mount(<App />);
  expect(window.location.hash).toBe("");
  expect(api.loginPass).not.toHaveBeenCalled();
});

test("Members: hidden unless isSystem", async () => {
  api.systemPass.mockImplementation(() => fail(403, {}));
  api.getMe.mockImplementation(() => ok(ME));
  let c = await mount(<App />);
  expect(byText(c, "a", "مستخدمو IT")).toBeUndefined();
  await unmountAll();

  // Typing the address by hand does not show it either.
  window.history.replaceState(null, "", "/members");
  c = await mount(<App />);
  expect(api.getMembers).not.toHaveBeenCalled();
  expect(c.textContent).not.toContain("إضافة مستخدم IT");
  await unmountAll();

  window.history.replaceState(null, "", "/");
  api.getMe.mockImplementation(() => ok({ ...ME, isSystem: true }));
  c = await mount(<App />);
  expect(byText(c, "a", "مستخدمو IT")).toBeDefined();
});

test("the system account's ID number is never shown", async () => {
  api.systemPass.mockImplementation(() => fail(403, {}));
  api.getMe.mockImplementation(() => ok({ ...ME, tz: "000000000", name: "النظام", isSystem: true }));
  const c = await mount(<App />);
  expect(c.textContent).not.toContain("000000000");
  expect(c.textContent).toContain("النظام");
});

test("a signed-out answer shows the sign-in screen", async () => {
  api.getMe.mockImplementation(() => fail(401, { code: "IT_SIGNED_OUT" }));
  const c = await mount(<App />);
  expect(c.querySelector('input[name="tz"]')).not.toBeNull();
});
