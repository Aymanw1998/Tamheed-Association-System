import Settings from "./Settings.jsx";
import * as api from "../api";
import { mount, unmountAll, ok, fail, button, click, type, submit } from "../testUtils";

jest.mock("../api", () => ({
  ...jest.requireActual("../api"),
  getPushSettings: jest.fn(),
  setPushEnabled: jest.fn(),
  forceReleaseLock: jest.fn(),
  recoverSystem: jest.fn(),
}));

beforeEach(() => { api.getPushSettings.mockImplementation(() => ok({ enabled: true, keysFrom: "env" })); });
afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

test("Settings: push notifications on/off", async () => {
  api.setPushEnabled.mockImplementation(() => ok({ enabled: false, keysFrom: "env" }));
  const c = await mount(<Settings />);
  const box = c.querySelector('input[name="push"]');
  expect(box.checked).toBe(true);
  await click(box);
  expect(api.setPushEnabled).toHaveBeenCalledWith(false);
  expect(c.querySelector('input[name="push"]').checked).toBe(false);
});

test("Settings: force-release a stuck lock", async () => {
  api.forceReleaseLock.mockImplementation(() => ok());
  const c = await mount(<Settings />);
  await type(c.querySelector('input[name="lockKey"]'), "student:123");
  await submit(c.querySelector('form[data-form="lock"]'));
  expect(api.forceReleaseLock).toHaveBeenCalledWith("student:123");
  expect(c.textContent).toContain("تم تحرير القفل");
});

test("Settings: a bad lock key shows an Arabic message", async () => {
  api.forceReleaseLock.mockImplementation(() => fail(400, { code: "BAD_KEY" }));
  const c = await mount(<Settings />);
  await type(c.querySelector('input[name="lockKey"]'), "x");
  await submit(c.querySelector('form[data-form="lock"]'));
  expect(c.querySelector("[role=alert]").textContent).toContain("مفتاح القفل غير صالح");
});

test("Settings: system recovery asks first", async () => {
  api.recoverSystem.mockImplementation(() => ok());
  const c = await mount(<Settings />);
  await click(button(c, "استعادة حساب النظام"));
  expect(api.recoverSystem).not.toHaveBeenCalled();
  await click(button(c.querySelector("[role=dialog]"), "تأكيد"));
  expect(api.recoverSystem).toHaveBeenCalledTimes(1);
  expect(c.textContent).toContain("تم إرسال كلمة مرور مؤقتة");
});
