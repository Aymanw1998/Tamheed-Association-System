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

import api from "../api";
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
