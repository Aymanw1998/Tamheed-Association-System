import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

jest.mock("react-router-dom", () => ({
  useParams: () => ({ id: "000000018" }),
  useNavigate: () => jest.fn(),
}), { virtual: true });
jest.mock("../../WebServer/services/api", () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() },
  API_BASE_URL: "/api",
  getAuthToken: () => "tok",
}));
jest.mock("../../journey/demoMode", () => ({ __esModule: true, isDemo: jest.fn(() => false) }));
// No viewPassword and no unlockUser: the everyday app has no such calls.
jest.mock("../../WebServer/services/user/functionsUser.jsx", () => ({
  create: jest.fn(), update: jest.fn(), getUserById: jest.fn(), uploadPhoto: jest.fn(), deletePhoto: jest.fn(), changeUserRole: jest.fn(),
}));
jest.mock("../../WebServer/services/tours/functionsTours.jsx", () => ({ resetUserTours: jest.fn() }));
jest.mock("../Provides/confirmBus", () => ({ ask: jest.fn() }));
jest.mock("../../ALERT/SystemToasts.jsx", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("../Profile/ChangeOwnPassword.jsx", () => ({ __esModule: true, default: () => null }));
jest.mock("./RolePickerDialog.jsx", () => ({ viewerAssignableRoles: () => ["مرشد", "مساعد"], permissionError: () => "error" }));
jest.mock("../../utils/session", () => ({
  ...jest.requireActual("../../utils/session"),
  canStored: () => true,
  getStoredUserId: () => "viewer",
  getStoredViewer: () => ({ id: "viewer", tz: "900000001", role: "ادارة", isSystem: false }),
}));

import api from "../../WebServer/services/api";
import { getUserById } from "../../WebServer/services/user/functionsUser.jsx";
import EditUser from "./EditUser";
import { I18nProvider } from "../../i18n/I18nContext";

global.IS_REACT_ACT_ENVIRONMENT = true;

const target = (extra = {}) => ({
  _id: "u1", tz: "000000018", firstname: "a", lastname: "b", birth_date: "2000-01-01", gender: "ذكر",
  phone: "+972521234567", email: "x@example.test", city: "c", street: "s", roles: ["مساعد"],
  updatedAt: "2026-10-01T10:00:00.000Z", ...extra,
});

let container, root;
const mount = async (user) => {
  api.post.mockImplementation(async () => ({ data: { ok: true } }));
  getUserById.mockResolvedValue({ ok: true, user: user });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<I18nProvider><EditUser /></I18nProvider>));
};
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

const labels = () => [...container.querySelectorAll("button")].map((b) => b.textContent.trim());

test("an administrator editing a lower-rank user can change the role and set a new password", async () => {
  await mount(target());
  expect(container.querySelector('[data-tour="user-role-save"]')).not.toBeNull();
  expect(container.querySelector('input[name="password"]')).not.toBeNull();
});

test("no account actions on an IT user: no role change, no password", async () => {
  await mount(target({ isIT: true }));
  expect(container.querySelector('[data-tour="user-role-save"]')).toBeNull();
  expect(container.querySelector('input[name="password"]')).toBeNull();
  expect(container.querySelector('[data-tour="user-save"]')).toBeNull();
});

test("a locked user shows the state but the form has no unlock button", async () => {
  await mount(target({ lockedAt: "2026-11-01T10:00:00Z" }));
  expect(container.textContent).toContain("محظور");
  expect(labels()).not.toContain("رفع الحظر");
});

test("the password field has no show-the-password fetch: the eye only reveals what was typed", async () => {
  await mount(target());
  const input = container.querySelector('input[name="password"]');
  expect(input.type).toBe("password");
  await act(async () => container.querySelector('button[aria-label="إظهار كلمة المرور"]').click());
  expect(container.querySelector('input[name="password"]').type).toBe("text");
});
