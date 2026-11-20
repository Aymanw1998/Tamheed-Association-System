// «المسؤول» of a program (owner, 2026-11-14 and 2026-11-19; spec
// docs/superpowers/specs/2026-11-19-student-to-staff-design.md, section A).
// A regular program may be run by any staff member, an assistant included; a
// درس تربوي only by a guide or a manager, since it enrols the students of its
// person in charge. Checked on the merged record (stored + body) before any
// write, so a teacher change, a kind change, or both are all covered.
const { resolveRole, isHiddenUser } = require("./permissions");

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const EDUCATIONAL_ROLES = new Set(["مرشد", "ادارة"]);

const EDUCATIONAL_NEEDS_GUIDE = {
  ok: false,
  code: "EDUCATIONAL_NEEDS_GUIDE",
  message: "البرنامج التربوي يحتاج مرشدًا أو أحد الإدارة مسؤولًا عنه",
};
const SAME_STAFF = { ok: false, code: "SAME_STAFF", message: "لا يمكن أن يكون المسؤول هو المساعد نفسه" };
const INVALID_TEACHER = { ok: false, code: "INVALID_STAFF", message: "المسؤول غير موجود أو غير فعّال" };
const LOOKUP_FAILED = { ok: false, code: "STAFF_LOOKUP_FAILED", message: "تعذر التحقق من المسؤول، حاول مرة أخرى" };

const same = (a, b) => a != null && a !== "" && b != null && b !== "" && String(a) === String(b);

// The person in charge as an active, visible user, or null. Throws on a failed
// lookup, so the caller fails closed.
async function activeStaff(UserModelDef, id) {
  if (!id || !OBJECT_ID.test(String(id))) return null;
  const found = await UserModelDef.get({ _id: String(id) }, "active");
  if (found && found.success === false) throw new Error("user lookup failed");
  const user = (found?.result || [])[0];
  return user && !isHiddenUser(user) ? user : null;
}

/**
 * Checks «المسؤول» of `next` (the merged program). `current` is the stored
 * program on an update, null on create. Returns null when fine, or
 * { status, body } to answer with.
 *
 * The teacher is looked up only when it is new or changed, or when the program
 * is (or becomes) educational, so an old program whose teacher has since left
 * can still be edited in other ways.
 */
async function checkInCharge(UserModelDef, next, current = null) {
  if (same(next?.teacher, next?.helper)) return { status: 400, body: SAME_STAFF };
  const educational = next?.kind === "educational";
  const teacherChanged = !current || String(next?.teacher ?? "") !== String(current?.teacher ?? "");
  const kindChanged = !current || (next?.kind || "regular") !== (current?.kind || "regular");
  if (!teacherChanged && !(educational && kindChanged)) return null;
  let teacher;
  try {
    teacher = await activeStaff(UserModelDef, next?.teacher);
  } catch {
    return { status: 503, body: LOOKUP_FAILED };
  }
  if (!teacher) return { status: 400, body: INVALID_TEACHER };
  if (educational && !EDUCATIONAL_ROLES.has(resolveRole(teacher))) return { status: 400, body: EDUCATIONAL_NEEDS_GUIDE };
  return null;
}

module.exports = { checkInCharge, EDUCATIONAL_NEEDS_GUIDE, SAME_STAFF, INVALID_TEACHER, EDUCATIONAL_ROLES };
