import React, { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("../../WebServer/services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() }, API_BASE_URL: "/api" }));
jest.mock("../../WebServer/services/lesson/functionsLesson.jsx", () => ({ getMyParticipations: jest.fn() }));

import { getMyParticipations } from "../../WebServer/services/lesson/functionsLesson.jsx";
import MyParticipations from "./MyParticipations";

global.IS_REACT_ACT_ENVIRONMENT = true;

// «البرامج المسجّل فيها» (owner, 2026-11-09): the user's own programs as a
// participant, at the bottom of his page. Synthetic data only.
const LESSONS = [{
  _id: "L1", name: "برنامج المساء", room: "1", date: { day: 1, startMin: 960, endMin: 1005 },
  teacherName: "مرشد أول", helperName: "مساعد ثان",
  attendance: [{ dateKey: 20261109, status: "غائب" }, { dateKey: 20261102, status: "حاضر" }],
}];

let host, root;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const render = () => act(async () => root.render(<MyParticipations />));

test("shows nothing when the user takes part in no program", async () => {
  getMyParticipations.mockResolvedValue({ ok: true, lessons: [] });
  await render();
  expect(host.textContent).toBe("");
});

test("lists each program with its time, room, guides and the user's own last statuses", async () => {
  getMyParticipations.mockResolvedValue({ ok: true, lessons: LESSONS });
  await render();
  expect(host.textContent).toContain("البرامج المسجّل فيها");
  expect(host.textContent).toContain("برنامج المساء");
  expect(host.textContent).toContain("الأحد 16:00");
  expect(host.textContent).toContain("مرشد أول");
  expect(host.textContent).toContain("مساعد ثان");
  expect(host.textContent).toContain("09/11");
  expect(host.textContent).toContain("غائب");
  expect(host.querySelector("a")).toBeNull();
});

test("a failed load shows nothing rather than an error", async () => {
  getMyParticipations.mockResolvedValue({ ok: false, lessons: [] });
  await render();
  expect(host.textContent).toBe("");
});
