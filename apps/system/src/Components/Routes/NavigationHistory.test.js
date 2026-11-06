import React, { act } from "react";
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
  await act(async () => root.render(<MemoryRouter initialEntries={[initial]}><NavigationHistory /><Probe /></MemoryRouter>));
};
const back = () => host.querySelector('nav button:first-child');
const forward = () => host.querySelector('nav button:last-child');
const at = () => host.querySelector('[data-testid="at"]').textContent;
beforeEach(() => { confirmLeave.mockResolvedValue(true); jest.spyOn(window, "scrollTo").mockImplementation(() => {}); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); jest.restoreAllMocks(); });
test("internal back and forward restore the previous query and obey unsaved confirmation", async () => {
  await mount();
  expect(forward().disabled).toBe(true);
  await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent === "record").click());
  confirmLeave.mockResolvedValueOnce(false);
  await act(async () => back().click());
  expect(at()).toBe("/students/one");
  await act(async () => back().click());
  expect(at()).toBe("/students?filter=pending");
  expect(forward().disabled).toBe(false);
  await act(async () => forward().click());
  expect(at()).toBe("/students/one");
});
test("a directly opened edit page returns to its record, with no forward entry or external navigation", async () => {
  await mount("/lessons/one/edit");
  expect(forward().disabled).toBe(true);
  await act(async () => back().click());
  expect(at()).toBe("/lessons/one");
  expect(forward().disabled).toBe(true);
});
