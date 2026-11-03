import PasskeyOffer from "./PasskeyOffer.jsx";
import * as passkey from "../passkey";
import { mount, unmountAll, button, click, toastText } from "../testUtils";

jest.mock("../passkey", () => ({ shouldOfferPasskey: jest.fn(), savePasskey: jest.fn(), rememberOffer: jest.fn() }));

afterEach(unmountAll);

test("PasskeyOffer: saving a passkey says so and hides the offer", async () => {
  passkey.shouldOfferPasskey.mockReturnValue(true);
  passkey.savePasskey.mockResolvedValue({ ok: true });
  const c = await mount(<PasskeyOffer />);
  await click(button(c, "حفظ"));
  expect(toastText()).toContain("ادخل بالبصمة أو بالوجه");
  expect(c.querySelector(".passkey-offer")).toBeNull();
});

test("PasskeyOffer: 'later' hides it and remembers; nothing shows where it was put off", async () => {
  passkey.shouldOfferPasskey.mockReturnValue(true);
  let c = await mount(<PasskeyOffer />);
  await click(button(c, "لاحقًا"));
  expect(passkey.rememberOffer).toHaveBeenCalled();
  expect(c.querySelector(".passkey-offer")).toBeNull();
  await unmountAll();

  passkey.shouldOfferPasskey.mockReturnValue(false);
  c = await mount(<PasskeyOffer />);
  expect(c.querySelector(".passkey-offer")).toBeNull();
});

test("PasskeyOffer: a failure is a toast and the offer stays", async () => {
  passkey.shouldOfferPasskey.mockReturnValue(true);
  passkey.savePasskey.mockResolvedValue({ ok: false, message: "تعذّر حفظ الدخول بالبصمة على هذا الجهاز" });
  const c = await mount(<PasskeyOffer />);
  await click(button(c, "حفظ"));
  expect(toastText()).toContain("تعذّر حفظ");
  expect(c.querySelector(".passkey-offer")).not.toBeNull();
});
