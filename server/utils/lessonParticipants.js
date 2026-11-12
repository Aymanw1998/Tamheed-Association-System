// Users (staff) as lesson participants (owner, 2026-11-09). A lesson keeps
// them in `list_users` (user _ids), beside its students. The rules live here:
// who may be added, and that a lesson's teacher or helper is never also one
// of its participants. Used by the lesson and attendance controllers.
const { isHiddenUser } = require("./permissions");

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const CLASH = {
  ok: false,
  code: "STAFF_IS_PARTICIPANT",
  message: "لا يمكن أن يكون المرشد أو المساعد مشاركًا في نفس البرنامج",
};

const asList = (value) => (Array.isArray(value) ? value : []);

// The lesson's teacher and helper, as strings.
function staffIds(lesson) {
  return new Set([lesson?.teacher, lesson?.helper].filter((v) => v != null && v !== "").map(String));
}

// Participants who are also the lesson's teacher or helper.
function staffClash(lesson) {
  const staff = staffIds(lesson);
  return asList(lesson?.list_users).map(String).filter((id) => staff.has(id));
}

function isParticipant(actor, lesson) {
  const me = String(actor?.id ?? "");
  return Boolean(me) && asList(lesson?.list_users).some((id) => String(id) === me);
}

// The active, everyday account behind an id, or null.
async function findActive(userModel, id) {
  if (!OBJECT_ID.test(String(id))) return null;
  const found = await userModel.get({ _id: String(id) }, "active");
  const user = (found?.result || []).find((u) => String(u._id) === String(id));
  return user && !isHiddenUser(user) ? user : null;
}

// Which of `ids` may join the lesson: active everyday users, not its teacher
// or helper, not already on it. Duplicates are dropped; order is kept.
async function addableUsers(userModel, ids, lesson) {
  const staff = staffIds(lesson);
  const seen = new Set(asList(lesson?.list_users).map(String));
  const accepted = [];
  const refused = [];
  for (const raw of asList(ids)) {
    const id = String(raw);
    if (seen.has(id)) continue;
    seen.add(id);
    if (staff.has(id)) refused.push({ id, reason: "STAFF" });
    else if (!(await findActive(userModel, id))) refused.push({ id, reason: "NOT_FOUND" });
    else accepted.push(id);
  }
  return { ids: accepted, refused };
}

const fullName = (user) => `${user.firstname || ""} ${user.lastname || ""}`.trim();

// The participants still active, with their names, in the stored order.
async function activeUsers(userModel, ids) {
  const out = [];
  for (const raw of asList(ids)) {
    const user = await findActive(userModel, raw);
    if (user) out.push({ _id: String(user._id), name: fullName(user) });
  }
  return out;
}

module.exports = { OBJECT_ID, CLASH, staffIds, staffClash, isParticipant, findActive, addableUsers, activeUsers, fullName };
