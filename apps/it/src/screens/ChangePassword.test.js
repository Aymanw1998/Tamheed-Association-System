import ChangePassword from "./ChangePassword.jsx";
import * as api from "../api";
import { mount, unmountAll, ok, fail, button, click, type, submit, toastText } from "../testUtils";

jest.mock("../api", () => ({ ...jest.requireActual("../api"), changeOwnPassword: jest.fn() }));

afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

const field = (c, name) => c.querySelector(`input[name="${name}"]`);

test("ChangePassword: an empty or mismatched password is stopped here; any other is saved", async () => {
  api.changeOwnPassword.mockImplementation(() => ok());
  const onDone = jest.fn();
  const c = await mount(<ChangePassword onDone={onDone} onSignOut={jest.fn()} />);
  await submit(c.querySelector("form"));
  expect(c.querySelector("[role=alert]").textContent).toContain("يجب إدخال");
  await type(field(c, "newPassword"), "a-long-enough-one");
  await type(field(c, "confirmPassword"), "a-long-enough-two");
  await submit(c.querySelector("form"));
  expect(c.querySelector("[role=alert]").textContent).toContain("غير متطابقتين");
  expect(api.changeOwnPassword).not.toHaveBeenCalled();

  await type(field(c, "newPassword"), "1");
  await type(field(c, "confirmPassword"), "1");
  await submit(c.querySelector("form"));
  expect(api.changeOwnPassword).toHaveBeenCalledWith("1");
  expect(toastText()).toContain("تم تغيير كلمة المرور");
  expect(onDone).toHaveBeenCalledTimes(1);
});

test("ChangePassword: the server's refusal is shown; sign-out stays available", async () => {
  api.changeOwnPassword.mockImplementation(() => fail(400, { code: "PASSWORD_TOO_LONG" }));
  const onSignOut = jest.fn();
  const c = await mount(<ChangePassword onDone={jest.fn()} onSignOut={onSignOut} />);
  await type(field(c, "newPassword"), "a-long-enough-one");
  await type(field(c, "confirmPassword"), "a-long-enough-one");
  await submit(c.querySelector("form"));
  expect(c.querySelector("[role=alert]").textContent).toContain("طويلة");
  await click(button(c, "تسجيل الخروج"));
  expect(onSignOut).toHaveBeenCalled();
});
