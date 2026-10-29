import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

import GuidePage from "./GuidePage";

// Jest 27 (CRA 5) ignores package "exports" (see journey/JourneyProvider.test.js).
jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});

let mockJourney;
jest.mock("../journey/JourneyProvider", () => ({ useJourney: () => mockJourney }));

let root;
let container;

const mount = async (permissions = []) => {
  localStorage.setItem("permissions", JSON.stringify(permissions));
  localStorage.setItem("user_id", "u1");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <GuidePage />
      </MemoryRouter>,
    );
  });
};

const cards = () => Array.from(container.querySelectorAll("[data-guide]")).map((el) => el.dataset.guide);
const card = (id) => container.querySelector(`[data-guide="${id}"]`);
const button = (scope, text) => Array.from(scope.querySelectorAll("button")).find((b) => b.textContent === text);

beforeEach(() => {
  mockJourney = { startJourney: jest.fn(() => Promise.resolve(true)) };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
});

test("shows a card per screen the user can open, folded", async () => {
  await mount([]);
  // Students, vehicles, files and the other restricted screens need permissions.
  expect(cards()).toEqual(["dashboard", "lessons", "calendar", "reports"]);
  expect(card("lessons").querySelector("details").open).toBe(false);
  // No lessons.create: the steps for a new lesson are left out.
  expect(card("lessons").textContent).not.toContain("درس جديد");
});

test("a user who can create lessons sees how", async () => {
  await mount(["lessons.create"]);
  expect(card("lessons").textContent).toContain("درس جديد");
});

test("switches to Hebrew and remembers it", async () => {
  await mount([]);
  expect(container.querySelector("h1").textContent).toBe("دليل المستخدم");
  await act(async () => button(container, "עברית").click());
  expect(container.querySelector("h1").textContent).toBe("מדריך למשתמש");
  expect(card("calendar").textContent).toContain("נוכחות");
  expect(localStorage.getItem("guide.lang")).toBe("he");
});

test("search keeps matching cards and opens them", async () => {
  await mount([]);
  const input = container.querySelector("input[type=search]");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, "السجل");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(cards()).toEqual(["calendar"]);
  expect(card("calendar").querySelector("details").open).toBe(true);
});

test("«أرني» runs the screen's chapter alone", async () => {
  await mount([]);
  await act(async () => button(card("calendar"), "أرني").click());
  expect(mockJourney.startJourney).toHaveBeenCalledWith("journey-attendance", { only: true });
});

test("marks entries changed since the last visit as new, then remembers them", async () => {
  localStorage.setItem("guide.seen.u1", JSON.stringify({ dashboard: "2026-10-01" }));
  await mount([]);
  expect(card("dashboard").textContent).toContain("جديد");
  const seen = JSON.parse(localStorage.getItem("guide.seen.u1"));
  expect(Object.keys(seen).sort()).toEqual(["calendar", "dashboard", "lessons", "reports"]);
});

test("approve and reject are explained only to who can do each", async () => {
  await mount(["users.view", "users.approve", "students.view", "students.delete"]);
  const text = card("dashboard").textContent;
  expect(text).toContain("ثم اختر دور المستخدم");
  expect(text).not.toContain("يحذف الحساب الجديد");
  expect(text).not.toContain("ينقلهم إلى قائمة الطلاب");
  expect(text).toContain("يحذف الطالب المنتظر");
});

test("the first visit marks nothing new", async () => {
  await mount([]);
  expect(container.textContent).not.toContain("جديد");
});

test("an administrator sees every screen; sports has no «أرني»", async () => {
  const { ALL_KEYS } = require("../utils/permissionKeys");
  await mount(ALL_KEYS);
  expect(cards()).toEqual(["dashboard", "lessons", "calendar", "students", "reports", "vehicles", "files", "notices", "users", "audit", "sports"]);
  expect(button(card("sports"), "أرني")).toBeUndefined();
  expect(button(card("users"), "أرني")).toBeDefined();
});

const mockExport = jest.fn(() => Promise.resolve());
jest.mock("../Components/ExportPDF/ExportPDF", () => ({ exportCardPdf: (...args) => mockExport(...args) }));

test("saves the whole guide this user sees as a PDF, in the chosen language", async () => {
  mockExport.mockClear();
  localStorage.setItem("guide.lang", "he");
  await mount([]);
  await act(async () => button(container, "שמירה כ-PDF").click());
  expect(mockExport).toHaveBeenCalledTimes(1);
  const opts = mockExport.mock.calls[0][0];
  expect(opts.profile).toBe(false);
  expect(opts.labels.preview.print).toBe("הדפסה");
  expect(opts.labels.issued).toBe("תאריך הפקה");
  expect(opts.title).toBe("מדריך למשתמש");
  expect(opts.sections.map((s) => s.title)).toEqual(["לוח הבקרה", "שיעורים", "נוכחות", "דוחות"]);
  expect(opts.sections[1].rows[0]).toEqual({ key: "המסך", value: expect.stringContaining("תוכנית השיעורים"), full: true });
});
