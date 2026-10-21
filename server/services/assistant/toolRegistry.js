// The assistant's tools. Every tool runs as the signed-in user (req.actor)
// with the same can(...) and student-scope rules as the HTTP routes, and
// returns minimal JSON data (never instructions).
//
//   definitions                 Anthropic tool definitions, fixed order, strict: true
//   run(name, input, actor, { conversationId }?)
//                               -> Promise<object>; never throws:
//                                  unknown tool / input not matching the schema -> { error: "INVALID_INPUT" }
//                                  no permission -> { error: "FORBIDDEN" }; hidden or missing -> { error: "NOT_FOUND" }
//                                  a failure inside the tool -> { error: "FAILED" }
//   forModel(result)            the result as the model should see it (navigate paths removed;
//                               a proposal as { pendingActionId, summary } only)
//   createToolRegistry({ deps }) the same with injected data access (tests)
//
// The propose_* tools change nothing: they store a pending action that runs
// only when the user approves it (actionRunner.js); they need the chat's
// conversationId. There are no tools to delete anything, change permissions
// or an existing role, or touch passwords (spec, part 2).
const { can, isSystemTz, SYSTEM_ACTOR_NAME } = require("../../utils/permissions");
const { createStudentScope } = require("../../utils/studentScope");
const { check, apiSchema } = require("./validateInput");
const { fullName, rows } = require("./tools/_shared");

const TOOLS = [
  require("./tools/whoami"),
  require("./tools/search_students"),
  require("./tools/get_student"),
  require("./tools/list_lessons"),
  require("./tools/attendance_summary"),
  require("./tools/pending_items"),
  require("./tools/vehicle_alerts"),
  require("./tools/my_reports"),
  require("./tools/notices"),
  require("./tools/navigate"),
  require("./tools/propose_attendance"),
  require("./tools/propose_add_student_to_lesson"),
  require("./tools/propose_report"),
  require("./tools/propose_notice"),
  require("./tools/propose_approve_user"),
];

const definitions = Object.freeze(TOOLS.map((tool) => Object.freeze({
  name: tool.name,
  description: tool.description,
  input_schema: apiSchema(tool.input_schema),
  strict: true,
})));

const SECRET_KEYS = new Set([
  "password", "passwordHash", "refreshHash", "resetOtpHash", "resetOtpExpires", "resetOtpAttempts",
  "resetOtpLockedUntil", "failedLoginCount", "token", "otp",
]);

// Last line of defence on every result: no secret fields, and nothing that
// names the system account (objects carrying its tz are dropped, the tz
// itself is blanked).
function scrub(value, systemTz) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => !(item && typeof item === "object" && isSystemTz(item.tz, systemTz)))
      .map((item) => scrub(item, systemTz));
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (SECRET_KEYS.has(key)) continue;
      out[key] = scrub(v, systemTz);
    }
    return out;
  }
  if (typeof value === "string" && isSystemTz(value, systemTz)) return "";
  return value;
}

// navigate's path can carry an ID number (students and users are opened by
// tz): the browser gets it, the model only learns that the button was shown.
function forModel(result) {
  // A proposal: the card (pendingAction) goes to the browser only.
  if (result && typeof result === "object" && result.pendingAction) {
    return { pendingActionId: result.pendingActionId, summary: result.summary };
  }
  if (result && typeof result === "object" && result.navigate) {
    const { path, ...rest } = result.navigate;
    return { navigate: rest, shown: true };
  }
  return result;
}

const once = (fn) => { let p = null; return () => (p ||= fn()); };

function defaultDeps() {
  const { StudentModelDef } = require("../../Entities/Student/Student.model");
  const { LessonModelDef } = require("../../Entities/Lesson/Lesson.model");
  const { AttendanceModelDef } = require("../../Entities/Attendance/Attendance.model");
  const { ReportModelDef } = require("../../Entities/Report/Report.model");
  const { UserModelDef } = require("../../Entities/User/User.model");
  const { VehicleModelDef } = require("../../Entities/Vehicle/Vehicle.model");
  const noticeService = require("../../Entities/Notice/Notice.service");
  const { logWithSource } = require("../../middleware/logger");
  return {
    models: {
      Student: StudentModelDef, Lesson: LessonModelDef, Attendance: AttendanceModelDef,
      Report: ReportModelDef, User: UserModelDef, Vehicle: VehicleModelDef,
    },
    notices: noticeService,
    now: () => new Date(),
    log: (...args) => logWithSource("[assistant.tool]", ...args),
    actions: require("./actionRunner"),
  };
}

function createToolRegistry({ deps } = {}) {
  let resolved = deps || null;
  const getDeps = () => (resolved ||= defaultDeps());
  const byName = new Map(TOOLS.map((tool) => [tool.name, tool]));
  let scope = null;

  function contextFor(actor, conversationId) {
    const d = getDeps();
    const systemTz = d.systemTz ?? process.env.SYSTEM_ADMIN_TZ;
    scope ||= createStudentScope({ lessonModel: d.models.Lesson, studentModel: d.models.Student });
    return {
      actor,
      models: d.models,
      notices: d.notices,
      now: d.now ? d.now() : new Date(),
      can: (key) => can(actor, key),
      isSystemTz: (tz) => isSystemTz(tz, systemTz),
      visible: once(() => scope.visibleStudentIds(actor)),
      // Active users by _id (and .byTz), for names; the system account is left out.
      users: once(async () => {
        const map = new Map();
        map.byTz = new Map();
        for (const u of rows(await d.models.User.get({}, "active"))) {
          if (isSystemTz(u.tz, systemTz)) continue;
          const entry = { name: fullName(u) };
          map.set(String(u._id), entry);
          if (u.tz) map.byTz.set(String(u.tz), entry);
        }
        return map;
      }),
      systemTz,
      // Stores a proposal for the user to approve (propose_* tools only).
      propose: (type, params) => (conversationId
        ? d.actions.propose({ actor, conversationId: String(conversationId), type, params })
        : { error: "INVALID_INPUT", message: "no conversation" }),
    };
  }

  async function run(name, input, actor, { conversationId } = {}) {
    const tool = typeof name === "string" ? byName.get(name) : null;
    if (!tool) return { error: "INVALID_INPUT", message: "unknown tool" };
    if (!actor || !(actor.permissions instanceof Set)) return { error: "FORBIDDEN" };
    const reason = check(tool.input_schema, input);
    if (reason) return { error: "INVALID_INPUT", message: reason };
    const d = getDeps();
    const ctx = contextFor(actor, conversationId);
    // Technical log (spec part 5): who, which tool, which input fields. Never
    // the values (a child's name or ID number) and never the result.
    d.log?.("call", { actor: actor.isSystem ? SYSTEM_ACTOR_NAME : String(actor.id ?? ""), tool: name, inputKeys: Object.keys(input) });
    try {
      return scrub(await tool.run(input, ctx), ctx.systemTz);
    } catch (error) {
      // The error name only: a message can quote the values that failed.
      d.log?.("failed", { tool: name, error: String(error?.name || "Error") });
      return { error: "FAILED" };
    }
  }

  return { definitions, run, tools: TOOLS };
}

const defaultRegistry = createToolRegistry();

module.exports = {
  definitions,
  run: (name, input, actor, options) => defaultRegistry.run(name, input, actor, options),
  forModel,
  createToolRegistry,
  scrub,
};
