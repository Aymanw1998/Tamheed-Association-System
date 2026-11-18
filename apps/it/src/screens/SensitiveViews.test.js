import SensitiveViews from "./SensitiveViews.jsx";
import * as api from "../api";
import { mount, unmountAll, ok, button, click } from "../testUtils";

// «سجل الاطلاع» (owner, 2026-11-16).
jest.mock("../api", () => ({ ...jest.requireActual("../api"), getSensitiveViews: jest.fn() }));

const ROW = { _id: "v1", at: "2026-11-16T08:00:00Z", actor: "111111118", actorName: "ليلى", studentLabel: "Example Student", fields: ["health_status", "signature"] };

afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

test("each look shows who, which student and what was opened", async () => {
  api.getSensitiveViews.mockImplementation(() => ok({ items: [ROW], total: 1, pageSize: 50 }));
  const c = await mount(<SensitiveViews />);
  for (const text of ["ليلى", "Example Student", "الحالة الصحية", "توقيع ولي الأمر"]) expect(c.textContent).toContain(text);
  expect(button(c, "التالي")).toBeUndefined();
});

test("more than one page offers the next one", async () => {
  api.getSensitiveViews.mockImplementation(() => ok({ items: [ROW], total: 120, pageSize: 50 }));
  const c = await mount(<SensitiveViews />);
  await click(button(c, "التالي"));
  expect(api.getSensitiveViews).toHaveBeenLastCalledWith(2);
});
