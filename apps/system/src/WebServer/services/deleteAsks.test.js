// Deleting a student or a staff member asks first, then the record goes to
// «سلة المحذوفات» with "تراجع" (owner, 2026-11-17). «إلغاء» sends nothing.
let mockAnswer = true;
const mockAsked = [];
const mockAsk = (kind) => { mockAsked.push(kind); return Promise.resolve(mockAnswer); };
jest.mock("../../Components/Provides/confirmBus", () => ({ ask: (...args) => mockAsk(...args) }));
jest.mock("./api", () => {
  const client = { delete: jest.fn(), get: jest.fn(), post: jest.fn(), put: jest.fn() };
  return { __esModule: true, default: client, publicApi: client };
});

import api from "./api";
import { deleteS } from "./student/functionsStudent.jsx";
import { deleteU } from "./user/functionsUser.jsx";

beforeEach(() => {
  mockAsked.length = 0;
  api.delete.mockReset();
  api.delete.mockResolvedValue({ status: 200, data: { ok: true, trashId: "t1" } });
});

test.each([
  ["student", () => deleteS("800000001")],
  ["staff member", () => deleteU("900000002", "active")],
])("deleting a %s asks with the recycle-bin message, then returns the bin id", async (_, run) => {
  mockAnswer = true;
  const res = await run();
  expect(mockAsked).toEqual(["trash"]);
  expect(api.delete).toHaveBeenCalledTimes(1);
  expect(res).toEqual(expect.objectContaining({ ok: true, trashId: "t1" }));
});

test.each([
  ["student", () => deleteS("800000001")],
  ["staff member", () => deleteU("900000002", "active")],
])("«إلغاء» on a %s deletes nothing", async (_, run) => {
  mockAnswer = false;
  expect(await run()).toBeNull();
  expect(api.delete).not.toHaveBeenCalled();
});
