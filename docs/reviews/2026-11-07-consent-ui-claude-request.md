# Independent actual Claude review: requested UI and parent-signing flow

Codex implements; actual Claude Code reviews without editing or using tools.
Review only this authorized source patch and synthetic tests. Do not inspect
files, request another reviewer, or contact services. No environment files,
credentials, runtime logs or user records are included.

Owner's current request supersedes earlier optional public signatures:
1. Weekly duties use square native checkboxes; checked means completed and duties
   move below open ones. Existing approvals, current week and permission rules stay.
2. Public student intake needs checkbox agreement, signer name and a valid PNG
   signature. The modal uses shared ConsentFields; staff sign/update an existing
   student in that same modal. Previous evidence is archived before a revision-
   guarded update, with deterministic archive IDs for retry safety.
3. Authorized staff can issue a personal seven-day parent link. Its 256-bit
   secret is carried in the browser fragment and POST body; only a SHA256 digest
   is stored. It is bound to one student and the current consent revision,
   expires after success/expiry/student removal or a newer signature, and gives
   no student edit/registration capability. Public response contains only name
   and current rules. Public requests are rate limited and no-store. Partial
   signature saves can repair their marker on retry without replacing evidence.
   The product only offers copying or user-initiated native sharing; no messages
   were sent while implementing or testing. Student deletion removes new history
   and personal-link records as well as existing consent.
4. Unsigned students use normal styling plus pending-signature text.
5. Program timelines become 850px (about 90px/hour), preserving 13:00–22:00 bounds.
6. Back/forward buttons render into a header slot beside the bell, only when
   useful. The existing layout-owned history survives a keyed header remount;
   unsaved-change confirmation and permission filtering remain in force.

Focused checks passed: 47 server consent/model tests and 40 client component
checks, with an additional history-remount regression included in full verify.
Synthetic actual-component browser QA covered checkbox movement and checked
state, desktop/375px header arrows, actual canvas drawing, rules dialog, parent
phone page blocking incomplete submission, scoped link display and hour spacing.
Full npm run verify is in progress. No live database or production deployment.

Please report concrete security, data-consistency, accessibility or regression
findings with file/line and scenario, or explicitly no findings. Independent
review must remain pending if quota prevents reading this request.

```diff
diff --git a/apps/system/src/Components/Header/Header.jsx b/apps/system/src/Components/Header/Header.jsx
index f040dd6..46e4a34 100644
--- a/apps/system/src/Components/Header/Header.jsx
+++ b/apps/system/src/Components/Header/Header.jsx
@@ -224,6 +224,7 @@ export default function Header() {
           <NoticeBell canViewNotices={canViewNotices} />
           {canViewNotices && <NewBadge section="notices" />}
         </span>
+        <span id="header-history" className={styles.historySlot} />
         {isMobile && accountMenu}
       </div>

diff --git a/apps/system/src/Components/Header/Header.module.css b/apps/system/src/Components/Header/Header.module.css
index a661c3e..838c043 100644
--- a/apps/system/src/Components/Header/Header.module.css
+++ b/apps/system/src/Components/Header/Header.module.css
@@ -15,6 +15,7 @@
   align-items: center;
   gap: 0.75rem;
 }
+.historySlot { display: inline-flex; flex: 0 0 auto; align-items: center; }

 /* The association logo in a white circle with the orange ring, as on the sport site. */
 .logo {
diff --git a/apps/system/src/Components/Lesson/ViewAllLesson.module.css b/apps/system/src/Components/Lesson/ViewAllLesson.module.css
index 1004f17..191449f 100644
--- a/apps/system/src/Components/Lesson/ViewAllLesson.module.css
+++ b/apps/system/src/Components/Lesson/ViewAllLesson.module.css
@@ -53,7 +53,7 @@
 .timelineGrid {
   display: grid;
   grid-template-columns: 58px repeat(7, minmax(0, 1fr));  /* عربيالجمعةالجمعةعربيالجمعةعربي ساعات + 5 أيام */
-  grid-template-rows: 42px clamp(360px, calc(100dvh - 300px), 540px);               /* ملاحظة عربية */
+  grid-template-rows: 42px 850px; /* 90px per hour, plus the timeline's 20px end insets. */
   column-gap: 8px;
   row-gap: 20px;
 }
@@ -269,7 +269,7 @@
   --cols: 1;
   display: grid;
   grid-template-columns: 58px repeat(var(--cols), minmax(0, 1fr));
-  grid-template-rows: 42px clamp(360px, calc(100dvh - 300px), 540px);
+  grid-template-rows: 42px 850px;
   column-gap: 8px;
   row-gap: 20px;
 }
diff --git a/apps/system/src/Components/Routes/NavigationHistory.jsx b/apps/system/src/Components/Routes/NavigationHistory.jsx
index 5e679cf..a10755e 100644
--- a/apps/system/src/Components/Routes/NavigationHistory.jsx
+++ b/apps/system/src/Components/Routes/NavigationHistory.jsx
@@ -1,4 +1,5 @@
 import React, { useLayoutEffect, useRef, useState } from "react";
+import { createPortal } from "react-dom";
 import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
 import { initialHistory, parentDestination, recordLocation, restorePageScroll } from "../../utils/navigationHistory";
 import { getStoredPermissions } from "../../utils/session";
@@ -12,10 +13,21 @@ export default function NavigationHistory() {
   const navigate = useNavigate();
   const [history, setHistory] = useState(() => initialHistory(location));
   const [busy, setBusy] = useState(false);
+  const [target, setTarget] = useState(null);
   const currentKey = useRef(location.key);
   const scroll = useRef(new Map());
   const previousKey = useRef(location.key);
   currentKey.current = location.key;
+  // The history stays mounted in the signed-in layout even when the header
+  // remounts after an access change; only its buttons move into the header.
+  useLayoutEffect(() => {
+    const attach = () => setTarget(document.getElementById("header-history"));
+    attach();
+    const container = document.getElementById("header")?.parentElement;
+    const observer = container ? new MutationObserver(attach) : null;
+    if (container) observer.observe(container, { childList: true });
+    return () => observer?.disconnect();
+  }, []);
   useLayoutEffect(() => {
     let stopRestoring;
     setHistory((previous) => recordLocation(previous, location, action));
@@ -45,8 +57,9 @@ export default function NavigationHistory() {
       else if (direction === -1 && !back && parent !== location.pathname) navigate(parent, { replace: true });
     } finally { setBusy(false); }
   };
-  return <nav className={styles.bar} aria-label="التنقل بين الصفحات" dir="rtl">
-    <button type="button" onClick={() => go(-1)} disabled={busy || !canGoBack}><span aria-hidden="true">→</span> رجوع</button>
-    <button type="button" onClick={() => go(1)} disabled={busy || !canGoForward}>تقدّم <span aria-hidden="true">←</span></button>
-  </nav>;
+  if (!target || (!canGoBack && !canGoForward)) return null;
+  return createPortal(<nav className={styles.bar} aria-label="التنقل بين الصفحات" dir="rtl">
+    {canGoBack && <button type="button" aria-label="رجوع" title="رجوع" onClick={() => go(-1)} disabled={busy}><span aria-hidden="true">→</span></button>}
+    {canGoForward && <button type="button" aria-label="تقدّم" title="تقدّم" onClick={() => go(1)} disabled={busy}><span aria-hidden="true">←</span></button>}
+  </nav>, target);
 }
diff --git a/apps/system/src/Components/Routes/NavigationHistory.module.css b/apps/system/src/Components/Routes/NavigationHistory.module.css
index 9caa177..256b383 100644
--- a/apps/system/src/Components/Routes/NavigationHistory.module.css
+++ b/apps/system/src/Components/Routes/NavigationHistory.module.css
@@ -1,4 +1,4 @@
-.bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 12px 16px; }
-.bar button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 6px 14px; font: inherit; color: var(--color-primary-700); background: var(--color-surface); border: 1px solid var(--color-border-strong); border-radius: var(--radius-md); cursor: pointer; }
+.bar { display: inline-flex; gap: 4px; align-items: center; }
+.bar button { display: inline-flex; align-items: center; justify-content: center; width: 40px; min-height: 44px; padding: 0; font: inherit; font-size: 1.35rem; color: var(--color-text-on-primary); background: transparent; border: 1px solid rgba(255,255,255,.35); border-radius: var(--radius-md); cursor: pointer; }
 .bar button:disabled { opacity: .45; cursor: default; }
 .bar button:focus-visible { outline: 2px solid var(--color-accent-500); outline-offset: 2px; }
diff --git a/apps/system/src/Components/Routes/NavigationHistory.test.js b/apps/system/src/Components/Routes/NavigationHistory.test.js
index 8f96848..a71983a 100644
--- a/apps/system/src/Components/Routes/NavigationHistory.test.js
+++ b/apps/system/src/Components/Routes/NavigationHistory.test.js
@@ -1,4 +1,4 @@
-import React, { act } from "react";
+import React, { act, useState } from "react";
 import { createRoot } from "react-dom/client";
 import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
 jest.mock("react-router-dom", () => {
@@ -18,30 +18,54 @@ function Probe() {
 }
 const mount = async (initial = "/students?filter=pending") => {
   host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
-  await act(async () => root.render(<MemoryRouter initialEntries={[initial]}><NavigationHistory /><Probe /></MemoryRouter>));
+  await act(async () => root.render(<MemoryRouter initialEntries={[initial]}><HeaderFixture /><NavigationHistory /><Probe /></MemoryRouter>));
 };
-const back = () => host.querySelector('nav button:first-child');
-const forward = () => host.querySelector('nav button:last-child');
+function HeaderFixture() {
+  const [version, setVersion] = useState(0);
+  return <><header key={version} id="header"><span id="header-history" /></header><button onClick={() => setVersion((value) => value + 1)}>remount header</button></>;
+}
+const back = () => host.querySelector('button[aria-label="رجوع"]');
+const forward = () => host.querySelector('button[aria-label="تقدّم"]');
 const at = () => host.querySelector('[data-testid="at"]').textContent;
 beforeEach(() => { confirmLeave.mockResolvedValue(true); jest.spyOn(window, "scrollTo").mockImplementation(() => {}); });
 afterEach(async () => { await act(async () => root.unmount()); host.remove(); jest.restoreAllMocks(); });
 test("internal back and forward restore the previous query and obey unsaved confirmation", async () => {
   await mount();
-  expect(forward().disabled).toBe(true);
+  expect(forward()).toBeNull();
+  expect(back().closest("header")).not.toBeNull();
   await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent === "record").click());
   confirmLeave.mockResolvedValueOnce(false);
   await act(async () => back().click());
   expect(at()).toBe("/students/one");
   await act(async () => back().click());
   expect(at()).toBe("/students?filter=pending");
-  expect(forward().disabled).toBe(false);
+  expect(forward()).not.toBeNull();
   await act(async () => forward().click());
   expect(at()).toBe("/students/one");
 });
 test("a directly opened edit page returns to its record, with no forward entry or external navigation", async () => {
   await mount("/lessons/one/edit");
-  expect(forward().disabled).toBe(true);
+  expect(forward()).toBeNull();
   await act(async () => back().click());
   expect(at()).toBe("/lessons/one");
-  expect(forward().disabled).toBe(true);
+  expect(forward()).toBeNull();
+});
+
+test("dashboard has no history arrows; a direct child has only a useful back arrow", async () => {
+  await mount("/dashboard");
+  expect(back()).toBeNull(); expect(forward()).toBeNull();
+  expect(host.querySelector('nav[aria-label="التنقل بين الصفحات"]')).toBeNull();
+  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "record").click());
+  expect(back()).not.toBeNull(); expect(forward()).toBeNull();
+});
+
+test("header remounts reattach the arrows without losing internal history", async () => {
+  await mount();
+  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "record").click());
+  const oldHeader = host.querySelector("header");
+  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "remount header").click());
+  expect(oldHeader.isConnected).toBe(false);
+  expect(back().closest("header")).toBe(host.querySelector("header"));
+  await act(async () => back().click());
+  expect(at()).toBe("/students?filter=pending"); expect(forward()).not.toBeNull();
 });
diff --git a/apps/system/src/Components/Routes/Routes.jsx b/apps/system/src/Components/Routes/Routes.jsx
index 12f4ade..25542ae 100644
--- a/apps/system/src/Components/Routes/Routes.jsx
+++ b/apps/system/src/Components/Routes/Routes.jsx
@@ -28,6 +28,7 @@ import LiveEventsProvider from '../../locks/LiveEventsProvider';
 import { lazyPage } from '../../utils/lazyPage';

 const RegisterPage = lazyPage(() => import('../Auth/RegisterPage/RegisterPage'));
+const ParentConsentPage = lazyPage(() => import('../Student/ParentConsentPage'));
 const NoticesBoard = lazyPage(() => import('../Notice/NoticesBoard'));
 const ViewAllStudent = lazyPage(() => import('../Student/ViewAllStudent'));
 const EditStudent = lazyPage(() => import('../Student/EditStudent'));
@@ -97,6 +98,7 @@ export default function CRoutes() {
       <Route path="/" element={<PublicOnly/>} />
       <Route path="/login" element={<PublicOnly/>} />
       <Route path="/register" element={<RegisterPage />} />
+      <Route path="/parent-consent" element={<ParentConsentPage />} />
       <Route path="/privacy" element={<PrivacyPage />} />
       <Route path="/register-student/:token" element={<EditStudent parent={true} />} />
       {/* عربيالجمعةالثلاثاءعربي */}
diff --git a/apps/system/src/Components/Student/ConsentView.jsx b/apps/system/src/Components/Student/ConsentView.jsx
index bbe68ad..74510a5 100644
--- a/apps/system/src/Components/Student/ConsentView.jsx
+++ b/apps/system/src/Components/Student/ConsentView.jsx
@@ -1,93 +1,79 @@
-import React, { useCallback, useEffect, useState } from "react";
-import { getConsent, getRules, signConsent } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
+import React, { useCallback, useEffect, useRef, useState } from "react";
+import { createConsentLink, getConsent, getRules, signConsent } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
 import { toast } from "../../ALERT/SystemToasts.jsx";
 import Button from "../UI/Button.jsx";
-import RequiredMark from "../UI/RequiredMark";
-import SignaturePad from "./SignaturePad.jsx";
+import RegistrationConsent from "./RegistrationConsent";

 const when = (value) => {
   const date = new Date(value);
   return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-GB");
 };

-// A student the association added: the parent signs here, on this device.
-function SignNow({ studentId, onSigned, signerName = "" }) {
-  const [rules, setRules] = useState(undefined);
-  const [form, setForm] = useState({ accepted: false, signerName, signature: "" });
+export default function ConsentView({ studentId }) {
+  const [state, setState] = useState({ loading: true, consent: null, rules: null });
+  const [form, setForm] = useState({ accepted: false, signerName: "", signature: "" });
   const [busy, setBusy] = useState(false);
-
-  useEffect(() => {
-    let alive = true;
-    getRules().then((res) => { if (alive) setRules(res.ok ? res.rules : null); });
-    return () => { alive = false; };
-  }, []);
-
-  if (rules === undefined) return null;
-  if (!rules?.text) return <p role="status">يجب نشر نظام الجمعية أولًا (من «رابط تسجيل الأهل») قبل التوقيع.</p>;
+  const [error, setError] = useState("");
+  const [link, setLink] = useState(null);
+  const [linkBusy, setLinkBusy] = useState(false);
+  const request = useRef(0);
+  const load = useCallback(async () => {
+    const ticket = ++request.current;
+    const [consent, rules] = await Promise.all([getConsent(studentId), getRules()]);
+    if (ticket !== request.current) return;
+    setState({ loading: false, consent: consent.ok ? consent.consent : null, rules: rules.ok ? rules.rules : null, error: !consent.ok ? consent.message : !rules.ok ? rules.message : "" });
+    setForm({ accepted: false, signerName: consent.consent?.signerName || "", signature: "" });
+  }, [studentId]);
+  useEffect(() => { setLink(null); setState({ loading: true }); load(); return () => { request.current += 1; }; }, [load]);

   const submit = async () => {
     if (!form.accepted || !form.signerName.trim() || !form.signature) {
-      toast.warn("يُرجى الموافقة على النظام وكتابة اسم ولي الأمر والتوقيع");
-      return;
+      setError("يجب الموافقة على قوانين الجمعية وكتابة اسم ولي الأمر والتوقيع قبل الإرسال.");
+      return false;
     }
-    setBusy(true);
-    const res = await signConsent(studentId, { rulesVersion: rules.version, rulesAccepted: "true", signerName: form.signerName.trim(), signature: form.signature });
+    setBusy(true); setError("");
+    const res = await signConsent(studentId, { rulesVersion: state.rules.version, rulesAccepted: "true", signerName: form.signerName.trim(), signature: form.signature, ...(state.consent?.revision ? { baseConsentVersion: state.consent.revision } : {}) });
     setBusy(false);
-    if (!res.ok) { toast.error(res.message); return; }
-    toast.success("تم حفظ التوقيع");
-    onSigned();
+    if (!res.ok) {
+      setError(res.message);
+      if (res.code === "RULES_CHANGED" || res.code === "CONSENT_CHANGED") await load();
+      return false;
+    }
+    toast.success("تم حفظ التوقيع"); setLink(null); await load();
+    return true;
   };
-
-  return (
-    <div style={{ display: "grid", gap: 8 }}>
-      <div dir="auto" tabIndex={0} style={{ maxHeight: 200, overflowY: "auto", whiteSpace: "pre-wrap", padding: 8, border: "1px solid #d1d5db", borderRadius: 8 }}>{rules.text}</div>
-      <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
-        <input type="checkbox" style={{ width: "auto" }} checked={form.accepted} onChange={(event) => setForm((prev) => ({ ...prev, accepted: event.target.checked }))} />
-        <span>قرأ ولي الأمر نظام الجمعية ويوافق عليه<RequiredMark /></span>
-      </label>
-      <label htmlFor="consent-signer">اسم ولي الأمر:<RequiredMark /></label>
-      <input id="consent-signer" maxLength={100} value={form.signerName} onChange={(event) => setForm((prev) => ({ ...prev, signerName: event.target.value }))} />
-      <label>توقيع / ختم ولي الأمر:<RequiredMark /></label>
-      <SignaturePad onChange={(signature) => setForm((prev) => ({ ...prev, signature }))} />
-      <div><Button size="sm" loading={busy} onClick={submit}>حفظ التوقيع</Button></div>
-    </div>
-  );
-}
-
-// The signature a parent gave, with the version signed; with none, the place to sign.
-export default function ConsentView({ studentId }) {
-  const [state, setState] = useState({ loading: true, consent: null });
-
-  const load = useCallback(() => {
-    let alive = true;
-    getConsent(studentId).then((res) => {
-      if (alive) setState({ loading: false, consent: res.ok ? res.consent : null, error: res.ok ? "" : res.message });
-    });
-    return () => { alive = false; };
-  }, [studentId]);
-  useEffect(() => load(), [load]);
-
-  if (state.loading) return <div role="status">جارٍ التحميل…</div>;
-  if (state.error) return <div role="alert">{state.error}</div>;
-  if (!state.consent?.signature) {
-    return (
-      <div style={{ display: "grid", gap: 8 }}>
-        <p style={{ margin: 0 }}>{state.consent
-          ? `وافق ولي الأمر ${state.consent.signerName} بتاريخ ${when(state.consent.acceptedAt)}. التوقيع/الختم مطلوب ولم يُستكمل بعد.`
-          : "لا يوجد توقيع لهذا الطالب. التوقيع/الختم مطلوب ويجب استكماله."}</p>
-        <SignNow studentId={studentId} signerName={state.consent?.signerName} onSigned={load} />
-      </div>
-    );
-  }
-  const { signerName, signedAt, rulesVersion, rulesText, signature } = state.consent;
-  return (
-    <div style={{ display: "grid", gap: 8 }}>
-      <p style={{ margin: 0 }}>وقّع <strong dir="auto">{signerName}</strong> بتاريخ {when(signedAt)} على الإصدار {rulesVersion}.</p>
-      <img src={signature} alt="توقيع ولي الأمر" style={{ maxWidth: 320, width: "100%", background: "#fff", border: "1px solid #d1d5db", borderRadius: 8 }} />
-      <details>
-        <summary>النص الذي تم التوقيع عليه</summary>
-        <div dir="auto" style={{ whiteSpace: "pre-wrap" }}>{rulesText}</div>
-      </details>
-    </div>
-  );
+  const makeLink = async () => {
+    setLinkBusy(true);
+    const result = await createConsentLink(studentId);
+    setLinkBusy(false);
+    if (!result.ok) { toast.error(result.message); return; }
+    setLink({ url: `${window.location.origin}/parent-consent#${result.token}`, expiresAt: result.expiresAt });
+  };
+  const copyLink = async () => {
+    try { await navigator.clipboard.writeText(link.url); toast.success("تم نسخ الرابط"); }
+    catch { toast.warn("تعذّر النسخ، انسخ الرابط من الحقل."); }
+  };
+  const shareLink = async () => {
+    try { await navigator.share({ title: "قوانين الجمعية والتوقيع", text: "يُرجى قراءة قوانين الجمعية والموافقة والتوقيع.", url: link.url }); }
+    catch (reason) { if (reason?.name !== "AbortError") toast.warn("تعذّرت المشاركة، يمكنك نسخ الرابط."); }
+  };
+  if (state.loading) return <p role="status">جارٍ التحميل…</p>;
+  if (state.error) return <p role="alert">{state.error}</p>;
+  const consent = state.consent;
+  return <div style={{ display: "grid", gap: 12 }}>
+    {consent?.signature ? <>
+      <p>وقّع <strong dir="auto">{consent.signerName}</strong> بتاريخ {when(consent.signedAt)} على الإصدار {consent.rulesVersion}.</p>
+      <img src={consent.signature} alt="توقيع ولي الأمر" style={{ width: "100%", maxWidth: 320, background: "#fff", border: "1px solid #d1d5db", borderRadius: 8 }} />
+      <details><summary>النص الذي تم التوقيع عليه</summary><div dir="auto" style={{ whiteSpace: "pre-wrap" }}>{consent.rulesText}</div></details>
+    </> : <p>متبقٍ توقيع ولي الأمر{consent?.acceptedAt ? ` — تمت الموافقة بتاريخ ${when(consent.acceptedAt)}، ولم يُستكمل التوقيع بعد.` : ""}</p>}
+    {state.rules?.text ? <>
+      <RegistrationConsent key={`${state.rules.version}:${consent?.revision || "none"}`} rules={state.rules} value={form} onChange={setForm} nameId="consent-signer" onConfirm={submit} busy={busy} error={error} linkLabel={consent?.signature ? "تحديث التوقيع" : "قوانين الجمعية والتوقيع"} confirmLabel="حفظ التوقيع" />
+      <div><Button size="sm" loading={linkBusy} onClick={makeLink}>إنشاء رابط لولي الأمر</Button></div>
+    </> : <p>التوقيع غير متاح حتى تنشر الإدارة قوانين الجمعية.</p>}
+    {link && <section aria-label="رابط توقيع ولي الأمر" style={{ display: "grid", gap: 8 }}>
+      <input readOnly dir="ltr" aria-label="رابط التوقيع" value={link.url} onFocus={(event) => event.target.select()} />
+      <small>الرابط مخصص لقوانين هذا الطالب وتوقيعها فقط، صالح حتى {when(link.expiresAt)} وينتهي بعد الإرسال.</small>
+      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Button size="sm" onClick={copyLink}>نسخ الرابط</Button>{typeof navigator.share === "function" && <Button size="sm" onClick={shareLink}>مشاركة الرابط</Button>}</div>
+    </section>}
+  </div>;
 }
diff --git a/apps/system/src/Components/Student/EditStudent.jsx b/apps/system/src/Components/Student/EditStudent.jsx
index 1278c39..f515f43 100644
--- a/apps/system/src/Components/Student/EditStudent.jsx
+++ b/apps/system/src/Components/Student/EditStudent.jsx
@@ -109,6 +109,7 @@ const EditStudent = ({parent = false}) => {
   });
   const [submitted, setSubmitted] = useState(false);
   const [consent, setConsent] = useState({ accepted: false, signerName: "", signature: "" });
+  const [consentError, setConsentError] = useState("");


   const [instructors, setInstructors] = useState([]);
@@ -303,6 +304,11 @@ const EditStudent = ({parent = false}) => {
   };
   const handleSubmit = async (e) => {
     if (photoPick.busy) { toast.warn(PHOTO_NOT_READY); return; }
+    if (parent && (!inviteStatus.rules || !consent.accepted || !consent.signerName.trim() || !consent.signature)) {
+      const message = "يجب الموافقة على قوانين الجمعية وكتابة اسم ولي الأمر والتوقيع قبل إرسال الطلب.";
+      setConsentError(message); toast.warn(message); return;
+    }
+    setConsentError("");
     let b = await validate();
     if (b) { toast.warn(b); return; }
     b = true
@@ -325,9 +331,6 @@ const EditStudent = ({parent = false}) => {
     }
     if(!b) return toast.warn("يُرجى تعبئة الحقول المطلوبة");
     const rules = parent ? inviteStatus.rules : null;
-    if (parent && (!rules || !consent.accepted || !consent.signerName.trim())) {
-      return toast.warn("يُرجى قراءة قوانين الجمعية والموافقة عليها وكتابة اسم ولي الأمر");
-    }
     e.preventDefault();
     try {
       setSaving(true);
@@ -612,9 +615,10 @@ const EditStudent = ({parent = false}) => {
       {parent && inviteStatus.rules && (
         <RegistrationConsent key={inviteStatus.rules.version} rules={inviteStatus.rules} value={consent} onChange={setConsent} />
       )}
+      {parent && consentError && <p role="alert" className={styles.formError}>{consentError}</p>}

       <div className={styles.buttonRow} style={{ gap: 8, flexWrap: "wrap" }}>
-        <button type="submit" data-tour="student-save" onClick={handleSubmit} disabled={readonly || saving || (parent && (!consent.accepted || !consent.signerName.trim()))} style={{width:"100%"}}>
+        <button type="submit" data-tour="student-save" onClick={handleSubmit} disabled={readonly || saving} style={{width:"100%"}}>
           {saving ? "جارٍ الحفظ…" : parent ? "إرسال الطلب" : (isEdit ? "حفظ التعديلات" : "إضافة الطالب")}
         </button>

diff --git a/apps/system/src/Components/Student/MobileStudentList.jsx b/apps/system/src/Components/Student/MobileStudentList.jsx
index 134ac71..e438b47 100644
--- a/apps/system/src/Components/Student/MobileStudentList.jsx
+++ b/apps/system/src/Components/Student/MobileStudentList.jsx
@@ -3,7 +3,6 @@ import StatusBadge from "../UI/StatusBadge.jsx";
 import PersonCard, { PersonCardList } from "../UI/PersonCard.jsx";
 import { passportSrc } from "../../utils/passportPhoto";
 import { healthNote, personInitial, studentSummary } from "../../utils/personCard";
-import { UNSIGNED_COLOR } from "./studentConsent";

 // Phone layout for the students list: one compact card per student. Tapping the
 // card opens the student's page, where print, edit and delete are, and
@@ -26,10 +25,9 @@ export default function MobileStudentList({
             name={`${student.firstname || ""} ${student.lastname || ""}`.trim()}
             summary={studentSummary(student)}
             note={healthNote(student)}
-            badge={status !== "active" && <StatusBadge tone={toneOf(student)}>{student.status}</StatusBadge>}
+            badge={<>{status !== "active" && <StatusBadge tone={toneOf(student)}>{student.status}</StatusBadge>}{!student.consentAt && <StatusBadge tone="neutral">متبقٍ توقيع ولي الأمر</StatusBadge>}</>}
             onOpen={() => onOpen(student)}
             tour={status === "active" ? "students-open" : undefined}
-            background={student.consentAt ? undefined : UNSIGNED_COLOR}
           />
         );
       })}
diff --git a/apps/system/src/Components/Student/RegistrationConsent.jsx b/apps/system/src/Components/Student/RegistrationConsent.jsx
index 5892e71..3e2062f 100644
--- a/apps/system/src/Components/Student/RegistrationConsent.jsx
+++ b/apps/system/src/Components/Student/RegistrationConsent.jsx
@@ -1,14 +1,12 @@
 import React, { useEffect, useRef, useState } from "react";
-import SignaturePad from "./SignaturePad";
+import ConsentFields from "./ConsentFields";
 import styles from "./RegistrationConsent.module.css";

-// Agreement is required now; the stamp stays visibly pending until completed.
-export default function RegistrationConsent({ rules, value, onChange }) {
+// Parents must agree and sign before sending; closing only keeps a local draft.
+export default function RegistrationConsent({ rules, value, onChange, onConfirm, busy = false, error = "", nameId, linkLabel = "قوانين الجمعية", confirmLabel = "حفظ والعودة إلى الطلب" }) {
   const [open, setOpen] = useState(false);
-  const [drawing, setDrawing] = useState(true);
   const dialog = useRef(null);
   const link = useRef(null);
-  const change = (patch) => onChange((previous) => ({ ...previous, ...patch }));
   useEffect(() => {
     if (!open) return undefined;
     const previousOverflow = document.body.style.overflow;
@@ -19,7 +17,7 @@ export default function RegistrationConsent({ rules, value, onChange }) {
   const onKeyDown = (event) => {
     if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
     if (event.key !== "Tab") return;
-    const controls = Array.from(dialog.current.querySelectorAll("button:not(:disabled), input, [tabindex='0']"));
+    const controls = Array.from(dialog.current.querySelectorAll("button:not(:disabled), input:not(:disabled), [tabindex='0']"));
     const first = controls[0];
     const last = controls[controls.length - 1];
     if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
@@ -27,9 +25,9 @@ export default function RegistrationConsent({ rules, value, onChange }) {
   };
   return (
     <section className={styles.section} aria-label="الموافقة على قوانين الجمعية">
-      <button type="button" ref={link} className={styles.link} onClick={() => { setDrawing(!value.signature); setOpen(true); }}>قوانين الجمعية</button>
+      <button type="button" ref={link} className={styles.link} onClick={() => setOpen(true)}>{linkLabel}</button>
       <p role="status">{value.accepted
-        ? value.signature ? "تمت الموافقة وإضافة التوقيع/الختم." : "تمت الموافقة. التوقيع/الختم مطلوب ويجب استكماله لاحقًا."
+        ? value.signature ? "تمت الموافقة وإضافة التوقيع/الختم." : "التوقيع/الختم مطلوب قبل الإرسال."
         : "يجب قراءة القوانين والموافقة عليها قبل إرسال الطلب."}</p>
       {open && (
         <div className={styles.overlay} onClick={() => setOpen(false)}>
@@ -38,22 +36,9 @@ export default function RegistrationConsent({ rules, value, onChange }) {
               <h2 id="registration-rules-title">قوانين الجمعية</h2>
               <button type="button" aria-label="إغلاق قوانين الجمعية" onClick={() => setOpen(false)}>×</button>
             </div>
-            <div className={styles.rules} dir="auto" tabIndex={0}>{rules.text}</div>
-            <label htmlFor="signer-name">اسم ولي الأمر (مطلوب)</label>
-            <input id="signer-name" name="signerName" maxLength={100} value={value.signerName} onChange={(event) => change({ signerName: event.target.value })} />
-            <div className={styles.actions}>
-              <button type="button" aria-pressed={value.accepted} onClick={() => change({ accepted: true })}>أوافق على القوانين</button>
-              <button type="button" aria-pressed={!value.accepted} onClick={() => change({ accepted: false })}>لا أوافق</button>
-            </div>
-            <label>توقيع / ختم ولي الأمر</label>
-            <small>ارسم التوقيع أو الختم في اللوحة. يمكن إرسال الطلب بعد الموافقة والاسم، واستكمال التوقيع/الختم لاحقًا لدى الجمعية.</small>
-            {!drawing && value.signature ? (
-              <div>
-                <img className={styles.signature} src={value.signature} alt="توقيع/ختم ولي الأمر" />
-                <button type="button" onClick={() => { change({ signature: "" }); setDrawing(true); }}>إعادة التوقيع/الختم</button>
-              </div>
-            ) : <SignaturePad onChange={(signature) => change({ signature })} />}
-            <button type="button" onClick={() => setOpen(false)}>حفظ والعودة إلى الطلب</button>
+            <ConsentFields rules={rules} value={value} onChange={onChange} disabled={busy} nameId={nameId} />
+            {error && <p role="alert">{error}</p>}
+            <button type="button" disabled={busy} onClick={async () => { if (!onConfirm || await onConfirm()) setOpen(false); }}>{busy ? "جارٍ الحفظ…" : confirmLabel}</button>
           </div>
         </div>
       )}
diff --git a/apps/system/src/Components/Student/RegistrationConsent.module.css b/apps/system/src/Components/Student/RegistrationConsent.module.css
index adda139..ed0d9c2 100644
--- a/apps/system/src/Components/Student/RegistrationConsent.module.css
+++ b/apps/system/src/Components/Student/RegistrationConsent.module.css
@@ -6,7 +6,11 @@
 .heading h2 { margin: 0; }
 .heading button { width: auto; }
 .rules { white-space: pre-wrap; border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; }
-.actions { display: flex; flex-wrap: wrap; gap: 8px; }
-.actions button { flex: 1; min-width: 130px; }
-.actions button[aria-pressed='true'] { outline: 3px solid #419567; outline-offset: 2px; }
+.fields { display: grid; gap: 8px; min-width: 0; margin: 0; padding: 0; border: 0; }
+.fields input:not([type='checkbox']) { box-sizing: border-box; width: 100%; padding: 8px 10px; min-height: 42px; font: inherit; border: 1px solid #9ca3af; border-radius: 8px; }
+.agreement { display: flex; align-items: center; gap: 10px; min-height: 44px; font-weight: 600; }
+.agreement input { width: 22px !important; height: 22px; margin: 0; flex: 0 0 auto; accent-color: var(--color-success-700, #247343); }
+.fields[disabled] canvas { pointer-events: none; }
+.page { max-width: 640px; margin: 24px auto; padding: 20px; display: grid; gap: 14px; background: var(--color-surface, #fff); border: 1px solid var(--color-border, #d1d5db); border-radius: 14px; }
+.page h1 { margin: 0; font-size: 1.4rem; }
 .signature { max-width: 100%; width: 400px; border: 1px solid #d1d5db; }
diff --git a/apps/system/src/Components/Student/RegistrationConsent.test.js b/apps/system/src/Components/Student/RegistrationConsent.test.js
index 30af40f..228d389 100644
--- a/apps/system/src/Components/Student/RegistrationConsent.test.js
+++ b/apps/system/src/Components/Student/RegistrationConsent.test.js
@@ -4,10 +4,11 @@ import { Simulate } from "react-dom/test-utils";
 import EditStudent from "./EditStudent";
 import RegistrationConsent from "./RegistrationConsent";
 import ConsentView from "./ConsentView";
-import { validate, submit, getConsent, getRules, signConsent } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
+import ParentConsentPage from "./ParentConsentPage";
+import { validate, submit, getConsent, getRules, signConsent, createConsentLink, validateConsentLink, submitConsentLink } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";

 jest.mock("react-router-dom", () => ({ useParams: () => ({ token: "registration-token" }), useNavigate: () => jest.fn() }), { virtual: true });
-jest.mock("../../WebServer/services/inviteToken/functionInviteToken.jsx", () => ({ validate: jest.fn(), submit: jest.fn(), getConsent: jest.fn(), getRules: jest.fn(), signConsent: jest.fn() }));
+jest.mock("../../WebServer/services/inviteToken/functionInviteToken.jsx", () => ({ validate: jest.fn(), submit: jest.fn(), getConsent: jest.fn(), getRules: jest.fn(), signConsent: jest.fn(), createConsentLink: jest.fn(), validateConsentLink: jest.fn(), submitConsentLink: jest.fn() }));
 jest.mock("../../WebServer/services/student/functionsStudent.jsx", () => ({ getOne: jest.fn(), create: jest.fn(), update: jest.fn() }));
 jest.mock("../../WebServer/services/user/functionsUser.jsx", () => ({ getAll: jest.fn() }));
 jest.mock("../../ALERT/SystemToasts", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
@@ -23,83 +24,118 @@ const rules = { version: 0, text: "قوانين الاختبار" };
 const button = (text) => [...host.querySelectorAll("button")].find((node) => node.textContent === text);
 const mount = (element) => act(async () => root.render(element));
 const click = (text) => act(async () => button(text).click());
+const agree = () => act(async () => host.querySelector('input[type="checkbox"]').click());
 const change = (selector, value) => act(async () => {
   const node = host.querySelector(selector);
   Simulate.change(node, { target: { name: node.name, value } });
 });
+const fillStudent = async () => {
+  for (const [name, value] of Object.entries({ tz: "123456782", firstname: "Child", lastname: "Family", birth_date: "2015-03-01", gender: "ذكر", street: "Street" })) await change(`[name="${name}"]`, value);
+};
 beforeEach(() => {
-  jest.clearAllMocks();
+  jest.clearAllMocks(); window.location.hash = "personal-secret";
   host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
   validate.mockResolvedValue({ valid: true, open: true, rules });
   submit.mockResolvedValue({ ok: true });
   getRules.mockResolvedValue({ ok: true, rules });
+  getConsent.mockResolvedValue({ ok: true, consent: null });
+  createConsentLink.mockResolvedValue({ ok: true, token: "personal-secret", expiresAt: "2026-11-13" });
+  validateConsentLink.mockResolvedValue({ ok: true, rules, studentName: "Child Family" });
+  submitConsentLink.mockResolvedValue({ ok: true });
 });
 afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

-test("registration places its laws link after the photo; agreement/name enable submission without a stamp", async () => {
+test("registration places laws after the photo and refuses submission without agreement and a stamp", async () => {
   await mount(<EditStudent parent />);
   const photo = [...host.querySelectorAll("label")].find((node) => node.textContent === "صورة الطالب:");
   expect(photo.compareDocumentPosition(button("قوانين الجمعية")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
-  expect(button("إرسال الطلب").disabled).toBe(true);
-  await click("قوانين الجمعية");
-  expect(host.querySelector('[role="dialog"]').textContent).toContain(rules.text);
-  await change('[name="signerName"]', "Parent");
-  await click("أوافق على القوانين");
-  await click("حفظ والعودة إلى الطلب");
-  expect(button("إرسال الطلب").disabled).toBe(false);
-  expect(host.textContent).toContain("التوقيع/الختم مطلوب");
-  for (const [name, value] of Object.entries({ tz: "123456782", firstname: "Child", lastname: "Family", birth_date: "2015-03-01", gender: "ذكر", street: "Street" })) await change(`[name="${name}"]`, value);
   await click("إرسال الطلب");
-  expect(submit).toHaveBeenCalledWith("registration-token", expect.objectContaining({ rulesVersion: 0, rulesAccepted: "true", signerName: "Parent", signature: "" }), null);
+  expect(submit).not.toHaveBeenCalled();
+  expect(host.querySelector('[role="alert"]').textContent).toContain("يجب الموافقة");
+  await click("قوانين الجمعية"); await change('[name="signerName"]', "Parent"); await agree();
+  expect(host.querySelector('input[type="checkbox"]').checked).toBe(true);
+  await click("حفظ والعودة إلى الطلب"); await click("إرسال الطلب");
+  expect(submit).not.toHaveBeenCalled();
+  await click("قوانين الجمعية"); await click("ارسم الختم"); await click("حفظ والعودة إلى الطلب");
+  await fillStudent(); await click("إرسال الطلب");
+  expect(submit).toHaveBeenCalledWith("registration-token", expect.objectContaining({ rulesVersion: 0, rulesAccepted: "true", signerName: "Parent", signature: "drawn-png" }), null);
 });

-test("a changed rules version clears consent and prevents sending until the new version is accepted", async () => {
+test("changed rules clear agreement and signature and require fresh acceptance before sending", async () => {
   submit.mockResolvedValue({ ok: false, code: "RULES_CHANGED", message: "Changed" });
   await mount(<EditStudent parent />);
-  await click("قوانين الجمعية"); await change('[name="signerName"]', "Parent"); await click("أوافق على القوانين"); await click("ارسم الختم"); await click("حفظ والعودة إلى الطلب");
-  for (const [name, value] of Object.entries({ tz: "123456782", firstname: "Child", lastname: "Family", birth_date: "2015-03-01", gender: "ذكر", street: "Street" })) await change(`[name="${name}"]`, value);
-  validate.mockResolvedValue({ valid: true, open: true, rules: { version: 1, text: "New rules" } });
-  await click("إرسال الطلب");
-  expect(button("إرسال الطلب").disabled).toBe(true);
+  await click("قوانين الجمعية"); await change('[name="signerName"]', "Parent"); await agree(); await click("ارسم الختم"); await click("حفظ والعودة إلى الطلب");
+  await fillStudent(); validate.mockResolvedValue({ valid: true, open: true, rules: { version: 1, text: "New rules" } });
+  await click("إرسال الطلب"); await click("إرسال الطلب");
+  expect(submit).toHaveBeenCalledTimes(1);
   await click("قوانين الجمعية");
   expect(host.querySelector('[role="dialog"]').textContent).toContain("New rules");
-  expect(button("أوافق على القوانين").getAttribute("aria-pressed")).toBe("false");
+  expect(host.querySelector('input[type="checkbox"]').checked).toBe(false);
+  expect(host.querySelector('img[alt="توقيع/ختم ولي الأمر"]')).toBeNull();
 });

-test("dialog preserves drawn evidence when reopened, disagreement clears acceptance, and keyboard focus stays inside", async () => {
+test("the compact dialog preserves drawn evidence, unchecking withdraws agreement and focus stays inside", async () => {
   function Harness() {
     const [value, setValue] = useState({ accepted: false, signerName: "Parent", signature: "" });
     return <RegistrationConsent rules={rules} value={value} onChange={setValue} />;
   }
-  await mount(<Harness />);
-  await click("قوانين الجمعية"); await click("أوافق على القوانين"); await click("ارسم الختم");
-  expect(button("ارسم الختم")).toBeDefined(); // A stroke does not destroy the canvas.
+  await mount(<Harness />); await click("قوانين الجمعية"); await agree(); await click("ارسم الختم");
+  expect(button("ارسم الختم")).toBeDefined();
+  expect(button("أوافق على القوانين")).toBeUndefined(); expect(button("لا أوافق")).toBeUndefined();
   await click("حفظ والعودة إلى الطلب"); await click("قوانين الجمعية");
   expect(host.querySelector('img[alt="توقيع/ختم ولي الأمر"]').getAttribute("src")).toBe("drawn-png");
-  await click("لا أوافق");
-  const dialog = host.querySelector('[role="dialog"]');
-  const first = dialog.querySelector("button");
-  const last = button("حفظ والعودة إلى الطلب");
-  last.focus();
+  await agree();
+  const dialog = host.querySelector('[role="dialog"]'); const first = dialog.querySelector("button");
+  button("حفظ والعودة إلى الطلب").focus();
   await act(async () => Simulate.keyDown(dialog, { key: "Tab", preventDefault: jest.fn() }));
   expect(document.activeElement).toBe(first);
   await act(async () => Simulate.keyDown(dialog, { key: "Escape", preventDefault: jest.fn() }));
-  expect(host.querySelector('[role="dialog"]')).toBeNull();
-  expect(document.activeElement).toBe(button("قوانين الجمعية"));
-  expect(host.textContent).toContain("يجب قراءة القوانين والموافقة");
-  expect(document.body.style.overflow).toBe("");
+  expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(button("قوانين الجمعية"));
+  expect(host.textContent).toContain("يجب قراءة القوانين والموافقة"); expect(document.body.style.overflow).toBe("");
 });

-test("pending consent is shown as incomplete and can be completed on the student's page", async () => {
-  getConsent.mockResolvedValueOnce({ ok: true, consent: { signerName: "Parent", acceptedAt: "2026-11-06", signature: null } })
-    .mockResolvedValueOnce({ ok: true, consent: { signerName: "Parent", signedAt: "2026-11-06", signature: "drawn-png", rulesText: rules.text, rulesVersion: 0 } });
+test("a legacy pending signature is completed using the same rules dialog", async () => {
+  getConsent.mockResolvedValueOnce({ ok: true, consent: { signerName: "Parent", acceptedAt: "2026-11-06", signature: null, revision: "pending" } })
+    .mockResolvedValueOnce({ ok: true, consent: { signerName: "Parent", signedAt: "2026-11-06", signature: "drawn-png", rulesText: rules.text, rulesVersion: 0, revision: "signed" } });
   signConsent.mockResolvedValue({ ok: true });
   await mount(<ConsentView studentId="student" />);
-  expect(host.textContent).toContain("لم يُستكمل بعد");
-  expect(host.querySelector("img")).toBeNull();
-  expect(host.querySelector("#consent-signer").value).toBe("Parent");
-  await act(async () => Simulate.change(host.querySelector('input[type="checkbox"]'), { target: { checked: true } }));
-  await click("ارسم الختم"); await click("حفظ التوقيع");
-  expect(signConsent).toHaveBeenCalledWith("student", expect.objectContaining({ rulesAccepted: "true", signature: "drawn-png" }));
+  expect(host.textContent).toContain("متبقٍ توقيع ولي الأمر"); expect(host.querySelector("canvas")).toBeNull();
+  await click("قوانين الجمعية والتوقيع"); expect(host.querySelector("#consent-signer").value).toBe("Parent");
+  await agree(); await click("ارسم الختم"); await click("حفظ التوقيع");
+  expect(signConsent).toHaveBeenCalledWith("student", expect.objectContaining({ rulesAccepted: "true", signature: "drawn-png", baseConsentVersion: "pending" }));
   expect(host.querySelector('img[alt="توقيع ولي الأمر"]')).not.toBeNull();
 });
+
+test("an existing signature can be updated only with new consent and its displayed revision", async () => {
+  getConsent.mockResolvedValue({ ok: true, consent: { signerName: "Parent", signature: "old-png", signedAt: "2026-11-06", revision: "old", rulesVersion: 0, rulesText: rules.text } });
+  signConsent.mockResolvedValue({ ok: true });
+  await mount(<ConsentView studentId="student" />); await click("تحديث التوقيع");
+  await click("حفظ التوقيع"); expect(signConsent).not.toHaveBeenCalled();
+  await agree(); await click("ارسم الختم"); await click("حفظ التوقيع");
+  expect(signConsent).toHaveBeenCalledWith("student", expect.objectContaining({ baseConsentVersion: "old", signature: "drawn-png" }));
+});
+
+test("staff generate a child-specific parent link without sending a registration or changing the signature", async () => {
+  await mount(<ConsentView studentId="student" />); await click("إنشاء رابط لولي الأمر");
+  expect(createConsentLink).toHaveBeenCalledWith("student");
+  expect(host.querySelector('[aria-label="رابط التوقيع"]').value).toBe(`${window.location.origin}/parent-consent#personal-secret`);
+  expect(signConsent).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
+});
+
+test("the parent link shows only the child name and signing surface, and requires both consent and signature", async () => {
+  await mount(<ParentConsentPage />);
+  expect(validateConsentLink).toHaveBeenCalledWith("personal-secret");
+  expect(host.textContent).toContain("Child Family"); expect(host.querySelector('[name="tz"]')).toBeNull();
+  await click("إرسال الموافقة والتوقيع"); expect(submitConsentLink).not.toHaveBeenCalled();
+  await change('[name="signerName"]', "Parent"); await click("ارسم الختم");
+  await click("إرسال الموافقة والتوقيع"); expect(submitConsentLink).not.toHaveBeenCalled();
+  await agree(); await click("إرسال الموافقة والتوقيع");
+  expect(submitConsentLink).toHaveBeenCalledWith("personal-secret", { rulesVersion: 0, rulesAccepted: "true", signerName: "Parent", signature: "drawn-png" });
+  expect(host.textContent).toContain("تم حفظ موافقتكم وتوقيعكم"); expect(host.querySelector('input[type="checkbox"]')).toBeNull();
+});
+
+test("a closed parent link exposes no signing controls", async () => {
+  validateConsentLink.mockResolvedValue({ ok: false, code: "LINK_CLOSED", message: "Closed link" });
+  await mount(<ParentConsentPage />);
+  expect(host.querySelector('[role="alert"]').textContent).toBe("Closed link"); expect(host.querySelector("input")).toBeNull();
+});
diff --git a/apps/system/src/Components/Student/RulesEditor.jsx b/apps/system/src/Components/Student/RulesEditor.jsx
index 7e85750..019c38a 100644
--- a/apps/system/src/Components/Student/RulesEditor.jsx
+++ b/apps/system/src/Components/Student/RulesEditor.jsx
@@ -59,7 +59,7 @@ export default function RulesEditor() {
   return (
     <div style={{ display: "grid", gap: 8 }}>
       <h3 style={{ margin: 0 }}>نظام الجمعية{version ? ` (الإصدار ${version})` : ""}</h3>
-      <small>يظهر للأهل في رابط «قوانين الجمعية». الموافقة مطلوبة لإرسال الطلب، والتوقيع/الختم مطلوب ويمكن استكماله لاحقًا. النص الافتراضي متاح ما لم تنشر الإدارة نصًا آخر.</small>
+      <small>يظهر للأهل في رابط «قوانين الجمعية». الموافقة والتوقيع/الختم مطلوبان لإرسال الطلب. يمكن استكمال توقيع طالب أضافته الجمعية من ملفه أو برابط شخصي لولي الأمر. النص الافتراضي متاح ما لم تنشر الإدارة نصًا آخر.</small>
       {!saved.trim() && version > 0 && <strong role="alert" style={{ color: "#b91c1c" }}>النص المنشور فارغ: رابط التسجيل لا يستقبل طلبات.</strong>}
       <textarea aria-label="نص نظام الجمعية" rows={8} maxLength={20000} value={text} onChange={(event) => setText(event.target.value)} />
       <div>
diff --git a/apps/system/src/Components/Student/Student.module.css b/apps/system/src/Components/Student/Student.module.css
index 1a5e459..1466037 100644
--- a/apps/system/src/Components/Student/Student.module.css
+++ b/apps/system/src/Components/Student/Student.module.css
@@ -261,5 +261,4 @@
   background: var(--color-primary-50, rgba(30, 101, 128, 0.06));
 }

-/* A student with no parent signature (studentConsent.js). The cells paint their own white. */
-.unsignedRow td { background: #fde2ec !important; }
+.signaturePending { display: block; margin-top: 4px; color: var(--color-text-secondary); font-size: .8rem; }
diff --git a/apps/system/src/Components/Student/StudentView.jsx b/apps/system/src/Components/Student/StudentView.jsx
index 2293402..cc78774 100644
--- a/apps/system/src/Components/Student/StudentView.jsx
+++ b/apps/system/src/Components/Student/StudentView.jsx
@@ -147,6 +147,7 @@ export default function StudentView() {
   // attendance.view holder, the rate over the rows sent.
   const rate = Array.isArray(s.attendance) ? attendanceTotals(s.attendance).rate : undefined;
   const facts = [
+    !s.consentAt && ["التوقيع", "متبقٍ توقيع ولي الأمر"],
     status !== ACTIVE_STATUS && [t("record.status"), status],
     [t("record.guide"), s.guide?.name || "—"],
     [t("record.lessons"), String(mine.length)],
diff --git a/apps/system/src/Components/Student/ViewAllStudent.jsx b/apps/system/src/Components/Student/ViewAllStudent.jsx
index 4a4b3f3..744e22e 100644
--- a/apps/system/src/Components/Student/ViewAllStudent.jsx
+++ b/apps/system/src/Components/Student/ViewAllStudent.jsx
@@ -7,7 +7,6 @@ import Fabtn from "../Global/Fabtn/Fabtn";
 import { canStored } from "../../utils/session.js";
 import StudentStatusFilter from "./StudentStatusFilter.jsx";
 import FilterDialog from "../UI/FilterDialog.jsx";
-import { UNSIGNED_COLOR } from "./studentConsent";
 import Button from "../UI/Button.jsx";
 import StatusBadge from "../UI/StatusBadge.jsx";
 import { ParentLinkDialog } from "./ParentLinkPanel.jsx";
@@ -223,8 +222,8 @@ const ViewAllStudent = () => {
               <span>بدون توقيع ولي الأمر فقط</span>
             </label>
           </FilterDialog>
-          <small style={{ background: UNSIGNED_COLOR, color: "#7a1f42", padding: "2px 8px", borderRadius: 6 }}>
-            الوردي: بدون توقيع ولي الأمر على نظام الجمعية ({unsignedCount})
+          <small style={{ color: "var(--color-text-secondary)" }}>
+            متبقٍ توقيع ولي الأمر ({unsignedCount})
           </small>
         </div>
       </div>
@@ -260,7 +259,7 @@ const ViewAllStudent = () => {
               sortedFilteredStudents.map((student) => (
                 <tr
                   key={student._id || student.tz}
-                  className={`${styles.openRow} ${student.consentAt ? "" : styles.unsignedRow}`}
+                  className={styles.openRow}
                   onClick={(e) => openStudent(e, student)}
                 >
                   <td data-label="رقم الهوية">{student.tz}</td>
@@ -271,6 +270,7 @@ const ViewAllStudent = () => {
                         {`${student.firstname || ""} ${student.lastname || ""}`.trim()}
                       </Link>
                     </span>
+                    {!student.consentAt && <small className={styles.signaturePending}>متبقٍ توقيع ولي الأمر</small>}
                   </td>
                   <td data-label="اسم الأب">{student.father_name || "-"}</td>
                   <td data-label="العمر">{getAge(student.birth_date)}</td>
diff --git a/apps/system/src/Components/Student/studentConsent.js b/apps/system/src/Components/Student/studentConsent.js
deleted file mode 100644
index 82d9813..0000000
--- a/apps/system/src/Components/Student/studentConsent.js
+++ /dev/null
@@ -1,2 +0,0 @@
-// A student whose parent has not signed the association's rules shows in this color.
-export const UNSIGNED_COLOR = "#fde2ec";
diff --git a/apps/system/src/Components/WeeklyTasks/WeeklyTasks.module.css b/apps/system/src/Components/WeeklyTasks/WeeklyTasks.module.css
index df1d903..19a7b28 100644
--- a/apps/system/src/Components/WeeklyTasks/WeeklyTasks.module.css
+++ b/apps/system/src/Components/WeeklyTasks/WeeklyTasks.module.css
@@ -19,6 +19,9 @@
 .groupHead:not(:disabled) { cursor: pointer; }
 .check { display: inline-grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; background: none; color: var(--color-text-secondary); cursor: pointer; }
 .checkOn { color: var(--color-success-700); }
+.check input { width: 24px; height: 24px; margin: 0; accent-color: var(--color-success-700); cursor: pointer; }
+.check input:disabled { cursor: default; }
+.check input:focus-visible { outline: 2px solid var(--color-accent-500); outline-offset: 3px; }
 .form { flex: 1 1 100%; display: grid; gap: 6px; }
 .form input { width: 100%; box-sizing: border-box; min-height: 44px; padding: 0 12px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-md); font: inherit; }
 .form label { font-weight: 600; font-size: var(--fs-sm); }
diff --git a/apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.jsx b/apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.jsx
index 5c63874..b125146 100644
--- a/apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.jsx
+++ b/apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.jsx
@@ -6,17 +6,10 @@ import { canStored } from "../../utils/session";
 import Button from "../UI/Button.jsx";
 import styles from "./WeeklyTasks.module.css";

-const CheckIcon = ({ on }) => (
-  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
-    {on ? (
-      <>
-        <circle cx="12" cy="12" r="11" fill="currentColor" />
-        <path d="M7 12.500l3.200 3.200L17 9" fill="none" stroke="#fff" strokeWidth="2.400" strokeLinecap="round" strokeLinejoin="round" />
-      </>
-    ) : (
-      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.400" />
-    )}
-  </svg>
+const TaskCheck = ({ checked, disabled, label, onChange }) => (
+  <label className={styles.check}>
+    <input type="checkbox" checked={checked} disabled={disabled} aria-label={label} onChange={(event) => onChange(event.target.checked)} />
+  </label>
 );

 const weekLabel = (week) => {
@@ -37,7 +30,7 @@ function MyTasks({ tasks, onToggle, busy }) {
         {open.map((task) => (
           <li key={`${task.groupId}:${task.taskId}`} className={styles.item}>
             <span className={styles.text}><strong dir="auto">{task.title}</strong><small dir="auto">{task.groupName}</small>{task.details && <small dir="auto">{task.details}</small>}</span>
-            <Button size="sm" loading={busy === `${task.groupId}:${task.taskId}`} onClick={() => onToggle(task, true)}>تم</Button>
+            <TaskCheck checked={false} disabled={busy === `${task.groupId}:${task.taskId}`} label={`إنجاز ${task.title} — ${task.groupName}`} onChange={(checked) => onToggle(task, checked)} />
           </li>
         ))}
       </ul>
@@ -48,7 +41,7 @@ function MyTasks({ tasks, onToggle, busy }) {
             {done.map((task) => (
               <li key={`${task.groupId}:${task.taskId}`} className={`${styles.item} ${styles.done}`}>
                 <span className={styles.text}><strong dir="auto">{task.title}</strong><small dir="auto">{task.groupName}</small>{task.approved && <small>أكّدتها الإدارة</small>}</span>
-                {!task.approved && <Button size="sm" variant="secondary" loading={busy === `${task.groupId}:${task.taskId}`} onClick={() => onToggle(task, false)}>إلغاء</Button>}
+                <TaskCheck checked disabled={task.approved || busy === `${task.groupId}:${task.taskId}`} label={`إنجاز ${task.title} — ${task.groupName}`} onChange={(checked) => onToggle(task, checked)} />
               </li>
             ))}
           </ul>
@@ -86,19 +79,16 @@ function Register({ board, onToggle, busy }) {
                 const key = `${task.id}:${group.id}`;
                 return (
                   <li key={key} className={`${styles.item} ${task.done ? styles.done : ""}`}>
-                    <button
-                      type="button"
-                      className={`${styles.check} ${task.approved ? styles.checkOn : ""}`}
-                      aria-pressed={task.approved}
-                      aria-label={`${task.approved ? "إلغاء تأكيد" : "تأكيد"} ${task.title}`}
+                    <TaskCheck
+                      checked={task.done}
+                      label={`${task.done ? "إلغاء إنجاز" : "تأكيد إنجاز"} ${task.title} — ${group.name}`}
                       disabled={busy === key}
-                      onClick={() => onToggle(task, group, !task.approved)}
-                    >
-                      <CheckIcon on={task.approved} />
-                    </button>
+                      onChange={(checked) => onToggle(task, group, checked)}
+                    />
                     <span className={styles.text}>
                       <span dir="auto">{task.title}</span>
-                      {task.done && !task.approved && <small>أنجزها المرشد</small>}
+                      {task.done && !task.approved && <small>أنجزها المسؤول</small>}
+                      {task.approved && <small>أكّدتها الإدارة</small>}
                     </span>
                   </li>
                 );
diff --git a/apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.test.js b/apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.test.js
index db8f29b..a05301e 100644
--- a/apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.test.js
+++ b/apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.test.js
@@ -53,17 +53,18 @@ test("a guide sees his task, marks it done, and it moves down to the done part",
   expect(getTaskBoard).not.toHaveBeenCalled();
   expect(button("تعديل المهمات والمجموعات")).toBeUndefined();
   expect(host.textContent).not.toContain("تم إنجازها");
-  await act(async () => button("تم").click());
+  await act(async () => host.querySelector('input[type="checkbox"]:not(:checked)').click());
   expect(setMyTaskDone).toHaveBeenCalledWith("t1", "g1", true, WEEK);
   expect(host.textContent).toContain("تم إنجازها");
-  expect(button("إلغاء")).toBeTruthy();
+  expect(host.querySelector('input[type="checkbox"]').checked).toBe(true);
 });

 test("a task the management confirmed cannot be undone by the guide", async () => {
   getMyTasks.mockResolvedValue({ ok: true, week: WEEK, tasks: [task({ done: true, approved: true })] });
   await mount();
   expect(host.textContent).toContain("أكّدتها الإدارة");
-  expect(button("إلغاء")).toBeUndefined();
+  expect(host.querySelector('input[type="checkbox"]').checked).toBe(true);
+  expect(host.querySelector('input[type="checkbox"]').disabled).toBe(true);
 });

 test("the management sees the register and the way to editing; an empty group is not listed", async () => {
@@ -96,8 +97,8 @@ test("the management's check confirms a task, and pressing it again takes it bac
   getMyTasks.mockResolvedValue({ ok: true, week: WEEK, tasks: [] });
   await mount();
   await act(async () => button("عرض مهمات الجمعية").click());
-  const check = () => host.querySelector("button[aria-pressed]");
-  expect(check().getAttribute("aria-pressed")).toBe("false");
+  const check = () => host.querySelector('input[type="checkbox"]');
+  expect(check().checked).toBe(false);
   await act(async () => check().click());
   expect(approveTask).toHaveBeenCalledWith("t1", "g1", true, WEEK);
   getTaskBoard.mockResolvedValue({ ...BOARD, statuses: [{ taskId: "t1", groupId: "g1", done: true, approved: true }] });
@@ -110,11 +111,28 @@ test("the same duty in two lessons has independent controls, and a completed dut
   getMyTasks.mockResolvedValue({ ok: true, week: WEEK, tasks: [task(), task({ groupId: "second", groupName: "Second lesson" })] });
   setMyTaskDone.mockResolvedValue({ ok: true, week: WEEK, tasks: [task({ done: true }), task({ groupId: "second", groupName: "Second lesson" })] });
   await mount();
-  await act(async () => button("تم").click());
+  await act(async () => host.querySelector('input[type="checkbox"]:not(:checked)').click());
   expect(setMyTaskDone).toHaveBeenCalledWith("t1", "g1", true, WEEK);
   const items = [...host.querySelectorAll("li")];
   expect(items[0].textContent).toContain("Second lesson");
   expect(items[1].textContent).toContain("Guide One");
-  await act(async () => button("تم").click());
+  await act(async () => host.querySelector('input[type="checkbox"]:not(:checked)').click());
   expect(setMyTaskDone).toHaveBeenLastCalledWith("t1", "second", true, WEEK);
 });
+
+test("management sees a check for duties already completed by the responsible person", async () => {
+  mockManage = true;
+  getTaskBoard.mockResolvedValue({ ...BOARD, statuses: [{ taskId: "t1", groupId: "g1", done: true, approved: false }] });
+  await mount(); await act(async () => button("عرض مهمات الجمعية").click());
+  const check = host.querySelector('input[type="checkbox"]');
+  expect(check.checked).toBe(true); expect(host.textContent).toContain("أنجزها المسؤول");
+  await act(async () => check.click());
+  expect(approveTask).toHaveBeenCalledWith("t1", "g1", false, WEEK);
+});
+
+test("a failed completion leaves the checkbox clear and the duty in the open section", async () => {
+  setMyTaskDone.mockResolvedValue({ ok: false, message: "Failed" });
+  await mount(); await act(async () => host.querySelector('input[type="checkbox"]').click());
+  expect(host.querySelector('input[type="checkbox"]').checked).toBe(false);
+  expect(host.textContent).not.toContain("تم إنجازها");
+});
diff --git a/apps/system/src/WebServer/services/inviteToken/functionInviteToken.jsx b/apps/system/src/WebServer/services/inviteToken/functionInviteToken.jsx
index c1d2af7..937462b 100644
--- a/apps/system/src/WebServer/services/inviteToken/functionInviteToken.jsx
+++ b/apps/system/src/WebServer/services/inviteToken/functionInviteToken.jsx
@@ -58,10 +58,31 @@ export const signConsent = async (studentId, consent) => {
         await api.post(`/inviteToken/consent/${encodeURIComponent(studentId)}`, consent);
         return { ok: true };
     } catch (err) {
-        return { ok: false, message: errorMessage(err, "تعذّر حفظ التوقيع") };
+        return { ok: false, code: err?.response?.data?.code, message: errorMessage(err, "تعذّر حفظ التوقيع") };
     }
 };

+export const createConsentLink = async (studentId) => {
+    try {
+        const { data } = await api.post(`/inviteToken/consent/${encodeURIComponent(studentId)}/link`);
+        return data;
+    } catch (err) { return { ok: false, message: errorMessage(err, "تعذّر إنشاء رابط التوقيع") }; }
+};
+
+export const validateConsentLink = async (token) => {
+    try {
+        const { data } = await publicApi.post("/inviteToken/consent-link/validate", { token });
+        return data;
+    } catch (err) { return { ok: false, code: err?.response?.data?.code, message: errorMessage(err, "تعذّر فتح رابط التوقيع") }; }
+};
+
+export const submitConsentLink = async (token, consent) => {
+    try {
+        const { data } = await publicApi.post("/inviteToken/consent-link/submit", { token, ...consent });
+        return data;
+    } catch (err) { return { ok: false, code: err?.response?.data?.code, message: errorMessage(err, "تعذّر حفظ التوقيع") }; }
+};
+
 // Public: the parents' page must never send or refresh a login, so these use
 // publicApi instead of api.
 export const validate = async (token) => {
diff --git a/server/Entities/InviteToken/InviteToken.controller.js b/server/Entities/InviteToken/InviteToken.controller.js
index 198936e..4c90bc3 100644
--- a/server/Entities/InviteToken/InviteToken.controller.js
+++ b/server/Entities/InviteToken/InviteToken.controller.js
@@ -1,7 +1,7 @@
 const crypto = require("crypto");
 const { DEFAULT_RULES } = require("./defaultRules");
 const { InviteTokenModelDef } = require("./InviteToken.model");
-const { RulesModelDef, ConsentModelDef } = require("./Rules.model");
+const { RulesModelDef, ConsentModelDef, ConsentHistoryModelDef } = require("./Rules.model");
 const { canonicalGrade } = require("../../utils/grades");
 const { StudentModelDef } = require("../Student/Student.model");
 const { handleUpload } = require("../UploadFile/file");
@@ -97,11 +97,11 @@ async function currentRules() {
 }

 // What the form sent about the rules; "" when all is in order.
-function consentProblem(body, rules, { allowPending = false } = {}) {
+function consentProblem(body, rules) {
   if (String(body.rulesVersion ?? "") !== String(rules.version)) return { status: 409, code: "RULES_CHANGED", message: "تم تحديث نظام الجمعية. يُرجى قراءته والتوقيع عليه من جديد." };
   const signature = String(body.signature ?? "");
-  if (body.rulesAccepted !== "true" || !cleanText(body.signerName, 100) || (!signature && !allowPending) || (signature && (signature.length > MAX_SIGNATURE || !SIGNATURE.test(signature) || !isPng(signature)))) {
-    return { status: 400, code: "CONSENT_REQUIRED", message: "يجب الموافقة على قوانين الجمعية وكتابة اسم ولي الأمر، وإضافة توقيع/ختم صالح أو استكماله لاحقًا." };
+  if (body.rulesAccepted !== "true" || !cleanText(body.signerName, 100) || !signature || signature.length > MAX_SIGNATURE || !SIGNATURE.test(signature) || !isPng(signature)) {
+    return { status: 400, code: "CONSENT_REQUIRED", message: "يجب الموافقة على قوانين الجمعية وكتابة اسم ولي الأمر وإضافة توقيع/ختم صالح قبل الإرسال." };
   }
   return null;
 }
@@ -141,6 +141,7 @@ const getConsent = async (req, res) => {
     return res.status(200).json({
       ok: true,
       consent: {
+        revision: consentRevision(consent),
         signerName: consent.signerName,
         signature: consent.signature,
         signedAt: consent.signedAt,
@@ -156,7 +157,46 @@ const getConsent = async (req, res) => {
   }
 };

-// A student the association added: the parent signs later, on the student's page.
+const digest = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
+const consentRevision = (consent) => consent ? digest(JSON.stringify([String(consent._id), consent.revision || "", consent.signature || "", consent.signedAt, consent.rulesVersion])) : "none";
+const changedConsent = () => ({ status: 409, ok: false, code: "CONSENT_CHANGED", message: "تم تحديث التوقيع. حدّث الصفحة واطلب رابطًا جديدًا عند الحاجة." });
+
+async function saveConsentEvidence(student, existing, body, rules, { recordedBy = "", requestId = "" } = {}) {
+  const studentId = String(student._id);
+  // A retry after a partial first signature repairs its marker without replacing
+  // accepted evidence. Parent-link retries are bound to the same request ID.
+  const markerMatches = existing?.signedAt && new Date(student.consentAt).getTime() === new Date(existing.signedAt).getTime();
+  const repairing = existing?.signature && ((requestId && existing.requestId === requestId) || (!requestId && ((!student.consentAt && !body.baseConsentVersion) || (!markerMatches && body.baseConsentVersion !== undefined && body.baseConsentVersion === existing.previousRevision))));
+  let signedAt = repairing ? existing.signedAt : new Date();
+  if (!repairing) {
+    if (body.baseConsentVersion !== undefined && body.baseConsentVersion !== consentRevision(existing)) return changedConsent();
+    if (existing?.signature && body.baseConsentVersion === undefined) {
+      return { status: 409, ok: false, code: "ALREADY_SIGNED", message: "يوجد توقيع لهذا الطالب. حدّث الصفحة قبل تعديله." };
+    }
+    if (existing?.signature) {
+      const snapshot = { ...existing, _id: digest(`${studentId}:${consentRevision(existing)}`).slice(0, 24), sourceConsentId: String(existing._id), archivedAt: signedAt };
+      try { await ConsentHistoryModelDef.create(snapshot); }
+      catch (error) { if (!isDuplicateKey(error)) throw error; }
+    }
+    const evidence = {
+      studentId, tz: student.tz, rulesVersion: rules.version,
+      signerName: cleanText(body.signerName, 100), signature: String(body.signature),
+      acceptedAt: signedAt, signedAt, recordedBy, requestId, previousRevision: consentRevision(existing), revision: crypto.randomBytes(16).toString("hex"),
+    };
+    if (existing) {
+      const saved = await ConsentModelDef.updateExisting(
+        { _id: String(existing._id), signature: existing.signature ?? null, revision: existing.revision ?? null }, evidence,
+      );
+      if (!saved?.result) return changedConsent();
+    } else await ConsentModelDef.create(evidence);
+  }
+  const marked = await StudentModelDef.updateExisting({ _id: studentId }, { consentAt: signedAt });
+  if (!marked?.result) throw new Error("Student disappeared while saving consent");
+  notifyChange("student", studentId);
+  return { ok: true };
+}
+
+// Staff-assisted signing and explicitly versioned updates use the same evidence path.
 const signConsent = async (req, res) => {
   try {
     const studentId = String(req.params.studentId);
@@ -167,29 +207,8 @@ const signConsent = async (req, res) => {
     const problem = consentProblem(req.body, rules);
     if (problem) return res.status(problem.status).json({ ok: false, code: problem.code, message: problem.message });
     const [existing] = resultsOf(await ConsentModelDef.get({ studentId }));
-    if (existing?.signature && student.consentAt) {
-      return res.status(409).json({ ok: false, code: "ALREADY_SIGNED", message: "يوجد توقيع لهذا الطالب." });
-    }
-    // A prior consent write may have succeeded before the student marker failed.
-    // Repair that marker on retry without replacing the original evidence.
-    const signedAt = existing?.signature ? existing.signedAt : new Date();
-    if (!existing?.signature) {
-      const evidence = {
-        studentId, tz: student.tz, rulesVersion: rules.version,
-        signerName: cleanText(req.body.signerName, 100), signature: String(req.body.signature),
-        acceptedAt: signedAt, signedAt, recordedBy: String(req.actor?.name || ""),
-      };
-      if (existing) {
-        const saved = await ConsentModelDef.updateExisting(
-          { _id: String(existing._id), signature: existing.signature ?? null }, evidence,
-        );
-        if (!saved?.result) return res.status(409).json({ ok: false, code: "CONSENT_CHANGED", message: "تم تحديث التوقيع. حدّث الصفحة وحاول مرة أخرى." });
-      } else await ConsentModelDef.create(evidence);
-    }
-    const marked = await StudentModelDef.updateExisting({ _id: studentId }, { consentAt: signedAt });
-    if (!marked?.result) throw new Error("Student disappeared while saving consent");
-    notifyChange("student", studentId);
-    return res.status(200).json({ ok: true });
+    const result = await saveConsentEvidence(student, existing, req.body, rules, { recordedBy: String(req.actor?.name || "") });
+    return res.status(result.status || 200).json(result);
   } catch (err) {
     if (isDuplicateKey(err)) return res.status(409).json({ ok: false, code: "CONSENT_CHANGED", message: "تم تحديث التوقيع. حدّث الصفحة وحاول مرة أخرى." });
     logWithSource("InviteToken.signConsent", err);
@@ -197,6 +216,74 @@ const signConsent = async (req, res) => {
   }
 };

+// A personal, seven-day, one-use capability. Only the digest is stored; the
+// browser sends the secret in a POST body, never in a server path/query.
+const createConsentLink = async (req, res) => {
+  try {
+    const studentId = String(req.params.studentId);
+    const [student] = resultsOf(await StudentModelDef.get({ _id: studentId }));
+    if (!student) return res.status(404).json({ ok: false, message: "الطالب غير موجود" });
+    const rules = await currentRules();
+    if (!rules?.text) return res.status(409).json({ ok: false, code: "NO_RULES", message: "يجب نشر قوانين الجمعية أولًا." });
+    const [existing] = resultsOf(await ConsentModelDef.get({ studentId }));
+    const token = crypto.randomBytes(32).toString("base64url");
+    const expiresAt = new Date(Date.now() + 7 * DAY_MS);
+    await InviteTokenModelDef.create({ purpose: "student-consent", tokenHash: digest(token), studentId, baseConsentVersion: consentRevision(existing), expiresAt, used: false, createdAt: new Date() });
+    res.set("Cache-Control", "no-store");
+    return res.status(200).json({ ok: true, token, expiresAt });
+  } catch (error) {
+    logWithSource("InviteToken.createConsentLink", error);
+    return res.status(500).json({ ok: false, message: "تعذّر إنشاء رابط التوقيع" });
+  }
+};
+
+async function consentLinkContext(token) {
+  if (!/^[A-Za-z0-9_-]{43}$/.test(String(token || ""))) return null;
+  const [link] = resultsOf(await InviteTokenModelDef.get({ purpose: "student-consent", tokenHash: digest(token), used: false }));
+  if (!link || !(new Date(link.expiresAt).getTime() > Date.now())) return null;
+  const [student] = resultsOf(await StudentModelDef.get({ _id: String(link.studentId) }));
+  if (!student) return null;
+  const [existing] = resultsOf(await ConsentModelDef.get({ studentId: String(link.studentId) }));
+  if (consentRevision(existing) !== link.baseConsentVersion && existing?.requestId !== link.tokenHash) return null;
+  return { link, student, existing };
+}
+
+const closedConsentLink = (res) => res.status(410).json({ ok: false, code: "LINK_CLOSED", message: "الرابط غير صالح أو انتهى أو تم استكمال التوقيع. اطلب رابطًا جديدًا من الجمعية." });
+const validateConsentLink = async (req, res) => {
+  res.set("Cache-Control", "no-store");
+  try {
+    const context = await consentLinkContext(req.body?.token);
+    if (!context) return closedConsentLink(res);
+    const rules = await currentRules();
+    if (!rules?.text) return res.status(409).json({ ok: false, code: "NO_RULES", message: "التوقيع غير متاح حاليًا. تواصل مع الجمعية." });
+    return res.status(200).json({ ok: true, studentName: [context.student.firstname, context.student.lastname].filter(Boolean).join(" "), rules: { version: rules.version, text: rules.text } });
+  } catch (error) {
+    logWithSource("InviteToken.validateConsentLink", error);
+    return res.status(500).json({ ok: false, message: "تعذّر فتح رابط التوقيع" });
+  }
+};
+
+const submitConsentLink = async (req, res) => {
+  res.set("Cache-Control", "no-store");
+  try {
+    const context = await consentLinkContext(req.body?.token);
+    if (!context) return closedConsentLink(res);
+    const rules = await currentRules();
+    if (!rules?.text) return res.status(409).json({ ok: false, code: "NO_RULES", message: "التوقيع غير متاح حاليًا. تواصل مع الجمعية." });
+    const problem = consentProblem(req.body, rules);
+    if (problem) return res.status(problem.status).json({ ok: false, ...problem });
+    const { link, student, existing } = context;
+    const result = await saveConsentEvidence(student, existing, { ...req.body, baseConsentVersion: link.baseConsentVersion }, rules, { recordedBy: "ولي الأمر عبر رابط التوقيع", requestId: link.tokenHash });
+    if (!result.ok) return res.status(result.status || 409).json(result);
+    await InviteTokenModelDef.updateExisting({ _id: String(link._id), used: false }, { used: true, usedAt: new Date() });
+    return res.status(200).json({ ok: true, message: "تم حفظ موافقتكم وتوقيعكم في ملف الطالب." });
+  } catch (error) {
+    if (isDuplicateKey(error)) return res.status(409).json(changedConsent());
+    logWithSource("InviteToken.submitConsentLink", error);
+    return res.status(500).json({ ok: false, message: "تعذّر حفظ التوقيع. حاول مرة أخرى." });
+  }
+};
+
 /* ================= admin: the link ================= */

 const getLink = async (req, res) => {
@@ -317,7 +404,7 @@ const submitRegistration = async (req, res) => {
     if (!rules?.text) {
       return res.status(409).json({ ok: false, code: "NO_RULES", message: "لا يمكن استقبال الطلبات قبل نشر نظام الجمعية. يُرجى التواصل مع الجمعية." });
     }
-    const problem = consentProblem(req.body, rules, { allowPending: true });
+    const problem = consentProblem(req.body, rules);
     if (problem) return res.status(problem.status).json({ ok: false, code: problem.code, message: problem.message });

     // A known ID gets exactly the same reply as a new one, so the public form
@@ -339,7 +426,7 @@ const submitRegistration = async (req, res) => {
       createdAt: now,
       updatedAt: now,
     });
-    // Agreement is saved before replying; an absent stamp remains pending.
+    // Required agreement and signature are saved before replying.
     // The time is the server's, and a known ID never reaches this point.
     try {
       await ConsentModelDef.create({
@@ -393,4 +480,5 @@ module.exports = {
   publishRules,
   getConsent,
   signConsent,
+  createConsentLink, validateConsentLink, submitConsentLink,
 };
diff --git a/server/Entities/InviteToken/InviteToken.model.js b/server/Entities/InviteToken/InviteToken.model.js
index bb6f804..bb77144 100644
--- a/server/Entities/InviteToken/InviteToken.model.js
+++ b/server/Entities/InviteToken/InviteToken.model.js
@@ -58,6 +58,10 @@ InviteTokenModelDef.update = async function (filter, newData) {
     });
 };

+InviteTokenModelDef.updateExisting = async function (filter, newData) {
+    return await api.updateExisting({ dbName: this.dbName, collection: this.collections.active, filter, newData });
+};
+
 // DELETE
 InviteTokenModelDef.delete = async function (filter) {
     return await api.delete({
diff --git a/server/Entities/InviteToken/InviteToken.route.js b/server/Entities/InviteToken/InviteToken.route.js
index 1f3611b..753bcd2 100644
--- a/server/Entities/InviteToken/InviteToken.route.js
+++ b/server/Entities/InviteToken/InviteToken.route.js
@@ -6,10 +6,12 @@ const {
   getLink,
   rotateLink,
   validateToken,
-  submitRegistration, getRules, publishRules, getConsent, signConsent
+  submitRegistration, getRules, publishRules, getConsent, signConsent,
+  createConsentLink, validateConsentLink, submitConsentLink,
 } = require("./InviteToken.controller");
 const { requireAuth: protect } = require("../../middleware/authMiddleware");
 const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware");
+const { rateLimit } = require("../../middleware/rateLimit");

 const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
 const photoUpload = multer({
@@ -42,6 +44,10 @@ router.get("/rules", protect, loadActor, requirePermission("students.parentLink"
 router.post("/rules", protect, loadActor, requirePermission("students.parentLink"), publishRules);
 router.get("/consent/:studentId", protect, loadActor, requirePermission("students.parentLink"), getConsent);
 router.post("/consent/:studentId", protect, loadActor, requirePermission("students.parentLink"), signConsent);
+router.post("/consent/:studentId/link", protect, loadActor, requirePermission("students.parentLink"), createConsentLink);
+const limitConsent = rateLimit({ windowMs: 60 * 1000, max: 30, scope: "parent-consent" });
+router.post("/consent-link/validate", limitConsent, validateConsentLink);
+router.post("/consent-link/submit", limitConsent, submitConsentLink);

 // Public: parents open these from the shared link without logging in.
 router.get(
diff --git a/server/Entities/InviteToken/Rules.model.js b/server/Entities/InviteToken/Rules.model.js
index bb468f3..97a4786 100644
--- a/server/Entities/InviteToken/Rules.model.js
+++ b/server/Entities/InviteToken/Rules.model.js
@@ -30,6 +30,19 @@ ConsentModelDef.delete = async function (filter) {
   return await api.delete({ dbName: this.dbName, collection: this.collection, filter });
 };

+// Updating a signature never discards the previously accepted evidence.
+// Deterministic snapshot _ids make archiving safe to retry before the CAS write.
+const ConsentHistoryModelDef = { dbName, collection: "StudentConsentHistory" };
+ConsentHistoryModelDef.create = async function (data) {
+  return await api.create({ dbName: this.dbName, collection: this.collection, data });
+};
+ConsentHistoryModelDef.get = async function (filter = {}) {
+  return await api.read({ dbName: this.dbName, collection: this.collection, filter });
+};
+ConsentHistoryModelDef.delete = async function (filter) {
+  return await api.delete({ dbName: this.dbName, collection: this.collection, filter });
+};
+
 // Two publishes at once cannot both take the same version.
 const RULES_INDEXES = [{ key: { version: 1 }, options: { unique: true } }];
 const CONSENT_INDEXES = [{ key: { studentId: 1 }, options: { unique: true } }];
@@ -47,4 +60,4 @@ async function ensureRulesIndexes() {
   await ensureIndexes(collectionOf(RulesModelDef), RULES_INDEXES);
 }

-module.exports = { RulesModelDef, ConsentModelDef, RULES_INDEXES, CONSENT_INDEXES, ensureRulesIndexes, ensureConsentIndexes };
+module.exports = { RulesModelDef, ConsentModelDef, ConsentHistoryModelDef, RULES_INDEXES, CONSENT_INDEXES, ensureRulesIndexes, ensureConsentIndexes };
diff --git a/server/Entities/Student/Student.controller.js b/server/Entities/Student/Student.controller.js
index bd3569a..c018ea2 100644
--- a/server/Entities/Student/Student.controller.js
+++ b/server/Entities/Student/Student.controller.js
@@ -450,6 +450,10 @@ const deleteS = async (req, res) => {
     // A parent's signature goes with the request it belongs to.
     await Promise.resolve().then(() => require("../InviteToken/Rules.model").ConsentModelDef.delete({ studentId: String(existing.result[0]._id) }))
       .catch((e) => logWithSource("Student.delete.consent", e));
+    await Promise.resolve().then(() => require("../InviteToken/Rules.model").ConsentHistoryModelDef.delete({ studentId: String(existing.result[0]._id) }))
+      .catch((e) => logWithSource("Student.delete.consentHistory", e));
+    await Promise.resolve().then(() => require("../InviteToken/InviteToken.model").InviteTokenModelDef.delete({ purpose: "student-consent", studentId: String(existing.result[0]._id) }))
+      .catch((e) => logWithSource("Student.delete.consentLinks", e));
     // Its player photo goes with it, at once.
     await playerPhotoJob.remove(existing.result[0]._id).catch((e) => logWithSource("Student.delete.playerPhoto", e));

diff --git a/server/test/parent-registration.test.js b/server/test/parent-registration.test.js
index a884fe4..635146d 100644
--- a/server/test/parent-registration.test.js
+++ b/server/test/parent-registration.test.js
@@ -25,6 +25,9 @@ function createModel(records = [], extra = {}) {
       return { success: true, result: docs.filter((doc) => matches(doc, filter)).map((doc) => ({ ...doc })) };
     },
     async create(data) {
+      if (docs.some((doc) => (data._id && doc._id === data._id) || (extra.uniqueKey && doc[extra.uniqueKey] === data[extra.uniqueKey]))) {
+        const error = new Error("duplicate"); error.code = 11000; throw error;
+      }
       const doc = { _id: `doc-${nextId++}`, ...data };
       docs.push(doc);
       return { success: true, result: { ...doc } };
@@ -72,7 +75,8 @@ function loadController({ students = [], rules = [{ version: 1, text: "the rules
     students: createModel(students, { dbName: "tamheed_db", collections: { active: "Students" } }),
     links: createModel(),
     rules: createModel(rules),
-    consents: createModel(),
+    consents: createModel([], { uniqueKey: "studentId" }),
+    consentHistory: createModel(),
   };
   const drive = {
     uploads: [],
@@ -85,7 +89,7 @@ function loadController({ students = [], rules = [{ version: 1, text: "the rules
     crypto: require("node:crypto"),
     "./defaultRules": require("../Entities/InviteToken/defaultRules"),
     "./InviteToken.model": { InviteTokenModelDef: models.links },
-    "./Rules.model": { RulesModelDef: models.rules, ConsentModelDef: models.consents },
+    "./Rules.model": { RulesModelDef: models.rules, ConsentModelDef: models.consents, ConsentHistoryModelDef: models.consentHistory },
     "../../utils/grades": require("../utils/grades"),
     "../Student/Student.model": { StudentModelDef: models.students },
     "../UploadFile/file": drive,
@@ -332,6 +336,9 @@ function loadRoutes({ multerError = null } = {}) {
       rotateLink: handler("rotateLink"),
       validateToken: handler("validateToken"),
       submitRegistration: handler("submitRegistration"),
+      getRules: handler("getRules"), publishRules: handler("publishRules"),
+      getConsent: handler("getConsent"), signConsent: handler("signConsent"),
+      createConsentLink: handler("createConsentLink"), validateConsentLink: handler("validateConsentLink"), submitConsentLink: handler("submitConsentLink"),
     },
     "../../middleware/authMiddleware": require("../middleware/authMiddleware"),
     "../../middleware/permissionMiddleware": require("./helpers/actors").permissionMiddlewareStub(),
@@ -586,13 +593,16 @@ test("the built-in rules are public version zero, stay readable after publicatio
   assert.equal(read.body.consent.rulesText, DEFAULT_RULES);
 });

-test("agreement without a stamp sends a request but stays unsigned until later completion", async () => {
-  const ctrl = loadController();
+test("public intake requires a stamp while existing pending evidence can still be completed", async () => {
+  const ctrl = loadController({ students: [{ tz: "1", consentAt: null }] });
   const token = await currentToken(ctrl);
   const sent = await call(ctrl.submitRegistration, { params: { token }, body: registration({ signature: "" }) });
-  assert.equal(sent.statusCode, 200);
+  assert.equal(sent.statusCode, 400);
+  assert.equal(sent.body.code, "CONSENT_REQUIRED");
+  assert.equal(ctrl.models.consents.snapshot().length, 0);
   const [student] = ctrl.models.students.snapshot();
   const params = { studentId: student._id };
+  await ctrl.models.consents.create({ studentId: student._id, signerName: "Parent", rulesVersion: 1, signature: null, acceptedAt: daysAgo(1), signedAt: null });
   assert.equal(student.consentAt, null);
   let read = (await call(ctrl.getConsent, { params })).body.consent;
   assert.ok(read.acceptedAt);
@@ -632,13 +642,151 @@ test("a partial later save can repair the student marker without replacing the s
 });

 test("a racing pending completion cannot overwrite already stored evidence", async () => {
-  const ctrl = loadController();
-  const token = await currentToken(ctrl);
-  await call(ctrl.submitRegistration, { params: { token }, body: registration({ signature: "" }) });
+  const ctrl = loadController({ students: [{ tz: "1", consentAt: null }] });
   const params = { studentId: ctrl.models.students.snapshot()[0]._id };
+  await ctrl.models.consents.create({ studentId: params.studentId, signerName: "Parent", rulesVersion: 1, signature: null, acceptedAt: daysAgo(1), signedAt: null });
   ctrl.models.consents.updateExisting = async () => ({ success: true, result: null });
   const res = await call(ctrl.signConsent, { params, body: registration() });
   assert.equal(res.statusCode, 409);
   assert.equal(res.body.code, "CONSENT_CHANGED");
   assert.equal(ctrl.models.students.snapshot()[0].consentAt, null);
 });
+
+const personalLink = async (ctrl, studentId) => {
+  const result = await call(ctrl.createConsentLink, { params: { studentId } });
+  assert.equal(result.statusCode, 200); return result.body.token;
+};
+
+test("personal links store only digests and disclose only the child name and rules", async () => {
+  const ctrl = loadController({ students: [{ tz: "1", firstname: "Child", lastname: "Family", phone: "private", photo: "private-photo" }] });
+  const studentId = ctrl.models.students.snapshot()[0]._id, token = await personalLink(ctrl, studentId);
+  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
+  const [record] = ctrl.models.links.snapshot();
+  assert.equal(record.purpose, "student-consent"); assert.equal(record.studentId, studentId);
+  assert.match(record.tokenHash, /^[a-f0-9]{64}$/); assert.equal(record.token, undefined);
+  assert.ok(new Date(record.expiresAt).getTime() > Date.now());
+  const result = await call(ctrl.validateConsentLink, { body: { token } });
+  assert.deepEqual(Object.keys(result.body).sort(), ["ok", "rules", "studentName"]);
+  assert.equal(result.body.studentName, "Child Family"); assert.ok(!JSON.stringify(result.body).includes("private"));
+});
+
+test("parent links cannot register, edit fields or target another child", async () => {
+  const ctrl = loadController({ students: [{ tz: "1", firstname: "First", status: "عادي" }, { tz: "2", firstname: "Other" }] });
+  const [first, other] = ctrl.models.students.snapshot(), token = await personalLink(ctrl, first._id);
+  const result = await call(ctrl.submitConsentLink, { body: { ...registration(), token, studentId: other._id, firstname: "Injected", tz: "2", status: "ينتظر", main_teacher: "attacker" } });
+  assert.equal(result.statusCode, 200); assert.equal(ctrl.models.students.snapshot().length, 2);
+  const saved = ctrl.models.students.snapshot().find((row) => row._id === first._id);
+  assert.equal(saved.firstname, "First"); assert.equal(saved.status, "عادي"); assert.equal(saved.main_teacher, undefined); assert.ok(saved.consentAt);
+  assert.equal(ctrl.models.students.snapshot().find((row) => row._id === other._id).consentAt, undefined);
+  assert.equal(ctrl.models.consents.snapshot()[0].studentId, first._id);
+});
+
+test("personal links require agreement, name and stamp and close after success", async () => {
+  const ctrl = loadController({ students: [{ tz: "1" }] }), token = await personalLink(ctrl, ctrl.models.students.snapshot()[0]._id);
+  for (const missing of [{ rulesAccepted: "false" }, { signature: "" }, { signerName: " " }, { signature: "not-a-png" }]) {
+    assert.equal((await call(ctrl.submitConsentLink, { body: { ...registration(missing), token } })).statusCode, 400);
+    assert.equal(ctrl.models.consents.snapshot().length, 0); assert.equal(ctrl.models.links.snapshot()[0].used, false);
+  }
+  assert.equal((await call(ctrl.submitConsentLink, { body: { ...registration(), token } })).statusCode, 200);
+  const evidence = plain(ctrl.models.consents.snapshot());
+  assert.equal((await call(ctrl.validateConsentLink, { body: { token } })).statusCode, 410);
+  assert.equal((await call(ctrl.submitConsentLink, { body: { ...registration({ signerName: "Replacement" }), token } })).statusCode, 410);
+  assert.deepEqual(plain(ctrl.models.consents.snapshot()), evidence);
+});
+
+test("expired, guessed, wrong-purpose and removed-child links cannot sign or reveal a name", async () => {
+  const ctrl = loadController({ students: [{ tz: "1", firstname: "Private Child" }] }), studentId = ctrl.models.students.snapshot()[0]._id;
+  const token = await personalLink(ctrl, studentId); await ctrl.models.links.update({ studentId }, { expiresAt: daysAgo(1) });
+  for (const candidate of [token, "x".repeat(43), await currentToken(ctrl), ""]) {
+    const result = await call(ctrl.validateConsentLink, { body: { token: candidate } });
+    assert.equal(result.statusCode, 410); assert.equal(result.body.studentName, undefined);
+    assert.equal((await call(ctrl.submitConsentLink, { body: { ...registration(), token: candidate } })).statusCode, 410);
+  }
+  const fresh = await personalLink(ctrl, studentId); await ctrl.models.students.delete({ _id: studentId });
+  assert.equal((await call(ctrl.validateConsentLink, { body: { token: fresh } })).statusCode, 410); assert.equal(ctrl.models.consents.snapshot().length, 0);
+});
+
+test("changed rules require fresh acceptance without consuming a signing link", async () => {
+  const ctrl = loadController({ students: [{ tz: "1" }] }), token = await personalLink(ctrl, ctrl.models.students.snapshot()[0]._id);
+  await call(ctrl.publishRules, { body: { text: "Updated rules" } });
+  const stale = await call(ctrl.submitConsentLink, { body: { ...registration(), token } });
+  assert.equal(stale.statusCode, 409); assert.equal(stale.body.code, "RULES_CHANGED");
+  assert.equal(ctrl.models.consents.snapshot().length, 0); assert.equal(ctrl.models.links.snapshot()[0].used, false);
+  assert.equal((await call(ctrl.validateConsentLink, { body: { token } })).body.rules.version, 2);
+  assert.equal((await call(ctrl.submitConsentLink, { body: { ...registration({ rulesVersion: "2" }), token } })).statusCode, 200);
+});
+
+test("signature updates retain evidence and invalidate stale versions and older links", async () => {
+  const ctrl = loadController({ students: [{ tz: "1" }] }), params = { studentId: ctrl.models.students.snapshot()[0]._id };
+  await call(ctrl.signConsent, { params, body: registration() });
+  const original = plain(ctrl.models.consents.snapshot()[0]), oldToken = await personalLink(ctrl, params.studentId);
+  const read = (await call(ctrl.getConsent, { params })).body.consent;
+  assert.equal((await call(ctrl.signConsent, { params, body: registration({ signerName: "New parent", baseConsentVersion: read.revision }) })).statusCode, 200);
+  assert.equal(ctrl.models.consents.snapshot()[0].signerName, "New parent");
+  const [history] = ctrl.models.consentHistory.snapshot();
+  assert.equal(history.signature, original.signature); assert.equal(history.signerName, original.signerName);
+  assert.equal(history.rulesVersion, original.rulesVersion); assert.equal(history.sourceConsentId, original._id);
+  assert.equal((await call(ctrl.submitConsentLink, { body: { ...registration(), token: oldToken } })).statusCode, 410);
+  assert.equal((await call(ctrl.signConsent, { params, body: registration({ baseConsentVersion: read.revision }) })).statusCode, 409);
+  assert.equal(ctrl.models.consents.snapshot()[0].signerName, "New parent");
+});
+
+test("concurrent edits preserve one winner and one immutable historical snapshot", async () => {
+  const ctrl = loadController({ students: [{ tz: "1" }] }), params = { studentId: ctrl.models.students.snapshot()[0]._id };
+  await call(ctrl.signConsent, { params, body: registration() });
+  const revision = (await call(ctrl.getConsent, { params })).body.consent.revision;
+  const results = await Promise.all(["First", "Second"].map((signerName) => call(ctrl.signConsent, { params, body: registration({ signerName, baseConsentVersion: revision }) })));
+  assert.deepEqual(results.map((row) => row.statusCode).sort(), [200, 409]);
+  assert.equal(ctrl.models.consentHistory.snapshot().length, 1); assert.equal(ctrl.models.consentHistory.snapshot()[0].signerName, "Parent");
+});
+
+test("parallel parent submissions never overwrite accepted evidence", async () => {
+  const ctrl = loadController({ students: [{ tz: "1" }] }), token = await personalLink(ctrl, ctrl.models.students.snapshot()[0]._id);
+  const results = await Promise.all(["First", "Second"].map((signerName) => call(ctrl.submitConsentLink, { body: { ...registration({ signerName }), token } })));
+  assert.ok(results.some((row) => row.statusCode === 200)); assert.equal(ctrl.models.consents.snapshot().length, 1);
+  assert.equal(ctrl.models.consentHistory.snapshot().length, 0); assert.equal(ctrl.models.links.snapshot()[0].used, true);
+});
+
+test("partial parent signing repairs the student marker without replacing original evidence", async () => {
+  const ctrl = loadController({ students: [{ tz: "1" }] }), token = await personalLink(ctrl, ctrl.models.students.snapshot()[0]._id);
+  const update = ctrl.models.students.updateExisting;
+  ctrl.models.students.updateExisting = async () => { throw new Error("simulated marker failure"); };
+  assert.equal((await call(ctrl.submitConsentLink, { body: { ...registration(), token } })).statusCode, 500);
+  const evidence = plain(ctrl.models.consents.snapshot()[0]); ctrl.models.students.updateExisting = update;
+  assert.equal((await call(ctrl.submitConsentLink, { body: { ...registration({ signerName: "Changed on retry" }), token } })).statusCode, 200);
+  assert.deepEqual(plain(ctrl.models.consents.snapshot()[0]), evidence);
+  assert.ok(ctrl.models.students.snapshot()[0].consentAt); assert.equal(ctrl.models.links.snapshot()[0].used, true);
+});
+
+test("only authorized staff issue personal links; public signing needs no login and is rate limited", async () => {
+  for (const [roles, status] of [[["ادارة"], 200], [["مرشد"], 403], [["مساعد"], 403], [null, 401]]) {
+    const routes = loadRoutes(), result = await runRoute(routes.find("post", "/consent/:studentId/link"), routeRequest({ roles }));
+    assert.equal(result.statusCode, status); assert.deepEqual(routes.calls, status === 200 ? ["createConsentLink"] : []);
+  }
+  const routes = loadRoutes();
+  assert.equal((await runRoute(routes.find("post", "/consent-link/validate"), routeRequest({ ip: "203.0.113.70" }))).statusCode, 200);
+  assert.equal((await runRoute(routes.find("post", "/consent-link/submit"), routeRequest({ ip: "203.0.113.71" }))).statusCode, 200);
+  for (let i = 0; i < 29; i++) await runRoute(routes.find("post", "/consent-link/validate"), routeRequest({ ip: "203.0.113.70" }));
+  assert.equal((await runRoute(routes.find("post", "/consent-link/validate"), routeRequest({ ip: "203.0.113.70" }))).statusCode, 429);
+});
+
+test("a versioned pending retry repairs its marker without overwriting the accepted signature", async () => {
+  const ctrl = loadController({ students: [{ tz: "1", consentAt: null }] }), params = { studentId: ctrl.models.students.snapshot()[0]._id };
+  await ctrl.models.consents.create({ studentId: params.studentId, signature: null, signedAt: null, rulesVersion: 1 });
+  const revision = (await call(ctrl.getConsent, { params })).body.consent.revision;
+  const update = ctrl.models.students.updateExisting;
+  ctrl.models.students.updateExisting = async () => { throw new Error("marker failure"); };
+  assert.equal((await call(ctrl.signConsent, { params, body: registration({ baseConsentVersion: revision }) })).statusCode, 500);
+  const evidence = plain(ctrl.models.consents.snapshot()[0]); ctrl.models.students.updateExisting = update;
+  assert.equal((await call(ctrl.signConsent, { params, body: registration({ signerName: "Retry", baseConsentVersion: revision }) })).statusCode, 200);
+  assert.deepEqual(plain(ctrl.models.consents.snapshot()[0]), evidence); assert.ok(ctrl.models.students.snapshot()[0].consentAt);
+});
+
+test("failure to retain prior evidence prevents signature replacement", async () => {
+  const ctrl = loadController({ students: [{ tz: "1" }] }), params = { studentId: ctrl.models.students.snapshot()[0]._id };
+  await call(ctrl.signConsent, { params, body: registration() });
+  const previous = plain(ctrl.models.consents.snapshot()[0]), revision = (await call(ctrl.getConsent, { params })).body.consent.revision;
+  ctrl.models.consentHistory.create = async () => { throw new Error("archive unavailable"); };
+  assert.equal((await call(ctrl.signConsent, { params, body: registration({ signerName: "Replacement", baseConsentVersion: revision }) })).statusCode, 500);
+  assert.deepEqual(plain(ctrl.models.consents.snapshot()[0]), previous);
+});
```

## apps/system/src/Components/Student/ConsentFields.jsx

```jsx
import React, { useState } from "react";
import SignaturePad from "./SignaturePad";
import styles from "./RegistrationConsent.module.css";

// One signing surface for registration, staff-assisted signing and parent links.
export default function ConsentFields({ rules, value, onChange, nameId = "signer-name", disabled = false }) {
  const [drawing, setDrawing] = useState(!value.signature);
  const change = (patch) => { if (!disabled) onChange((previous) => ({ ...previous, ...patch })); };
  return <>
    <div className={styles.rules} dir="auto" tabIndex={0}>{rules.text}</div>
    <fieldset className={styles.fields} disabled={disabled}>
      <label className={styles.agreement}>
        <input type="checkbox" checked={value.accepted} onChange={(event) => change({ accepted: event.target.checked })} />
        <span>قرأت قوانين الجمعية وأوافق عليها</span>
      </label>
      <label htmlFor={nameId}>اسم ولي الأمر</label>
      <input id={nameId} name="signerName" maxLength={100} value={value.signerName} onChange={(event) => change({ signerName: event.target.value })} />
      <label>توقيع / ختم ولي الأمر</label>
      {!drawing && value.signature ? <div>
        <img className={styles.signature} src={value.signature} alt="توقيع/ختم ولي الأمر" />
        <button type="button" onClick={() => { change({ signature: "" }); setDrawing(true); }}>إعادة التوقيع/الختم</button>
      </div> : <SignaturePad onChange={(signature) => change({ signature })} />}
    </fieldset>
  </>;
}

```

## apps/system/src/Components/Student/ParentConsentPage.jsx

```jsx
import React, { useEffect, useState } from "react";
import { submitConsentLink, validateConsentLink } from "../../WebServer/services/inviteToken/functionInviteToken";
import ConsentFields from "./ConsentFields";
import Button from "../UI/Button";
import styles from "./RegistrationConsent.module.css";

// A scoped parent link opens only this signing page, without an account or form.
export default function ParentConsentPage() {
  const [token] = useState(() => window.location.hash.slice(1));
  const [state, setState] = useState({ loading: true });
  const [form, setForm] = useState({ accepted: false, signerName: "", signature: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    let alive = true;
    validateConsentLink(token).then((result) => { if (alive) setState({ ...result, loading: false }); });
    return () => { alive = false; };
  }, [token]);
  const submit = async () => {
    if (!form.accepted || !form.signerName.trim() || !form.signature) {
      setError("يجب الموافقة على قوانين الجمعية وكتابة اسم ولي الأمر والتوقيع قبل الإرسال."); return;
    }
    setBusy(true); setError("");
    const result = await submitConsentLink(token, { rulesVersion: state.rules.version, rulesAccepted: "true", signerName: form.signerName.trim(), signature: form.signature });
    setBusy(false);
    if (result.ok) { setSent(true); return; }
    setError(result.message);
    if (result.code === "RULES_CHANGED") {
      const fresh = await validateConsentLink(token);
      setState({ ...fresh, loading: false });
      setForm((previous) => ({ ...previous, accepted: false, signature: "" }));
    } else if (result.code === "LINK_CLOSED") setState({ ok: false, message: result.message });
  };
  return <main className={styles.page} dir="rtl">
    <h1>قوانين الجمعية</h1>
    {state.loading ? <p role="status">جارٍ التحميل…</p> : sent ? <p role="status">تم حفظ موافقتكم وتوقيعكم في ملف الطالب. شكرًا لكم.</p> : !state.ok ? <p role="alert">{state.message || "الرابط غير صالح. اطلب رابطًا جديدًا من الجمعية."}</p> : <>
      <p>للطالب: <strong dir="auto">{state.studentName}</strong></p>
      <ConsentFields key={state.rules.version} rules={state.rules} value={form} onChange={setForm} disabled={busy} />
      {error && <p role="alert">{error}</p>}
      <Button loading={busy} onClick={submit}>إرسال الموافقة والتوقيع</Button>
    </>}
  </main>;
}

```

## Final verification addendum

Full npm run verify passed: 1,497 server and 1,096 System tests (125 suites), plus build.
The route inventory now lists the two exact scoped public endpoints. Deletion
cleanup explicitly checks removal of current evidence, history and personal links.
These test-only follow-ups were added after Claude returned its quota; they
are attached for the pending review, not represented as reviewed by Claude.

```diff
diff --git a/server/test/photo-storage.test.js b/server/test/photo-storage.test.js
index 023fb87..7c381cf 100644
--- a/server/test/photo-storage.test.js
+++ b/server/test/photo-storage.test.js
@@ -109,7 +109,7 @@ function loadUserController(model, storage, audit = auditStub()) {
   });
 }

-function loadStudentController(model, storage, audit = auditStub()) {
+function loadStudentController(model, storage, audit = auditStub(), consentCleanup = []) {
   return runInVm(path.join(__dirname, "../Entities/Student/Student.controller.js"), {
     ...audit.deps,
     "./Student.model": { StudentModelDef: model },
@@ -119,6 +119,11 @@ function loadStudentController(model, storage, audit = auditStub()) {
     "../../utils/studentScope": require("../utils/studentScope"),
     "../../middleware/logger": { logWithSource() {} },
     "../UploadFile/file": storage,
+    "../InviteToken/Rules.model": {
+      ConsentModelDef: { delete: async (filter) => consentCleanup.push(["current", filter]) },
+      ConsentHistoryModelDef: { delete: async (filter) => consentCleanup.push(["history", filter]) },
+    },
+    "../InviteToken/InviteToken.model": { InviteTokenModelDef: { delete: async (filter) => consentCleanup.push(["links", filter]) } },
     "../Notification/Notification.controller": {},
     ...require("./helpers/alertEventsStub").noopAlertDeps,
   });
@@ -281,7 +286,8 @@ test("deleting a student also deletes their photo from Drive", async () => {
     events,
     { dbName: "tamheed_db", collections: { active: "Students" } }
   );
-  const { deleteS } = loadStudentController(model, createDriveStorage(events, null));
+  const cleanup = [];
+  const { deleteS } = loadStudentController(model, createDriveStorage(events, null), auditStub(), cleanup);
   const res = createRes();
   const { forgotten } = require("./helpers/alertEventsStub");
   forgotten.length = 0;
@@ -297,6 +303,11 @@ test("deleting a student also deletes their photo from Drive", async () => {
     ["drive-delete", OLD_PHOTO],
   ]);
   assert.equal(model.snapshot().length, 0);
+  assert.deepEqual(JSON.parse(JSON.stringify(cleanup)), [
+    ["current", { studentId: "student-1" }],
+    ["history", { studentId: "student-1" }],
+    ["links", { purpose: "student-consent", studentId: "student-1" }],
+  ]);
 });

 test("student create, edit, photo and delete are recorded in the audit log", async () => {
diff --git a/server/test/route-guards.test.js b/server/test/route-guards.test.js
index e89df1d..d1af6bf 100644
--- a/server/test/route-guards.test.js
+++ b/server/test/route-guards.test.js
@@ -47,6 +47,9 @@ const PUBLIC_ROUTES = {
   "InviteToken/InviteToken.route.js": [
     "GET /validate/:token",
     "POST /submit/:token",
+    // Scoped expiring parent capabilities, checked in the controller.
+    "POST /consent-link/validate",
+    "POST /consent-link/submit",
   ],
   "Storage/Storage.route.js": [
     "GET /open-signed", // signed, time-limited link
```
