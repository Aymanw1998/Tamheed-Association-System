jest.mock("../WebServer/services/api", () => ({ __esModule: true, default: { post: jest.fn(), put: jest.fn() } }));
import { createMemoryBackend, pending, setBackend } from "./attendanceQueue";
import { flushCurrentUser, queueAttendance } from "./queuedSave";
import api from "../WebServer/services/api";
import { startDemo, stopDemo } from "../journey/demoMode";

const item = { kind: "general", url: "/attendance/bulk-save", body: { lessonId: 1, year: 2026, month: 1, day: 2 } };

beforeEach(() => {
  setBackend(createMemoryBackend());
  localStorage.setItem("user_tz", "u1");
  localStorage.setItem("isLoggedIn", "1");
});
afterEach(() => { stopDemo(); localStorage.clear(); jest.clearAllMocks(); });

test("queueAttendance stores nothing while training mode is on", async () => {
  startDemo();
  expect(await queueAttendance(item)).toBe(false);
  stopDemo();
  expect(await pending("u1")).toHaveLength(0);
});

test("flushCurrentUser sends nothing while training mode is on", async () => {
  expect(await queueAttendance(item)).toBe(true);
  startDemo();
  expect(await flushCurrentUser()).toBeNull();
  expect(api.post).not.toHaveBeenCalled();
  stopDemo();
  expect(await pending("u1")).toHaveLength(1);
});
