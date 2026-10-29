// Who on the staff live stream may receive a `change` or `lock` event. The
// events carry only ids, but even an id tells that a record exists and was
// touched, so each one goes only to who may see that kind of record:
//   kind = the change's `entity`, or the lock key's prefix (student:…).
// `visible` is the actor's visible student ids (null = all; see
// utils/studentScope), used for student records. `audience.owner` is a
// report's createdBy (sent with report changes), so a reports.editOwn holder
// still hears about his own reports. Unknown kinds go to nobody.
const { can } = require("../utils/permissions");
const { hasVehiclePermission } = require("../utils/vehicleRules");

const SPORT_VIEW = ["sports.view", "sports.coach", "sports.manage"];
const anyOf = (actor, keys) => keys.some((key) => can(actor?.permissions, key));
const isMe = (actor, ref) => {
  const value = String(ref ?? "").trim();
  return Boolean(value) && (value === String(actor?.id ?? "").trim() || value === String(actor?.tz ?? "").trim());
};

const RULES = {
  student: (actor, id, { visible }) => anyOf(actor, ["students.view"]) && (!visible || visible.has(String(id))),
  lesson: (actor) => anyOf(actor, ["lessons.view"]),
  attendance: (actor) => anyOf(actor, ["attendance.view"]),
  sport: (actor) => anyOf(actor, SPORT_VIEW),
  player: (actor) => anyOf(actor, SPORT_VIEW),
  // The lesson schedule shows sport lessons too (GET /lesson/sport-schedule).
  sportLesson: (actor) => anyOf(actor, [...SPORT_VIEW, "lessons.view"]),
  sportAttendance: (actor) => anyOf(actor, SPORT_VIEW),
  sportNotice: (actor) => anyOf(actor, SPORT_VIEW),
  report: (actor, id, { audience }) => anyOf(actor, ["reports.viewAll"]) || isMe(actor, audience?.owner),
  user: (actor, id) => anyOf(actor, ["users.view"]) || String(actor?.id ?? "") === String(id),
  vehicle: (actor) => hasVehiclePermission(actor, "view"),
};

// type: "change" | "lock"; payload: { entity, id } | { key }.
function mayReceive(actor, type, payload, { visible = null, audience = null } = {}) {
  if (!actor) return false;
  let kind;
  let id;
  if (type === "change") {
    kind = payload?.entity;
    id = payload?.id;
  } else if (type === "lock") {
    [kind, id] = String(payload?.key ?? "").split(":");
  } else {
    return false;
  }
  const rule = Object.hasOwn(RULES, kind) ? RULES[kind] : null;
  return Boolean(rule && rule(actor, id, { visible, audience }));
}

module.exports = { mayReceive };
