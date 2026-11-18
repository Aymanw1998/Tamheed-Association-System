const { can, effectivePermissions, isSystemTz, isUnblockedItUser, isHiddenIt } = require("../utils/permissions");
const { canSeeAlertType } = require("./alertAccess");
const { isLocked } = require("../utils/loginLockout");

// The alert engine: decides who receives an alert and writes it to each
// recipient's AiAlerts inbox (the live stream picks new rows up from there).
//
// recipientsFor(rule | [rules]) -> Promise<string[]> (tz of each recipient)
//   A rule's selectors must all hold (AND); a list of rules is their union.
//   { permission: key }                 holders of the key
//   { permissions: [keys] }             holders of every key
//   { tz }                              that user
//   { userIds: [_id] }                  those users
//   { it: true }                        IT users who are not blocked
//   { requestAlerts: true }             users IT marked for new-request alerts
//   { scopeOfStudent: _id, permission } users whose student scope includes the
//                                       student (main teacher, teacher/helper of
//                                       a lesson with the student, students.viewAll)
//   system: true                        also the system account; alone, only it
// Only active users are ever returned, and the system account only when the
// rule says system: true.
//
// raise({ type, severity, text, link, dedupKey, recipients }) writes one unread
// row per recipient unless that recipient already has the dedupKey.
const SEVERITIES = new Set(["critical", "important", "info"]);
const LANGS = ["ar", "he", "en"];

// Every alert also goes to its recipients' phones (web push), for whoever
// turned it on in the profile (owner, 2026-11-17: "and everything"; before
// that only no-attendance, absence streaks and a few chosen types pushed).
// A phone gets it only when its owner may still read that alert type in the
// app now (services/alertAccess), like the inbox (Codex review, 2026-11-18).

const SELECTORS = ["permission", "permissions", "tz", "userIds", "scopeOfStudent", "it", "requestAlerts"];

function createAlertEngine({
  listActiveUsers,
  findStudentById,
  lessonsWithStudent,
  store,
  systemTz,
  push = null,
  log = (...args) => console.error("[alertEngine]", ...args),
  now = () => new Date(),
} = {}) {
  const sysTz = () => (systemTz === undefined ? process.env.SYSTEM_ADMIN_TZ : systemTz);

  async function studentScopeIds(studentId) {
    const ids = new Set();
    const student = await findStudentById(String(studentId));
    if (student?.main_teacher) ids.add(String(student.main_teacher));
    for (const lesson of (await lessonsWithStudent(String(studentId))) || []) {
      if (lesson?.teacher) ids.add(String(lesson.teacher));
      if (lesson?.helper) ids.add(String(lesson.helper));
    }
    return ids;
  }

  async function matchRule(rule, people) {
    if (!rule || typeof rule !== "object") return [];
    if (!SELECTORS.some((key) => rule[key] !== undefined)) return [];
    let out = people;
    const keys = [
      ...(rule.permission ? [rule.permission] : []),
      ...(Array.isArray(rule.permissions) ? rule.permissions : []),
    ];
    if (rule.permissions !== undefined && !Array.isArray(rule.permissions)) return [];
    if (keys.length) out = out.filter((u) => keys.every((key) => can(u.permissions, key)));
    if (rule.it !== undefined) out = rule.it === true ? out.filter(isUnblockedItUser) : [];
    if (rule.requestAlerts !== undefined) out = rule.requestAlerts === true ? out.filter((u) => u.receivesRequestAlerts === true) : [];
    if (rule.tz !== undefined) out = out.filter((u) => String(u.tz) === String(rule.tz ?? "").trim());
    if (rule.userIds !== undefined) {
      const ids = new Set((Array.isArray(rule.userIds) ? rule.userIds : []).filter(Boolean).map(String));
      out = out.filter((u) => u._id != null && ids.has(String(u._id)));
    }
    if (rule.scopeOfStudent !== undefined) {
      if (!rule.scopeOfStudent) return [];
      const ids = await studentScopeIds(rule.scopeOfStudent);
      out = out.filter((u) => can(u.permissions, "students.viewAll") || (u._id != null && ids.has(String(u._id))));
    }
    return out;
  }

  async function recipientsFor(ruleOrRules) {
    const rules = Array.isArray(ruleOrRules) ? ruleOrRules : [ruleOrRules];
    const users = ((await listActiveUsers()) || []).filter((u) => u?.tz && String(u.tz).trim());
    const isSystem = (u) => isSystemTz(String(u.tz), sysTz());
    const people = users.filter((u) => !isSystem(u)).map((u) => ({ ...u, permissions: effectivePermissions(u) }));
    const system = users.find(isSystem);

    const out = new Set();
    for (const rule of rules) {
      if (rule?.system === true && system) out.add(String(system.tz));
      for (const user of await matchRule(rule, people)) out.add(String(user.tz));
    }
    return [...out];
  }

  // Of these recipients, those who may read this alert type now: what
  // loadActor would let them into the app with (a locked account gets no push;
  // only the real system account is never locked; Codex re-review, 2026-11-18).
  async function mayRead(tzs, type) {
    const users = ((await listActiveUsers()) || []).filter((u) => u?.tz);
    const byTz = new Map(users.map((u) => [String(u.tz).trim(), u]));
    return tzs.filter((tz) => {
      const user = byTz.get(tz);
      if (!user) return false;
      const realSystem = isSystemTz(String(user.tz), sysTz());
      const hidden = !realSystem && isHiddenIt(user, { systemTz: sysTz() });
      if (isLocked(user, { isSystem: realSystem })) return false;
      const isSystem = realSystem || hidden;
      const actor = { id: String(user._id ?? ""), tz: String(user.tz), permissions: effectivePermissions(user, { isSystem }), isSystem, ...(hidden && { hidden: true }), user };
      return canSeeAlertType(actor, type);
    });
  }

  async function raise({ type, severity, text, link = "", dedupKey, recipients = [] } = {}) {
    if (!type || typeof type !== "string") throw new Error("alert type required");
    if (!SEVERITIES.has(severity)) throw new Error(`unknown alert severity: ${severity}`);
    if (!text || LANGS.some((lang) => typeof text[lang] !== "string" || !text[lang].trim())) {
      throw new Error("alert text needs ar, he and en");
    }
    if (!dedupKey || typeof dedupKey !== "string") throw new Error("alert dedupKey required");

    const tzs = [...new Set((recipients || []).map((tz) => String(tz ?? "").trim()).filter(Boolean))];
    const created = [];
    for (const recipientTz of tzs) {
      const res = await store.insertOnce({
        recipientTz,
        type,
        severity,
        text: { ar: text.ar, he: text.he, en: text.en },
        link: String(link || ""),
        dedupKey,
        readAt: null,
        at: now(),
      });
      if (res?.created) created.push(recipientTz);
    }
    // Phones of the new recipients, never fatal.
    if (created.length && push) {
      try {
        const phones = await mayRead(created, type);
        if (phones.length) await push.sendToStaff(phones, { title: "تمهيد", body: text.ar, url: link || "/" });
      } catch (error) {
        log("push failed", error?.message || error);
      }
    }
    return { created };
  }

  return { recipientsFor, raise };
}

// The production engine, wired to the real collections on first use.
let defaultEngine = null;
function getAlertEngine() {
  if (defaultEngine) return defaultEngine;
  const { Types } = require("mongoose");
  const { UserModelDef } = require("../Entities/User/User.model");
  const { StudentModelDef } = require("../Entities/Student/Student.model");
  const { LessonModelDef } = require("../Entities/Lesson/Lesson.model");
  const { AlertModelDef } = require("../Entities/Alert/Alert.model");
  // A 24-hex id may be stored as a string or as an ObjectId; match both.
  const idMatch = (id) => (/^[0-9a-fA-F]{24}$/.test(id) ? { $in: [id, new Types.ObjectId(id)] } : id);
  defaultEngine = createAlertEngine({
    listActiveUsers: async () => (await UserModelDef.get({}, "active"))?.result || [],
    findStudentById: async (id) => (await StudentModelDef.get({ _id: idMatch(id) }))?.result?.[0] || null,
    lessonsWithStudent: async (id) => (await LessonModelDef.get({ list_students: idMatch(id) }))?.result || [],
    store: AlertModelDef,
    // Loaded on first send so a missing push setup never breaks alerts.
    push: { sendToStaff: (...args) => require("../utils/push").push.sendToStaff(...args) },
  });
  return defaultEngine;
}

module.exports = {
  createAlertEngine,
  getAlertEngine,
  recipientsFor: (rule) => getAlertEngine().recipientsFor(rule),
  raise: (alert) => getAlertEngine().raise(alert),
};
