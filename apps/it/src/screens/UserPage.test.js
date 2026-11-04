import UserPage from "./UserPage.jsx";
import * as api from "../api";
import * as router from "../router.jsx";
import { mount, unmountAll, ok, fail, button, click, type, flush, toastText, submit } from "../testUtils";

jest.mock("../api", () => ({
  ...jest.requireActual("../api"),
  getUser: jest.fn(),
  setRole: jest.fn(),
  getPermissions: jest.fn(),
  savePermissions: jest.fn(),
  getPassword: jest.fn(),
  resetPassword: jest.fn(),
  unlockUser: jest.fn(),
  getSessions: jest.fn(),
  endSession: jest.fn(),
  moveUser: jest.fn(),
  deleteUser: jest.fn(),
  setRequestAlerts: jest.fn(),
}));

jest.mock("../router.jsx", () => ({ ...jest.requireActual("../router.jsx"), navigate: jest.fn() }));

const TZ = "100000002";
const USER = { tz: TZ, firstname: "ليلى", lastname: "الثانية", role: "مرشد", photo: null, lockedAt: "2026-11-01T10:00:00Z" };

beforeEach(() => {
  api.getUser.mockImplementation(() => ok({ user: USER, room: "active" }));
  api.getPermissions.mockImplementation(() => ok({
    role: "مرشد", grants: [], revokes: [], defaults: ["students.view", "students.create"],
    effective: ["students.view", "students.create"], grantable: ["students.view", "students.create", "students.edit"],
    updatedAt: null, updatedBy: null,
  }));
  api.getSessions.mockImplementation(() => ok({ devices: [{ sid: "s1", label: "Chrome على ويندوز", startedAt: "2026-11-01T08:00:00Z", lastSeenAt: "2026-11-02T08:00:00Z", current: false }] }));
  api.getPassword.mockImplementation(() => ok({ hasPassword: true }));
});
afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

test("UserPage: role, permissions, reset/view password, unlock, devices", async () => {
  api.setRole.mockImplementation(() => ok({ role: "ادارة", demoted: false }));
  api.resetPassword.mockImplementation(() => ok());
  api.unlockUser.mockImplementation(() => ok());
  api.endSession.mockImplementation(() => ok());
  const c = await mount(<UserPage tz={TZ} />);

  // Name and current role.
  expect(c.textContent).toContain("ليلى الثانية");
  const roleSelect = c.querySelector('select[name="role"]');
  expect(roleSelect.value).toBe("مرشد");

  // Change the role.
  await type(roleSelect, "ادارة");
  await click(button(c, "حفظ الدور"));
  expect(api.setRole).toHaveBeenCalledWith(TZ, "ادارة");

  // The permissions editor is here (one row per module, the user's effective keys).
  expect(api.getPermissions).toHaveBeenCalledWith(TZ);
  expect(c.textContent).toContain("الطلاب");

  // View password: only whether there is one, never the value.
  await click(button(c, "عرض كلمة المرور"));
  expect(api.getPassword).toHaveBeenCalledWith(TZ);
  expect(c.textContent).toContain("يوجد كلمة مرور");

  // Reset the password: two fields that must match (owner, 2026-11-03).
  await type(c.querySelector('input[name="newPassword"]'), "a-new-test-password");
  await type(c.querySelector('input[name="confirmPassword"]'), "another");
  await submit(c.querySelector(".password-form"));
  expect(api.resetPassword).not.toHaveBeenCalled();
  expect(toastText()).toContain("غير متطابقتين");
  await type(c.querySelector('input[name="confirmPassword"]'), "a-new-test-password");
  await submit(c.querySelector(".password-form"));
  expect(api.resetPassword).toHaveBeenCalledWith(TZ, "a-new-test-password");
  expect(c.querySelector('input[name="newPassword"]').value).toBe("");

  // Unlock (the account is locked).
  expect(c.textContent).toContain("الحساب مقفل");
  await click(button(c, "رفع الحظر"));
  expect(api.unlockUser).toHaveBeenCalledWith(TZ);

  // Signed-in devices, and ending one.
  expect(api.getSessions).toHaveBeenCalledWith(TZ);
  expect(c.textContent).toContain("Chrome على ويندوز");
  await click(button(c, "إنهاء الجلسة"));
  expect(api.endSession).toHaveBeenCalledWith(TZ, "s1");
});

test("UserPage: no password on file", async () => {
  api.getPassword.mockImplementation(() => ok({ hasPassword: false }));
  const c = await mount(<UserPage tz={TZ} />);
  await click(button(c, "عرض كلمة المرور"));
  expect(c.textContent).toContain("لا توجد كلمة مرور");
});

test("UserPage: an unlocked account has no unlock button", async () => {
  api.getUser.mockImplementation(() => ok({ user: { ...USER, lockedAt: null }, room: "active" }));
  const c = await mount(<UserPage tz={TZ} />);
  expect(button(c, "رفع الحظر")).toBeUndefined();
});

test("UserPage: a refusal shows the server's text, the page stays", async () => {
  api.setRole.mockImplementation(() => fail(403, { code: "FORBIDDEN", message: "غير مسموح." }));
  const c = await mount(<UserPage tz={TZ} />);
  await type(c.querySelector('select[name="role"]'), "ادارة");
  await click(button(c, "حفظ الدور"));
  await flush();
  expect(toastText()).toContain("غير مسموح.");
});

test("UserPage: a user that is not found", async () => {
  api.getUser.mockImplementation(() => fail(404, { code: "NOT_FOUND" }));
  const c = await mount(<UserPage tz={TZ} />);
  expect(c.textContent).toContain("المستخدم غير موجود");
});

test("UserPage: disabling asks first, then moves the account to noActive", async () => {
  api.moveUser.mockImplementation(() => ok());
  const c = await mount(<UserPage tz={TZ} />);
  await click(button(c, "تعطيل الحساب"));
  expect(api.moveUser).not.toHaveBeenCalled();
  await click(button(c.querySelector("[role=dialog]"), "تأكيد"));
  await flush();
  expect(api.moveUser).toHaveBeenCalledWith(TZ, "active", "noActive");
  expect(toastText()).toContain("تم تعطيل الحساب");
});

test("UserPage: a disabled account is enabled again; a waiting one is approved with the chosen role", async () => {
  api.moveUser.mockImplementation(() => ok());
  api.getUser.mockImplementation(() => ok({ user: USER, room: "noActive" }));
  let c = await mount(<UserPage tz={TZ} />);
  await click(button(c, "تفعيل الحساب"));
  await flush();
  expect(api.moveUser).toHaveBeenLastCalledWith(TZ, "noActive", "active", undefined);
  await unmountAll();

  api.getUser.mockImplementation(() => ok({ user: { ...USER, role: null, roles: [] }, room: "waiting" }));
  c = await mount(<UserPage tz={TZ} />);
  await click(button(c, "قبول المستخدم"));
  expect(toastText()).toContain("اختر دورًا أولًا");
  await type(c.querySelector('select[name="role"]'), "مساعد");
  await click(button(c, "قبول المستخدم"));
  await flush();
  expect(api.moveUser).toHaveBeenLastCalledWith(TZ, "waiting", "active", "مساعد");
});

test("UserPage: deleting asks first, then goes back to the list", async () => {
  api.deleteUser.mockImplementation(() => ok());
  const c = await mount(<UserPage tz={TZ} />);
  await click(button(c, "حذف المستخدم"));
  expect(c.querySelector("[role=dialog]").textContent).toContain("نهائيًا");
  await click(button(c.querySelector("[role=dialog]"), "تأكيد"));
  await flush();
  expect(api.deleteUser).toHaveBeenCalledWith(TZ, "active");
  expect(router.navigate).toHaveBeenCalledWith("/");
  expect(toastText()).toContain("تم حذف المستخدم");
});

test("UserPage: marks who hears about new requests", async () => {
  api.setRequestAlerts.mockImplementation(() => ok({ enabled: true }));
  const c = await mount(<UserPage tz={TZ} />);
  const box = c.querySelector('input[name="requestAlerts"]');
  expect(box.checked).toBe(false);
  api.getUser.mockImplementation(() => ok({ user: { ...USER, receivesRequestAlerts: true }, room: "active" }));
  await click(box);
  await flush();
  expect(api.setRequestAlerts).toHaveBeenCalledWith(TZ, true);
  expect(c.querySelector('input[name="requestAlerts"]').checked).toBe(true);
});
