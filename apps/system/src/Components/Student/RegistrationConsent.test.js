import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import EditStudent from "./EditStudent";
import RegistrationConsent from "./RegistrationConsent";
import ConsentView from "./ConsentView";
import ParentConsentPage from "./ParentConsentPage";
import { validate, submit, getConsent, getRules, signConsent, createConsentLink, validateConsentLink, submitConsentLink } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";

jest.mock("react-router-dom", () => ({ useParams: () => ({ token: "registration-token" }), useNavigate: () => jest.fn() }), { virtual: true });
jest.mock("../../WebServer/services/inviteToken/functionInviteToken.jsx", () => ({ validate: jest.fn(), submit: jest.fn(), getConsent: jest.fn(), getRules: jest.fn(), signConsent: jest.fn(), createConsentLink: jest.fn(), validateConsentLink: jest.fn(), submitConsentLink: jest.fn() }));
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
const agree = () => act(async () => host.querySelector('input[type="checkbox"]').click());
const change = (selector, value) => act(async () => {
  const node = host.querySelector(selector);
  Simulate.change(node, { target: { name: node.name, value } });
});
const fillStudent = async () => {
  for (const [name, value] of Object.entries({ tz: "123456782", firstname: "Child", lastname: "Family", birth_date: "2015-03-01", gender: "ذكر", street: "Street" })) await change(`[name="${name}"]`, value);
};
beforeEach(() => {
  jest.clearAllMocks(); window.location.hash = "personal-secret";
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  validate.mockResolvedValue({ valid: true, open: true, rules });
  submit.mockResolvedValue({ ok: true });
  getRules.mockResolvedValue({ ok: true, rules });
  getConsent.mockResolvedValue({ ok: true, consent: null });
  createConsentLink.mockResolvedValue({ ok: true, token: "personal-secret", expiresAt: "2026-11-13" });
  validateConsentLink.mockResolvedValue({ ok: true, rules, studentName: "Child Family" });
  submitConsentLink.mockResolvedValue({ ok: true });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

test("registration places laws after the photo and refuses submission without agreement and a stamp", async () => {
  await mount(<EditStudent parent />);
  const photo = [...host.querySelectorAll("label")].find((node) => node.textContent === "صورة الطالب:");
  expect(photo.compareDocumentPosition(button("قوانين الجمعية")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await click("إرسال الطلب");
  expect(submit).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]').textContent).toContain("يجب الموافقة");
  await click("قوانين الجمعية"); await change('[name="signerName"]', "Parent"); await agree();
  expect(host.querySelector('input[type="checkbox"]').checked).toBe(true);
  await click("حفظ والعودة إلى الطلب"); await click("إرسال الطلب");
  expect(submit).not.toHaveBeenCalled();
  await click("قوانين الجمعية"); await click("ارسم الختم"); await click("حفظ والعودة إلى الطلب");
  await fillStudent(); await click("إرسال الطلب");
  expect(submit).toHaveBeenCalledWith("registration-token", expect.objectContaining({ rulesVersion: 0, rulesAccepted: "true", signerName: "Parent", signature: "drawn-png" }), null);
});

test("changed rules clear agreement and signature and require fresh acceptance before sending", async () => {
  submit.mockResolvedValue({ ok: false, code: "RULES_CHANGED", message: "Changed" });
  await mount(<EditStudent parent />);
  await click("قوانين الجمعية"); await change('[name="signerName"]', "Parent"); await agree(); await click("ارسم الختم"); await click("حفظ والعودة إلى الطلب");
  await fillStudent(); validate.mockResolvedValue({ valid: true, open: true, rules: { version: 1, text: "New rules" } });
  await click("إرسال الطلب"); await click("إرسال الطلب");
  expect(submit).toHaveBeenCalledTimes(1);
  await click("قوانين الجمعية");
  expect(host.querySelector('[role="dialog"]').textContent).toContain("New rules");
  expect(host.querySelector('input[type="checkbox"]').checked).toBe(false);
  expect(host.querySelector('img[alt="توقيع/ختم ولي الأمر"]')).toBeNull();
});

test("the compact dialog preserves drawn evidence, unchecking withdraws agreement and focus stays inside", async () => {
  function Harness() {
    const [value, setValue] = useState({ accepted: false, signerName: "Parent", signature: "" });
    return <RegistrationConsent rules={rules} value={value} onChange={setValue} />;
  }
  await mount(<Harness />); await click("قوانين الجمعية"); await agree(); await click("ارسم الختم");
  expect(button("ارسم الختم")).toBeDefined();
  expect(button("أوافق على القوانين")).toBeUndefined(); expect(button("لا أوافق")).toBeUndefined();
  await click("حفظ والعودة إلى الطلب"); await click("قوانين الجمعية");
  expect(host.querySelector('img[alt="توقيع/ختم ولي الأمر"]').getAttribute("src")).toBe("drawn-png");
  await agree();
  const dialog = host.querySelector('[role="dialog"]'); const first = dialog.querySelector("button");
  button("حفظ والعودة إلى الطلب").focus();
  await act(async () => Simulate.keyDown(dialog, { key: "Tab", preventDefault: jest.fn() }));
  expect(document.activeElement).toBe(first);
  await act(async () => Simulate.keyDown(dialog, { key: "Escape", preventDefault: jest.fn() }));
  expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(button("قوانين الجمعية"));
  expect(host.textContent).toContain("يجب قراءة القوانين والموافقة"); expect(document.body.style.overflow).toBe("");
});

test("a legacy pending signature is completed using the same rules dialog", async () => {
  getConsent.mockResolvedValueOnce({ ok: true, consent: { signerName: "Parent", acceptedAt: "2026-11-06", signature: null, revision: "pending" } })
    .mockResolvedValueOnce({ ok: true, consent: { signerName: "Parent", signedAt: "2026-11-06", signature: "drawn-png", rulesText: rules.text, rulesVersion: 0, revision: "signed" } });
  signConsent.mockResolvedValue({ ok: true });
  await mount(<ConsentView studentId="student" />);
  expect(host.textContent).toContain("متبقٍ توقيع ولي الأمر"); expect(host.querySelector("canvas")).toBeNull();
  await click("قوانين الجمعية والتوقيع"); expect(host.querySelector("#consent-signer").value).toBe("Parent");
  await agree(); await click("ارسم الختم"); await click("حفظ التوقيع");
  expect(signConsent).toHaveBeenCalledWith("student", expect.objectContaining({ rulesAccepted: "true", signature: "drawn-png", baseConsentVersion: "pending" }));
  expect(host.querySelector('img[alt="توقيع ولي الأمر"]')).not.toBeNull();
});

test("an existing signature can be updated only with new consent and its displayed revision", async () => {
  getConsent.mockResolvedValue({ ok: true, consent: { signerName: "Parent", signature: "old-png", signedAt: "2026-11-06", revision: "old", rulesVersion: 0, rulesText: rules.text } });
  signConsent.mockResolvedValue({ ok: true });
  await mount(<ConsentView studentId="student" />); await click("تحديث التوقيع");
  await click("حفظ التوقيع"); expect(signConsent).not.toHaveBeenCalled();
  await agree(); await click("ارسم الختم"); await click("حفظ التوقيع");
  expect(signConsent).toHaveBeenCalledWith("student", expect.objectContaining({ baseConsentVersion: "old", signature: "drawn-png" }));
});

test("staff generate a child-specific parent link without sending a registration or changing the signature", async () => {
  await mount(<ConsentView studentId="student" />); await click("إنشاء رابط لولي الأمر");
  expect(createConsentLink).toHaveBeenCalledWith("student");
  expect(host.querySelector('[aria-label="رابط التوقيع"]').value).toBe(`${window.location.origin}/parent-consent#personal-secret`);
  expect(signConsent).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
});

test("the parent link shows only the child name and signing surface, and requires both consent and signature", async () => {
  await mount(<ParentConsentPage />);
  expect(validateConsentLink).toHaveBeenCalledWith("personal-secret");
  expect(host.textContent).toContain("Child Family"); expect(host.querySelector('[name="tz"]')).toBeNull();
  await click("إرسال الموافقة والتوقيع"); expect(submitConsentLink).not.toHaveBeenCalled();
  await change('[name="signerName"]', "Parent"); await click("ارسم الختم");
  await click("إرسال الموافقة والتوقيع"); expect(submitConsentLink).not.toHaveBeenCalled();
  await agree(); await click("إرسال الموافقة والتوقيع");
  expect(submitConsentLink).toHaveBeenCalledWith("personal-secret", { rulesVersion: 0, rulesAccepted: "true", signerName: "Parent", signature: "drawn-png" });
  expect(host.textContent).toContain("تم حفظ موافقتكم وتوقيعكم"); expect(host.querySelector('input[type="checkbox"]')).toBeNull();
});

test("a closed parent link exposes no signing controls", async () => {
  validateConsentLink.mockResolvedValue({ ok: false, code: "LINK_CLOSED", message: "Closed link" });
  await mount(<ParentConsentPage />);
  expect(host.querySelector('[role="alert"]').textContent).toBe("Closed link"); expect(host.querySelector("input")).toBeNull();
});
