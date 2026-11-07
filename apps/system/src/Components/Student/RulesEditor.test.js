jest.mock("../../utils/session", () => ({ ...jest.requireActual("../../utils/session"), canStored: jest.fn(() => true) }));
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import RulesEditor from "./RulesEditor";
import { DEFAULT_RULES } from "./defaultRules";
import { getRules, publishRules } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
import { ask } from "../Provides/confirmBus.js";
jest.mock("../../WebServer/services/inviteToken/functionInviteToken.jsx", () => ({ getRules: jest.fn(), publishRules: jest.fn() }));
jest.mock("../Provides/confirmBus.js", () => ({ ask: jest.fn() }));
jest.mock("../../ALERT/SystemToasts.jsx", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("../../utils/unsavedChanges", () => ({ setUnsavedChanges: jest.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const mount = () => act(async () => root.render(<RulesEditor />));
const button = (text) => [...host.querySelectorAll("button")].find((node) => node.textContent === text);
beforeEach(() => {
  require("../../utils/session").canStored.mockReturnValue(true);
  jest.clearAllMocks(); getRules.mockResolvedValue({ ok: true, rules: null }); ask.mockResolvedValue(true);
  publishRules.mockImplementation(async (text) => ({ ok: true, rules: { version: 2, text } }));
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

test("viewing rules without edit permission exposes only read-only text", async () => {
  require("../../utils/session").canStored.mockImplementation((key) => key === "rules.view");
  await mount();
  expect(host.querySelector("textarea").readOnly).toBe(true);
  expect(button("نشر")).toBeUndefined();
  expect(button("استعادة النص الافتراضي")).toBeUndefined();
  expect(publishRules).not.toHaveBeenCalled();
  expect(require("../../utils/unsavedChanges").setUnsavedChanges).toHaveBeenLastCalledWith(false);
});
test("legacy no-record response still offers the default without claiming intake is closed", async () => {
  await mount();
  expect(host.querySelector("textarea").value).toBe(DEFAULT_RULES);
  expect(button("نشر").disabled).toBe(false);
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(publishRules).not.toHaveBeenCalled();
});
test.each(["Existing published wording", ""])("published wording %p is retained until explicitly restored", async (text) => {
  getRules.mockResolvedValue({ ok: true, rules: { version: 1, text } });
  await mount();
  expect(host.querySelector("textarea").value).toBe(text);
  expect(button("نشر").disabled).toBe(true);
  await act(async () => button("استعادة النص الافتراضي").click());
  expect(host.querySelector("textarea").value).toBe(DEFAULT_RULES);
  expect(publishRules).not.toHaveBeenCalled();
});
test("management can edit the default and publish exactly the edited text after confirmation", async () => {
  await mount();
  const text = DEFAULT_RULES + "\n\nإضافة من الإدارة";
  await act(async () => Simulate.change(host.querySelector("textarea"), { target: { value: text } }));
  await act(async () => button("نشر").click());
  expect(ask).toHaveBeenCalled();
  expect(publishRules).toHaveBeenCalledWith(text);
  expect(button("نشر").disabled).toBe(true);
});
test("canceling publication or failing to load the published version cannot overwrite it", async () => {
  ask.mockResolvedValue(false);
  await mount();
  await act(async () => button("نشر").click());
  expect(publishRules).not.toHaveBeenCalled();
  await act(async () => root.unmount()); root = createRoot(host);
  getRules.mockResolvedValue({ ok: false, message: "offline" });
  await mount();
  expect(host.querySelector("textarea")).toBeNull();
  expect(button("نشر")).toBeUndefined();
});
