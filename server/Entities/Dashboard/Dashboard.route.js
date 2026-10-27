const express = require("express");
const { requireAuth } = require("../../middleware/authMiddleware");
const { loadActor } = require("../../middleware/permissionMiddleware");
const { logWithSource } = require("../../middleware/logger");
const { can } = require("../../utils/permissions");

// GET /api/dashboard/summary: what the dashboard shows, in one request instead
// of four. It runs the existing list handlers with the caller's request, in
// parallel, so their scope rules stay theirs. Each part first needs the same
// permission as its own route (PARTS); without it the part is null and its
// handler never runs:
//   { ok, users: { ok, users } | null, students: { ok, students } | null,
//     lessons: { ok, lessons } | null, reports: { ok, count } }
// (the dashboard shows only the report count). A part that failed answers
// { ok: false }; the others still arrive.
const PARTS = {
  users: "users.view", // GET /api/user
  students: "students.view", // GET /api/student
  lessons: "lessons.view", // GET /api/lesson
  reports: null, // GET /api/report: any signed-in user, scoped in the controller
};

// Runs one handler with this request and keeps its answer. The request keeps
// everything (actor, user, headers) but has no query or route params.
function invoke(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body }); return this; },
      set() { return this; },
      setHeader() {},
    };
    const call = Object.assign(Object.create(req), { query: {}, params: {}, body: {} });
    Promise.resolve()
      .then(() => handler(call, res))
      .catch((error) => {
        logWithSource("Dashboard.summary", error);
        resolve({ status: 500, body: { ok: false } });
      });
  });
}

const answered = (part) => part.status >= 200 && part.status < 300 && part.body?.ok !== false;

function createDashboardRouter({ requireAuth, loadActor, handlers }) {
  const router = express.Router();

  router.get("/summary", requireAuth, loadActor, async (req, res) => {
    try {
      const h = handlers();
      const allowed = (part) => PARTS[part] === null || can(req.actor?.permissions, PARTS[part]);
      const run = (part) => (allowed(part) ? invoke(h[part], req) : Promise.resolve(null));
      const [users, students, lessons, reports] = await Promise.all([run("users"), run("students"), run("lessons"), run("reports")]);
      const list = (part, key) => (part ? (answered(part) ? { ok: true, [key]: part.body[key] || [] } : { ok: false }) : null);
      return res.status(200).json({
        ok: true,
        users: list(users, "users"),
        students: list(students, "students"),
        lessons: list(lessons, "lessons"),
        reports: answered(reports) ? { ok: true, count: (reports.body.reports || []).length } : { ok: false },
      });
    } catch (error) {
      logWithSource("Dashboard.summary", error);
      return res.status(500).json({ ok: false, message: "حدث خطأ غير متوقع، حاول مرة أخرى" });
    }
  });

  return router;
}

// The controllers are read when the route is first used, so requiring this
// file does not pull in the database layer.
const router = createDashboardRouter({
  requireAuth,
  loadActor,
  handlers: () => ({
    users: require("../User/User.controller").getAllU,
    students: require("../Student/Student.controller").getAllS,
    lessons: require("../Lesson/Lesson.controller").getAll,
    reports: require("../Report/Report.controller").getAll,
  }),
});

module.exports = router;
module.exports.createDashboardRouter = createDashboardRouter;
