import Audit from "./Audit.jsx";
import * as api from "../api";
import { mount, unmountAll, ok, button, click, type, submit } from "../testUtils";

jest.mock("../api", () => ({ ...jest.requireActual("../api"), getAudit: jest.fn(), archiveAudit: jest.fn() }));

const ITEMS = [
  { _id: "a1", at: "2026-11-02T10:00:00Z", actor: "100000001", actorName: "سامر الأول", module: "users", action: "role_change", targetType: "user", targetId: "100000002", targetLabel: "ليلى الثانية", changes: { role: { before: "مساعد", after: "مرشد" } } },
  { _id: "a2", at: "2026-11-02T09:00:00Z", actor: "system", actorName: "النظام", module: "it", action: "sign_in", targetType: "user", targetId: "system", targetLabel: "", changes: null },
];

beforeEach(() => { api.getAudit.mockImplementation(() => ok({ items: ITEMS, total: 120 })); });
afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

test("Audit renders its data", async () => {
  const c = await mount(<Audit />);
  expect(api.getAudit).toHaveBeenCalledWith({ status: "active" }, 1);
  expect(c.querySelectorAll("tbody tr")).toHaveLength(2);
  expect(c.textContent).toContain("سامر الأول");
  expect(c.textContent).toContain("تغيير دور");
  expect(c.textContent).toContain("ليلى الثانية");
  // The system account shows only as «النظام».
  expect(c.textContent).toContain("النظام");
  expect(c.textContent).toContain("المجموع: 120");
  expect(c.textContent).toContain("صفحة 1 من 3");
  // The changed field, before and after.
  expect(c.textContent).toContain("مساعد");
});

test("Audit: filters apply from the «فلتر» window and paging asks the server", async () => {
  const c = await mount(<Audit />);
  await click(button(c, "فلتر"));
  const dialog = c.querySelector("[role=dialog]");
  await type(dialog.querySelector('select[name="module"]'), "users");
  await type(dialog.querySelector('input[name="q"]'), "ليلى");
  await submit(dialog);
  expect(api.getAudit).toHaveBeenLastCalledWith({ module: "users", q: "ليلى", status: "active" }, 1);

  await click(button(c, "التالي"));
  expect(api.getAudit).toHaveBeenLastCalledWith({ module: "users", q: "ليلى", status: "active" }, 2);
});

test("the real person behind «النظام» shows only here", async () => {
  api.getAudit.mockImplementation(() => ok({ items: [{ ...ITEMS[1], realActor: "100000009", realActorName: "اسم حقيقي" }], total: 1 }));
  const c = await mount(<Audit />);
  expect(c.textContent).toContain("النظام (اسم حقيقي)");
});

test("archive permission allows recoverable selection, and archived view restores it", async () => {
  api.archiveAudit.mockImplementation(() => ok());
  const c = await mount(<Audit me={{ permissions: ["audit.view", "audit.archive"] }} />);
  await click(button(c, "تحديد الصفحة")); await click(button(c, "أرشفة المحدد (2)"));
  await click(button(document.body.querySelector('[role="dialog"]'), "تأكيد"));
  expect(api.archiveAudit).toHaveBeenLastCalledWith(["a1", "a2"], true);
  await click(button(c, "الأرشيف")); expect(api.getAudit).toHaveBeenLastCalledWith({ status: "archived" }, 1);
  await click(button(c, "تحديد الصفحة")); await click(button(c, "استعادة المحدد (2)"));
  await click(button(document.body.querySelector('[role="dialog"]'), "تأكيد"));
  expect(api.archiveAudit).toHaveBeenLastCalledWith(["a1", "a2"], false);
});
test("view-only audit access has no selection or archive action", async () => {
  const c = await mount(<Audit me={{ permissions: ["audit.view"] }} />);
  expect(c.querySelector('input[type="checkbox"]')).toBeNull(); expect(button(c, "تحديد الصفحة")).toBeUndefined();
});
