import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  global.TextEncoder = TextEncoder; global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});
jest.mock("../../utils/unsavedChanges", () => ({ confirmLeave: jest.fn() }));
jest.mock("../../utils/session", () => ({ getStoredPermissions: () => ["students.view", "lessons.view", "lessons.edit", "reports.create"] }));
import { confirmLeave } from "../../utils/unsavedChanges";
import NavigationHistory from "./NavigationHistory";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
function Probe() {
  const location = useLocation(), navigate = useNavigate();
  return <><p data-testid="at">{location.pathname}{location.search}</p><button onClick={() => navigate("/students/one")}>record</button></>;
}
const mount = async (initial = "/students?filter=pending") => {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => root.render(<MemoryRouter initialEntries={[initial]}><HeaderFixture /><NavigationHistory /><Probe /></MemoryRouter>));
};
function HeaderFixture() {
  const [version, setVersion] = useState(0);
  return <><header key={version} id="header"><span id="header-history" /></header><button onClick={() => setVersion((value) => value + 1)}>remount header</button></>;
}
const back = () => host.querySelector('button[aria-label="رجوع"]');
const forward = () => host.querySelector('button[aria-label="تقدّم"]');
const at = () => host.querySelector('[data-testid="at"]').textContent;
beforeEach(() => { confirmLeave.mockResolvedValue(true); jest.spyOn(window, "scrollTo").mockImplementation(() => {}); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); jest.restoreAllMocks(); });
test("internal back and forward restore the previous query and obey unsaved confirmation", async () => {
  await mount();
  expect(forward()).toBeNull();
  expect(back().closest("header")).not.toBeNull();
  await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent === "record").click());
  confirmLeave.mockResolvedValueOnce(false);
  await act(async () => back().click());
  expect(at()).toBe("/students/one");
  await act(async () => back().click());
  expect(at()).toBe("/students?filter=pending");
  expect(forward()).not.toBeNull();
  await act(async () => forward().click());
  expect(at()).toBe("/students/one");
});
test("a directly opened edit page returns to its record, with no forward entry or external navigation", async () => {
  await mount("/lessons/one/edit");
  expect(forward()).toBeNull();
  await act(async () => back().click());
  expect(at()).toBe("/lessons/one");
  expect(forward()).toBeNull();
});

test("dashboard has no history arrows; a direct child has only a useful back arrow", async () => {
  await mount("/dashboard");
  expect(back()).toBeNull(); expect(forward()).toBeNull();
  expect(host.querySelector('nav[aria-label="التنقل بين الصفحات"]')).toBeNull();
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "record").click());
  expect(back()).not.toBeNull(); expect(forward()).toBeNull();
});

test("header remounts reattach the arrows without losing internal history", async () => {
  await mount();
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "record").click());
  const oldHeader = host.querySelector("header");
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "remount header").click());
  expect(oldHeader.isConnected).toBe(false);
  expect(back().closest("header")).toBe(host.querySelector("header"));
  await act(async () => back().click());
  expect(at()).toBe("/students?filter=pending"); expect(forward()).not.toBeNull();
});
