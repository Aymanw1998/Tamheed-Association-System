jest.mock("../WebServer/services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() } }));
import { dropDevicePush } from "./pushOptIn";

afterEach(() => { delete navigator.serviceWorker; });

test("dropDevicePush unsubscribes the browser subscription without calling the server", async () => {
  const unsubscribe = jest.fn().mockResolvedValue(true);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: jest.fn().mockResolvedValue({ pushManager: { getSubscription: jest.fn().mockResolvedValue({ unsubscribe }) } }) },
  });
  await dropDevicePush();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

test("dropDevicePush never throws and gives up after about three seconds", async () => {
  jest.useFakeTimers();
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: jest.fn(() => new Promise(() => {})) },
  });
  const done = dropDevicePush();
  jest.advanceTimersByTime(3100);
  await expect(done).resolves.toBeUndefined();
  jest.useRealTimers();
});

test("resyncStaff posts an existing browser subscription once", async () => {
  window.PushManager = function PushManager() {};
  window.Notification = {};
  const api = require("../WebServer/services/api").default;
  api.post.mockResolvedValue({});
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: jest.fn().mockResolvedValue({ pushManager: { getSubscription: jest.fn().mockResolvedValue({ toJSON: () => ({ endpoint: "e" }) }) } }) },
  });
  const { resyncStaff } = require("./pushOptIn");
  await resyncStaff();
  expect(api.post).toHaveBeenCalledWith("/push/subscribe", { subscription: { endpoint: "e" } });
  delete window.PushManager; delete window.Notification;
});
