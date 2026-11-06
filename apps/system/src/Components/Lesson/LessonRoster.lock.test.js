import React, { act } from "react";
import { createRoot } from "react-dom/client";
import LessonRoster from "./LessonRoster";
import api from "../../WebServer/services/api";

jest.mock("react-router-dom", () => ({ Link: ({ children }) => <span>{children}</span> }), { virtual: true });
jest.mock("../../i18n/I18nContext", () => ({ useI18n: () => ({ t: (key) => key }) }));
jest.mock("../../ALERT/SystemToasts", () => ({ toast: { success: jest.fn(), warn: jest.fn() } }));
jest.mock("../../WebServer/services/student/functionsStudent", () => ({ lookupStudent: jest.fn() }));
jest.mock("../../WebServer/services/api", () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() }, API_BASE_URL: "/api", getAuthToken: () => "fake" }));
jest.mock("../../journey/demoMode", () => ({ isDemo: () => false }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
const button = (text) => [...host.querySelectorAll("button")].find((node) => node.textContent === text);
const mount = (props = {}) => act(async () => root.render(<LessonRoster lesson={{ _id: "program-a", list_students: [] }} students={[{ _id: "student", firstname: "Child" }]} allLessons={[]} canEdit onChange={jest.fn()} confirmRemove={jest.fn()} {...props} />));
beforeEach(() => {
  jest.clearAllMocks(); api.post.mockResolvedValue({ data: { ok: true } });
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

test("the add window holds the program while choosing students and releases it when closed", async () => {
  await mount();
  expect(api.post).not.toHaveBeenCalled();
  await act(async () => button("+ إضافة طالب").click());
  expect(api.post).toHaveBeenCalledWith("/locks/acquire", { key: "lesson:program-a" });
  expect(button("إضافة")).toBeDefined();
  expect(api.post.mock.calls.filter(([path]) => path === "/locks/release")).toHaveLength(0);
  await act(async () => button("تم").click());
  expect(api.post).toHaveBeenCalledWith("/locks/release", { key: "lesson:program-a" });
});

test("a held program shows the other holder and offers no addition until released", async () => {
  api.post.mockImplementation(async (path) => {
    if (path === "/locks/acquire") throw { response: { status: 423, data: { holder: { name: "Other User", tz: "900000001" } } } };
    return { data: { ok: true } };
  });
  const onChange = jest.fn();
  await mount({ onChange });
  await act(async () => button("+ إضافة طالب").click());
  expect(host.querySelector('[role="dialog"]').textContent).toContain("مفتوح الآن لدى Other User (900000001)");
  expect(button("إضافة")).toBeUndefined();
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => button("تم").click());
  expect(api.post.mock.calls.filter(([path]) => path === "/locks/release")).toHaveLength(0);
});

test("a lesson edit form reuses its surrounding lock without taking/releasing a second one", async () => {
  await mount({ confirmRemove: undefined });
  await act(async () => button("+ إضافة طالب").click());
  await act(async () => button("تم").click());
  expect(api.post).not.toHaveBeenCalled();
});
