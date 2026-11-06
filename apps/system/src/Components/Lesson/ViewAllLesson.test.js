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
jest.mock("../../WebServer/services/user/functionsUser", () => ({ getAll: jest.fn() }));
jest.mock("../../WebServer/services/lesson/functionsLesson", () => ({
  getAllLesson: jest.fn(), getSportSchedule: jest.fn(), updateLesson: jest.fn(),
}));
jest.mock("../../locks/useLiveRefresh", () => ({ __esModule: true, default: () => {} }));
jest.mock("../../utils/session", () => ({
  ...jest.requireActual("../../utils/session"),
  canStored: (k) => ["lessons.view"].includes(k),
}));

import { getAll as getAllUsers } from "../../WebServer/services/user/functionsUser";
import { getAllLesson, getSportSchedule } from "../../WebServer/services/lesson/functionsLesson";
import ViewAllLesson from "./ViewAllLesson";

global.IS_REACT_ACT_ENVIRONMENT = true;

// A guide's lesson list (owner, 2026-11-01) comes with its staff names, so the
// page never asks for the user list (which a guide may not read: 403).

let container, root;
beforeEach(async () => {
  localStorage.setItem("user_id", "g1");
  getAllLesson.mockResolvedValue({
    ok: true,
    lessons: [{ _id: "L1", name: "Math", teacher: "g1", helper: "h1", room: "1", date: { day: 1, startMin: 600, endMin: 660 }, list_students: [] }],
    names: { g1: "Gu Ide", h1: "He Lper" },
  });
  getSportSchedule.mockResolvedValue({ ok: true, lessons: [] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<MemoryRouter><ViewAllLesson /></MemoryRouter>));
});
afterEach(() => { act(() => root.unmount()); container.remove(); localStorage.removeItem("user_id"); });

test("the page does not ask for the user list", () => {
  expect(getAllUsers).not.toHaveBeenCalled();
});

test("desktop timeline shows 13:00–22:00 and retains legacy morning programs in a separate list", () => {
  const labels = [...container.querySelectorAll('[class*="hourLabel"]')].map((node) => node.textContent);
  expect(labels).toContain("13:00");
  expect(labels).toContain("22:00");
  expect(labels).not.toContain("08:00");
  const outside = container.querySelector('section[aria-label="برامج خارج الساعات المحددة"]');
  expect(outside.textContent).toContain("Math");
  expect(outside.textContent).toContain("10:00–11:00");
});

test("the guide filter is filled from the names that come with the lessons", async () => {
  // The filters sit in the «فلتر» window (owner, 2026-11-03).
  expect([...container.querySelectorAll("select")].some((s) => [...s.options].some((o) => o.text === "Gu Ide"))).toBe(false);
  const open = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "فلتر");
  await act(async () => open.click());
  const filter = [...container.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.text === "Gu Ide"));
  expect(filter).toBeTruthy();
});
