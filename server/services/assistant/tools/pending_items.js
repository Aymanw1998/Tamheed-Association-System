const { isLocked } = require("../../../utils/loginLockout");
const { FORBIDDEN, fullName, rows, jerusalemDate } = require("./_shared");

const MAX = 20;
const PARENT_SOURCE = "اهل";
const WAITING = "ينتظر";

const section = (items) => ({ count: items.length, items: items.slice(0, MAX) });

// What waits for the user, only the kinds they hold the permission for
// (spec decision #4): parent registrations (students.viewAll + students.edit),
// users in the waiting room (users.approve), locked accounts (users.unlock;
// the system account holds every permission). Nothing at all -> FORBIDDEN.
module.exports = {
  name: "pending_items",
  description: "Items waiting for the user, only the kinds they may handle: parent registrations waiting for approval, "
    + "new users in the waiting room, and accounts locked after failed logins. Each kind: count and up to 20 items "
    + "(id, name, date). FORBIDDEN means the user handles none of these.",
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  async run(input, ctx) {
    const kinds = {
      parentRegistrations: ctx.can("students.viewAll") && ctx.can("students.edit"),
      waitingUsers: ctx.can("users.approve"),
      lockedAccounts: ctx.can("users.unlock"),
    };
    if (!Object.values(kinds).some(Boolean)) return FORBIDDEN;
    const out = {};
    const notSystem = (u) => !ctx.isSystemTz(u.tz);

    if (kinds.parentRegistrations) {
      const found = rows(await ctx.models.Student.get({ source: PARENT_SOURCE, status: WAITING }));
      out.parentRegistrations = section(found.filter(notSystem).map((s) => ({
        id: String(s._id), name: fullName(s), school: s.school || "", layer: s.layer || "",
        date: jerusalemDate(s.createdAt),
      })));
    }
    if (kinds.waitingUsers) {
      const found = rows(await ctx.models.User.get({}, "waiting"));
      out.waitingUsers = section(found.filter(notSystem).map((u) => ({
        id: String(u._id), name: fullName(u), date: jerusalemDate(u.createdAt),
      })));
    }
    if (kinds.lockedAccounts) {
      const found = rows(await ctx.models.User.get({ lockedAt: { $ne: null } }, "active"));
      out.lockedAccounts = section(found.filter((u) => notSystem(u) && isLocked(u)).map((u) => ({
        id: String(u._id), name: fullName(u), date: jerusalemDate(u.lockedAt),
      })));
    }
    return out;
  },
};
