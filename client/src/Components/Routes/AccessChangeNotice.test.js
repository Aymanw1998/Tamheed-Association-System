import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";

jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});

import { rememberSessionUser } from "../../utils/session";
import { setUnsavedChanges } from "../../utils/unsavedChanges";
import { I18nProvider } from "../../i18n/I18nContext";
import useAccessUpdates from "./AccessChangeNotice";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Owner, 2026-11-02: when the admin takes a permission away, the page says so
// («ألغت الإدارة صلاحياتك: …»). The page redraws at once, unless it holds
// unsaved edits: then it waits until they are saved or left, or the user
// asks to update now.
let mounts = 0;
let goTo;
function Page() {
  const [typed] = useState(() => { mounts += 1; return "draft"; });
  goTo = useNavigate();
  return <p data-testid="page">{typed}</p>;
}
function Layout() {
  const { applied, notice } = useAccessUpdates();
  return <>{notice}<Page key={applied} /></>;
}
let host, root;
const banner = () => host.querySelector('[data-testid="access-notice"]');
const button = (label) => [...host.querySelectorAll("button")].find((b) => b.textContent === label);

beforeEach(async () => {
  localStorage.clear();
  setUnsavedChanges(null);
  mounts = 0;
  rememberSessionUser({ _id: "me", roles: ["مرشد"], permissions: ["students.view", "students.edit", "lessons.view"] });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<I18nProvider><MemoryRouter initialEntries={["/a"]}><Routes>
    <Route path="*" element={<Layout />} />
  </Routes></MemoryRouter></I18nProvider>));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); setUnsavedChanges(null); });

// Owner, 2026-11-03: one general message, without listing what changed.
test("a changed permission shows a general message, and the page redraws at once", async () => {
  await act(async () => rememberSessionUser({ _id: "me", roles: ["مرشد"], permissions: ["students.view", "lessons.view"] }));
  expect(banner().textContent).toContain("عدّلت الإدارة صلاحياتك");
  expect(banner().textContent).not.toContain("الطلاب");
  expect(mounts).toBe(2);
});

test("an added permission shows the same message", async () => {
  await act(async () => rememberSessionUser({ _id: "me", roles: ["مرشد"], permissions: ["students.view", "students.edit", "lessons.view", "reports.create"] }));
  expect(banner().textContent).toContain("عدّلت الإدارة صلاحياتك");
  expect(banner().textContent).not.toContain("التقارير");
});

test("with unsaved edits the page waits; «حدّث الآن» redraws it", async () => {
  setUnsavedChanges(true);
  await act(async () => rememberSessionUser({ _id: "me", roles: ["مرشد"], permissions: ["lessons.view"] }));
  expect(banner().textContent).toContain("بعد أن تحفظ");
  expect(mounts).toBe(1);
  await act(async () => button("حدّث الآن").click());
  expect(mounts).toBe(2);
});

test("with unsaved edits, leaving the page (after saving or not) applies the change", async () => {
  setUnsavedChanges(true);
  await act(async () => rememberSessionUser({ _id: "me", roles: ["مرشد"], permissions: ["lessons.view"] }));
  expect(mounts).toBe(1);
  setUnsavedChanges(null);
  await act(async () => goTo("/b"));
  expect(mounts).toBe(2);
});

test("the notice can be closed", async () => {
  await act(async () => rememberSessionUser({ _id: "me", roles: ["مرشد"], permissions: ["lessons.view"] }));
  await act(async () => button("إغلاق").click());
  expect(banner()).toBeNull();
});

test("the same permissions again show nothing", async () => {
  await act(async () => rememberSessionUser({ _id: "me", roles: ["مرشد"], permissions: ["students.view", "students.edit", "lessons.view"] }));
  expect(banner()).toBeNull();
  expect(mounts).toBe(1);
});
