const { FORBIDDEN, NOT_FOUND, invalid, OBJECT_ID_RE, rows } = require("./_shared");

// The fixed list of screens (client/src/Components/Routes/Routes.jsx).
// `needs`: the permission the screen's data needs; `id`: what the :id in
// the path is. Students and users are opened by their ID number in the URL,
// so the tool looks the record up (in the user's scope) to build the path;
// forModel() in the registry keeps that path away from the model.
const SCREENS = {
  dashboard: { path: "/dashboard" },
  students: { path: "/students", needs: "students.view" },
  student: { path: "/students/", needs: "students.view", id: "student" },
  lessons: { path: "/lessons", needs: "lessons.view" },
  lesson: { path: "/lessons/", needs: "lessons.view", id: "lesson" },
  attendance: { path: "/calendar", needs: "attendance.view" },
  reports: { path: "/reports" },
  report: { path: "/reports/", id: "report" },
  vehicles: { path: "/vehicles", needs: "vehicles.view" },
  vehicle: { path: "/vehicles/", needs: "vehicles.view", id: "vehicle" },
  files: { path: "/files", needs: "files.use" },
  notices: { path: "/notices", needs: "notices.view" },
  users: { path: "/users", needs: "users.view" },
  user: { path: "/users/", needs: "users.view", id: "user" },
  audit: { path: "/audit", needs: "audit.view" },
  profile: { path: "/profile" },
};
const USER_ROOMS = ["active", "waiting", "noActive"];
// A record without an ID number cannot be opened (the route needs it).
const blankToNull = (tz) => (tz == null || String(tz).trim() === "" ? null : String(tz));

// Returns the path segment for `id`, or null when the user may not open it.
const RESOLVE = {
  async student(id, ctx) {
    const student = rows(await ctx.models.Student.get({ _id: id }))[0];
    const visible = await ctx.visible();
    if (!student || ctx.isSystemTz(student.tz) || (visible && !visible.has(String(student._id)))) return null;
    return blankToNull(student.tz);
  },
  async lesson(id, ctx) {
    return rows(await ctx.models.Lesson.get({ _id: id }))[0] ? id : null;
  },
  async vehicle(id, ctx) {
    return rows(await ctx.models.Vehicle.get({ _id: id }))[0] ? id : null;
  },
  // GET /api/reports/:id: reports.viewAll or the author.
  async report(id, ctx) {
    const report = rows(await ctx.models.Report.get({ _id: id }))[0];
    if (!report) return null;
    const by = String(report.createdBy ?? "").trim();
    const own = Boolean(by) && (by === String(ctx.actor.id) || by === String(ctx.actor.tz));
    return ctx.can("reports.viewAll") || own ? id : null;
  },
  async user(id, ctx) {
    for (const room of USER_ROOMS) {
      const user = rows(await ctx.models.User.get({ _id: id }, room))[0];
      if (user) return ctx.isSystemTz(user.tz) ? null : blankToNull(user.tz);
    }
    return null;
  },
};

module.exports = {
  name: "navigate",
  description: "Offer the user a button that opens a screen of the app. Screens: dashboard, students, student, lessons, lesson, "
    + "attendance, reports, report, vehicles, vehicle, files, notices, users, user, audit, profile. "
    + "student, lesson, report, vehicle and user need the id returned by another tool. Use it when the user wants to "
    + "go somewhere or act on a screen.",
  input_schema: {
    type: "object",
    properties: {
      screen: { type: "string", enum: Object.keys(SCREENS) },
      id: { type: "string", maxLength: 64, description: "Record id, for the single-record screens." },
    },
    required: ["screen"],
    additionalProperties: false,
  },
  SCREENS,
  async run({ screen, id: rawId }, ctx) {
    // Stored ids are lower-case hex.
    const id = rawId?.toLowerCase();
    const def = SCREENS[screen];
    if (def.needs && !ctx.can(def.needs)) return FORBIDDEN;
    if (!def.id) return { navigate: { screen, id: null, path: def.path } };
    if (!id) return invalid(`${screen} needs an id`);
    if (!OBJECT_ID_RE.test(id)) return invalid("id must be 24 hex characters");
    const segment = await RESOLVE[def.id](id, ctx);
    if (!segment) return NOT_FOUND;
    return { navigate: { screen, id, path: `${def.path}${encodeURIComponent(segment)}` } };
  },
};
