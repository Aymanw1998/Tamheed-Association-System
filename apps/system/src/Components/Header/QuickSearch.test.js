import React, { act } from "react";
import { createRoot } from "react-dom/client";
import QuickSearch, { normalize, searchAll } from "./QuickSearch";
import { getAll as getAllStudents } from "../../WebServer/services/student/functionsStudent";
import { getAll as getAllUsers } from "../../WebServer/services/user/functionsUser";
import { getAllLesson } from "../../WebServer/services/lesson/functionsLesson";

jest.mock("../../WebServer/services/student/functionsStudent", () => ({ getAll: jest.fn() }));
jest.mock("../../WebServer/services/user/functionsUser", () => ({ getAll: jest.fn() }));
jest.mock("../../WebServer/services/lesson/functionsLesson", () => ({ getAllLesson: jest.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("Arabic search ignores diacritics and alef/teh marbuta forms", () => {
  expect(normalize("أحمَد")).toBe(normalize("احمد"));
  expect(normalize("مدرسة")).toBe(normalize("مدرسه"));
  const groups = searchAll("احمد", { students: [{ firstname: "أحمد", lastname: "خالد", tz: "123" }] });
  expect(groups).toEqual([{ group: "الطلاب", items: [expect.objectContaining({ path: "/students/123", label: "أحمد خالد" })] }]);
});

test("every word must match, and an ID number finds its person", () => {
  const users = [{ firstname: "سمير", lastname: "حداد", tz: "555" }, { firstname: "سمير", lastname: "نصار", tz: "777" }];
  expect(searchAll("سمير نصار", { users })[0].items.map((i) => i.hint)).toEqual(["777"]);
  expect(searchAll("555", { users })[0].items.map((i) => i.label)).toEqual(["سمير حداد"]);
});

test("an empty query lists the pages only", () => {
  const pages = [{ path: "/dashboard", label: "الرئيسي" }];
  expect(searchAll("  ", { pages, students: [{ firstname: "x", tz: "1" }] })).toEqual([{ group: "الصفحات", items: pages }]);
});

describe("the dialog", () => {
  let host, root;
  beforeEach(() => {
    host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
    getAllStudents.mockResolvedValue({ ok: true, students: [{ firstname: "نور", lastname: "علي", tz: "42" }] });
    getAllUsers.mockResolvedValue({ ok: true, users: [] });
    getAllLesson.mockResolvedValue({ ok: true, lessons: [] });
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

  test("Ctrl+K opens it, records load only for what the user may list, Enter opens the result", async () => {
    const onNav = jest.fn();
    await act(async () => root.render(<QuickSearch pages={[]} canStudents canUsers={false} canLessons={false} onNav={onNav} />));
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })); });
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(getAllStudents).toHaveBeenCalledTimes(1);
    expect(getAllUsers).not.toHaveBeenCalled();
    expect(getAllLesson).not.toHaveBeenCalled();
    const input = document.body.querySelector("input");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "نور");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(document.body.querySelector('[role="option"]').textContent).toContain("نور علي");
    await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(onNav).toHaveBeenCalledWith(expect.anything(), "/students/42");
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  test("Escape closes it", async () => {
    await act(async () => root.render(<QuickSearch pages={[]} canStudents={false} canUsers={false} canLessons={false} onNav={jest.fn()} />));
    await act(async () => { host.querySelector("button").click(); });
    await act(async () => { document.body.querySelector("input").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(getAllStudents).not.toHaveBeenCalled();
  });

  // A phone has no Escape key and the full-screen panel leaves no backdrop to
  // tap, so the dialog needs its own close button (owner, 2026-11-09).
  test("a visible close button closes it", async () => {
    await act(async () => root.render(<QuickSearch pages={[]} canStudents={false} canUsers={false} canLessons={false} onNav={jest.fn()} />));
    await act(async () => { host.querySelector("button").click(); });
    const closeButton = document.body.querySelector('[role="dialog"] button[aria-label="إغلاق البحث"]');
    expect(closeButton).not.toBeNull();
    await act(async () => { closeButton.click(); });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});
