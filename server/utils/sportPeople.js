// Users as sport players (owner, 2026-11-09). A football player is a student
// or an everyday user (staff). Both are kept the same way: the person's _id
// sits in the existing `studentId` fields (player row, lesson roster,
// attendance, login code, push), and a user's player row has kind "user".
// This adapter reads and writes "a person" (the student, else the active,
// non-hidden user) for the sport controller and the Sport portal, so their
// flows keep one shape. Users come back tagged kind: "user".
const { isHiddenUser } = require("./permissions");

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
// The user model's default email (User.model.js): never a real address.
const PLACEHOLDER_EMAIL = "test@test.com";

// A user player has no statistics (owner): his card shows none and none are kept.
const NO_STATS = { ok: false, code: "NO_STATS_FOR_STAFF", message: "لا تُسجَّل إحصائيات للموظفين" };

const rows = (r) => (r?.success && Array.isArray(r.result) ? r.result : []);
const isUserPlayer = (player) => player?.kind === "user";

const asPerson = (user) => ({
  ...user,
  kind: "user",
  email: String(user.email || "").trim().toLowerCase() === PLACEHOLDER_EMAIL ? "" : user.email,
});

function createSportPeople(deps = {}) {
  // Loaded on first use, so requiring this file pulls in no model.
  const students = () => deps.students || require("../Entities/Student/Student.model").StudentModelDef;
  const users = () => deps.users || require("../Entities/User/User.model").UserModelDef;

  const visibleUsers = async (filter) => rows(await users().get(filter, "active"))
    .filter((u) => !isHiddenUser(u))
    .map(asPerson);

  // Students matching `filter`, then visible users matching it.
  async function get(filter = {}) {
    const [found, staff] = await Promise.all([students().get(filter), visibleUsers(filter)]);
    return { success: true, result: [...rows(found), ...staff] };
  }

  // The student when one matches; otherwise the visible user, by his _id.
  async function updateExisting(filter, data) {
    const written = await students().updateExisting(filter, data);
    if (written?.result) return written;
    const user = (await visibleUsers(filter))[0];
    if (!user) return { success: true, result: null };
    const saved = await users().updateExisting({ _id: String(user._id) }, data, "active");
    return { success: true, result: saved?.result ? asPerson(saved.result) : null };
  }

  // The person behind an id, or null. Only ObjectId-like strings are looked up.
  async function findPerson(id) {
    if (typeof id !== "string" || !OBJECT_ID.test(id)) return null;
    return rows(await get({ _id: id })).find((p) => String(p._id) === id) || null;
  }

  async function peopleMap() {
    return new Map(rows(await get({})).map((p) => [String(p._id), p]));
  }

  return { get, updateExisting, findPerson, peopleMap };
}

module.exports = { createSportPeople, sportPeople: createSportPeople(), isUserPlayer, NO_STATS, PLACEHOLDER_EMAIL };
