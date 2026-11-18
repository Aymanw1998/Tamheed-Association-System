import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Codex full review, 2026-11-18: no connection never sends a signed-in user
// to the sign-in page; a refusal from the server does.
jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});
jest.mock("../../WebServer/services/api", () => ({ refreshSession: jest.fn(), setAuthTokens: jest.fn() }));
jest.mock("../../WebServer/services/auth/fuctionsAuth", () => ({ getMeChecked: jest.fn() }));
jest.mock("../../WebServer/utils/accessScheduler", () => ({ scheduleAccessRefresh: jest.fn() }));
jest.mock("../../WebServer/utils/logoutScheduler", () => ({ getLogoutDeadline: () => null, scheduleAutoLogout: jest.fn() }));
jest.mock("../../utils/passkey", () => ({ syncSavedPasskey: jest.fn() }));

global.IS_REACT_ACT_ENVIRONMENT = true;

const { refreshSession } = require("../../WebServer/services/api");
const { getMeChecked } = require("../../WebServer/services/auth/fuctionsAuth");
const RequireAuth = require("./RequireAuth").default;

let container;
let root;
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); };
const open = async () => {
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/" element={<p>sign in</p>} />
        <Route element={<RequireAuth />}><Route path="/dashboard" element={<p>dashboard</p>} /></Route>
      </Routes>
    </MemoryRouter>
  ));
  await flush();
  return () => container.textContent;
};

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
});
afterEach(async () => { await act(async () => root.unmount()); });

test("signed in on this device, no connection: the app stays open", async () => {
  window.localStorage.setItem("user_tz", "123456782");
  refreshSession.mockRejectedValue(new Error("Network Error"));
  const text = await open();
  expect(text()).toBe("dashboard");
  expect(getMeChecked).not.toHaveBeenCalled();
});

test("a valid token but /auth/me cannot be reached: the app stays open and keeps the token", async () => {
  window.localStorage.setItem("user_tz", "123456782");
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
  window.localStorage.setItem("accessToken", `x.${payload}.y`);
  getMeChecked.mockResolvedValue({ me: null, connectionFailed: true });
  const text = await open();
  expect(text()).toBe("dashboard");
  expect(window.localStorage.getItem("accessToken")).not.toBeNull();
});

test("the server refuses the session: sign-in page", async () => {
  window.localStorage.setItem("user_tz", "123456782");
  refreshSession.mockRejectedValue({ response: { status: 401 } });
  const text = await open();
  expect(text()).toBe("sign in");
});

test("nobody signed in here before: no connection still means the sign-in page", async () => {
  refreshSession.mockRejectedValue(new Error("Network Error"));
  const text = await open();
  expect(text()).toBe("sign in");
});

test("when the connection is back, the session is checked again", async () => {
  window.localStorage.setItem("user_tz", "123456782");
  refreshSession.mockRejectedValue(new Error("Network Error"));
  const text = await open();
  expect(text()).toBe("dashboard");
  refreshSession.mockRejectedValue({ response: { status: 401 } });
  await act(async () => { window.dispatchEvent(new Event("online")); });
  await flush();
  expect(text()).toBe("sign in");
});
