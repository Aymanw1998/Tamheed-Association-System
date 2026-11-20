import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});
jest.mock("../../WebServer/services/student/functionsStudent.jsx", () => ({ getArchived: jest.fn() }));

import { MemoryRouter } from "react-router-dom";
import { getArchived } from "../../WebServer/services/student/functionsStudent.jsx";
import FormerStudents from "./FormerStudents";

global.IS_REACT_ACT_ENVIRONMENT = true;

// «طلاب سابقون» (owner, 2026-11-19; testing review 2026-11-20).
let container, root;
beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<MemoryRouter><FormerStudents /></MemoryRouter>));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

const toggle = async (open) => {
  const details = container.querySelector("details");
  await act(async () => { details.open = open; });
  // The browser (and jsdom) fires "toggle" itself when `open` changes.
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};

test("read only when opened, and listed with a link to each record", async () => {
  expect(getArchived).not.toHaveBeenCalled();
  getArchived.mockResolvedValue({ ok: true, students: [{ _id: "s1", tz: "800000001", firstname: "علي", lastname: "طالب", staffConversion: { doneAt: "2026-11-19T10:00:00Z" } }] });
  await toggle(true);
  expect(getArchived).toHaveBeenCalledTimes(1);
  expect(container.querySelector('a[href="/students/800000001"]').textContent).toBe("علي طالب");
  expect(container.textContent).toContain("19/11/2026");
});

test("an error is announced, and opening again tries again with the old message gone", async () => {
  getArchived.mockResolvedValueOnce({ ok: false, message: "تعذر التحميل" });
  await toggle(true);
  expect(container.querySelector("[role=alert]").textContent).toBe("تعذر التحميل");
  let finish;
  getArchived.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  await toggle(false);
  await toggle(true);
  expect(container.querySelector("[role=alert]")).toBeNull();
  expect(container.querySelector("[role=status]").textContent).toBe("جارٍ التحميل…");
  await act(async () => finish({ ok: true, students: [] }));
  expect(container.textContent).toContain("لا يوجد طلاب سابقون");
});
