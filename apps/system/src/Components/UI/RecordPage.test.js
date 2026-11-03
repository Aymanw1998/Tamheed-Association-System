import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import RecordPage from "./RecordPage";

// Jest 27 (CRA 5) ignores package "exports" (see journey/JourneyProvider.test.js).
jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});

global.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
const tabs = [
  { id: "a", label: "الأول", content: <p>محتوى أ</p> },
  { id: "b", label: "الثاني", content: <p>محتوى ب</p> },
];

const mount = async (props, path = "/x") => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(
    <MemoryRouter initialEntries={[path]}><RecordPage title="اسم" subtitle="سطر" photo="" actions={[]} {...props} /></MemoryRouter>
  ));
};

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const tabButtons = () => [...container.querySelectorAll('[role="tab"]')];

test("only the first tab's content is shown", async () => {
  await mount({ tabs });
  expect(container.textContent).toContain("محتوى أ");
  expect(container.textContent).not.toContain("محتوى ب");
  expect(tabButtons().map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false"]);
});

test("clicking a tab shows its content instead", async () => {
  await mount({ tabs });
  await act(async () => tabButtons()[1].click());
  expect(container.textContent).toContain("محتوى ب");
  expect(container.textContent).not.toContain("محتوى أ");
});

test("?tab= opens that tab", async () => {
  await mount({ tabs }, "/x?tab=b");
  expect(container.textContent).toContain("محتوى ب");
});

test("a single tab shows its content without a tab bar", async () => {
  await mount({ tabs: [tabs[0]] });
  expect(container.querySelector('[role="tablist"]')).toBeNull();
  expect(container.textContent).toContain("محتوى أ");
});

test("no actions means no buttons; actions render with their labels", async () => {
  await mount({ tabs });
  expect(container.querySelectorAll("button:not([role=tab])").length).toBe(0);
  await act(async () => root.unmount());
  container.remove();
  const onClick = jest.fn();
  await mount({ tabs, actions: [{ label: "تعديل", onClick }] });
  const btn = [...container.querySelectorAll("button")].find((b) => b.textContent.includes("تعديل"));
  await act(async () => btn.click());
  expect(onClick).toHaveBeenCalled();
});

test("loading and error replace the page", async () => {
  await mount({ tabs, loading: true });
  expect(container.textContent).not.toContain("محتوى أ");
  await act(async () => root.unmount());
  container.remove();
  await mount({ tabs, error: "غير موجود" });
  expect(container.textContent).toContain("غير موجود");
  expect(container.textContent).not.toContain("محتوى أ");
});

test("photo={null} shows no photo box (a lesson has no picture)", async () => {
  await mount({ tabs, photo: null });
  expect(container.querySelector("svg, img")).toBeNull();
});

test("an action's tour name becomes its data-tour (the guided tour clicks it)", async () => {
  await mount({ tabs, actions: [{ label: "تعديل", onClick() {}, tour: "student-view-edit" }] });
  expect(container.querySelector('[data-tour="student-view-edit"]')).not.toBeNull();
});
