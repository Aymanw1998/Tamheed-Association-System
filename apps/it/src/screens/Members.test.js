import Members from "./Members.jsx";
import * as api from "../api";
import { mount, unmountAll, ok, fail, button, click, type, submit, toastText } from "../testUtils";

jest.mock("../api", () => ({
  ...jest.requireActual("../api"),
  getMembers: jest.fn(),
  addMember: jest.fn(),
  removeMember: jest.fn(),
  blockMember: jest.fn(),
  unblockMember: jest.fn(),
  setMemberManager: jest.fn(),
}));

const MEMBERS = [
  { tz: "100000011", firstname: "رامي", lastname: "أول", role: "ادارة", photo: null, itSince: "2026-10-01T00:00:00Z", itBlockedAt: null },
  { tz: "100000012", firstname: "هدى", lastname: "ثانية", role: null, photo: null, itSince: "2026-10-02T00:00:00Z", itBlockedAt: "2026-11-01T00:00:00Z" },
];

beforeEach(() => { api.getMembers.mockImplementation(() => ok({ members: MEMBERS })); });
afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

test("Members: lists the IT users, blocked ones marked", async () => {
  const c = await mount(<Members me={{ isSystem: true }} />);
  expect(c.textContent).toContain("رامي أول");
  expect(c.textContent).toContain("هدى ثانية");
  expect(c.querySelectorAll("li[data-member]")).toHaveLength(2);
  expect(c.querySelector('li[data-member="100000012"]').textContent).toContain("محظور");
  // A blocked member offers «رفع الحظر», the other «حظر».
  expect(c.querySelector('li[data-member="100000012"]').textContent).toContain("إلغاء الحظر");
});

test("Members: add an existing user as IT", async () => {
  api.addMember.mockImplementation(() => ok({ member: MEMBERS[0] }));
  const c = await mount(<Members me={{ isSystem: true }} />);
  await type(c.querySelector('input[name="tz"]'), "100000020");
  await submit(c.querySelector("form"));
  expect(api.addMember).toHaveBeenCalledWith("100000020");
  expect(api.getMembers).toHaveBeenCalledTimes(2);
});

test("Members: no real email gets its own message", async () => {
  api.addMember.mockImplementation(() => fail(400, { code: "NO_REAL_EMAIL" }));
  const c = await mount(<Members me={{ isSystem: true }} />);
  await type(c.querySelector('input[name="tz"]'), "100000020");
  await submit(c.querySelector("form"));
  expect(toastText()).toContain("بريد إلكتروني حقيقي");
});

test("Members: block, unblock and remove (remove asks first)", async () => {
  api.blockMember.mockImplementation(() => ok());
  api.unblockMember.mockImplementation(() => ok());
  api.removeMember.mockImplementation(() => ok());
  const c = await mount(<Members me={{ isSystem: true }} />);
  const first = () => c.querySelector('li[data-member="100000011"]');
  const second = () => c.querySelector('li[data-member="100000012"]');

  await click(button(first(), "حظر"));
  expect(api.blockMember).toHaveBeenCalledWith("100000011");

  await click(button(second(), "إلغاء الحظر"));
  expect(api.unblockMember).toHaveBeenCalledWith("100000012");

  await click(button(first(), "إزالة"));
  expect(api.removeMember).not.toHaveBeenCalled();
  expect(c.querySelector("[role=dialog]")).not.toBeNull();
  await click(button(c.querySelector("[role=dialog]"), "تأكيد"));
  expect(api.removeMember).toHaveBeenCalledWith("100000011");
});

test("Members: the system account makes a manager; a manager sees no actions on a manager or himself", async () => {
  api.getMembers.mockImplementation(() => ok({ members: [
    { tz: "100000011", firstname: "رامي", lastname: "أول", role: "ادارة", itManager: true },
    { tz: "100000012", firstname: "هدى", lastname: "ثانية", role: null },
    { tz: "100000013", firstname: "سامي", lastname: "ثالث", role: null },
  ] }));
  api.setMemberManager.mockImplementation(() => ok());
  let c = await mount(<Members me={{ isSystem: true }} />);
  const row = (tz) => c.querySelector(`[data-member="${tz}"]`);
  expect(row("100000011").textContent).toContain("مدير IT");
  await click(button(row("100000012"), "جعله مدير IT"));
  expect(api.setMemberManager).toHaveBeenCalledWith("100000012", true);
  expect(button(row("100000011"), "إزالة")).toBeDefined();
  await unmountAll();

  c = await mount(<Members me={{ isItManager: true, tz: "100000013" }} />);
  expect(button(row("100000011"), "إزالة")).toBeUndefined();
  expect(button(row("100000011"), "حظر")).toBeUndefined();
  expect(button(row("100000013"), "إزالة")).toBeUndefined();
  expect(button(row("100000012"), "إزالة")).toBeDefined();
  expect(button(row("100000012"), "جعله مدير IT")).toBeUndefined();
});
