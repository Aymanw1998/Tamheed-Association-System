import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

// Users (staff) as football players (owner, 2026-11-09): the picker has a
// staff tab, a staff player wears a «موظف» badge and has no stats.
jest.mock("../../WebServer/services/sport/functionsSport", () => ({
  searchStudents: jest.fn(), searchUsers: jest.fn(),
  bumpStat: jest.fn(), deletePlayer: jest.fn(), signOutPlayer: jest.fn(), issueLoginCard: jest.fn(),
}));
jest.mock("../Provides/confirmBus", () => ({ ask: () => Promise.resolve(true) }));
jest.mock("../../ALERT/SystemToasts", () => ({ toast: { success() {}, warn() {}, error() {} } }));
jest.mock("../../locks/useLiveRefresh", () => () => {});
jest.mock("../../locks/withLock", () => (key, fn) => fn());
jest.mock("./AddPlayerDialog", () => () => null);
jest.mock("../../utils/excelExport", () => ({ ...jest.requireActual("../../utils/excelExport"), downloadWorkbook: jest.fn(() => Promise.resolve()) }));
jest.mock("./PlayerCardModal", () => ({ __esModule: true, default: () => null, Silhouette: () => null }));

import { searchStudents, searchUsers } from "../../WebServer/services/sport/functionsSport";
import StudentPicker from "./StudentPicker";
import PlayersTab from "./PlayersTab";
import { downloadWorkbook } from "../../utils/excelExport";
import { I18nProvider } from "../../i18n/I18nContext";

global.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
const mount = async (node) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<I18nProvider>{node}</I18nProvider>));
};
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
// The picker loads after a zero-delay timer.
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const buttons = () => [...container.querySelectorAll("button")];
const tab = (name) => [...container.querySelectorAll('[role="tab"]')].find((b) => b.textContent === name);

beforeEach(() => {
  searchStudents.mockResolvedValue({ ok: true, students: [{ _id: "s1", firstname: "طالب", lastname: "أ", tz: "900000301" }] });
  searchUsers.mockResolvedValue({ ok: true, users: [{ _id: "u1", firstname: "موظف", lastname: "ب", tz: "900000302", kind: "user" }] });
});

test("the picker lists students first and staff on its second tab", async () => {
  const onPick = jest.fn();
  await mount(<StudentPicker onPick={onPick} pickLabel="اختيار" />);
  await flush();
  expect(searchStudents).toHaveBeenCalled();
  expect(container.textContent).toContain("طالب أ");
  expect(tab("الطلاب").getAttribute("aria-selected")).toBe("true");
  await act(async () => tab("الموظفون").click());
  await flush();
  expect(searchUsers).toHaveBeenCalled();
  expect(container.textContent).toContain("موظف ب");
  expect(container.textContent).not.toContain("طالب أ");
  await act(async () => buttons().find((b) => b.textContent === "اختيار").click());
  expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ _id: "u1", kind: "user" }));
});

test("a staff player has a «موظف» badge and no stat buttons", async () => {
  const sport = { stats: [{ key: "g", label: "أهداف" }] };
  const players = [
    { studentId: "s1", kind: "student", firstname: "طالب", lastname: "أ", lessons: [], values: { g: 2 } },
    { studentId: "u1", kind: "user", firstname: "موظف", lastname: "ب", lessons: [], values: {} },
  ];
  await mount(<PlayersTab sport={sport} players={players} lessons={[]} reload={() => {}} canCoach canManage />);
  const rows = [...container.querySelectorAll("tbody tr")];
  const staffRow = rows.find((r) => r.textContent.includes("موظف ب"));
  const studentRow = rows.find((r) => r.textContent.includes("طالب أ"));
  expect(staffRow.querySelector('[data-staff-badge]').textContent).toBe("موظف");
  expect(studentRow.querySelector('[data-staff-badge]')).toBeNull();
  expect(staffRow.querySelector('[aria-label="زيادة أهداف"]')).toBeNull();
  expect(studentRow.querySelector('[aria-label="زيادة أهداف"]')).not.toBeNull();
});

test("«تصدير Excel» downloads the players on screen, a staff player without stats", async () => {
  const sport = { stats: [{ key: "g", label: "أهداف" }] };
  const players = [
    { studentId: "s1", kind: "student", firstname: "طالب", lastname: "أ", tz: "1", lessons: [], values: { g: 2 }, attendance: { rate: 80, late: 1 } },
    { studentId: "u1", kind: "user", firstname: "موظف", lastname: "ب", tz: "2", lessons: [], values: {}, attendance: { rate: null, late: 0 } },
  ];
  await mount(<PlayersTab sport={sport} players={players} lessons={[]} reload={() => {}} />);
  await act(async () => buttons().find((b) => b.textContent === "تصدير Excel").click());
  const [, sheets] = downloadWorkbook.mock.calls[0];
  expect(sheets[0].rows.map((r) => [r[0], r[1], r[r.length - 1]])).toEqual([["طالب أ", "طالب", 2], ["موظف ب", "موظف", ""]]);
});
