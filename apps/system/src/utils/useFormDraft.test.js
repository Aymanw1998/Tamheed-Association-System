import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import useFormDraft, { DRAFT_TTL_MS } from "./useFormDraft";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const FIELDS = ["info"];
let host, root, api;

function Form({ storageKey, baseline }) {
  const [form, setForm] = useState(baseline);
  const draft = useFormDraft({ key: storageKey, form, baseline, fields: FIELDS, setForm });
  api = { form, setForm, draft };
  return null;
}
const mount = async (props) => { await act(async () => root.render(<Form {...props} />)); };
const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

beforeEach(() => { localStorage.clear(); host = document.createElement("div"); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); });

test("typed text is kept after a short pause and dropped again when it matches the record", async () => {
  const baseline = { info: "", id: 1 };
  await mount({ storageKey: "draft:u:report:new", baseline });
  await act(async () => api.setForm((f) => ({ ...f, info: "نص جديد" })));
  await wait(700);
  expect(JSON.parse(localStorage.getItem("draft:u:report:new")).data).toEqual({ info: "نص جديد" });
  await act(async () => api.setForm((f) => ({ ...f, info: "" })));
  await wait(700);
  expect(localStorage.getItem("draft:u:report:new")).toBeNull();
});

test("a stored draft is offered, never applied silently, and restore applies only its fields", async () => {
  localStorage.setItem("draft:u:report:7", JSON.stringify({ at: Date.now(), data: { info: "مسودة" } }));
  const baseline = { info: "محفوظ", version: 3 };
  await mount({ storageKey: "draft:u:report:7", baseline });
  expect(api.form.info).toBe("محفوظ");
  expect(api.draft.pending.data).toEqual({ info: "مسودة" });
  await act(async () => api.draft.restore());
  expect(api.form).toEqual({ info: "مسودة", version: 3 });
  expect(api.draft.pending).toBeNull();
});

test("discard removes the draft; clear after a save removes it too", async () => {
  localStorage.setItem("draft:u:report:8", JSON.stringify({ at: Date.now(), data: { info: "x" } }));
  await mount({ storageKey: "draft:u:report:8", baseline: { info: "" } });
  await act(async () => api.draft.discard());
  expect(localStorage.getItem("draft:u:report:8")).toBeNull();
  await act(async () => api.setForm({ info: "y" }));
  await act(async () => api.draft.clear());
  await wait(700);
  expect(localStorage.getItem("draft:u:report:8")).toBeNull();
});

test("an expired draft or a read-only form (no key) keeps nothing", async () => {
  localStorage.setItem("draft:u:report:9", JSON.stringify({ at: Date.now() - DRAFT_TTL_MS - 1000, data: { info: "old" } }));
  await mount({ storageKey: "draft:u:report:9", baseline: { info: "" } });
  expect(api.draft.pending).toBeNull();
  expect(localStorage.getItem("draft:u:report:9")).toBeNull();
  await act(async () => root.unmount());
  root = createRoot(host);
  await mount({ storageKey: null, baseline: { info: "" } });
  await act(async () => api.setForm({ info: "typed" }));
  await wait(700);
  expect(Object.keys(localStorage).filter((k) => k.startsWith("draft:"))).toEqual([]);
});
