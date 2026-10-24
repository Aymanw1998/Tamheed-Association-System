// logout leaves training mode before anything else.
jest.mock("axios", () => {
  const path = require("path");
  return jest.requireActual(path.join(path.dirname(require.resolve("axios/package.json")), "dist/node/axios.cjs"));
});
jest.mock("../api", () => ({
  __esModule: true,
  default: { post: jest.fn() },
  publicApi: { post: jest.fn() },
  API_BASE_URL: "/api",
  refreshSession: jest.fn(),
  setAuthTokens: jest.fn(),
}));
jest.mock("../../utils/accessScheduler", () => ({ scheduleAccessRefresh: jest.fn(), clearAccessRefresh: jest.fn() }));

jest.mock("../../../Components/Provides/confirmBus", () => ({ ask: jest.fn() }));

import api from "../api";
import { ask } from "../../../Components/Provides/confirmBus";
import { createMemoryBackend, enqueue, pending, setBackend } from "../../../pwa/attendanceQueue";
import { logout } from "./fuctionsAuth";
import { isDemo, startDemo, stopDemo } from "../../../journey/demoMode";

const originalLocation = window.location;

beforeEach(() => {
  delete window.location;
  window.location = { assign: jest.fn() };
});

afterEach(() => {
  stopDemo();
  window.location = originalLocation;
});

test("logout stops training mode before calling the server", async () => {
  const seen = [];
  api.post.mockImplementation(() => {
    seen.push(isDemo());
    return Promise.resolve({ data: { ok: true } });
  });
  startDemo();
  await logout();
  expect(seen).toEqual([false]);
  expect(isDemo()).toBe(false);
  expect(window.location.assign).toHaveBeenCalledWith("/");
});

describe("login drops the device push subscription", () => {
  afterEach(() => { delete navigator.serviceWorker; });
  test("a successful login unsubscribes this device", async () => {
    const unsubscribe = jest.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: jest.fn().mockResolvedValue({ pushManager: { getSubscription: jest.fn().mockResolvedValue({ unsubscribe }) } }) },
    });
    api.post.mockResolvedValueOnce({
      status: 200,
      data: { ok: true, accessToken: "t", expirationTime: 1, user: { id: 1 } },
    });
    const { login } = require("./fuctionsAuth");
    await login("x", "y");
    await new Promise((r) => setTimeout(r, 0));
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe("login clears the cached API data", () => {
  test("a successful login empties the cache", async () => {
    const del = jest.fn().mockResolvedValue(true);
    global.caches = { delete: del };
    api.post.mockResolvedValueOnce({
      status: 200,
      data: { ok: true, accessToken: "t", expirationTime: 1, user: { id: 1 } },
    });
    const { login } = require("./fuctionsAuth");
    await login("x", "y");
    expect(del).toHaveBeenCalledWith("tamheed-api");
    delete global.caches;
  });
});

describe("logout with unsent attendance", () => {
  beforeEach(async () => {
    setBackend(createMemoryBackend());
    localStorage.setItem("user_tz", "A");
    localStorage.setItem("accessToken", "tok");
    await enqueue("A", { kind: "general", url: "/x", body: {}, label: "x", queuedAt: 1 });
    api.post.mockResolvedValue({ data: { ok: true } });
    ask.mockReset();
  });
  afterEach(() => localStorage.clear());

  test("cancel aborts: returns false and nothing is touched", async () => {
    ask.mockResolvedValue(false);
    expect(await logout()).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
    expect(localStorage.getItem("accessToken")).toBe("tok");
    expect(await pending("A")).toHaveLength(1);
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  test("OK clears the queue and signs out", async () => {
    ask.mockResolvedValue(true);
    await logout();
    expect(await pending("A")).toEqual([]);
    expect(window.location.assign).toHaveBeenCalledWith("/");
  });
});
