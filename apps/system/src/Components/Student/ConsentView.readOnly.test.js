import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

jest.mock("../../WebServer/services/inviteToken/functionInviteToken.jsx", () => ({
  getConsent: jest.fn(), getRules: jest.fn(), signConsent: jest.fn(), createConsentLink: jest.fn(),
}));
jest.mock("../../ALERT/SystemToasts.jsx", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../utils/session", () => ({ ...jest.requireActual("../../utils/session"), canStored: () => true }));
jest.mock("./RegistrationConsent", () => ({ __esModule: true, default: () => require("react").createElement("div", { "data-testid": "sign-form" }) }));

import { getConsent, getRules } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
import ConsentView from "./ConsentView";

global.IS_REACT_ACT_ENVIRONMENT = true;

// A student who became staff: his signature is shown, never signed or sent
// again (owner, 2026-11-19; testing review 2026-11-20).
let container, root;
const mount = async (props) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<ConsentView studentId="s1" {...props} />));
};
beforeEach(() => {
  getConsent.mockResolvedValue({ ok: true, consent: { signerName: "ولي الأمر", signature: "data:image/png;base64,x", signedAt: "2026-11-01T10:00:00Z", rulesVersion: 1 } });
  getRules.mockResolvedValue({ ok: true, rules: { version: 1, text: "القوانين" } });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

test("read-only shows the signature with no signing form and no parent link", async () => {
  await mount({ readOnly: true });
  expect(container.textContent).toContain("ولي الأمر");
  expect(container.querySelector('[data-testid="sign-form"]')).toBeNull();
  expect([...container.querySelectorAll("button")].some((b) => b.textContent.includes("إنشاء رابط"))).toBe(false);
});

test("otherwise the form and the parent link are offered", async () => {
  await mount({});
  expect(container.querySelector('[data-testid="sign-form"]')).not.toBeNull();
  expect([...container.querySelectorAll("button")].some((b) => b.textContent.includes("إنشاء رابط"))).toBe(true);
});
