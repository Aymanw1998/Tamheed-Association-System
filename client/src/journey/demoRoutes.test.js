// The demo store answers every screen's request in the shape its service expects.
jest.mock("axios", () => {
  const path = require("path");
  return jest.requireActual(path.join(path.dirname(require.resolve("axios/package.json")), "dist/node/axios.cjs"));
});

// The services talk to a real axios instance whose adapter is the demo router
// (no network): what a screen receives is exactly what the store answers.
jest.mock("../WebServer/services/api", () => {
  const axios = require("axios");
  const instance = axios.create({ baseURL: "/api", headers: { "Content-Type": "application/json" } });
  return {
    __esModule: true,
    default: instance,
    publicApi: instance,
    API_BASE_URL: "/api",
    getAuthToken: () => null,
    refreshSession: () => Promise.reject(new Error("no refresh in tests")),
    setAuthTokens: () => {},
  };
});

import api from "../WebServer/services/api";
import { createDemoStore, demoUploadFile, DEMO_UPLOAD_NAME } from "./demoData";
import { ALL_KEYS } from "../utils/permissionKeys";

// What a demo administrator holds (the server's role defaults for «ادارة»).
const ADMIN_KEYS = ALL_KEYS.filter((key) => /^(dashboard|calendar|students|lessons|attendance|reports|vehicles|files|notices|ai)\./.test(key))
  .concat(["users.view", "users.create", "users.edit", "users.approve", "users.delete"]);
import { handleDemoRequest } from "./demoRoutes";
import * as Students from "../WebServer/services/student/functionsStudent";
import * as Lessons from "../WebServer/services/lesson/functionsLesson";
import * as Attendance from "../WebServer/services/attendance/functionsAttendance";
import * as Reports from "../WebServer/services/report/functionsReport";
import * as Users from "../WebServer/services/user/functionsUser";
import * as Vehicles from "../WebServer/services/vehicle/functionsVehicle";
import * as Notices from "../WebServer/services/notice/functionsNotice";
import * as Audit from "../WebServer/services/audit/functionsAudit";
import * as Alerts from "../WebServer/services/alerts/functionsAlerts";
import * as Storage from "../WebServer/services/storage/functionsStorage";
import * as AI from "../WebServer/services/ai/functionsAI";

let store;

const call = (method, url, { params, data } = {}) => handleDemoRequest({ method, url, params, data }, store);

beforeEach(() => {
  store = createDemoStore();
  api.defaults.adapter = async (config) => {
    const answer = handleDemoRequest(
      { method: config.method, url: config.url, params: config.params, data: config.data },
      store
    );
    if (!answer) throw new Error(`no demo route for ${config.method} ${config.url}`);
    const response = { data: answer.data, status: answer.status, statusText: "", headers: {}, config, request: {} };
    if (answer.status >= 400) throw Object.assign(new Error("demo error"), { response, config });
    return response;
  };
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("one read and one write per entity", () => {
  test("students", () => {
    expect(call("get", "/student").data.students.length).toBe(store.students.length);
    const tz = store.students[0].tz;
    const res = call("put", `/student/${tz}`, { data: JSON.stringify({ notes: "ملاحظة" }) });
    expect(res.status).toBe(200);
    expect(res.data.student.notes).toBe("ملاحظة");
  });

  test("lessons", () => {
    expect(call("get", "/lesson").data.lessons).toHaveLength(store.lessons.length);
    const id = store.lessons[0]._id;
    const res = call("put", `/lesson/${id}`, { data: { name: "درس معدَّل" } });
    expect(res.data.lesson.name).toBe("درس معدَّل");
    expect(call("get", `/lesson/${id}`).data.lesson.name).toBe("درس معدَّل");
  });

  test("attendance", () => {
    const lesson = store.lessons[0];
    const [year, month, day] = [2026, 10, 20];
    const sheet = call("get", "/attendance/sheet", { params: { lessonId: lesson._id, year, month, day } }).data.schema;
    expect(sheet.items).toHaveLength(lesson.list_students.length);
    const studentId = sheet.items[0].studentId;
    call("post", "/attendance/bulk-save", { data: { lessonId: lesson._id, year, month, day, items: [{ studentId, status: "غائب", notes: "" }] } });
    const again = call("get", "/attendance/sheet", { params: { lessonId: lesson._id, year, month, day } }).data.schema;
    expect(again.items.find((i) => i.studentId === studentId).status).toBe("غائب");
    expect(call("get", "/attendance/dates", { params: { lessonId: lesson._id } }).data.schema.some((d) => d.dateKey === 20261020)).toBe(true);
  });

  test("reports", () => {
    expect(call("get", "/report").data.reports).toHaveLength(2);
    const res = call("post", "/report", { data: { date: "2026-10-22", title: ["نشاط"], stitle: "تقرير جديد", info: "<p>نص</p>", attendance: [] } });
    expect(res.status).toBe(201);
    expect(call("get", `/report/${res.data.report._id}`).data.report.stitle).toBe("تقرير جديد");
  });

  test("vehicles", () => {
    const [vehicle] = call("get", "/vehicle").data.vehicles;
    expect(vehicle.summary.license.state).toBe("due");
    const res = call("post", `/vehicle/${vehicle._id}/archive`, { data: { reason: "" } });
    expect(res.data.vehicle.status).toBe("archived");
  });

  test("files", () => {
    const root = call("get", "/storage/list", { params: { path: "" } }).data;
    expect(root.items.length).toBeGreaterThan(0);
    call("post", "/storage/folder", { data: { path: "", name: "مجلد جديد" } });
    expect(call("get", "/storage/list", { params: { path: "" } }).data.folders.some((f) => f.name === "مجلد جديد")).toBe(true);
  });

  test("notices", () => {
    const unread = call("get", "/notices/unread-count").data.count;
    expect(unread).toBeGreaterThan(0);
    call("post", "/notices/read-all", { data: {} });
    expect(call("get", "/notices/unread-count").data.count).toBe(0);
  });

  test("users", () => {
    const users = call("get", "/user/").data.users;
    expect(users).toHaveLength(store.users.length);
    const res = call("put", `/user/${users[1].tz}`, { data: { city: "مدينة تجريبية" } });
    expect(res.data.ok).toBe(true);
    expect(call("get", `/user/${users[1].tz}`).data.user.city).toBe("مدينة تجريبية");
  });

  test("audit: a write elsewhere adds a row", () => {
    const before = call("get", "/audit").data.total;
    call("delete", `/student/${store.students[0].tz}`);
    const after = call("get", "/audit").data;
    expect(after.total).toBe(before + 1);
    expect(after.items[0].module).toBe("students");
  });

  test("alerts", () => {
    const alerts = call("get", "/alerts").data.alerts;
    expect(alerts.some((a) => !a.read)).toBe(true);
    call("post", `/alerts/${alerts[0].id}/read`);
    expect(call("get", "/alerts").data.alerts.find((a) => a.id === alerts[0].id).read).toBe(true);
  });

  test("dashboard: today's lessons and approving a waiting student", () => {
    expect(call("get", "/lesson/today").data.lessons.length).toBeGreaterThan(0);
    const waiting = store.students.find((s) => s.status === "ينتظر");
    call("put", `/student/${waiting.tz}`, { data: { status: "عادي" } });
    expect(call("get", `/student/${waiting.tz}`).data.student.status).toBe("عادي");
  });
});

test("a POST to students adds a row that the next GET returns", () => {
  const res = call("post", "/student", { data: JSON.stringify({ tz: "11", firstname: "طالب", lastname: "جديد" }) });
  expect(res.status).toBe(201);
  expect(call("get", "/student").data.students.some((s) => s.firstname === "طالب" && s.lastname === "جديد")).toBe(true);
});

test("an unknown URL gives null", () => {
  expect(call("get", "/unknown")).toBeNull();
  expect(call("post", "/unknown", { data: {} })).toBeNull();
});

test("a query string in the URL is read as params", () => {
  const lessonId = store.lessons[0]._id;
  expect(call("get", `/attendance/dates?lessonId=${lessonId}`).data.ok).toBe(true);
});

test("a vehicle document downloads as a demo blob", () => {
  const vehicle = store.vehicles[0];
  const res = call("get", `/vehicle/${vehicle._id}/documents/${vehicle.documents[0].id}/download`);
  expect(res.data).toBeInstanceOf(Blob);
});

const ok = (res) => {
  expect(res.ok).toBe(true);
  return res;
};

describe("demo responses match service shapes", () => {
  const defined = (value) => {
    expect(value).not.toBeUndefined();
    expect(value).not.toBeNull();
  };

  test("students", async () => {
    defined(ok(await Students.getAll()).students);
    const tz = store.students[0].tz;
    defined(ok(await Students.getOne(tz)).student);
    defined(ok(await Students.lookupStudent(tz)).student);
    defined(ok(await Students.create({ tz: "12", firstname: "أ", lastname: "ب" }, { confirm: false })).student);
    defined(ok(await Students.update(tz, { notes: "x" }, { confirm: false })).student);
    ok(await Students.deleteS(tz, { confirm: false }));
  });

  test("lessons", async () => {
    defined(ok(await Lessons.getAllLesson()).lessons);
    defined(ok(await Lessons.getLessonsToday()).lessons);
    defined(ok(await Lessons.getLessonsByQuery({ day: 1 })).lessons);
    const id = store.lessons[0]._id;
    defined(ok(await Lessons.getOneLesson(id)).lesson);
    defined(ok(await Lessons.createLesson({ name: "درس", teacher: store.users[1]._id, room: "1", date: { day: 2, startMin: 600, endMin: 660 } }, { confirm: false })).lesson);
    defined(ok(await Lessons.updateLesson(id, { name: "ج" }, { confirm: false })).lesson);
    ok(await Lessons.addToList(id, { list_students: [store.students[5]._id] }));
    ok(await Lessons.removeFromList(id, [store.students[5]._id]));
    ok(await Lessons.deleteLesson(id, { confirm: false }));
  });

  test("attendance", async () => {
    const id = store.lessons[0]._id;
    const sheet = ok(await Attendance.getAttendanceSheet(id, { year: 2026, month: 10, day: 18 })).sheet;
    defined(sheet.items);
    ok(await Attendance.saveAttendanceSheet(id, { year: 2026, month: 10, day: 18 }, sheet.items));
    defined(ok(await Attendance.getLessonDates(id)).dates);
  });

  test("reports", async () => {
    const reports = ok(await Reports.getAll()).reports;
    defined(reports);
    defined(ok(await Reports.getOne(reports[0]._id)).report);
    defined(ok(await Reports.create({ date: "2026-10-22", title: [], info: "x" }, { confirm: false })).report);
    defined(ok(await Reports.update(reports[0]._id, { info: "y" }, { confirm: false })).report);
    ok(await Reports.deleteR(reports[0]._id, { confirm: false }));
  });

  test("users", async () => {
    const users = ok(await Users.getAll()).users;
    defined(users);
    const tz = users[2].tz;
    defined(ok(await Users.getUserById(tz)).user);
    defined(ok(await Users.getUserPermissions(tz)).effective);
    defined(ok(await Users.create({ tz: "13", firstname: "أ", lastname: "ب" }, { confirm: false })).user);
    defined(ok(await Users.update(tz, { city: "x" }, { confirm: false })).user);
    ok(await Users.changeStatus(tz, "active", "noActive"));
    ok(await Users.saveUserPermissions(tz, { grants: [], revokes: [] }));
    ok(await Users.unlockUser(tz));
    expect((await Users.viewPassword(tz)).ok).toBe(false);
  });

  test("vehicles", async () => {
    const list = ok(await Vehicles.getAllVehicles());
    defined(list.vehicles);
    defined(list.today);
    const id = list.vehicles[0]._id;
    defined(ok(await Vehicles.getVehicle(id)).vehicle);
    defined(ok(await Vehicles.getAlerts()).alerts);
    defined(ok(await Vehicles.getResponsibles()).users);
    defined(ok(await Vehicles.getVehicleAudit(id)).entries);
    defined(ok(await Vehicles.updateVehicle(id, { nickname: "اسم" })).vehicle);
    defined(ok(await Vehicles.licenseApi.add(id, { validUntil: "2027-10-01" })).vehicle);
    defined(ok(await Vehicles.testApi.add(id, { result: "passed", testDate: "2026-10-01" })).vehicle);
    defined(ok(await Vehicles.policyApi.add(id, { type: "mandatory", insurer: "شركة", startDate: "2026-10-01", endDate: "2027-10-01" })).vehicle);
    defined(ok(await Vehicles.setNextTestDate(id, "2027-01-01")).vehicle);
    const docId = list.vehicles[0].documents[0].id;
    defined(ok(await Vehicles.updateDocumentTitle(id, docId, "عنوان")).vehicle);
    const file = await Vehicles.fetchVehicleDocument(id, docId, { inline: true });
    expect(file.ok).toBe(true);
    defined(file.blob);
    defined(ok(await Vehicles.deleteDocument(id, docId)).vehicle);
    defined(ok(await Vehicles.createVehicle({ plate: "0000002", type: "trailer" })).vehicle);
  });

  test("notices", async () => {
    defined(ok(await Notices.getNotices()).notices);
    defined(ok(await Notices.getUnreadCount()).count);
    defined(ok(await Notices.createNotice({ title: "عنوان", body: "نص", severity: "info" })).notice);
    const id = store.notices[0]._id;
    ok(await Notices.markNoticeRead(id));
    ok(await Notices.archiveNotice(id));
    ok(await Notices.markAllNoticesRead());
  });

  test("audit", async () => {
    const res = ok(await Audit.getAudit({ module: "students", page: 1 }));
    defined(res.items);
    defined(res.total);
  });

  test("alerts", async () => {
    const alerts = await Alerts.listAlerts();
    expect(alerts.length).toBeGreaterThan(0);
    await Alerts.markAlertRead(alerts[0].id);
    await Alerts.markAllAlertsRead();
    expect((await Alerts.listAlerts()).every((a) => a.read)).toBe(true);
  });

  test("files", async () => {
    const root = await Storage.getStorageEntries("");
    expect(root.items.length).toBeGreaterThan(0);
    const folder = root.folders[0];
    expect((await Storage.getStorageEntries(folder.path)).files.length).toBeGreaterThan(0);
    defined((await Storage.getStorageStats("")).displayTotalBytes);
    expect((await Storage.createStorageFolder({ path: "", name: "جديد" })).ok).toBe(true);
    const file = root.files[0];
    expect((await Storage.renameStorageFile(file.path, "اسم-جديد.pdf")).ok).toBe(true);
    expect((await Storage.deleteStorageFile("اسم-جديد.pdf")).ok).toBe(true);
    defined((await Storage.getStorageShareStatus(folder)).sharedWith);
    expect((await Storage.getDriveStatus()).connected).toBe(false);
  });

  test("assistant is off in training", async () => {
    expect(await AI.getAiStatus()).toBe(false);
    expect(await AI.listConversations()).toEqual([]);
  });
});

test("Drive shows as not connected in training", () => {
  expect(call("get", "/storage/google/status").data.connected).toBe(false);
});

test("approving the waiting account gives it a role and makes it active", () => {
  const store = createDemoStore();
  const waiting = store.users.find((u) => u.room === "waiting");
  const res = handleDemoRequest({ method: "post", url: `/user/changeStatus/${waiting.tz}`, data: { from: "waiting", to: "active", role: "مساعد" } }, store);
  expect(res.status).toBe(200);
  expect(waiting.room).toBe("active");
  expect(waiting.role).toBe("مساعد");
});

describe("chapters 7-13: every save the guide makes succeeds in the demo store", () => {
  beforeEach(() => {
    jest.spyOn(console, "info").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  test("files: the guide's synthetic file uploads through the service into the store", async () => {
    const res = await Storage.uploadStorageFileAuto(demoUploadFile(), "", "");
    expect(res.ok).toBe(true);
    const root = await Storage.getStorageEntries("");
    const uploaded = root.files.find((f) => f.name === DEMO_UPLOAD_NAME);
    expect(uploaded).toBeDefined();
    expect(uploaded.size).toBe(demoUploadFile().size);
  });

  test("files: the chunked upload endpoints are answered by the store", async () => {
    const file = new File(["demo"], "ملف-كبير.pdf", { type: "application/pdf" });
    const res = await Storage.uploadLargeStorageFile(file, "مستندات الدروس", "");
    expect(res.ok).toBe(true);
    const folder = await Storage.getStorageEntries("مستندات الدروس");
    expect(folder.files.some((f) => f.name === "ملف-كبير.pdf")).toBe(true);
    expect(store.uploads).toEqual({});
  });

  test("files: an upload status for an unknown upload asks for every chunk, and cancel forgets it", async () => {
    const status = await Storage.getStorageUploadStatus("u-unknown");
    expect(status.ok).toBe(true);
    expect(status.receivedChunks).toEqual([]);
    call("post", "/storage/upload-chunk", { data: { uploadId: "u-1", chunkIndex: "0", totalChunks: "2", fileName: "أ.pdf", path: "" } });
    expect(call("get", "/storage/upload-status", { params: { uploadId: "u-1" } }).data).toMatchObject({ totalChunks: 2, receivedChunks: [0], missingChunks: [1] });
    expect((await Storage.cancelStorageUpload("u-1")).ok).toBe(true);
    expect(store.uploads["u-1"]).toBeUndefined();
  });

  test("files: sharing a folder is saved, shown, and can be undone", async () => {
    await Storage.createStorageFolder({ path: "", name: "أنشطة الصيف" });
    const folder = (await Storage.getStorageEntries("")).folders.find((f) => f.name === "أنشطة الصيف");
    const target = store.users[1];
    expect((await Storage.shareStorageEntry(folder, target.tz, "write")).ok).toBe(true);
    const status = await Storage.getStorageShareStatus(folder);
    expect(status.sharedWith).toEqual([expect.objectContaining({ tz: target.tz, role: "write" })]);
    expect((await Storage.getStorageShareStatus({ path: "صور الأنشطة" })).sharedWith).toEqual([]);
    expect((await Storage.unshareStorageEntry(folder, target.tz)).ok).toBe(true);
    expect((await Storage.getStorageShareStatus(folder)).sharedWith).toEqual([]);
  });

  test("files: sharing something that does not exist is refused", () => {
    expect(call("post", "/storage/share", { data: { relativePath: "لا-يوجد", targetTz: store.users[1].tz, role: "read" } }).status).toBe(404);
  });

  test("users: the permissions tab gets the role defaults and what the manager may grant", async () => {
    store = createDemoStore({ meId: "me-1", meTz: "me-tz", role: "ادارة", permissions: [...ADMIN_KEYS, "permissions.manage"] });
    const target = store.users.find((u) => u.role === "مساعد");
    const res = ok(await Users.getUserPermissions(target.tz));
    expect(res.defaults).toEqual(expect.arrayContaining(["students.view", "files.use"]));
    expect(res.defaults).not.toContain("students.create");
    expect(res.effective).toEqual(res.defaults);
    expect(res.grantable).toContain("students.create");
    expect(res.grantable).not.toContain("permissions.manage");
    expect(res.grantable).not.toContain("users.changeRole");
  });

  test("users: a grant then a revoke are saved and change the effective permissions", async () => {
    store = createDemoStore({ meId: "me-1", meTz: "me-tz", role: "ادارة", permissions: [...ADMIN_KEYS, "permissions.manage"] });
    const target = store.users.find((u) => u.role === "مساعد");
    const granted = ok(await Users.saveUserPermissions(target.tz, { grants: ["students.create"], revokes: [] }));
    expect(granted.effective).toContain("students.create");
    expect(granted.updatedAt).toBeTruthy();
    expect(ok(await Users.getUserPermissions(target.tz)).grants).toEqual(["students.create"]);
    const revoked = ok(await Users.saveUserPermissions(target.tz, { grants: [], revokes: [] }));
    expect(revoked.effective).not.toContain("students.create");
  });

  test("users: nobody grants their own permissions, and a non-manager grants nothing", async () => {
    store = createDemoStore({ meId: "me-1", meTz: "me-tz", role: "ادارة", permissions: [...ADMIN_KEYS, "permissions.manage"] });
    const me = store.users.find((u) => u._id === "me-1");
    expect(ok(await Users.getUserPermissions(me.tz)).grantable).toEqual([]);
    store = createDemoStore({ meId: "me-2", role: "مرشد", permissions: ["students.view"] });
    const other = store.users.find((u) => u.role === "مساعد");
    expect(ok(await Users.getUserPermissions(other.tz)).grantable).toEqual([]);
  });

  test("users: a role change is saved; a demotion clears grants and revokes", async () => {
    const target = store.users.find((u) => u.role === "مرشد");
    target.permissionGrants = ["students.create"];
    const up = ok(await Users.changeUserRole(target.tz, "ادارة"));
    expect(up.demoted).toBe(false);
    expect(target.permissionGrants).toEqual(["students.create"]);
    const down = ok(await Users.changeUserRole(target.tz, "مساعد"));
    expect(down.demoted).toBe(true);
    expect(target.role).toBe("مساعد");
    expect(target.permissionGrants).toEqual([]);
  });
});