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
jest.mock("../../WebServer/services/user/functionsUser.jsx", () => ({
  create: jest.fn(), update: jest.fn(), getUserById: jest.fn(), deleteU: jest.fn(), uploadPhoto: jest.fn(),
  deletePhoto: jest.fn(), changeStatus: jest.fn(), viewPassword: jest.fn(), changeUserRole: jest.fn(), unlockUser: jest.fn(),
}));
jest.mock("../../WebServer/services/tours/functionsTours.jsx", () => ({ resetUserTours: jest.fn() }));
jest.mock("../Provides/confirmBus", () => ({ ask: jest.fn() }));
jest.mock("../../ALERT/SystemToasts.jsx", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("../Audit/RecentChanges.jsx", () => ({ __esModule: true, default: () => null }));
jest.mock("../Profile/ChangeOwnPassword.jsx", () => ({ __esModule: true, default: () => null }));
jest.mock("./PermissionsTab.jsx", () => ({ __esModule: true, default: () => null }));
jest.mock("./RolePickerDialog.jsx", () => ({ viewerAssignableRoles: () => ["مرشد", "مساعد"], permissionError: () => "error" }));
jest.mock("../../utils/roles", () => ({ ...jest.requireActual("../../utils/roles"), canManageTargetClient: () => true }));
jest.mock("../../utils/session", () => ({ ...jest.requireActual("../../utils/session"), canStored: () => true, getStoredUserId: () => "viewer" }));

import api from "../../WebServer/services/api";
import { ask } from "../Provides/confirmBus";
import { getUserById, update, changeUserRole } from "../../WebServer/services/user/functionsUser.jsx";
import EditUser from "./EditUser";
import { I18nProvider } from "../../i18n/I18nContext";

global.IS_REACT_ACT_ENVIRONMENT = true;

const OPENED = "2026-10-01T10:00:00.000Z";
const AFTER_ROLE = "2026-10-01T10:05:00.000Z";
const user = (updatedAt) => ({
  _id: "u1", tz: "000000018", firstname: "a", lastname: "b", birth_date: "2000-01-01", gender: "ذكر",
  phone: "+972521234567", email: "x@example.test", city: "c", street: "s", roles: ["مساعد"], updatedAt,
});

test("changing the role and then saving the form builds on the new version (no 409 naming oneself)", async () => {
  api.post.mockImplementation(async () => ({ data: { ok: true } }));
  getUserById.mockResolvedValueOnce({ ok: true, user: user(OPENED) });
  getUserById.mockResolvedValue({ ok: true, user: user(AFTER_ROLE) });
  changeUserRole.mockResolvedValue({ ok: true });
  update.mockResolvedValue({ ok: true });
  ask.mockResolvedValue(false);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<I18nProvider><EditUser /></I18nProvider>));
  const select = container.querySelector("#user-role");
  const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
  await act(async () => {
    setValue.call(select, "مرشد");
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const roleSave = container.querySelector('[data-tour="user-role-save"]');
  await act(async () => roleSave.click());
  expect(changeUserRole).toHaveBeenCalledTimes(1);
  await act(async () => container.querySelector('[data-tour="user-save"]').click());
  expect(update).toHaveBeenCalledTimes(1);
  expect(update.mock.calls[0][1].baseVersion).toBe(AFTER_ROLE);
  // The typed form was not replaced by the re-read.
  await act(async () => root.unmount());
  container.remove();
});
