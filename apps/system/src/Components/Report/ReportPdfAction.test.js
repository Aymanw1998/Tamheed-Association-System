import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ReportPdfAction from "./ReportPdfAction";
import api from "../../WebServer/services/api";
import { canStored } from "../../utils/session";
jest.mock("../../WebServer/services/api", () => ({ get: jest.fn(), post: jest.fn(), delete: jest.fn() }));
jest.mock("../../utils/session", () => ({ canStored: jest.fn(), getStoredUserId: () => "synthetic-user" }));
global.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
const report = { _id: "a".repeat(24) };
const job = (state) => ({ id: "b".repeat(48), state, expiresAt: Date.now() + 600000 });
const mount = async () => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); await act(async () => root.render(<ReportPdfAction report={report} />)); };
const click = async (text) => act(async () => [...host.querySelectorAll("button")].find((b) => b.textContent === text).click());
beforeEach(() => { sessionStorage.clear(); canStored.mockReturnValue(true); api.post.mockResolvedValue({ data: { job: job("queued") } }); api.get.mockResolvedValue({ data: { job: job("ready") } }); api.delete.mockResolvedValue({}); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); jest.clearAllMocks(); });

test("server generation becomes downloadable and resumes after navigating back without another POST", async () => {
  await mount(); await click("ملف التقرير");
  expect(host.textContent).toContain("تنزيل PDF");
  expect(api.post).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount()); host.remove(); await mount();
  expect(host.textContent).toContain("تنزيل PDF"); expect(api.post).toHaveBeenCalledTimes(1);
});
test("cancel ignores an in-flight late status response", async () => {
  let finish; api.get.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await mount(); await click("ملف التقرير"); await click("إلغاء");
  await act(async () => finish({ data: { job: job("ready") } }));
  expect(host.textContent).toContain("ملف التقرير"); expect(host.textContent).not.toContain("تنزيل PDF");
  expect(api.delete).toHaveBeenCalledTimes(1); expect(sessionStorage.length).toBe(0);
});
test("revoked export permission never resumes a retained job or exposes its controls", async () => {
  sessionStorage.setItem(`report.pdf:synthetic-user:${report._id}`, JSON.stringify(job("ready"))); canStored.mockReturnValue(false);
  await mount(); expect(host.textContent).toBe(""); expect(api.get).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled();
});
test("ready PDF downloads the authenticated blob instead of rendering the report in the page", async () => {
  await mount(); await click("ملف التقرير");
  const blob = new Blob(["%PDF-synthetic"], { type: "application/pdf" });
  api.get.mockResolvedValue({ data: blob });
  const old = URL.createObjectURL; URL.createObjectURL = jest.fn(() => "blob:synthetic");
  const anchorClick = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  try {
    await click("تنزيل PDF");
    expect(api.get).toHaveBeenLastCalledWith(expect.stringMatching(/\/pdf\/jobs\/.+\/file$/), { responseType: "blob" });
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob); expect(anchorClick).toHaveBeenCalledTimes(1);
  } finally { URL.createObjectURL = old; anchorClick.mockRestore(); }
});
