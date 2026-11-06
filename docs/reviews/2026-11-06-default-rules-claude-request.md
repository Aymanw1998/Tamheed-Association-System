PENDING actual Claude Code independent review. Codex implemented this change. Read-only, no edits/tools/recursive reviewers. Current actual-Claude weekly quota response is already recorded; no new peer review is claimed.
Owner supplied exact four Arabic paragraphs as editable default parent rules. The editor must use them as a draft only if no published version exists, preserve both nonempty and deliberately empty published versions, allow explicit restore-to-default and editing, then publish through the existing versioned endpoint only after confirmation. Existing signed versions remain unchanged. Loading failure must not enable overwriting unknown published text. Owner explicitly deferred repairs of educational-roster concurrency and partial consent persistence; those are not fixed in this change. No environment, credentials, logs or real user records follow. Return concrete regressions with file/line and scenario.

SOURCE: apps/system/src/Components/Student/defaultRules.js

// Owner-provided default. It is an editable draft, not automatically published.
export const DEFAULT_RULES = String.raw`1- أتعهد بالالتزام ببرنامج الجمعيّة.

2- أوافق على أنّ ابني سيشارك في دورة كرة القدم في الجمعية ولن يشارك بأيّ دورة كرة قدم خارج نطاق الجمعية في المقابل.

3- أقرّ بأنّ ابني\ابنتي لا يعاني من عائق صحّيّ يمنعها من المشاركة في الفعاليات الرّياضيّة جميعها. (تجاهلوا البند في حال وجود عائق صحّي)

4- لا أمانع من مشاركة صور ابني \ ابنتي عبر منصّات التّواصل الاجتماعيّ أو الإعلام خلال الفعاليّات.`;


SOURCE: apps/system/src/Components/Student/RulesEditor.jsx

import React, { useEffect, useState } from "react";
import Button from "../UI/Button.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { ask } from "../Provides/confirmBus.js";
import { getRules, publishRules } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
import { DEFAULT_RULES } from "./defaultRules";

// The rules a parent signs on the registration link. Publishing makes a new
// version; those who already signed keep the version they signed.
export default function RulesEditor() {
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(0);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getRules().then((res) => {
      if (!alive) return;
      if (res.ok) {
        setVersion(res.rules?.version || 0);
        setText(res.rules ? (res.rules.text ?? "") : DEFAULT_RULES);
        setSaved(res.rules?.text || "");
      } else setError(res.message || "تعذّر تحميل نظام الجمعية");
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  const publish = async () => {
    let confirmed = false;
    try {
      confirmed = await ask("", {
        title: "نشر نظام الجمعية",
        message: text.trim()
          ? "من الآن سيوقّع الأهل الجدد على هذا النص. من وقّع سابقًا يبقى توقيعه على النص الذي وقّعه."
          : "النص فارغ: سيتوقف رابط التسجيل عن استقبال طلبات الأهل. هل تريد المتابعة؟",
        confirmText: "نشر",
        cancelText: "إلغاء",
      });
    } catch {
      toast.error("تعذّر فتح نافذة التأكيد، حاول مرة أخرى.");
      return;
    }
    if (!confirmed) return;
    setBusy(true);
    const res = await publishRules(text);
    setBusy(false);
    if (!res.ok) return toast.error(res.message);
    setVersion(res.rules.version);
    setSaved(res.rules.text);
    toast.success("تم نشر نظام الجمعية");
  };

  if (!loaded) return null;
  if (error) return <p role="alert">{error}</p>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <h3 style={{ margin: 0 }}>نظام الجمعية{version ? ` (الإصدار ${version})` : ""}</h3>
      <small>يظهر للأهل في رابط التسجيل، ويوقّعون عليه قبل إرسال الطلب.</small>
      {!saved.trim() && <strong role="alert" style={{ color: "#b91c1c" }}>لم يُنشر نظام بعد: رابط التسجيل لا يستقبل طلبات.</strong>}
      <textarea aria-label="نص نظام الجمعية" rows={8} maxLength={20000} value={text} onChange={(event) => setText(event.target.value)} />
      <div>
        <Button size="sm" variant="secondary" disabled={busy || text === DEFAULT_RULES} onClick={() => setText(DEFAULT_RULES)}>استعادة النص الافتراضي</Button>{" "}
        <Button size="sm" loading={busy} disabled={text === saved} onClick={publish}>نشر</Button>
      </div>
    </div>
  );
}


SOURCE: apps/system/src/Components/Student/RulesEditor.test.js

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
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const mount = () => act(async () => root.render(<RulesEditor />));
const button = (text) => [...host.querySelectorAll("button")].find((node) => node.textContent === text);
beforeEach(() => {
  jest.clearAllMocks(); getRules.mockResolvedValue({ ok: true, rules: null }); ask.mockResolvedValue(true);
  publishRules.mockImplementation(async (text) => ({ ok: true, rules: { version: 2, text } }));
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
test("no published rules opens the supplied default as a draft; nothing is published automatically", async () => {
  await mount();
  expect(host.querySelector("textarea").value).toBe(DEFAULT_RULES);
  expect(button("نشر").disabled).toBe(false);
  expect(host.querySelector('[role="alert"]').textContent).toContain("لم يُنشر");
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
