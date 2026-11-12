// Approving a new user (owner, 2026-11-12): no role is picked in advance, so
// the administrator always chooses one; approve stays off until then.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useRolePicker } from "./RolePickerDialog";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../i18n/I18nContext", () => ({ useI18n: () => ({ t: (key, fallback) => fallback || key }) }));
jest.mock("../../utils/session", () => ({
  getStoredRole: () => "ادارة",
  isStoredSystem: () => false,
  isStoredAdminPowers: () => true,
}));

let host;
let root;
let picker;

function Probe() {
  picker = useRolePicker();
  return picker.roleDialog;
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(<Probe />); });
});

afterEach(() => {
  act(() => { root.unmount(); });
  host.remove();
});

const select = () => host.querySelector('[data-tour="role-picker-select"]');
const approve = () => host.querySelector('[data-tour="role-picker-approve"]');

test("no role is picked in advance and approve waits for a choice", async () => {
  let chosen;
  await act(async () => { picker.pickRole({ firstname: "منتظر", lastname: "جديد" }).then((r) => { chosen = r; }); });
  expect(select().value).toBe("");
  expect(approve().disabled).toBe(true);

  const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
  act(() => {
    setValue.call(select(), "مرشد");
    select().dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(approve().disabled).toBe(false);

  await act(async () => { approve().click(); });
  expect(chosen).toBe("مرشد");
  expect(select()).toBeNull();
});
