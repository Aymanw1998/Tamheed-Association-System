import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

jest.mock("react-router-dom", () => ({
  useParams: () => ({ id: "0000" }),
  useNavigate: () => jest.fn(),
}), { virtual: true });
jest.mock("../../WebServer/services/api", () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() },
  API_BASE_URL: "/api",
  getAuthToken: () => "tok",
}));
jest.mock("../../journey/demoMode", () => ({ __esModule: true, isDemo: jest.fn(() => false) }));
jest.mock("../../WebServer/services/student/functionsStudent.jsx", () => ({
  create: jest.fn(),
  update: jest.fn(),
  getOne: jest.fn(),
  deleteS: jest.fn(),
  uploadPhoto: jest.fn(),
  deletePhoto: jest.fn(),
}));
jest.mock("../../WebServer/services/user/functionsUser.jsx", () => ({ getAll: jest.fn(async () => ({ ok: true, users: [] })) }));
jest.mock("../../WebServer/services/inviteToken/functionInviteToken.jsx", () => ({ validate: jest.fn(), submit: jest.fn() }));
jest.mock("../../ALERT/SystemToasts", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("../Audit/RecentChanges.jsx", () => ({ __esModule: true, default: () => null }));
jest.mock("../../utils/session", () => ({ ...jest.requireActual("../../utils/session"), canStored: () => true }));

import api from "../../WebServer/services/api";
import { getOne } from "../../WebServer/services/student/functionsStudent.jsx";
import EditStudent from "./EditStudent";
import { I18nProvider } from "../../i18n/I18nContext";

global.IS_REACT_ACT_ENVIRONMENT = true;

const student = { _id: "s1", tz: "0000", firstname: "a", lastname: "b", updatedAt: "2026-10-01T10:00:00.000Z" };
let container, root;

const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<I18nProvider><EditStudent /></I18nProvider>));
};

beforeEach(() => {
  api.post.mockReset();
  getOne.mockReset();
  getOne.mockResolvedValue({ ok: true, student });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

test("EditStudent shows the lock screen when the acquire answers 423", async () => {
  api.post.mockImplementation((path) =>
    path === "/locks/acquire"
      ? Promise.reject(Object.assign(new Error("locked"), { response: { status: 423, data: { ok: false, code: "LOCKED", holder: { name: "منى أحمد", tz: "123" } } } }))
      : Promise.resolve({ data: { ok: true } })
  );
  await mount();
  expect(api.post).toHaveBeenCalledWith("/locks/acquire", { key: "student:s1" });
  expect(container.textContent).toContain("مفتوح الآن لدى منى أحمد (123)");
  expect(container.querySelector('[name="firstname"]')).toBeNull();
});
