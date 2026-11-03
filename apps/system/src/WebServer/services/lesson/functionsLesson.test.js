import api from "../api";
import { removeFromList } from "./functionsLesson";

jest.mock("../api", () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));
jest.mock("../../../Components/Provides/confirmBus", () => ({ ask: jest.fn() }));

test("removeFromList posts the student ids to the lesson's own address", async () => {
  api.post.mockResolvedValue({ status: 200, data: { ok: true, updatedAt: "2026-10-31T10:00:00.000Z" } });
  const res = await removeFromList("L1", ["s1"]);
  expect(api.post).toHaveBeenCalledWith("/lesson/removeFromList/L1", { list_students: ["s1"] });
  expect(res).toEqual({ ok: true, updatedAt: "2026-10-31T10:00:00.000Z" });
});
