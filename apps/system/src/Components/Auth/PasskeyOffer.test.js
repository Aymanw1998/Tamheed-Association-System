import React, { act } from "react";
import { createRoot } from "react-dom/client";

let mockOffer = true;
const mockSave = jest.fn();
const mockRemember = jest.fn();
jest.mock("../../utils/passkey", () => ({
  shouldOfferPasskey: () => mockOffer,
  savePasskey: (...args) => mockSave(...args),
  rememberOffer: (...args) => mockRemember(...args),
}));
jest.mock("../../ALERT/SystemToasts", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import PasskeyOffer from "./PasskeyOffer.jsx";
import { toast } from "../../ALERT/SystemToasts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const mount = async (props = {}) => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<PasskeyOffer {...props} />));
};
afterEach(async () => { await act(async () => root.unmount()); host.remove(); mockOffer = true; jest.clearAllMocks(); });
const button = (text) => [...host.querySelectorAll("button")].find((b) => b.textContent === text);

test("after sign-in it offers to save, and saving closes it", async () => {
  mockSave.mockResolvedValue({ ok: true });
  await mount();
  await act(async () => button("حفظ").click());
  expect(mockSave).toHaveBeenCalled();
  expect(toast.success).toHaveBeenCalled();
  expect(host.textContent).toBe("");
});

test("«later» closes it for this device", async () => {
  await mount();
  await act(async () => button("لاحقًا").click());
  expect(mockRemember).toHaveBeenCalled();
  expect(host.textContent).toBe("");
});

test("once saved or put off it stays away, except on the profile page", async () => {
  mockOffer = false;
  await mount();
  expect(host.textContent).toBe("");
  await act(async () => root.unmount()); host.remove();
  await mount({ always: true });
  expect(button("حفظ")).toBeDefined();
  expect(button("لاحقًا")).toBeUndefined();
});

test("a cancelled prompt is no error; a failure says so and keeps the offer", async () => {
  mockSave.mockResolvedValue({ ok: false, cancelled: true });
  await mount();
  await act(async () => button("حفظ").click());
  expect(toast.error).not.toHaveBeenCalled();
  mockSave.mockResolvedValue({ ok: false, message: "فشل" });
  await act(async () => button("حفظ").click());
  expect(toast.error).toHaveBeenCalledWith("فشل");
  expect(button("حفظ")).toBeDefined();
});
