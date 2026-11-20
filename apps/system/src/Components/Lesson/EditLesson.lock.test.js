import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
let mockLessonId = "L1";

jest.mock("react-router-dom", () => ({
  useParams: () => ({ id: mockLessonId }),
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
const lesson = (updatedAt, list) => ({ _id: "L1", name: "Math", teacher: "t1", helper: "", room: "1", date: { day: 2, startMin: 840, endMin: 885 }, list_students: list, updatedAt });
let container, root;

// CRA resets mock implementations before each test.
beforeEach(() => {
  mockLessonId = "L1";
  api.post.mockImplementation(async () => ({ data: { ok: true } }));
  updateLesson.mockImplementation(async () => ({ ok: true }));
  getAllLesson.mockImplementation(async () => ({ ok: true, lessons: [] }));
  getAllS.mockImplementation(async () => ({ ok: true, students: [] }));
  getAllU.mockImplementation(async () => ({ ok: true, users: [] }));
});

test("an existing out-of-hours program shows an error and cannot be saved", async () => {
  getOneLesson.mockResolvedValue({ ok: true, lesson: { ...lesson(OPENED, []), date: { day: 2, startMin: 720, endMin: 765 } } });
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  await act(async () => root.render(<I18nProvider><EditLesson /></I18nProvider>));
  expect(container.querySelector('[role="alert"]').textContent).toContain("13:00");
  expect(container.querySelector('#lesson-start').min).toBe("13:00");
  expect(container.querySelector('#lesson-end').max).toBe("22:00");
  const save = [...container.querySelectorAll("button")].find((button) => button.textContent.includes("حفظ التعديلات"));
  await act(async () => save.click());
  expect(updateLesson).not.toHaveBeenCalled();
  await act(async () => root.unmount()); container.remove();
});

test.each([["", "13:00"], ["?startMin=600", "13:00"], ["?startMin=1320", "21:15"]])("new program %s starts within operating hours", async (query, expected) => {
  mockLessonId = "new";
  window.history.replaceState({}, "", `/lessons/new${query}`);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  await act(async () => root.render(<I18nProvider><EditLesson /></I18nProvider>));
  expect(container.querySelector('#lesson-start').value).toBe(expected);
  expect(container.querySelector('#lesson-end').value <= "22:00").toBe(true);
  await act(async () => root.unmount()); container.remove();
  window.history.replaceState({}, "", "/");
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

// Owner, 2026-11-02: deleting is done on the lesson's page, not in the form.
test("the edit form offers no «حذف»", async () => {
  getOneLesson.mockResolvedValue({ ok: true, lesson: lesson(OPENED, []) });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<I18nProvider><EditLesson /></I18nProvider>));
  const labels = [...container.querySelectorAll("button")].map((b) => b.textContent.trim());
  expect(labels.some((l) => l.includes("حفظ التعديلات"))).toBe(true);
  expect(labels).not.toContain("حذف");
  await act(async () => root.unmount());
  container.remove();
});

// Owner, 2026-11-03: administrators may have lessons of their own; 2026-11-14:
// an assistant may be «المسؤول» of a regular program.
test("«المسؤول» offers managers, guides and assistants in groups, whichever field holds the role", async () => {
  getOneLesson.mockResolvedValue({ ok: true, lesson: lesson(OPENED, []) });
  getAllU.mockImplementation(async () => ({ ok: true, users: [
    { _id: "t1", firstname: "مرشد", lastname: "أول", roles: ["مرشد"] },
    { _id: "a1", firstname: "مدير", lastname: "أول", role: "ادارة", roles: [] },
    { _id: "a2", firstname: "مدير", lastname: "ثان", roles: ["الإدارة"] },
    { _id: "h1", firstname: "مساعد", lastname: "أول", roles: ["مساعد"] },
  ] }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<I18nProvider><EditLesson /></I18nProvider>));
  const groups = [...container.querySelectorAll("#lesson-teacher optgroup")];
  expect(groups.map((g) => g.label)).toEqual(["الإدارة", "المرشدون", "المساعدون"]);
  expect([...groups[0].querySelectorAll("option")].map((o) => o.value)).toEqual(["a1", "a2"]);
  expect([...groups[1].querySelectorAll("option")].map((o) => o.value)).toEqual(["t1"]);
  expect([...groups[2].querySelectorAll("option")].map((o) => o.value)).toEqual(["h1"]);
  expect(container.querySelector("label[for=lesson-teacher]").textContent).toContain("المسؤول");
  await act(async () => root.unmount());
  container.remove();
});

/* ---------- testing review, 2026-11-20: «المسؤول» ---------- */

const STAFF = [
  { _id: "t1", firstname: "مرشد", lastname: "أول", roles: ["مرشد"], tz: "123451111" },
  { _id: "h1", firstname: "مساعد", lastname: "أول", roles: ["مساعد"], tz: "123452222" },
  { _id: "h2", firstname: "مساعد", lastname: "ثان", roles: ["مساعد"], tz: "123453333" },
];
const changeValue = (el, value) => {
  const proto = el.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
};
const mountForm = async (data) => {
  getOneLesson.mockResolvedValue({ ok: true, lesson: { ...lesson(OPENED, []), date: { day: 2, startMin: 900, endMin: 960 }, ...data } });
  getAllU.mockImplementation(async () => ({ ok: true, users: STAFF }));
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  await act(async () => root.render(<I18nProvider><EditLesson /></I18nProvider>));
};
const optionValues = (select) => [...select.querySelectorAll("option")].map((o) => o.value).filter(Boolean);

test("a درس تربوي with an assistant in charge shows the message on the field and cannot be saved", async () => {
  await mountForm({ teacher: "h1", kind: "educational" });
  const select = container.querySelector("#lesson-teacher");
  expect(select.value).toBe("h1");
  const message = container.querySelector("#lesson-teacher-error");
  expect(message.textContent).toContain("مرشدًا");
  expect(select.getAttribute("aria-describedby")).toBe("lesson-teacher-error");
  const save = [...container.querySelectorAll("button")].find((b) => b.textContent.includes("حفظ التعديلات"));
  await act(async () => save.click());
  expect(updateLesson).not.toHaveBeenCalled();
  await act(async () => root.unmount()); container.remove();
});

test("the search narrows «المسؤول» but keeps the chosen person; the two lists exclude each other", async () => {
  await mountForm({ teacher: "t1", helper: "h1" });
  const select = container.querySelector("#lesson-teacher");
  const search = container.querySelector("#lesson-teacher-search");
  await act(async () => changeValue(search, "3333"));
  expect(optionValues(select)).toEqual(["t1", "h2"]);
  expect(optionValues(container.querySelector("#lesson-teacher"))).not.toContain("h1");
  expect(optionValues(container.querySelector("#lesson-helper"))).not.toContain("t1");
  await act(async () => root.unmount()); container.remove();
});
