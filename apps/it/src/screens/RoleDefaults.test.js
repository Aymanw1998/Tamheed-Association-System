import RoleDefaults from "./RoleDefaults.jsx";
import * as api from "../api";
import { mount, unmountAll, ok, fail, button, click, flush, toastText } from "../testUtils";

jest.mock("../api", () => ({
  ...jest.requireActual("../api"),
  getRoleDefaults: jest.fn(),
  saveRoleDefaults: jest.fn(),
  resetRoleDefaults: jest.fn(),
}));

const role = (name, defaults, extra = {}) => ({
  role: name, defaults, original: defaults, custom: false, updatedAt: null, updatedBy: null, users: 4, ...extra,
});
const DATA = {
  roles: [
    role("ادارة", ["students.view", "students.edit", "lessons.view"]),
    role("مرشد", ["students.view", "lessons.view"]),
    role("مساعد", ["students.view"], { custom: true, original: ["students.view", "lessons.view"], updatedAt: "2026-11-03T10:00:00Z", updatedBy: "رامي" }),
  ],
  grantable: ["students.view", "students.edit", "lessons.view", "lessons.edit"],
};

beforeEach(() => { api.getRoleDefaults.mockImplementation(() => ok(DATA)); });
afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

const moduleBox = (c, module) => c.querySelector(`[data-module="${module}"] input[type=checkbox]`);
const openModule = (c, module) => click(c.querySelector(`[data-module="${module}"] button[aria-expanded]`));

test("RoleDefaults includes weekly tasks from the shared catalog and keeps IT keys out", async () => {
  api.getRoleDefaults.mockImplementation(() => ok({ ...DATA, grantable: [...DATA.grantable, "tasks.manage"] }));
  const c = await mount(<RoleDefaults />);
  expect(c.querySelector('[data-module="tasks"]')).not.toBeNull();
  expect(c.querySelector('[data-module="permissions"]')).toBeNull();
  await openModule(c, "tasks");
  expect(c.textContent).toContain("فتح صفحة تحديث المهمات");
  await click(c.querySelector('input[name="tasks.manage"]'));
  await click(button(c, "حفظ"));
  expect(c.querySelector('[role="dialog"]').textContent).toContain("المهمات الأسبوعية: فتح صفحة تحديث المهمات");
});

test("RoleDefaults: three roles; only keys that may be defaults are shown", async () => {
  const c = await mount(<RoleDefaults />);
  expect(button(c, "الإدارة")).toBeDefined();
  expect(c.querySelectorAll("[role=tab]").length).toBe(3);
  expect(c.querySelector('[data-module="students"]')).not.toBeNull();
  expect(c.querySelector('[data-module="audit"]')).toBeNull();
  expect(c.querySelector('[data-module="sports"]')).toBeNull();
  expect(moduleBox(c, "lessons").indeterminate).toBe(true);
});

test("RoleDefaults: a change is saved after the confirm, with what was added", async () => {
  api.saveRoleDefaults.mockImplementation((r, keys) => ok({ role: role(r, keys, { custom: true }) }));
  const c = await mount(<RoleDefaults />);
  const tab = [...c.querySelectorAll("[role=tab]")].find((el) => el.textContent.includes("مرشد") && !el.textContent.includes("مساعد"));
  await click(tab);
  expect(button(c, "حفظ").disabled).toBe(true);
  await openModule(c, "lessons");
  await click(c.querySelector('input[name="lessons.edit"]'));
  expect(c.textContent).toContain("ممنوح");
  await click(button(c, "حفظ"));
  const dialog = c.querySelector("[role=dialog]");
  expect(dialog.textContent).toContain("4 مستخدمين");
  expect(dialog.textContent).toContain("البرنامج");
  await click(button(dialog, "حفظ"));
  await flush();
  expect(api.saveRoleDefaults).toHaveBeenCalledWith("مرشد", ["students.view", "lessons.view", "lessons.edit"]);
  expect(toastText()).toContain("تم حفظ صلاحيات الدور");
});

test("RoleDefaults: a changed role goes back to the original; a refusal is a toast", async () => {
  api.resetRoleDefaults.mockImplementation(() => fail(400, { code: "UNKNOWN_ROLE" }));
  const c = await mount(<RoleDefaults />);
  await click([...c.querySelectorAll("[role=tab]")].find((el) => el.textContent.includes("مساعد")));
  expect(c.textContent).toContain("رامي");
  await click(button(c, "الرجوع إلى الأصل"));
  await click(button(c.querySelector("[role=dialog]"), "تأكيد"));
  await flush();
  expect(api.resetRoleDefaults).toHaveBeenCalledWith("مساعد");
  expect(toastText()).toContain("دور غير معروف");
});
