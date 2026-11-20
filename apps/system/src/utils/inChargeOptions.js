import { resolveRole } from "./roles";

// «المسؤول» of a program (owner, 2026-11-14/19): الإدارة, المرشدون and, for a
// regular program, المساعدون. A درس تربوي takes only a guide or a manager.
// The search text narrows by first name, last name or the last 4 tz digits;
// the chosen person always stays listed so the select never loses its value.
export const IN_CHARGE_GROUPS = [
  ["ادارة", "الإدارة"],
  ["مرشد", "المرشدون"],
  ["مساعد", "المساعدون"],
];
export const EDUCATIONAL_NEEDS_GUIDE = "البرنامج التربوي يحتاج مرشدًا أو أحد الإدارة مسؤولًا عنه";
const EDUCATIONAL_ROLES = new Set(["مرشد", "ادارة"]);

const normalize = (text) => String(text ?? "").trim().toLowerCase();
export const staffLabel = (u) => `${u.firstname || ""} ${u.lastname || ""}`.trim() + (u.tz ? ` (${String(u.tz).slice(-4)})` : "");

export function matchesSearch(user, search) {
  const q = normalize(search);
  if (!q) return true;
  const tail = String(user?.tz ?? "").slice(-4);
  return [user?.firstname, user?.lastname, `${user?.firstname || ""} ${user?.lastname || ""}`, tail].some((v) => normalize(v).includes(q));
}

// Groups to show: [{ role, label, users }], empty groups left out.
// exclude: an id never offered here (the program's «المساعد»).
// The chosen person always keeps an option: in his group even when a درس
// تربوي hides the assistants (the error message tells why he cannot stay),
// and, when he is not on the staff list any more (left), in a group of his
// own, so the select never shows «اختر» while the form holds his id
// (testing review, 2026-11-20).
export const UNLISTED_LABEL = "المسؤول الحالي (غير موجود في قائمة الطاقم)";
export function inChargeGroups(users, { kind, search = "", chosen = "", exclude = "" } = {}) {
  const list = Array.isArray(users) ? users : [];
  const isChosen = (u) => Boolean(chosen) && String(u._id) === String(chosen);
  const groups = IN_CHARGE_GROUPS
    .map(([role, label]) => ({
      role,
      label,
      users: list.filter((u) => resolveRole(u) === role
        && String(u._id) !== String(exclude || "")
        && (isChosen(u) || ((kind !== "educational" || EDUCATIONAL_ROLES.has(role)) && matchesSearch(u, search)))),
    }))
    .filter((g) => g.users.length > 0);
  if (chosen && !list.some(isChosen)) {
    groups.push({ role: "", label: UNLISTED_LABEL, users: [{ _id: String(chosen), firstname: UNLISTED_LABEL, lastname: "" }] });
  }
  return groups;
}

// The message for a درس تربوي whose «المسؤول» is not a guide or a manager.
export function inChargeError(users, { kind, teacher }) {
  if (kind !== "educational" || !teacher) return null;
  const user = (Array.isArray(users) ? users : []).find((u) => String(u._id) === String(teacher));
  return user && !EDUCATIONAL_ROLES.has(resolveRole(user)) ? EDUCATIONAL_NEEDS_GUIDE : null;
}
