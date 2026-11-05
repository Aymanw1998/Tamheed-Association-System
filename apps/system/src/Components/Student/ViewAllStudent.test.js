import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

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

// Owner, 2026-11-02: a row opens the student's page, where print, edit and
// delete are, and approve/reject for a waiting request; the list itself
// offers none of them.

let container, root;
const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<I18nProvider><MemoryRouter initialEntries={["/students"]}><Routes>
    <Route path="/students" element={<ViewAllStudent />} />
    <Route path="/students/:id" element={<p data-testid="opened">opened</p>} />
  </Routes></MemoryRouter></I18nProvider>));
};

const STUDENT = { _id: "s1", tz: "800000001", firstname: "طالب", lastname: "تجربة", status: "عادي" };
beforeEach(() => {
  getAll.mockResolvedValue({ ok: true, students: [STUDENT] });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const labels = () => [...container.querySelectorAll("button")].map((b) => b.textContent.trim());

test("an admin's list has no «تعديل» or «ملف الطالب»", async () => {
  mockPerms = ["students.view", "students.edit", "students.viewAll", "students.delete"];
  await mount();
  expect(labels()).not.toContain("تعديل");
  expect(labels()).not.toContain("ملف الطالب");
  expect(labels()).not.toContain("حذف");
});

test("clicking anywhere on the row opens the student's page", async () => {
  mockPerms = ["students.view"];
  await mount();
  const row = [...container.querySelectorAll("tbody tr")].find((tr) => tr.textContent.includes("800000001"));
  await act(async () => row.querySelector("td").click());
  expect(container.querySelector('[data-testid="opened"]')).not.toBeNull();
});

test("the name stays a link to the student's page", async () => {
  mockPerms = ["students.view"];
  await mount();
  expect([...container.querySelectorAll("a")].some((a) => a.getAttribute("href") === "/students/800000001")).toBe(true);
});

test("a waiting request has no «قبول» or «رفض» in the list; its row opens the page", async () => {
  mockPerms = ["students.view", "students.edit", "students.viewAll", "students.delete"];
  getAll.mockResolvedValue({ ok: true, students: [{ ...STUDENT, status: "ينتظر" }] });
  await mount();
  // The lists are tabs on the page; there is no «فلتر» here any more.
  expect(labels()).not.toContain("فلتر");
  const waiting = [...container.querySelectorAll('[role="tab"]')].find((b) => b.textContent.includes("الطلبات"));
  await act(async () => waiting.click());
  expect(labels()).not.toContain("قبول");
  expect(labels()).not.toContain("رفض");
  const row = [...container.querySelectorAll("tbody tr")].find((tr) => tr.textContent.includes("800000001"));
  await act(async () => row.querySelector("td").click());
  expect(container.querySelector('[data-testid="opened"]')).not.toBeNull();
});

test("each row shows the person's photo", async () => {
  mockPerms = ["students.view"];
  getAll.mockResolvedValue({ ok: true, students: [{ ...STUDENT, photo: "https://example.test/s1.jpg" }] });
  await mount();
  const imgs = [...container.querySelectorAll('tbody img[loading="lazy"]')];
  expect(imgs.map((i) => i.getAttribute("src"))).toEqual(["https://example.test/s1.jpg"]);
  expect(container.querySelectorAll('ul img[loading="lazy"]').length).toBe(1);
});
