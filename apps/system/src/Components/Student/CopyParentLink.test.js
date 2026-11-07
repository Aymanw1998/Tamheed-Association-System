import React, { act } from "react";
import { createRoot } from "react-dom/client";
import CopyParentLink from "./CopyParentLink";
import { getLink } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
jest.mock("../../WebServer/services/inviteToken/functionInviteToken.jsx", () => ({ getLink: jest.fn() }));
jest.mock("../../ALERT/SystemToasts.jsx", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, write;
beforeEach(() => {
  write = jest.fn().mockResolvedValue();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: write } });
  getLink.mockResolvedValue({ ok: true, token: "synthetic-token" });
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
test("one press copies the registration link without exposing a URL or opening rules", async () => {
  await act(async () => root.render(<CopyParentLink />));
  expect(host.querySelector("input,textarea,[role=dialog],a")).toBeNull();
  expect(host.textContent).not.toContain("synthetic-token");
  await act(async () => host.querySelector("button").click());
  expect(write).toHaveBeenCalledWith(`${window.location.origin}/register-student/synthetic-token`);
  expect(toast.success).toHaveBeenCalled();
});
test("a failed fetch offers retry and never copies an invalid link", async () => {
  getLink.mockResolvedValueOnce({ ok: false });
  await act(async () => root.render(<CopyParentLink />));
  await act(async () => host.querySelector("button").click());
  expect(write).not.toHaveBeenCalled();
  expect(host.textContent).toBe("نسخ رابط تسجيل الأهل");
  await act(async () => host.querySelector("button").click());
  expect(write).toHaveBeenCalledTimes(1);
});
