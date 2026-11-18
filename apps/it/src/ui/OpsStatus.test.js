import OpsStatus from "./OpsStatus.jsx";
import * as api from "../api";
import { mount, unmountAll, ok, fail } from "../testUtils";

jest.mock("../api", () => ({ ...jest.requireActual("../api"), getOpsStatus: jest.fn() }));
afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

const CHECKS = [
  { id: "backup", label: "النسخ الاحتياطي الليلي", state: "ok", ok: true, at: "2026-11-16T00:30:00Z", message: "tamheed-x (1M)" },
  { id: "offsite", label: "نسخة على Google Drive", state: "failed", ok: false, at: "2026-11-16T00:31:00Z", message: "no key" },
  { id: "restore", label: "فحص الاسترجاع الأسبوعي", state: "missing", ok: false, at: null, message: "" },
];

// Owner, 2026-11-16: a failed backup or a full disk shows on the IT site.
test("the banner lists only what needs attention", async () => {
  api.getOpsStatus.mockImplementation(() => ok({ checks: CHECKS }));
  const c = await mount(<OpsStatus banner />);
  const banner = c.querySelector("[role=alert]");
  expect(banner.textContent).toContain("نسخة على Google Drive: فشل (no key)");
  expect(banner.textContent).toContain("فحص الاسترجاع الأسبوعي: لم يعمل بعد");
  expect(banner.textContent).not.toContain("النسخ الاحتياطي الليلي");
});

test("no banner when every check is fine, or when the status cannot be read", async () => {
  api.getOpsStatus.mockImplementation(() => ok({ checks: [CHECKS[0]] }));
  const c = await mount(<OpsStatus banner />);
  expect(c.querySelector("[role=alert]")).toBeNull();
  api.getOpsStatus.mockImplementation(() => fail(500));
  const d = await mount(<OpsStatus banner />);
  expect(d.textContent).toBe("");
});

test("the full card lists every check with its state", async () => {
  api.getOpsStatus.mockImplementation(() => ok({ checks: CHECKS }));
  const c = await mount(<OpsStatus />);
  expect(c.textContent).toContain("حالة الخادم");
  expect(c.querySelectorAll(".ops-list li")).toHaveLength(3);
  expect(c.textContent).toContain("سليم");
  expect(c.textContent).toContain("tamheed-x (1M)");
});
