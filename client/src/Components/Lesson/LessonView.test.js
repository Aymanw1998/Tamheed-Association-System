import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";

jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});
jest.mock("../../WebServer/services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() }, API_BASE_URL: "/api" }));
jest.mock("../../WebServer/services/lesson/functionsLesson.jsx", () => ({
  getOneLesson: jest.fn(), getAllLesson: jest.fn(), addToList: jest.fn(), removeFromList: jest.fn(),
}));
// One mock serves both specifiers (LessonRoster imports it without ".jsx").
jest.mock("../../WebServer/services/student/functionsStudent.jsx", () => ({ getAll: jest.fn(), lookupStudent: jest.fn() }));
jest.mock("../Provides/confirmBus", () => ({ ask: jest.fn() }));
jest.mock("../../ALERT/SystemToasts", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
let mockPerms = [];
jest.mock("../../utils/session", () => ({
  ...jest.requireActual("../../utils/session"),
  canStored: (k) => mockPerms.includes(k),
  getStoredUserId: () => "viewer-1",
}));

import { getOneLesson, getAllLesson, removeFromList } from "../../WebServer/services/lesson/functionsLesson.jsx";
import { getAll as getStudents } from "../../WebServer/services/student/functionsStudent.jsx";
import { ask } from "../Provides/confirmBus";
import { toast } from "../../ALERT/SystemToasts";
import LessonView from "./LessonView";
import { I18nProvider } from "../../i18n/I18nContext";

global.IS_REACT_ACT_ENVIRONMENT = true;

const STUDENTS = [
  { _id: "s1", tz: "800000001", firstname: "أول", lastname: "طالب" },
  { _id: "s2", tz: "800000002", firstname: "ثاني", lastname: "طالب" },
];
const LESSON = {
  _id: "L1", name: "رياضيات", room: "1", date: { day: 1, startMin: 960, endMin: 1005 },
  teacher: "g1", helper: null, list_students: ["s1", "s2"], hiddenCount: 0,
  teacherContact: { name: "سامي علي", phone: "050-1111111" }, helperContact: null,
};

let container, root;
const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(
    <I18nProvider><MemoryRouter initialEntries={["/lessons/L1"]}><Routes>
      <Route path="/lessons/:id" element={<LessonView />} />
    </Routes></MemoryRouter></I18nProvider>
  ));
};
const openTab = async (label) => {
  const tab = [...container.querySelectorAll('[role="tab"]')].find((t) => t.textContent === label);
  await act(async () => tab.click());
};
const removeButtons = () => [...container.querySelectorAll("button")].filter((b) => b.textContent === "إزالة");

beforeEach(() => {
  // The real api answers every call with a promise (the lock acquire/release too).
  require("../../WebServer/services/api").default.post.mockResolvedValue({ data: { ok: true } });
  mockPerms = ["lessons.view", "lessons.roster"];
  getOneLesson.mockReset();
  getOneLesson.mockResolvedValue({ ok: true, lesson: LESSON });
  getAllLesson.mockResolvedValue({ ok: true, lessons: [LESSON] });
  getStudents.mockResolvedValue({ ok: true, students: STUDENTS });
  removeFromList.mockReset();
  ask.mockReset();
  toast.warn.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

test("the details tab shows the time, room and teacher's name and phone", async () => {
  await mount();
  expect(container.textContent).toContain("الأحد 16:00");
  expect(container.textContent).toContain("سامي علي");
  expect(container.querySelector('a[href="tel:050-1111111"]')).not.toBeNull();
});

test("the students tab links each student to their page", async () => {
  await mount();
  await openTab("قائمة الطلاب");
  const hrefs = [...container.querySelectorAll('a[href^="/students/"]')].map((a) => a.getAttribute("href"));
  expect(hrefs).toEqual(["/students/800000001", "/students/800000002"]);
});

test("without lessons.roster there are no add or remove controls", async () => {
  mockPerms = ["lessons.view"];
  await mount();
  await openTab("قائمة الطلاب");
  expect(removeButtons()).toHaveLength(0);
  expect(container.textContent).not.toContain("+ إضافة طالب");
});

test("removing asks first and, on yes, removes only that student", async () => {
  ask.mockResolvedValue(true);
  removeFromList.mockResolvedValue({ ok: true });
  await mount();
  await openTab("قائمة الطلاب");
  await act(async () => removeButtons()[0].click());
  expect(ask).toHaveBeenCalledTimes(1);
  expect(removeFromList).toHaveBeenCalledWith("L1", ["s1"]);
  expect(getOneLesson).toHaveBeenCalledTimes(2); // reloaded after the change
});

test("declining the question removes nothing", async () => {
  ask.mockResolvedValue(false);
  await mount();
  await openTab("قائمة الطلاب");
  await act(async () => removeButtons()[0].click());
  expect(removeFromList).not.toHaveBeenCalled();
});

test("a lock refusal shows the server's message and reloads", async () => {
  ask.mockResolvedValue(true);
  removeFromList.mockResolvedValue({ ok: false, status: 423, message: "هذا العنصر مفتوح الآن لدى منى" });
  await mount();
  await openTab("قائمة الطلاب");
  await act(async () => removeButtons()[0].click());
  expect(toast.warn).toHaveBeenCalledWith("هذا العنصر مفتوح الآن لدى منى");
  expect(getOneLesson).toHaveBeenCalledTimes(2);
});

test("hidden students show as a count and are never sent on remove", async () => {
  getOneLesson.mockResolvedValue({ ok: true, lesson: { ...LESSON, list_students: ["s1"], hiddenCount: 2 } });
  ask.mockResolvedValue(true);
  removeFromList.mockResolvedValue({ ok: true });
  await mount();
  await openTab("قائمة الطلاب");
  expect(container.textContent).toContain("2");
  await act(async () => removeButtons()[0].click());
  expect(removeFromList).toHaveBeenCalledWith("L1", ["s1"]);
});

const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

test("roster changes are saved one after another, never overlapping", async () => {
  ask.mockResolvedValue(true);
  const first = deferred();
  removeFromList.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ ok: true });
  await mount();
  await openTab("قائمة الطلاب");
  await act(async () => { removeButtons()[0].click(); });
  await act(async () => { removeButtons()[1].click(); });
  expect(removeFromList).toHaveBeenCalledTimes(1);
  await act(async () => first.resolve({ ok: true }));
  expect(removeFromList).toHaveBeenCalledTimes(2);
  expect(removeFromList.mock.calls.map((c) => c[1])).toEqual([["s1"], ["s2"]]);
});

test("after a roster change the student list is reloaded too (a newly visible student shows)", async () => {
  ask.mockResolvedValue(true);
  removeFromList.mockResolvedValue({ ok: true });
  await mount();
  await openTab("قائمة الطلاب");
  const before = getStudents.mock.calls.length;
  await act(async () => removeButtons()[0].click());
  expect(getStudents.mock.calls.length).toBe(before + 1);
});

test("a late answer for the previous lesson never replaces the current one", async () => {
  const late = deferred();
  getOneLesson.mockImplementation((id) => (id === "L1" ? late.promise : Promise.resolve({ ok: true, lesson: { ...LESSON, _id: "L2", name: "علوم" } })));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(
    <I18nProvider><MemoryRouter initialEntries={["/lessons/L1"]}>
      <Link to="/lessons/L2">next</Link>
      <Routes><Route path="/lessons/:id" element={<LessonView />} /></Routes>
    </MemoryRouter></I18nProvider>
  ));
  await act(async () => container.querySelector('a[href="/lessons/L2"]').click());
  await act(async () => late.resolve({ ok: true, lesson: LESSON }));
  expect(container.textContent).toContain("علوم");
  expect(container.textContent).not.toContain("رياضيات");
});

test("the lesson page does not tell the user to press save", async () => {
  await mount();
  await openTab("قائمة الطلاب");
  expect(container.textContent).not.toContain("الضغط على زر الحفظ");
});

test("a slow first student load never hides a student just added by ID", async () => {
  const { addToList } = require("../../WebServer/services/lesson/functionsLesson.jsx");
  const { lookupStudent } = require("../../WebServer/services/student/functionsStudent.jsx");
  const NEW = { _id: "s3", tz: "000000018", firstname: "ثالث", lastname: "طالب" };
  const slow = deferred();
  getStudents.mockReset();
  getStudents.mockReturnValueOnce(slow.promise).mockResolvedValue({ ok: true, students: [...STUDENTS, NEW] });
  getOneLesson.mockResolvedValueOnce({ ok: true, lesson: LESSON }).mockResolvedValue({ ok: true, lesson: { ...LESSON, list_students: ["s1", "s2", "s3"] } });
  lookupStudent.mockResolvedValue({ ok: true, student: NEW });
  addToList.mockResolvedValue({ ok: true });
  await mount();
  await openTab("قائمة الطلاب");
  const byText = (txt) => [...container.querySelectorAll("button")].find((b) => b.textContent.includes(txt));
  await act(async () => byText("إضافة طالب").click());
  const input = container.querySelector('input[aria-label="إضافة طالب برقم الهوية"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => { setter.call(input, "000000018"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => byText("بحث").click());
  await act(async () => [...container.querySelectorAll("button")].find((b) => b.textContent === "إضافة").click());
  expect(addToList).toHaveBeenCalledWith("L1", { list_tz: ["000000018"] });
  await act(async () => slow.resolve({ ok: true, students: STUDENTS })); // the old, stale answer
  expect(container.querySelector('a[href="/students/000000018"]')).not.toBeNull();
});

test("each roster change takes the lesson's lock; while someone else holds it nothing is written", async () => {
  const api = require("../../WebServer/services/api").default;
  api.post.mockImplementation((path) => (path === "/locks/acquire"
    ? Promise.reject(Object.assign(new Error("locked"), { response: { status: 423, data: { ok: false, message: "هذا العنصر مفتوح الآن لدى منى" } } }))
    : Promise.resolve({ data: { ok: true } })));
  ask.mockResolvedValue(true);
  await mount();
  await openTab("قائمة الطلاب");
  await act(async () => removeButtons()[0].click());
  expect(api.post).toHaveBeenCalledWith("/locks/acquire", { key: "lesson:L1" });
  expect(removeFromList).not.toHaveBeenCalled();
  expect(toast.warn).toHaveBeenCalledWith("هذا العنصر مفتوح الآن لدى منى");
  api.post.mockReset();
});

test("«تعديل» waits for a pending roster change (and its lock release) before opening the form", async () => {
  mockPerms = ["lessons.view", "lessons.roster", "lessons.edit"];
  const api = require("../../WebServer/services/api").default;
  let releaseLock;
  api.post.mockImplementation((path) => (path === "/locks/release"
    ? new Promise((r) => { releaseLock = r; })
    : Promise.resolve({ data: { ok: true, created: true } })));
  ask.mockResolvedValue(true);
  removeFromList.mockResolvedValue({ ok: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(
    <I18nProvider><MemoryRouter initialEntries={["/lessons/L1"]}><Routes>
      <Route path="/lessons/:id" element={<LessonView />} />
      <Route path="/lessons/:id/edit" element={<p>the form</p>} />
    </Routes></MemoryRouter></I18nProvider>
  ));
  await openTab("قائمة الطلاب");
  await act(async () => removeButtons()[0].click());
  const edit = [...container.querySelectorAll("button")].find((b) => b.textContent === "تعديل");
  await act(async () => edit.click());
  expect(container.textContent).not.toContain("the form");
  await act(async () => releaseLock({ data: { ok: true } }));
  expect(container.textContent).toContain("the form");
});

const mountWithForm = async (extra = null) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(
    <I18nProvider><MemoryRouter initialEntries={["/lessons/L1"]}>
      {extra}
      <Routes>
        <Route path="/lessons/:id" element={<LessonView />} />
        <Route path="/lessons/:id/edit" element={<p>the form</p>} />
        <Route path="/elsewhere" element={<p>elsewhere</p>} />
      </Routes>
    </MemoryRouter></I18nProvider>
  ));
};
const pendingRelease = () => {
  const api = require("../../WebServer/services/api").default;
  const releases = [];
  api.post.mockImplementation((path) => (path === "/locks/release"
    ? new Promise((r) => { releases.push(r); })
    : Promise.resolve({ data: { ok: true, created: true } })));
  return releases;
};

test("once «تعديل» is clicked, a removal confirmed afterwards writes nothing", async () => {
  mockPerms = ["lessons.view", "lessons.roster", "lessons.edit"];
  const releases = pendingRelease();
  let answerB;
  ask.mockResolvedValueOnce(true).mockImplementationOnce(() => new Promise((r) => { answerB = r; }));
  removeFromList.mockResolvedValue({ ok: true });
  await mountWithForm();
  await openTab("قائمة الطلاب");
  const removeB = removeButtons()[1];
  await act(async () => removeButtons()[0].click());           // A saving
  await act(async () => removeB.click());                      // B's question left open
  const edit = [...container.querySelectorAll("button")].find((b) => b.textContent === "تعديل");
  await act(async () => edit.click());                         // Edit requested: the roster freezes
  expect(removeButtons()).toHaveLength(0);
  await act(async () => releases[0]({ data: { ok: true } }));  // A done -> form opens
  await act(async () => answerB(true));                        // B confirmed too late
  expect(removeFromList).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("the form");
});

test("leaving the page after «تعديل» is not undone when the save finishes", async () => {
  mockPerms = ["lessons.view", "lessons.roster", "lessons.edit"];
  const releases = pendingRelease();
  ask.mockResolvedValue(true);
  removeFromList.mockResolvedValue({ ok: true });
  await mountWithForm(<Link to="/elsewhere">away</Link>);
  await openTab("قائمة الطلاب");
  await act(async () => removeButtons()[0].click());
  const edit = [...container.querySelectorAll("button")].find((b) => b.textContent === "تعديل");
  await act(async () => edit.click());
  await act(async () => container.querySelector('a[href="/elsewhere"]').click());
  await act(async () => releases[0]({ data: { ok: true } }));
  expect(container.textContent).toContain("elsewhere");
  expect(container.textContent).not.toContain("the form");
});

test("a removal confirmed after moving to another lesson writes nothing", async () => {
  let answer;
  ask.mockImplementation(() => new Promise((r) => { answer = r; }));
  removeFromList.mockResolvedValue({ ok: true });
  getOneLesson.mockImplementation((id) => Promise.resolve({ ok: true, lesson: { ...LESSON, _id: id, name: id === "L2" ? "علوم" : "رياضيات" } }));
  await mountWithForm(<Link to="/lessons/L2">next</Link>);
  await openTab("قائمة الطلاب");
  await act(async () => removeButtons()[0].click());               // question open on L1
  await act(async () => container.querySelector('a[href="/lessons/L2"]').click());
  await act(async () => answer(true));                             // confirmed on L2's page
  expect(removeFromList).not.toHaveBeenCalled();
  expect(container.textContent).toContain("علوم");
});

test("the picker counts a student as added only when the save succeeded", async () => {
  const { addToList } = require("../../WebServer/services/lesson/functionsLesson.jsx");
  getStudents.mockResolvedValue({ ok: true, students: [...STUDENTS, { _id: "s3", tz: "000000018", firstname: "ثالث", lastname: "طالب" }] });
  addToList.mockResolvedValue({ ok: false, status: 423, message: "هذا العنصر مفتوح الآن لدى منى" });
  await mount();
  await openTab("قائمة الطلاب");
  await act(async () => [...container.querySelectorAll("button")].find((b) => b.textContent.includes("إضافة طالب")).click());
  const addS3 = [...container.querySelectorAll("button")].filter((b) => b.textContent === "إضافة").pop();
  await act(async () => addS3.click());
  expect(addToList).toHaveBeenCalledWith("L1", { list_students: ["s3"] });
  expect(container.textContent).not.toContain("أُضيف: 1");
});

test("a double click on «إضافة» adds and counts the student once", async () => {
  const { addToList } = require("../../WebServer/services/lesson/functionsLesson.jsx");
  getStudents.mockResolvedValue({ ok: true, students: [...STUDENTS, { _id: "s3", tz: "000000018", firstname: "ثالث", lastname: "طالب" }] });
  addToList.mockResolvedValue({ ok: true, updatedAt: "2026-11-01T10:00:00Z" });
  await mount();
  await openTab("قائمة الطلاب");
  await act(async () => [...container.querySelectorAll("button")].find((b) => b.textContent.includes("إضافة طالب")).click());
  const addS3 = [...container.querySelectorAll("button")].filter((b) => b.textContent === "إضافة").pop();
  await act(async () => { addS3.click(); addS3.click(); });
  expect(addToList).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("أُضيف: 1");
  expect(container.textContent).not.toContain("أُضيف: 2");
});
