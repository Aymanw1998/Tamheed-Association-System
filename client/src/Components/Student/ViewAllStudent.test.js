import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});
jest.mock("../../WebServer/services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() }, API_BASE_URL: "/api" }));
jest.mock("../../WebServer/services/student/functionsStudent.jsx", () => ({ getAll: jest.fn(), deleteS: jest.fn(), update: jest.fn() }));
jest.mock("../../locks/useLiveRefresh", () => ({ __esModule: true, default: () => {} }));
jest.mock("../ExportPDF/ExportPDF.jsx", () => ({ exportStudentPdf: jest.fn() }));
let mockPerms = [];
jest.mock("../../utils/session.js", () => ({
  ...jest.requireActual("../../utils/session.js"),
  canStored: (k) => mockPerms.includes(k),
}));

import { getAll } from "../../WebServer/services/student/functionsStudent.jsx";
import ViewAllStudent from "./ViewAllStudent";
import { I18nProvider } from "../../i18n/I18nContext";

global.IS_REACT_ACT_ENVIRONMENT = true;

// Only an admin edits students by default (owner, 2026-11-01): without
// students.edit the list offers no «تعديل»; the name still opens the page.

let container, root;
const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<I18nProvider><MemoryRouter><ViewAllStudent /></MemoryRouter></I18nProvider>));
};

beforeEach(() => {
  getAll.mockResolvedValue({ ok: true, students: [{ _id: "s1", tz: "800000001", firstname: "طالب", lastname: "تجربة", status: "عادي" }] });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const editButtons = () => [...container.querySelectorAll("button")].filter((b) => b.textContent.trim() === "تعديل");

test("a guide (no students.edit) sees no «تعديل» but can open the student's page", async () => {
  mockPerms = ["students.view"];
  await mount();
  expect(editButtons()).toHaveLength(0);
  expect([...container.querySelectorAll("a")].some((a) => a.getAttribute("href") === "/students/800000001")).toBe(true);
});

test("an admin sees «تعديل»", async () => {
  mockPerms = ["students.view", "students.edit", "students.viewAll"];
  await mount();
  expect(editButtons()).toHaveLength(1);
});
