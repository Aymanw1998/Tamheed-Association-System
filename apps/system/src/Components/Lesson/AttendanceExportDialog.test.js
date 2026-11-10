import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

jest.mock("../../WebServer/services/attendance/functionsAttendance", () => ({ exportAttendance: jest.fn() }));
jest.mock("../../utils/excelExport", () => ({
  ...jest.requireActual("../../utils/excelExport"),
  downloadWorkbook: jest.fn(),
}));

import { exportAttendance } from "../../WebServer/services/attendance/functionsAttendance";
import { downloadWorkbook } from "../../utils/excelExport";
import AttendanceExportDialog from "./AttendanceExportDialog";

global.IS_REACT_ACT_ENVIRONMENT = true;
let container, root;
const mount = async (props) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<AttendanceExportDialog lessonId="L1" lessonName="كرة القدم" onClose={() => {}} today={new Date(2026, 10, 10)} {...props} />));
};
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const button = (text) => [...container.querySelectorAll("button")].find((b) => b.textContent === text);

test("defaults to this month so far and downloads the lesson's file", async () => {
  exportAttendance.mockResolvedValue({ ok: true, lesson: { name: "كرة القدم" }, rows: [{ dateKey: 20261104, name: "طالب أ", kind: "student", status: "حاضر", notes: "" }] });
  downloadWorkbook.mockResolvedValue();
  await mount();
  const [from, to] = container.querySelectorAll('input[type="date"]');
  expect(from.value).toBe("2026-11-01");
  expect(to.value).toBe("2026-11-10");
  await act(async () => button("تنزيل Excel").click());
  expect(exportAttendance).toHaveBeenCalledWith("L1", { from: "2026-11-01", to: "2026-11-10" });
  expect(downloadWorkbook).toHaveBeenCalledTimes(1);
  const [fileName, sheets] = downloadWorkbook.mock.calls[0];
  expect(fileName).toBe("حضور كرة القدم 2026-11-01 - 2026-11-10");
  expect(sheets.map((s) => s.name)).toEqual(["الحضور", "ملخص"]);
});

test("a period with no marks says so and downloads nothing", async () => {
  exportAttendance.mockResolvedValue({ ok: true, lesson: { name: "كرة القدم" }, rows: [] });
  await mount();
  await act(async () => button("تنزيل Excel").click());
  expect(downloadWorkbook).not.toHaveBeenCalled();
  expect(container.textContent).toContain("لا يوجد حضور مسجّل في هذه الفترة");
});

test("a server refusal shows its message", async () => {
  exportAttendance.mockResolvedValue({ ok: false, message: "الفترة غير صحيحة (حتى سنة واحدة)" });
  await mount();
  await act(async () => button("تنزيل Excel").click());
  expect(container.querySelector('[role="alert"]').textContent).toBe("الفترة غير صحيحة (حتى سنة واحدة)");
});
