import api from "../api";
import { normalizeUser } from "../user/functionsUser.jsx";
import { normalizeStudent } from "../student/functionsStudent.jsx";
import { normalizeLesson } from "../lesson/functionsLesson.jsx";

// GET /api/dashboard/summary: the dashboard's four parts in one request. Each
// part has the same shape the separate list functions return:
//   users: { ok, users } | null (no users.view), students: { ok, students },
//   lessons: { ok, lessons }, reports: { ok, count }
// Never throws: a failed request gives every part { ok: false }.
const failed = { ok: false };

export const getDashboardSummary = async () => {
  try {
    const { data } = await api.get("/dashboard/summary");
    if (!data?.ok) throw new Error("summary failed");
    const part = (value, key, normalize) => {
      if (value === null || value === undefined) return null;
      if (!value.ok) return failed;
      return { ok: true, [key]: (value[key] || []).map(normalize).filter(Boolean) };
    };
    return {
      users: part(data.users, "users", normalizeUser),
      students: part(data.students, "students", normalizeStudent) || failed,
      lessons: part(data.lessons, "lessons", normalizeLesson) || failed,
      reports: data.reports?.ok ? { ok: true, count: Number(data.reports.count) || 0 } : failed,
    };
  } catch {
    return { users: failed, students: failed, lessons: failed, reports: failed };
  }
};
