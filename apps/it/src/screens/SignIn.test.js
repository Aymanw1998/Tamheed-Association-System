import SignIn from "./SignIn.jsx";
import * as api from "../api";
import { mount, unmountAll, ok, fail, button, click, type, submit } from "../testUtils";

jest.mock("../api", () => ({
  ...jest.requireActual("../api"),
  login: jest.fn(),
  loginPass: jest.fn(),
  verify: jest.fn(),
}));

afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

const TZ = "100000001";
const field = (c, name) => c.querySelector(`input[name="${name}"]`);

test("SignIn: password step then code step", async () => {
  api.login.mockImplementation(() => ok({ message: "إن كانت البيانات صحيحة أُرسل رمز إلى بريدك." }));
  api.verify.mockImplementation(() => ok());
  const onSignedIn = jest.fn();
  const c = await mount(<SignIn onSignedIn={onSignedIn} />);

  // Step 1: ID number and password only.
  expect(field(c, "tz")).not.toBeNull();
  expect(field(c, "password").type).toBe("password");
  expect(field(c, "code")).toBeNull();

  await type(field(c, "tz"), TZ);
  await type(field(c, "password"), "not-a-real-password");
  await submit(c.querySelector("form"));
  expect(api.login).toHaveBeenCalledWith(TZ, "not-a-real-password");

  // Step 2: the email code; the password field is gone.
  expect(field(c, "code")).not.toBeNull();
  expect(field(c, "password")).toBeNull();
  expect(c.textContent).toContain("أُرسل رمز إلى بريدك");

  await type(field(c, "code"), "123456");
  await submit(c.querySelector("form"));
  expect(api.verify).toHaveBeenCalledWith(TZ, "123456");
  expect(onSignedIn).toHaveBeenCalledTimes(1);
});

test("SignIn: a wrong code shows the server's message and stays on the code step", async () => {
  api.login.mockImplementation(() => ok({ message: "تم." }));
  api.verify.mockImplementation(() => fail(400, { message: "الرمز غير صحيح." }));
  const onSignedIn = jest.fn();
  const c = await mount(<SignIn onSignedIn={onSignedIn} />);
  await type(field(c, "tz"), TZ);
  await type(field(c, "password"), "x");
  await submit(c.querySelector("form"));
  await type(field(c, "code"), "000000");
  await submit(c.querySelector("form"));
  expect(c.textContent).toContain("الرمز غير صحيح.");
  expect(onSignedIn).not.toHaveBeenCalled();
  // «رجوع» returns to the password step.
  await click(button(c, "رجوع"));
  expect(field(c, "password")).not.toBeNull();
});

test("SignIn: a pass from the other site skips the password step and asks for the code", async () => {
  api.loginPass.mockImplementation(() => ok({ message: "تم.", tz: TZ }));
  api.verify.mockImplementation(() => ok());
  const onSignedIn = jest.fn();
  const c = await mount(<SignIn pass="one-time-pass_1" onSignedIn={onSignedIn} />);
  expect(api.loginPass).toHaveBeenCalledWith("one-time-pass_1");
  expect(api.login).not.toHaveBeenCalled();
  expect(field(c, "password")).toBeNull();
  expect(field(c, "code")).not.toBeNull();
  await type(field(c, "code"), "654321");
  await submit(c.querySelector("form"));
  expect(api.verify).toHaveBeenCalledWith(TZ, "654321");
  expect(onSignedIn).toHaveBeenCalled();
});

test("SignIn: a pass that did not work falls back to the password step", async () => {
  api.loginPass.mockImplementation(() => ok({ message: "تم." }));
  const c = await mount(<SignIn pass="spent" onSignedIn={() => {}} />);
  expect(field(c, "password")).not.toBeNull();
  expect(c.textContent).toContain("سجّل الدخول من جديد");
});
