import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

jest.mock("react-router-dom", () => ({
  useParams: () => ({ id: "L1" }),
  useNavigate: () => jest.fn(),
}), { virtual: true });
jest.mock("../../WebServer/services/api", () => ({
  __esModule: true,
  default: { post: jest.fn(async () => ({ data: { ok: true } })), get: jest.fn() },
  API_BASE_URL: "/api",
  getAuthToken: () => "tok",
}));
jest.mock("../../journey/demoMode", () => ({ __esModule: true, isDemo: jest.fn(() => false) }));
jest.mock("../../WebServer/services/lesson/functionsLesson", () => ({
  getOneLesson: jest.fn(),
  createLesson: jest.fn(),
  updateLesson: jest.fn(async () => ({ ok: true })),
  getAllLesson: jest.fn(async () => ({ ok: true, lessons: [] })),
  deleteLesson: jest.fn(),
  addToList: jest.fn(),
}));
jest.mock("../../WebServer/services/student/functionsStudent", () => ({ getAll: jest.fn(async () => ({ ok: true, students: [] })) }));
jest.mock("../../WebServer/services/user/functionsUser", () => ({ getAll: jest.fn(async () => ({ ok: true, users: [] })) }));
jest.mock("../../ALERT/SystemToasts", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("../../utils/session", () => ({ ...jest.requireActual("../../utils/session"), canStored: () => true }));
// The roster UI is replaced by one button that adds a found student.
jest.mock("./LessonRoster", () => ({
  __esModule: true,
  default: ({ onLookupAdd }) => <button type="button" data-testid="add-found" onClick={() => onLookupAdd({ _id: "s9", tz: "000000018" })}>add</button>,
}));

import api from "../../WebServer/services/api";
import { getOneLesson, updateLesson, addToList, getAllLesson } from "../../WebServer/services/lesson/functionsLesson";
import { getAll as getAllS } from "../../WebServer/services/student/functionsStudent";
import { getAll as getAllU } from "../../WebServer/services/user/functionsUser";
import EditLesson from "./EditLesson";
import { I18nProvider } from "../../i18n/I18nContext";

global.IS_REACT_ACT_ENVIRONMENT = true;

const OPENED = "2026-10-01T10:00:00.000Z";
const AFTER_ADD = "2026-10-01T10:05:00.000Z";
const lesson = (updatedAt, list) => ({ _id: "L1", name: "Math", teacher: "t1", helper: "", room: "1", date: { day: 2, startMin: 600, endMin: 645 }, list_students: list, updatedAt });
let container, root;

// CRA resets mock implementations before each test.
beforeEach(() => {
  api.post.mockImplementation(async () => ({ data: { ok: true } }));
  updateLesson.mockImplementation(async () => ({ ok: true }));
  getAllLesson.mockImplementation(async () => ({ ok: true, lessons: [] }));
  getAllS.mockImplementation(async () => ({ ok: true, students: [] }));
  getAllU.mockImplementation(async () => ({ ok: true, users: [] }));
});

test("adding a found student and then saving builds on the new version (no 409 naming oneself)", async () => {
  getOneLesson.mockResolvedValueOnce({ ok: true, lesson: lesson(OPENED, []) }); // load
  getOneLesson.mockResolvedValueOnce({ ok: true, lesson: lesson(OPENED, []) }); // before the add
  getOneLesson.mockResolvedValue({ ok: true, lesson: lesson(AFTER_ADD, ["s9"]) }); // after the add
  addToList.mockResolvedValue({ ok: true, updatedAt: AFTER_ADD });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<I18nProvider><EditLesson /></I18nProvider>));
  await act(async () => container.querySelector('[data-testid="add-found"]').click());
  const save = [...container.querySelectorAll("button")].find((b) => b.textContent.includes("حفظ التعديلات"));
  await act(async () => save.click());
  expect(updateLesson).toHaveBeenCalledTimes(1);
  expect(updateLesson.mock.calls[0][1].baseVersion).toBe(AFTER_ADD);
  await act(async () => root.unmount());
  container.remove();
});
