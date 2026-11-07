import PermissionsEditor from "./PermissionsEditor";
import * as api from "../api";
import { moduleName, leafName } from "../strings";
import { mount, unmountAll, ok, button, click, flush } from "../testUtils";

jest.mock("../api", () => ({
  ...jest.requireActual("../api"), getPermissions: jest.fn(), savePermissions: jest.fn(),
}));

afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

test("IT shows current System names and saves weekly task permissions without adding IT keys", async () => {
  const data = { role: "مرشد", defaults: ["lessons.view"], grants: [], revokes: [], effective: ["lessons.view"], grantable: ["tasks.manage"] };
  api.getPermissions.mockImplementation(() => ok(data));
  api.savePermissions.mockImplementation((tz, draft) => ok({ ...draft, effective: ["lessons.view", "tasks.manage"] }));
  const c = await mount(<PermissionsEditor tz="synthetic-user" />);
  expect(c.textContent).toContain("الرئيسي");
  expect(c.textContent).toContain("البرنامج");
  expect(c.textContent).not.toContain("لوحة التحكم");
  const itRow = [...c.querySelectorAll("li")].find((el) => el.querySelector("span")?.textContent === "الصلاحيات");
  expect(itRow.querySelector("input").disabled).toBe(true);
  const row = [...c.querySelectorAll("li")].find((el) => el.querySelector("span")?.textContent === "المهمات الأسبوعية");
  expect(row).toBeDefined();
  await click(row.querySelector("button"));
  expect(row.textContent).toContain("إدارة المهمات الأسبوعية");
  const boxes = row.querySelectorAll("input[type=checkbox]");
  expect(boxes[1].disabled).toBe(false);
  await click(boxes[1]);
  await click(button(c, "حفظ"));
  const dialog = c.querySelector('[role="dialog"]');
  expect(dialog.textContent).toContain("المهمات الأسبوعية: إدارة المهمات الأسبوعية");
  await click(button(dialog, "حفظ"));
  await flush();
  expect(api.savePermissions).toHaveBeenCalledWith("synthetic-user", { grants: ["tasks.manage"], revokes: [] });
  expect(moduleName("lessons")).toBe("البرنامج");
  expect(leafName("lessons.roster")).toBe("قائمة طلاب البرنامج");
});
