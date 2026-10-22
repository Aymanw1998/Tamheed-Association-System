import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

import ChangeOwnPassword from "./ChangeOwnPassword";
import { I18nProvider } from "../../i18n/I18nContext";
import { changePassword } from "../../WebServer/services/auth/fuctionsAuth";

jest.mock("../../WebServer/services/auth/fuctionsAuth", () => ({ changePassword: jest.fn() }));
jest.mock("../../ALERT/SystemToasts.jsx", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));

global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<I18nProvider><ChangeOwnPassword /></I18nProvider>);
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const byTour = (name) => container.querySelector(`[data-tour="${name}"]`);

// Types the way React sees it: through the native value setter, then "input".
const typeInto = async (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

test("«إلغاء» is off while the form is empty", () => {
  expect(byTour("password-cancel").disabled).toBe(true);
  expect(byTour("password-cancel").textContent).toBe("إلغاء");
});

test("«إلغاء» empties a filled form and sends nothing", async () => {
  await typeInto(byTour("password-current"), "old-demo-value");
  await typeInto(byTour("password-new"), "new-demo-value");
  await typeInto(byTour("password-confirm"), "new-demo-value");
  expect(byTour("password-cancel").disabled).toBe(false);

  await act(async () => byTour("password-cancel").click());

  ["password-current", "password-new", "password-confirm"].forEach((name) => expect(byTour(name).value).toBe(""));
  expect(changePassword).not.toHaveBeenCalled();
});
