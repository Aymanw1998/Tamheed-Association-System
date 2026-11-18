// Codex full review, 2026-11-18: a token refresh that finds no connection
// tries again later; it never signs out and wipes the device.
jest.mock("../services/api", () => ({ refreshSession: jest.fn(), setAuthTokens: jest.fn() }));
jest.mock("../../pwa/clearApiCache", () => ({ clearApiCache: jest.fn() }));
jest.mock("../../pwa/pushOptIn", () => ({ dropDevicePush: jest.fn() }));

const { refreshSession } = require("../services/api");
const { clearApiCache } = require("../../pwa/clearApiCache");
const { scheduleAccessRefresh, clearAccessRefresh, RETRY_OFFLINE_MS } = require("./accessScheduler");

const tokenFor = (secondsLeft) => `x.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsLeft }))}.y`;
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

beforeEach(() => {
  jest.useFakeTimers();
  window.localStorage.clear();
  window.localStorage.setItem("user_tz", "123456782");
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {}); // jsdom: navigation not implemented
});
afterEach(() => {
  clearAccessRefresh();
  jest.useRealTimers();
  console.error.mockRestore();
});

test("no connection when the token is due: keep everything and try again", async () => {
  refreshSession.mockRejectedValue(new Error("Network Error"));
  scheduleAccessRefresh(tokenFor(120));
  jest.advanceTimersByTime(61_000);
  await flush();
  expect(refreshSession).toHaveBeenCalledTimes(1);
  expect(clearApiCache).not.toHaveBeenCalled();
  expect(window.localStorage.getItem("user_tz")).toBe("123456782");

  // Still offline: again, nothing wiped. Then the server refuses: signed out.
  jest.advanceTimersByTime(RETRY_OFFLINE_MS);
  await flush();
  expect(refreshSession).toHaveBeenCalledTimes(2);
  expect(clearApiCache).not.toHaveBeenCalled();
  refreshSession.mockRejectedValue({ response: { status: 401 } });
  jest.advanceTimersByTime(RETRY_OFFLINE_MS);
  await flush();
  expect(clearApiCache).toHaveBeenCalled();
});

test("the connection coming back retries at once", async () => {
  refreshSession.mockRejectedValueOnce(new Error("Network Error"));
  scheduleAccessRefresh(tokenFor(120));
  jest.advanceTimersByTime(61_000);
  await flush();
  refreshSession.mockResolvedValueOnce({ accessToken: tokenFor(900) });
  window.dispatchEvent(new Event("online"));
  await flush();
  expect(refreshSession).toHaveBeenCalledTimes(2);
  expect(clearApiCache).not.toHaveBeenCalled();
});
