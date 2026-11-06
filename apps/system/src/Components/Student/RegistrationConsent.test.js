import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import EditStudent from "./EditStudent";
import RegistrationConsent from "./RegistrationConsent";
import ConsentView from "./ConsentView";
import { validate, submit, getConsent, getRules, signConsent } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";

jest.mock("react-router-dom", () => ({ useParams: () => ({ token: "registration-token" }), useNavigate: () => jest.fn() }), { virtual: true });
jest.mock("../../WebServer/services/inviteToken/functionInviteToken.jsx", () => ({ validate: jest.fn(), submit: jest.fn(), getConsent: jest.fn(), getRules: jest.fn(), signConsent: jest.fn() }));
jest.mock("../../WebServer/services/student/functionsStudent.jsx", () => ({ getOne: jest.fn(), create: jest.fn(), update: jest.fn() }));
jest.mock("../../WebServer/services/user/functionsUser.jsx", () => ({ getAll: jest.fn() }));
jest.mock("../../ALERT/SystemToasts", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../i18n/I18nContext", () => ({ useI18n: () => ({ t: (key) => key }) }));
jest.mock("../../utils/session", () => ({ canStored: () => false }));
jest.mock("../../locks/useItemLock", () => () => ({ status: "held" }));
jest.mock("../../locks/LockLostBanner", () => ({ useLockRecovery: () => ({ element: null }) }));
jest.mock("./SignaturePad", () => ({ onChange }) => <button type="button" data-testid="signature-pad" onClick={() => onChange("drawn-png")}>ارسم الختم</button>);

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const rules = { version: 0, text: "قوانين الاختبار" };
const button = (text) => [...host.querySelectorAll("button")].find((node) => node.textContent === text);
const mount = (element) => act(async () => root.render(element));
const click = (text) => act(async () => button(text).click());
const change = (selector, value) => act(async () => {
  const node = host.querySelector(selector);
  Simulate.change(node, { target: { name: node.name, value } });
});
beforeEach(() => {
  jest.clearAllMocks();
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  validate.mockResolvedValue({ valid: true, open: true, rules });
  submit.mockResolvedValue({ ok: true });
  getRules.mockResolvedValue({ ok: true, rules });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

test("registration places its laws link after the photo; agreement/name enable submission without a stamp", async () => {
  await mount(<EditStudent parent />);
  const photo = [...host.querySelectorAll("label")].find((node) => node.textContent === "صورة الطالب:");
  expect(photo.compareDocumentPosition(button("قوانين الجمعية")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(button("إرسال الطلب").disabled).toBe(true);
  await click("قوانين الجمعية");
  expect(host.querySelector('[role="dialog"]').textContent).toContain(rules.text);
  await change('[name="signerName"]', "Parent");
  await click("أوافق على القوانين");
  await click("حفظ والعودة إلى الطلب");
  expect(button("إرسال الطلب").disabled).toBe(false);
  expect(host.textContent).toContain("التوقيع/الختم مطلوب");
  for (const [name, value] of Object.entries({ tz: "123456782", firstname: "Child", lastname: "Family", birth_date: "2015-03-01", gender: "ذكر", street: "Street" })) await change(`[name="${name}"]`, value);
  await click("إرسال الطلب");
  expect(submit).toHaveBeenCalledWith("registration-token", expect.objectContaining({ rulesVersion: 0, rulesAccepted: "true", signerName: "Parent", signature: "" }), null);
});

test("a changed rules version clears consent and prevents sending until the new version is accepted", async () => {
  submit.mockResolvedValue({ ok: false, code: "RULES_CHANGED", message: "Changed" });
  await mount(<EditStudent parent />);
  await click("قوانين الجمعية"); await change('[name="signerName"]', "Parent"); await click("أوافق على القوانين"); await click("ارسم الختم"); await click("حفظ والعودة إلى الطلب");
  for (const [name, value] of Object.entries({ tz: "123456782", firstname: "Child", lastname: "Family", birth_date: "2015-03-01", gender: "ذكر", street: "Street" })) await change(`[name="${name}"]`, value);
  validate.mockResolvedValue({ valid: true, open: true, rules: { version: 1, text: "New rules" } });
  await click("إرسال الطلب");
  expect(button("إرسال الطلب").disabled).toBe(true);
  await click("قوانين الجمعية");
  expect(host.querySelector('[role="dialog"]').textContent).toContain("New rules");
  expect(button("أوافق على القوانين").getAttribute("aria-pressed")).toBe("false");
});

test("dialog preserves drawn evidence when reopened, disagreement clears acceptance, and keyboard focus stays inside", async () => {
  function Harness() {
    const [value, setValue] = useState({ accepted: false, signerName: "Parent", signature: "" });
    return <RegistrationConsent rules={rules} value={value} onChange={setValue} />;
  }
  await mount(<Harness />);
  await click("قوانين الجمعية"); await click("أوافق على القوانين"); await click("ارسم الختم");
  expect(button("ارسم الختم")).toBeDefined(); // A stroke does not destroy the canvas.
  await click("حفظ والعودة إلى الطلب"); await click("قوانين الجمعية");
  expect(host.querySelector('img[alt="توقيع/ختم ولي الأمر"]').getAttribute("src")).toBe("drawn-png");
  await click("لا أوافق");
  const dialog = host.querySelector('[role="dialog"]');
  const first = dialog.querySelector("button");
  const last = button("حفظ والعودة إلى الطلب");
  last.focus();
  await act(async () => Simulate.keyDown(dialog, { key: "Tab", preventDefault: jest.fn() }));
  expect(document.activeElement).toBe(first);
  await act(async () => Simulate.keyDown(dialog, { key: "Escape", preventDefault: jest.fn() }));
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(button("قوانين الجمعية"));
  expect(host.textContent).toContain("يجب قراءة القوانين والموافقة");
  expect(document.body.style.overflow).toBe("");
});

test("pending consent is shown as incomplete and can be completed on the student's page", async () => {
  getConsent.mockResolvedValueOnce({ ok: true, consent: { signerName: "Parent", acceptedAt: "2026-11-06", signature: null } })
    .mockResolvedValueOnce({ ok: true, consent: { signerName: "Parent", signedAt: "2026-11-06", signature: "drawn-png", rulesText: rules.text, rulesVersion: 0 } });
  signConsent.mockResolvedValue({ ok: true });
  await mount(<ConsentView studentId="student" />);
  expect(host.textContent).toContain("لم يُستكمل بعد");
  expect(host.querySelector("img")).toBeNull();
  expect(host.querySelector("#consent-signer").value).toBe("Parent");
  await act(async () => Simulate.change(host.querySelector('input[type="checkbox"]'), { target: { checked: true } }));
  await click("ارسم الختم"); await click("حفظ التوقيع");
  expect(signConsent).toHaveBeenCalledWith("student", expect.objectContaining({ rulesAccepted: "true", signature: "drawn-png" }));
  expect(host.querySelector('img[alt="توقيع ولي الأمر"]')).not.toBeNull();
});
