// streamChat's non-stream paths, with fetch and the api module mocked.
jest.mock("../api", () => ({
  __esModule: true,
  default: { get: jest.fn(() => Promise.resolve({ data: {} })), delete: jest.fn() },
  API_BASE_URL: "/api",
  getAuthToken: jest.fn(() => "old-token"),
  refreshSession: jest.fn(),
  setAuthTokens: jest.fn(),
}));

import api, { getAuthToken, refreshSession, setAuthTokens } from "../api";
import { streamChat } from "./functionsAI";

const jsonResponse = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: () => "application/json" },
  json: () => Promise.resolve(body),
  body: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  // CRA's Jest config resets mock implementations before each test.
  api.get.mockResolvedValue({ data: {} });
  getAuthToken.mockReturnValue("old-token");
  global.fetch = jest.fn();
});

afterEach(() => {
  delete global.fetch;
});

test("403 BLOCKED hands the session over to the shared api layer, like a 401", async () => {
  global.fetch.mockResolvedValueOnce(jsonResponse(403, { code: "BLOCKED" }));
  await expect(streamChat({ message: "hi" })).resolves.toEqual({ ok: false, code: "SESSION" });
  expect(api.get).toHaveBeenCalledTimes(1);
});

test("a plain 403 is FORBIDDEN and does not sign out", async () => {
  global.fetch.mockResolvedValueOnce(jsonResponse(403, { code: "FORBIDDEN" }));
  await expect(streamChat({ message: "hi" })).resolves.toEqual({ ok: false, code: "FORBIDDEN" });
  expect(api.get).not.toHaveBeenCalled();
});

test("401 TOKEN_EXPIRED refreshes once and retries with the new token", async () => {
  refreshSession.mockResolvedValueOnce({ accessToken: "new-token", expirationTime: 1 });
  getAuthToken.mockReturnValueOnce("old-token").mockReturnValueOnce("new-token");
  global.fetch
    .mockResolvedValueOnce(jsonResponse(401, { code: "TOKEN_EXPIRED" }))
    .mockResolvedValueOnce(jsonResponse(429, { code: "RATE_LIMITED" }));
  await expect(streamChat({ message: "hi", conversationId: "c1" })).resolves.toEqual({ ok: false, code: "RATE_LIMITED" });
  expect(setAuthTokens).toHaveBeenCalledWith("new-token", 1);
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(global.fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer new-token");
  expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ message: "hi", conversationId: "c1" });
});

test("a 401 that survives the refresh hands over the session", async () => {
  refreshSession.mockRejectedValueOnce(new Error("no"));
  global.fetch.mockResolvedValueOnce(jsonResponse(401, { code: "TOKEN_EXPIRED" }));
  await expect(streamChat({ message: "hi" })).resolves.toEqual({ ok: false, code: "SESSION" });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(api.get).toHaveBeenCalledTimes(1);
});

test("a network failure is NETWORK and an abort is ABORTED", async () => {
  global.fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  await expect(streamChat({ message: "hi" })).resolves.toEqual({ ok: false, code: "NETWORK" });
  global.fetch.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));
  await expect(streamChat({ message: "hi" })).resolves.toEqual({ ok: false, code: "ABORTED" });
});

test("403 PASSWORD_CHANGE_REQUIRED and 423 ACCOUNT_LOCKED hand the session over", async () => {
  global.fetch.mockResolvedValueOnce(jsonResponse(403, { code: "PASSWORD_CHANGE_REQUIRED" }));
  await expect(streamChat({ message: "hi" })).resolves.toEqual({ ok: false, code: "SESSION" });
  global.fetch.mockResolvedValueOnce(jsonResponse(423, { code: "ACCOUNT_LOCKED" }));
  await expect(streamChat({ message: "hi" })).resolves.toEqual({ ok: false, code: "SESSION" });
  expect(api.get).toHaveBeenCalledTimes(2);
});

test("other 403 codes keep the server code; a 403 without one is FORBIDDEN", async () => {
  global.fetch.mockResolvedValueOnce(jsonResponse(403, { code: "SOMETHING_ELSE" }));
  await expect(streamChat({ message: "hi" })).resolves.toEqual({ ok: false, code: "SOMETHING_ELSE" });
  global.fetch.mockResolvedValueOnce(jsonResponse(403, null));
  await expect(streamChat({ message: "hi" })).resolves.toEqual({ ok: false, code: "FORBIDDEN" });
  expect(api.get).not.toHaveBeenCalled();
});

test("a null or non-object JSON body never throws", async () => {
  global.fetch.mockResolvedValueOnce(jsonResponse(401, null));
  await expect(streamChat({ message: "hi" })).resolves.toEqual({ ok: false, code: "SESSION" });
  global.fetch.mockResolvedValueOnce(jsonResponse(500, null));
  await expect(streamChat({ message: "hi" })).resolves.toEqual({ ok: false, code: "SERVER_ERROR" });
  global.fetch.mockResolvedValueOnce(jsonResponse(409, "text"));
  await expect(streamChat({ message: "hi" })).resolves.toEqual({ ok: false, code: "SERVER_ERROR" });
  global.fetch.mockResolvedValueOnce(jsonResponse(409, { code: "BUSY" }));
  await expect(streamChat({ message: "hi" })).resolves.toEqual({ ok: false, code: "BUSY" });
});
