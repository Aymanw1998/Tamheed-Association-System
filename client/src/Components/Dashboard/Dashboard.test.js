import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});
jest.mock("../../WebServer/services/dashboard/functionsDashboard.jsx", () => ({ getDashboardSummary: jest.fn() }));
jest.mock("../../WebServer/services/user/functionsUser.jsx", () => ({ changeStatus: jest.fn(), deleteU: jest.fn(), getAll: jest.fn() }));
jest.mock("../../WebServer/services/student/functionsStudent.jsx", () => ({ deleteS: jest.fn(), getAll: jest.fn(), update: jest.fn() }));
jest.mock("../../WebServer/services/lesson/functionsLesson.jsx", () => ({ getAllLesson: jest.fn() }));
jest.mock("../../WebServer/services/report/functionsReport.jsx", () => ({ getAll: jest.fn() }));
jest.mock("../Vehicle/VehicleAlerts.jsx", () => () => null);
jest.mock("../Student/ParentLinkPanel.jsx", () => () => null);

import { getDashboardSummary } from "../../WebServer/services/dashboard/functionsDashboard.jsx";
import Dashboard from "./Dashboard";
import { I18nProvider } from "../../i18n/I18nContext";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Owner, 2026-11-03: a section taken away disappears from the dashboard too
// (its shortcut, its stat card and its panel), as it does from the menu.
let host, root;
const mount = async (permissions) => {
  localStorage.setItem("permissions", JSON.stringify(permissions));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<I18nProvider><MemoryRouter><Dashboard /></MemoryRouter></I18nProvider>));
};
const links = () => [...host.querySelectorAll('[data-tour="dashboard-links"] a')].map((a) => a.textContent.trim());
const cards = () => [...host.querySelectorAll('[data-tour="dashboard-stats"] span')].map((s) => s.textContent.trim());
const lessonsPanel = () => host.querySelector('[data-tour="dashboard-lessons"]');

beforeEach(() => {
  getDashboardSummary.mockResolvedValue({
    users: null,
    students: { ok: true, students: [] },
    lessons: { ok: true, lessons: [] },
    reports: { ok: true, count: 4 },
  });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); });

test("a guide without any reports key sees no reports shortcut or card", async () => {
  await mount(["students.view", "lessons.view", "attendance.view"]);
  expect(links()).toEqual(["الطلاب", "الدروس"]);
  expect(cards()).toEqual(["الطلاب", "دروس اليوم"]);
});

test("any reports key brings the reports shortcut and card back", async () => {
  await mount(["students.view", "lessons.view", "reports.create"]);
  expect(links()).toEqual(["الطلاب", "الدروس", "التقارير"]);
  expect(cards()).toEqual(["الطلاب", "دروس اليوم", "التقارير"]);
});

test("without lessons.view the lessons shortcut, card and panel are gone", async () => {
  await mount(["students.view", "reports.create"]);
  expect(links()).toEqual(["الطلاب", "التقارير"]);
  expect(cards()).toEqual(["الطلاب", "التقارير"]);
  expect(lessonsPanel()).toBeNull();
});

test("without students.view the students card is gone", async () => {
  await mount(["lessons.view"]);
  expect(cards()).toEqual(["دروس اليوم"]);
});
