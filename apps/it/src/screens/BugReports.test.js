import BugReports from "./BugReports.jsx";
import * as api from "../api";
import { mount, unmountAll, ok, fail, button, click, toastText } from "../testUtils";

jest.mock("../api", () => ({ ...jest.requireActual("../api"), getBugReports: jest.fn(), deleteBugReport: jest.fn() }));

const AUTO = {
  _id: "r1", type: "fault", source: "auto", reporterName: "ليلى", reporterRole: "مرشد", section: "الطلاب",
  page: "/students/••••8155", action: "PUT /api/student/••••8155", errorKind: "server", errorStatus: 500,
  errorCode: "E1", errorMessage: "boom", errorSource: "Student.update", requestId: "abc", text: "", hasImage: false,
  createdAt: "2026-11-04T10:00:00Z",
};
const MANUAL = {
  _id: "r2", type: "suggestion", source: "manual", reporterName: "سامر", reporterRole: "ادارة", section: "",
  page: "/", action: "", errorKind: "", errorStatus: 0, text: "<b>فكرة</b>", hasImage: true,
  createdAt: "2026-11-04T09:00:00Z",
};

beforeEach(() => {
  api.getBugReports.mockImplementation(() => ok({ reports: [AUTO, MANUAL] }));
  api.deleteBugReport.mockImplementation(() => ok());
});
afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

test("a report shows who, the section, the action and the exact server error", async () => {
  const c = await mount(<BugReports />);
  const first = c.querySelector('[data-report="r1"]');
  for (const text of ["عطل", "ليلى", "الطلاب", "PUT /api/student/••••8155", "500", "boom", "abc"]) {
    expect(first.textContent).toContain(text);
  }
});

test("a window's report shows its kind, its text as plain text and its picture", async () => {
  const c = await mount(<BugReports />);
  const second = c.querySelector('[data-report="r2"]');
  expect(second.textContent).toContain("اقتراح تحسين");
  expect(second.textContent).toContain("<b>فكرة</b>");
  expect(second.querySelector("b")).toBeNull();
  expect(second.querySelector("img").getAttribute("src")).toBe("/api/it/bug-reports/r2/image");
});

test("done deletes it for good after asking, and it leaves the list", async () => {
  const c = await mount(<BugReports />);
  await click(button(c.querySelector('[data-report="r1"]'), "تم الحل"));
  expect(document.body.textContent).toContain("نهائيًا");
  expect(api.deleteBugReport).not.toHaveBeenCalled();
  api.getBugReports.mockImplementation(() => ok({ reports: [MANUAL] }));
  await click(button(document.body.querySelector("[role=dialog]"), "تم الحل"));
  expect(api.deleteBugReport).toHaveBeenCalledWith("r1");
  expect(c.querySelector('[data-report="r1"]')).toBeNull();
});

test("delete does the same", async () => {
  const c = await mount(<BugReports />);
  await click(button(c.querySelector('[data-report="r2"]'), "حذف"));
  await click(button(document.body.querySelector("[role=dialog]"), "حذف"));
  expect(api.deleteBugReport).toHaveBeenCalledWith("r2");
});

test("a failed delete says so and keeps the report", async () => {
  api.deleteBugReport.mockImplementation(() => fail(500, { message: "تعذر" }));
  const c = await mount(<BugReports />);
  await click(button(c.querySelector('[data-report="r1"]'), "حذف"));
  await click(button(document.body.querySelector("[role=dialog]"), "حذف"));
  expect(toastText()).toContain("تعذر");
  expect(c.querySelector('[data-report="r1"]')).not.toBeNull();
});

test("an empty list says so", async () => {
  api.getBugReports.mockImplementation(() => ok({ reports: [] }));
  const c = await mount(<BugReports />);
  expect(c.textContent).toContain("لا توجد بلاغات");
});
