import { createRoot } from "react-dom/client";
import { act } from "react";
import PasskeyOffer from "./PasskeyOffer.jsx";
import * as pk from "./passkey";

// After signing in with the code or the card: offer to sign in next time
// with a fingerprint or face, once per phone.
jest.mock("./passkey", () => ({ shouldOfferPasskey: jest.fn(), savePasskey: jest.fn(), rememberOffer: jest.fn() }));

global.IS_REACT_ACT_ENVIRONMENT = true;
let container, root;
const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<PasskeyOffer />));
};
const button = (text) => [...container.querySelectorAll("button")].find((b) => b.textContent === text);
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

test("not offered on a phone that has one or put it off", async () => {
  pk.shouldOfferPasskey.mockReturnValue(false);
  await mount();
  expect(container.textContent).toBe("");
});

test("saving it thanks the player and hides the offer", async () => {
  pk.shouldOfferPasskey.mockReturnValue(true);
  pk.savePasskey.mockImplementation(() => Promise.resolve({ ok: true }));
  await mount();
  await act(async () => button("حفظ").click());
  expect(pk.savePasskey).toHaveBeenCalled();
  expect(container.textContent).toContain("تم");
  expect(button("حفظ")).toBeUndefined();
});

test("'later' hides it and remembers", async () => {
  pk.shouldOfferPasskey.mockReturnValue(true);
  await mount();
  await act(async () => button("لاحقًا").click());
  expect(pk.rememberOffer).toHaveBeenCalled();
  expect(container.textContent).toBe("");
});

test("a failed save says so and keeps the offer", async () => {
  pk.shouldOfferPasskey.mockReturnValue(true);
  pk.savePasskey.mockImplementation(() => Promise.resolve({ ok: false, message: "تعذّر حفظ الدخول بالبصمة على هذا الهاتف" }));
  await mount();
  await act(async () => button("حفظ").click());
  expect(container.textContent).toContain("تعذّر حفظ");
  expect(button("حفظ")).not.toBeUndefined();
});
