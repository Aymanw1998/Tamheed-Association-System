import AssistantGuides from "./AssistantGuides.jsx";
import * as api from "../api";
import { mount, unmountAll, ok } from "../testUtils";

// Owner, 2026-11-19.
jest.mock("../api", () => ({ ...jest.requireActual("../api"), getAssistantGuides: jest.fn() }));

afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

test("each student is shown with the assistant", async () => {
  api.getAssistantGuides.mockImplementation(() => ok({ items: [{ studentId: "s1", student: "علي أ", assistant: "سامي م" }] }));
  const c = await mount(<AssistantGuides />);
  expect(c.textContent).toContain("علي أ");
  expect(c.textContent).toContain("سامي م");
});

test("an empty list says so", async () => {
  api.getAssistantGuides.mockImplementation(() => ok({ items: [] }));
  const c = await mount(<AssistantGuides />);
  expect(c.textContent).toContain("لا يوجد طلاب كهؤلاء");
});
