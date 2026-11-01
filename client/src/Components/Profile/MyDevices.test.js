import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

import MyDevices from "./MyDevices";
import * as users from "../../WebServer/services/user/functionsUser.jsx";

// Implementations are set in render(): CRA's resetMocks clears them between tests.
jest.mock("../../WebServer/services/user/functionsUser.jsx", () => ({
  listMyDevices: jest.fn(),
  signOutMyDevice: jest.fn(),
  signOutOtherDevices: jest.fn(),
}));
let mockConfirmAnswer = true;
const mockAsked = [];
jest.mock("../Provides/confirmBus", () => ({
  ask: (kind, opts) => { mockAsked.push(opts); return Promise.resolve(mockConfirmAnswer); },
}));
const mockToasts = [];
jest.mock("../../ALERT/SystemToasts.jsx", () => ({
  toast: { success: (m) => mockToasts.push(["success", m]), warn: (m) => mockToasts.push(["warn", m]) },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
const q = (sel) => container.querySelector(sel);
const qa = (sel) => [...container.querySelectorAll(sel)];

const DEVICES = [
  { sid: "s-laptop", label: "Chrome · Windows", startedAt: "2026-10-01T08:00:00Z", lastSeenAt: "2026-11-01T09:00:00Z", current: true },
  { sid: "s-phone", label: "Safari · iPhone", startedAt: "2026-10-02T08:00:00Z", lastSeenAt: "2026-10-30T09:00:00Z", current: false },
  { sid: "s-old", label: "", startedAt: "2026-09-02T08:00:00Z", lastSeenAt: "2026-09-30T09:00:00Z", current: false },
];

async function render(devices = DEVICES) {
  users.listMyDevices.mockImplementation(() => Promise.resolve({ ok: true, devices }));
  users.signOutMyDevice.mockImplementation(() => Promise.resolve({ ok: true }));
  users.signOutOtherDevices.mockImplementation(() => Promise.resolve({ ok: true, ended: 2 }));
  await act(async () => root.render(<MyDevices />));
}

beforeEach(() => {
  mockConfirmAnswer = true;
  mockAsked.length = 0;
  mockToasts.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

test("lists each device, marks this one, and offers sign-out only for the others", async () => {
  await render();
  const rows = qa('[data-testid="device-row"]');
  expect(rows).toHaveLength(3);
  expect(rows[0].textContent).toContain("Chrome · Windows");
  expect(rows[0].textContent).toContain("هذا الجهاز");
  expect(rows[0].querySelector("button")).toBeNull();
  expect(rows[1].querySelector("button")).not.toBeNull();
  expect(rows[2].textContent).toContain("جهاز غير معروف");
});

test("signing out one device asks first, then removes it from the list", async () => {
  await render();
  await act(async () => qa('[data-testid="device-row"]')[1].querySelector("button").click());
  expect(mockAsked).toHaveLength(1);
  expect(users.signOutMyDevice).toHaveBeenCalledWith("s-phone");
  expect(qa('[data-testid="device-row"]')).toHaveLength(2);
  expect(mockToasts[0][0]).toBe("success");
});

test("nothing is signed out when the question is declined", async () => {
  await render();
  mockConfirmAnswer = false;
  await act(async () => qa('[data-testid="device-row"]')[1].querySelector("button").click());
  expect(users.signOutMyDevice).not.toHaveBeenCalled();
  expect(qa('[data-testid="device-row"]')).toHaveLength(3);
});

test("signing out other devices leaves only this one", async () => {
  await render();
  await act(async () => q('[data-testid="sign-out-others"]').click());
  expect(users.signOutOtherDevices).toHaveBeenCalled();
  const rows = qa('[data-testid="device-row"]');
  expect(rows).toHaveLength(1);
  expect(rows[0].textContent).toContain("هذا الجهاز");
});

test("with only this device there is no sign-out-others button", async () => {
  await render([DEVICES[0]]);
  expect(q('[data-testid="sign-out-others"]')).toBeNull();
});

test("a failed list shows nothing", async () => {
  users.listMyDevices.mockImplementation(() => Promise.resolve({ ok: false }));
  await act(async () => root.render(<MyDevices />));
  expect(q('[data-testid="my-devices"]')).toBeNull();
});
