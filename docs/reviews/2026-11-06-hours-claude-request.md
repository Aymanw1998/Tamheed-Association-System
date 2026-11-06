PENDING read-only actual Claude Code review. Codex implements; do not edit, use tools or spawn reviewers. The most recent actual Claude response is its weekly quota limit until Nov 8 16:00 Asia/Jerusalem, so this packet is retained for availability.
Owner requests: desktop weekly/day program timeline 13:00–22:00, more compact on a computer; both create and edit refuse schedules outside those hours. Whole program must fit; end later than start. Preserve legacy out-of-hours records visibly without changing stored data. Check drag rescheduling, responsive geometry/hit-testing, exact boundaries and malformed input. Existing minimum-duration UI behavior was not a new policy request. Source below only, no env, credentials, runtime logs or user records. Return concrete findings with file/line and failure scenario.

SOURCE: server/Entities/Lesson/Lesson.controller.js

const { LessonModelDef } = require("./Lesson.model");
const { logWithSource } = require("../../middleware/logger");
const { audit } = require("../../utils/audit");
const { UserModelDef } = require("../User/User.model");
const { isSystemTz, isHiddenUser } = require("../../utils/permissions");
const { StudentModelDef } = require("../Student/Student.model");
const { SportLessonModelDef } = require("../Sport/SportLesson.model");
const { conflictsInRoom9 } = require("../../utils/lessonConflict");
const { createStudentScope, mergeRoster, scopeLesson } = require("../../utils/studentScope");
const { contactById } = require("../../utils/guideContact");
// Without lessons.viewAll only the lessons the actor teaches or assists in.
const { isOnLesson, mayOpenLesson, mayViewLesson, ownLessons, responsibleStudentIds, seesAllLessons } = require("../../utils/lessonAccess");
const { checkVersion, editorStamp, sameVersion, raceLost } = require("../../middleware/lockGuard");
const { notifyChange } = require("../../services/liveHub");

// Student scope: null (students.viewAll, today's behaviour) or the Set of
// student _ids the actor may see. Hidden ids never leave the server; the
// stored roster and the audit rows keep the true list.
const scope = createStudentScope({ lessonModel: LessonModelDef, studentModel: StudentModelDef });

// Waiting-list status (parent registration, until staff approve).
const PENDING_STATUS = "ينتظر";

// _ids a scoped actor may put on a roster (addToList, postOne): only students
// he can already see, that exist and are not waiting. A hidden _id is never
// accepted, so guessing ObjectIds pulls no one in. Duplicates are dropped.
async function addableIds(ids, visible) {
  const accepted = [];
  const seen = new Set();
  for (const s of Array.isArray(ids) ? ids : []) {
    const key = String(s);
    if (seen.has(key) || !visible.has(key) || !OBJECT_ID.test(key)) continue;
    seen.add(key);
    const found = await StudentModelDef.get({ _id: key });
    const student = found?.result?.[0];
    if (student && student.status !== PENDING_STATUS) accepted.push(s);
  }
  return accepted;
}

// list_tz: students named by their full ID number (the way to add someone the
// actor cannot see). Each string is trimmed and matched exactly; waiting,
// unknown, partial and non-string entries are dropped. Returns student _ids.
async function idsFromTz(tzs) {
  const ids = [];
  for (const raw of Array.isArray(tzs) ? tzs : []) {
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const tz = String(raw).trim();
    if (!tz) continue;
    const found = await StudentModelDef.get({ tz });
    const student = (found?.result || []).find((s) => String(s.tz) === tz);
    if (student && student.status !== PENDING_STATUS) ids.push(String(student._id));
  }
  return ids;
}

// _ids an unscoped actor (students.viewAll) may put on a roster: students who
// exist and are accepted in the association (not waiting), so a mistyped or
// made-up id is never stored. Duplicates are dropped.
async function existingIds(ids) {
  const accepted = [];
  const seen = new Set();
  for (const s of ids) {
    const key = String(s);
    if (seen.has(key) || !OBJECT_ID.test(key)) continue;
    seen.add(key);
    const found = await StudentModelDef.get({ _id: key });
    const student = found?.result?.[0];
    if (student && student.status !== PENDING_STATUS) accepted.push(s);
  }
  return accepted;
}

// list_students, when sent, must be a list.
const notAList = (body) => body?.list_students !== undefined && !Array.isArray(body.list_students);
const NOT_A_LIST = { ok: false, code: "BAD_LIST", message: "قائمة الطلاب غير صالحة" };

// Most full ID numbers one request may name; more is refused (TOO_MANY).
const MAX_LIST_TZ = 50;
const tooManyTz = (body) => Array.isArray(body?.list_tz) && body.list_tz.length > MAX_LIST_TZ;
const TOO_MANY = { ok: false, code: "TOO_MANY", message: "عدد كبير من أرقام الهوية" };

// Appends ids to a list, skipping ones already present (as strings).
function appendNew(list, ids) {
  const have = new Set(list.map(String));
  const out = [...list];
  for (const id of ids) if (!have.has(String(id))) { have.add(String(id)); out.push(id); }
  return out;
}

const FORBIDDEN = { code: "FORBIDDEN", message: "لا توجد صلاحية" };

// The system account is never a teacher or helper. A failed lookup throws
// (500) rather than letting it through. Only a 24-hex ObjectId can name an
// account, so other values are not looked up (that would be a CastError, 500).
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
async function namesSystemAccount(ids) {
  for (const id of ids.filter((value) => value && OBJECT_ID.test(String(value)))) {
    const found = await UserModelDef.get({ _id: String(id) }, "active");
    if ((found?.result || []).some((user) => isHiddenUser(user))) return true;
  }
  return false;
}
const SYSTEM_STAFF = { ok: false, code: "INVALID_STAFF", message: "المرشد أو المساعد غير موجود" };

/* ===================== optional notify ===================== */
let notify = null;
try {
  ({ notify } = require("../Notification/Notification.controller"));
} catch (e) {
  notify = null;
}

const safeNotify = async (payload) => {
  try {
    if (typeof notify === "function") await notify(payload);
  } catch (e) {
    logWithSource("Lesson.safeNotify", e);
  }
};

/* ===================== helpers ===================== */

const toInt = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
const PROGRAM_HOURS = { ok: false, code: "PROGRAM_HOURS", message: "يجب أن يكون موعد البرنامج بين 13:00 و22:00، وأن تكون ساعة الانتهاء بعد ساعة البدء." };
function validProgramHours(date = {}) {
  if (!date || typeof date !== "object") return false;
  if (["startMin", "endMin"].some((key) => Object.hasOwn(date, key) && date[key] == null)) return false;
  const start = date.startMin ?? (date.hh != null ? Number(date.hh) * 60 : 780);
  const end = date.endMin ?? (Number(start) + 45);
  return start !== "" && end !== "" && Number.isInteger(Number(start)) && Number.isInteger(Number(end)) && Number(start) >= 780 && Number(end) <= 1320 && Number(end) > Number(start);
}

function buildLesson(body) {
  const start = toInt(body?.date?.startMin, body?.date?.hh != null ? Number(body.date.hh) * 60 : 780);
  const end = toInt(body?.date?.endMin, start + 45);

  return {
    name: body?.name ?? "",
    date: {
      day: toInt(body?.date?.day, 1),
      startMin: start,
      endMin: end,
    },
    teacher: body?.teacher || null,
    helper: body?.helper || null,
    room: body?.room ?? "0",
    list_students: Array.isArray(body?.list_students) ? body.list_students : [],
    ...(body?.kind ? { kind: body.kind === "educational" ? "educational" : "regular" } : {}),
  };
}

// A guide's educational lesson (services/educationalLesson). Never fatal to the save.
const edu = () => require("../../services/educationalLesson").educationalLessons();
const EDUCATIONAL_TAKEN = { ok: false, code: "EDUCATIONAL_EXISTS", message: "لهذا المرشد برنامج تربوي. لكل مرشد برنامج تربوي واحد." };
const enrolGuideStudents = (teacher) => Promise.resolve()
  .then(() => edu().enrolAll(teacher))
  .catch((err) => logWithSource("Lesson.enrolGuideStudents", err));

const pad2 = (n) => String(n).padStart(2, "0");

// Audit-log label: lesson name, weekday (1-7) and start time.
function lessonLabel(lesson = {}) {
  const day = lesson?.date?.day;
  const start = Number(lesson?.date?.startMin);
  const time = Number.isFinite(start) ? `${pad2(Math.floor(start / 60))}:${pad2(start % 60)}` : "";
  return [lesson?.name || "", day ? `يوم ${day}` : "", time].filter(Boolean).join(" ");
}

// Central audit-log entry for a lesson change (called after the write).
const recordLesson = (req, action, before, after) => {
  const doc = after || before || {};
  return audit.record(req, {
    module: "lessons", action, targetType: "lesson",
    targetId: doc._id, targetLabel: lessonLabel(doc), before, after,
  });
};

const getDow1to7 = (date = new Date()) => {
  const jsDay = date.getDay();
  return jsDay === 0 ? 1 : jsDay + 1;
};

/* ===================== CRUD ===================== */

// The teacher's and helper's full names of these lessons, by user _id, so a
// screen shows them without reading the user list (which needs users.view).
async function staffNames(lessons, actor) {
  const ids = [...new Set(lessons.flatMap((l) => [l.teacher, l.helper]).filter((v) => v != null && v !== "").map(String))];
  const contacts = await Promise.all(ids.map((uid) => contactById(UserModelDef, uid, actor)));
  return Object.fromEntries(ids.map((uid, i) => [uid, contacts[i]?.name]).filter(([, name]) => name));
}

// GET ALL
const getAll = async (req, res) => {
  try {
    const [result, visible] = await Promise.all([LessonModelDef.get({}), scope.visibleStudentIds(req.actor)]);
    const lessons = ownLessons(req.actor, result?.result || []);
    return res.status(200).json({
      ok: true,
      lessons: lessons.map((l) => scopeLesson(l, visible)),
      names: await staffNames(lessons, req.actor),
    });
  } catch (err) {
    logWithSource("Lesson.getAll", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// GET ONE
const getOne = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await LessonModelDef.get({ _id: id });
    if (!result?.result?.length) {
      return res.status(404).json({ ok: false, message: "غير موجود" });
    }

    const lesson = result.result[0];
    // Someone else's lesson is "not found", the same as a missing one, unless
    // it holds one of the actor's own students (he views it, never edits it).
    if (!mayOpenLesson(req.actor, lesson)
      && !mayViewLesson(req.actor, lesson, await responsibleStudentIds(StudentModelDef, req.actor))) {
      return res.status(404).json({ ok: false, message: "غير موجود" });
    }
    lesson.num_in_list = (lesson.list_students || []).length;
    const visible = await scope.visibleStudentIds(req.actor);
    // The teacher's and helper's name and phone (see utils/guideContact).
    const [teacherContact, helperContact] = await Promise.all([
      contactById(UserModelDef, lesson.teacher, req.actor),
      contactById(UserModelDef, lesson.helper, req.actor),
    ]);

    return res.status(200).json({ ok: true, lesson: { ...scopeLesson(lesson, visible), teacherContact, helperContact } });
  } catch (err) {
    logWithSource("Lesson.getOne", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// GET BY QUERY
const getLessonsByQuery = async (req, res) => {
  try {
    const { day, teacher, helper, room } = req.query;

    const filter = {};

    if (day) filter["date.day"] = Number(day);
    if (teacher) filter.teacher = teacher;
    if (helper) filter.helper = helper;
    if (room) filter.room = String(room);

    const result = await LessonModelDef.get(filter);
    const visible = await scope.visibleStudentIds(req.actor);

    return res.status(200).json({
      ok: true,
      lessons: ownLessons(req.actor, result?.result || []).map((l) => scopeLesson(l, visible)),
    });
  } catch (err) {
    logWithSource("Lesson.getLessonsByQuery", err);
    return res.status(500).json({ ok: false });
  }
};

// Football lessons for the general schedule: read-only, room 9, no player ids.
const getSportSchedule = async (req, res) => {
  try {
    // Football has no guide or assistant here: only those who see every lesson.
    if (!seesAllLessons(req.actor)) return res.status(200).json({ ok: true, lessons: [] });
    const result = await SportLessonModelDef.get({});
    return res.status(200).json({
      ok: true,
      lessons: (result?.result || []).map((l) => ({
        _id: l._id,
        name: l.name,
        date: l.date,
        room: "9",
        teacher: null,
        readOnly: true,
        kind: "sport",
        playersCount: Array.isArray(l.players) ? l.players.length : 0,
      })),
    });
  } catch (err) {
    logWithSource("Lesson.getSportSchedule", err);
    return res.status(500).json({ ok: false });
  }
};

// CREATE
const postOne = async (req, res) => {
  try {
    if (tooManyTz(req.body)) return res.status(400).json(TOO_MANY);
    const model = buildLesson(req.body);

    if (!model.name || !model.teacher) {
      return res.status(400).json({ ok: false, message: "missing fields" });
    }
    // A scoped actor creates only lessons he teaches or helps on, and his
    // roster takes only addable students.
    const visible = await scope.visibleStudentIds(req.actor);
    if (visible) {
      if (!isOnLesson(req.actor, model)) return res.status(403).json(FORBIDDEN);
      model.list_students = await addableIds(model.list_students, visible);
    } else {
      // Anyone else: only students who exist and are accepted (owner, 2026-11-01).
      model.list_students = await existingIds(Array.isArray(model.list_students) ? model.list_students : []);
    }
    // Students named by exact tz (list_tz) join the roster for any actor.
    if (req.body?.list_tz !== undefined) {
      model.list_students = appendNew(model.list_students, await idsFromTz(req.body.list_tz));
    }
    if (await namesSystemAccount([model.teacher, model.helper])) return res.status(400).json(SYSTEM_STAFF);
    if (!validProgramHours(req.body?.date)) return res.status(400).json(PROGRAM_HOURS);
    if (model.kind === "educational" && (await edu().takenBy(model.teacher))) return res.status(409).json(EDUCATIONAL_TAKEN);

    const sameDay = await LessonModelDef.get({ "date.day": model.date.day });
    const sportDay = await SportLessonModelDef.get({ "date.day": model.date.day });

    const conflict = conflictsInRoom9(model, { lessons: sameDay?.result || [], sportLessons: sportDay?.result || [] });

    if (conflict) {
      return res.status(409).json({
        ok: false,
        message: "يوجد تعارض",
      });
    }

    // Stored with its version, so even its first edit is a guarded write.
    const createdAt = new Date();
    const created = await LessonModelDef.create({
      ...model,
      createdAt,
      updatedAt: createdAt,
      ...editorStamp(req),
    });
    await recordLesson(req, "create", null, created?.result || model);
    notifyChange("lesson", created?.result?._id);
    if (model.kind === "educational") await enrolGuideStudents(model.teacher);

    return res.status(201).json({ ok: true, lesson: created });
  } catch (err) {
    logWithSource("Lesson.postOne", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// UPDATE
const putOne = async (req, res) => {
  try {
    const { id } = req.params;

    const existingRes = await LessonModelDef.get({ _id: id });
    if (!existingRes?.result?.length) {
      return res.status(404).json({ ok: false, message: "غير موجود" });
    }

    const current = existingRes.result[0];
    const date = { ...current.date, ...req.body?.date };
    const next = buildLesson({ ...current, ...req.body, date });
    const visible = await scope.visibleStudentIds(req.actor);
    // A form saved on top of a newer version is refused (the screen keeps the draft).
    const stale = checkVersion(current, req, (doc) => scopeLesson(doc, visible));
    if (stale) return res.status(409).json(stale);
    if (visible) {
      // Staff changes only on a lesson he is already on (so he can never
      // put himself on someone else's lesson and see its students).
      const staffChanged = ["teacher", "helper"].some((k) => String(next[k] ?? "") !== String(current[k] ?? ""));
      if (staffChanged && !isOnLesson(req.actor, current)) return res.status(403).json(FORBIDDEN);
      // The roster he submits is the one he was shown: his edits apply to the
      // students he can see, hidden ids are kept, unseen new ids are dropped.
      // A list_students that is not an array leaves the stored roster as is.
      if (Array.isArray(req.body?.list_students)) {
        next.list_students = mergeRoster(current.list_students, req.body.list_students, visible);
      } else {
        next.list_students = Array.isArray(current.list_students) ? current.list_students : [];
      }
    } else if (Array.isArray(next.list_students)) {
      // Anyone else keeps the students already on the lesson; a newly listed
      // one must exist and be accepted (owner, 2026-11-01).
      const onLesson = new Set((current.list_students || []).map(String));
      const added = new Set((await existingIds(next.list_students.filter((s) => !onLesson.has(String(s))))).map(String));
      const seen = new Set();
      next.list_students = next.list_students.filter((s) => {
        const key = String(s);
        if (seen.has(key) || !(onLesson.has(key) || added.has(key))) return false;
        seen.add(key);
        return true;
      });
    }
    if (await namesSystemAccount([req.body?.teacher, req.body?.helper])) return res.status(400).json(SYSTEM_STAFF);
    if (!validProgramHours(date)) return res.status(400).json(PROGRAM_HOURS);
    if (next.kind === "educational" && (await edu().takenBy(next.teacher, id))) return res.status(409).json(EDUCATIONAL_TAKEN);

    const sameDay = await LessonModelDef.get({ "date.day": next.date.day });
    const sportDay = await SportLessonModelDef.get({ "date.day": next.date.day });

    const conflict = conflictsInRoom9(next, {
      lessons: sameDay?.result || [],
      sportLessons: sportDay?.result || [],
      ignoreId: id,
    });

    if (conflict) {
      return res.status(409).json({ ok: false, message: "يوجد تعارض" });
    }

    // Written only if nobody saved since `current` was read.
    const updated = await LessonModelDef.updateExisting(
      sameVersion({ _id: id }, current),
      { ...next, updatedAt: new Date(), ...editorStamp(req) }
    );
    if (!updated?.result) {
      return res.status(409).json(await raceLost(() => LessonModelDef.get({ _id: id }), (doc) => scopeLesson(doc, visible)));
    }
    await recordLesson(req, "update", current, { ...current, ...next });
    notifyChange("lesson", id);
    // The guide's students stay on it, whatever the submitted roster said.
    if (next.kind === "educational") await enrolGuideStudents(next.teacher);

    const lesson = visible && updated?.result ? { ...updated, result: scopeLesson(updated.result, visible) } : updated;
    return res.status(200).json({ ok: true, lesson });
  } catch (err) {
    logWithSource("Lesson.putOne", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// DELETE
// A deleted record's alerts go with it (owner, 2026-11-02). Never fatal.
const forgetAlerts = (kind, id) => Promise.resolve()
  .then(() => require("../../services/recordAlerts").forget(kind, id))
  .catch((err) => logWithSource("Lesson.forgetAlerts", err));

const deleteOne = async (req, res) => {
  try {
    const { id } = req.params;

    const existingRes = await LessonModelDef.get({ _id: id });
    const existing = existingRes?.result?.[0] || null;

    await LessonModelDef.delete({ _id: id });
    if (existing) await recordLesson(req, "delete", existing, null);
    notifyChange("lesson", id);
    if (existing) await forgetAlerts("lesson", existing._id);

    return res.status(200).json({ ok: true, removed: true });
  } catch (err) {
    logWithSource("Lesson.deleteOne", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// ADD STUDENTS
const addToList = async (req, res) => {
  try {
    const { id } = req.params;
    if (tooManyTz(req.body)) return res.status(400).json(TOO_MANY);
    if (notAList(req.body)) return res.status(400).json(NOT_A_LIST);
    const list = req.body.list_students || [];

    const existingRes = await LessonModelDef.get({ _id: id });
    if (!existingRes?.result?.length) {
      return res.status(404).json({ ok: false });
    }

    const lesson = existingRes.result[0];

    const set = new Set((lesson.list_students || []).map(String));
    let toAdd = list.filter((s) => !set.has(String(s)));

    // A scoped actor adds _ids only for students he can see (addableIds);
    // anyone else must be named by exact tz in list_tz (idsFromTz).
    const visible = await scope.visibleStudentIds(req.actor);
    toAdd = visible ? await addableIds(toAdd, visible) : await existingIds(toAdd);
    if (req.body?.list_tz !== undefined) {
      toAdd = appendNew(toAdd, (await idsFromTz(req.body.list_tz)).filter((s) => !set.has(String(s))));
    }

    const updatedList = [...lesson.list_students, ...toAdd];

    const updatedAt = new Date();
    await LessonModelDef.update(
      { _id: id },
      { list_students: updatedList, updatedAt, ...editorStamp(req) }
    );
    await recordLesson(req, "update", lesson, { ...lesson, list_students: updatedList });
    notifyChange("lesson", id);

    // The new version: the open edit screen saves on top of it, not a 409.
    return res.status(200).json({ ok: true, updatedAt });
  } catch (err) {
    logWithSource("Lesson.addToList", err);
    return res.status(500).json({ ok: false });
  }
};

// REMOVE STUDENTS
const removeFromList = async (req, res) => {
  try {
    const { id } = req.params;
    if (notAList(req.body)) return res.status(400).json(NOT_A_LIST);
    const removeList = req.body.list_students || [];

    const existingRes = await LessonModelDef.get({ _id: id });
    if (!existingRes?.result?.length) {
      return res.status(404).json({ ok: false });
    }

    const lesson = existingRes.result[0];
    if (lesson.kind === "educational" && removeList.length) {
      const own = await StudentModelDef.get({ main_teacher: String(lesson.teacher) });
      const ownIds = new Set((own?.result || []).map((s) => String(s._id)));
      if (removeList.some((r) => ownIds.has(String(r)))) {
        return res.status(409).json({ ok: false, code: "EDUCATIONAL_MEMBER", message: "طلاب المرشد المسؤول يبقون في برنامجه التربوي. غيّر المرشد المسؤول في صفحة الطالب." });
      }
    }

    // A scoped actor removes only students he can see; hidden ids stay.
    const visible = await scope.visibleStudentIds(req.actor);
    const updated = visible
      ? (lesson.list_students || []).filter((s) => {
        const key = String(s);
        return !(visible.has(key) && removeList.some((r) => String(r) === key));
      })
      // Compared as strings: the lesson may hold ObjectIds, the request strings.
      : (lesson.list_students || []).filter((s) => !removeList.some((r) => String(r) === String(s)));

    const updatedAt = new Date();
    await LessonModelDef.update(
      { _id: id },
      { list_students: updated, updatedAt, ...editorStamp(req) }
    );
    await recordLesson(req, "update", lesson, { ...lesson, list_students: updated });
    notifyChange("lesson", id);

    return res.status(200).json({ ok: true, updatedAt });
  } catch (err) {
    logWithSource("Lesson.removeFromList", err);
    return res.status(500).json({ ok: false });
  }
};

const getLessonsByToDay = async (req, res) => {
  try {
    const dow = getDow1to7(new Date());
    const result = await LessonModelDef.get({ "date.day": dow });
    const visible = await scope.visibleStudentIds(req.actor);

    return res.status(200).json({
      ok: true,
      lessons: ownLessons(req.actor, result?.result || []).map((l) => scopeLesson(l, visible)),
    });
  } catch (err) {
    logWithSource("Lesson.getLessonsByToDay", err);
    return res.status(500).json({
      ok: false,
      message: err.message || "server error",
    });
  }
};

const copyMonth = async (req, res) => {
  return res.status(501).json({
    ok: false,
    message: "copy-month is not implemented in the generic LessonModelDef version yet",
  });
};

const deletePerMonth = async (req, res) => {
  return res.status(501).json({
    ok: false,
    message: "delete-perMonth is not implemented in the generic LessonModelDef version yet",
  });
};

module.exports = {
  getAll,
  getOne,
  getLessonsByQuery,
  getSportSchedule,
  postOne,
  putOne,
  deleteOne,
  addToList,
  removeFromList,
  copyMonth,
  // The list_tz rule, for the assistant's add-student action (actionRunner).
  idsFromTz,
  deletePerMonth,
  getLessonsByToDay,
};

//OLD CODE - DO NOT SUGGEST
// // Lesson.controller.js (SERVER) ✅ Full fixed version + optional notifications

// const { logWithSource } = require("../../middleware/logger");
// const Lesson = require("./Lesson.model");
// const mongoose = require("mongoose");

// /* ===================== Optional Notifications ===================== */
// // if you have services/notify.js export { notify }, it will work.
// // if not, it won't crash.
// let notify = null;
// try {
//   ({ notify } = require("../Notification/Notification.controller")); // adjust path if needed
// } catch (e) {
//   notify = null;
// }
// const safeNotify = async (payload) => {
//   try {
//     if (typeof notify === "function") await notify(payload);
//   } catch (e) {
//     logWithSource("Lesson.safeNotify", e);
//   }
// };

// /* ===================== Helpers ===================== */
// const toInt = (value, defaultValue = 0) =>
//   Number.isFinite(Number(value)) ? Number(value) : defaultValue;

// const clamp = (num, min, max) => Math.max(min, Math.min(num, max));

// const sameRoom = (aRoom, bRoom) => String(aRoom ?? "0") === String(bRoom ?? "0");
// const overlapTime = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

// // ✅ conflict = time overlap AND (same room OR same teacher OR same helper)
// function isConflict(next, existing) {
//   const aStart = toInt(next?.date?.startMin);
//   const aEnd   = toInt(next?.date?.endMin);
//   const bStart = toInt(existing?.date?.startMin);
//   const bEnd   = toInt(existing?.date?.endMin);

//   if (!overlapTime(aStart, aEnd, bStart, bEnd)) return false;

//   const roomConflict = sameRoom(next.room, existing.room);

//   const teacherConflict =
//     next.teacher && existing.teacher && String(next.teacher) === String(existing.teacher);

//   const helperConflict =
//     next.helper && existing.helper && String(next.helper) === String(existing.helper);

//   return roomConflict || teacherConflict || helperConflict;
// }

// const buildLessonData = (body) => {
//   const day = toInt(body?.date?.day, 1);

//   const startMin = clamp(toInt(body?.date?.startMin, 9 * 60), 0, 24 * 60 - 1);
//   const endMinRaw = toInt(body?.date?.endMin, startMin + 45);
//   const endMin = clamp(Math.max(endMinRaw, startMin + 1), 1, 24 * 60);

//   return {
//     name: body?.name ?? "",
//     date: { day, startMin, endMin },
//     teacher: body?.teacher || null,
//     helper: body?.helper || null,
//     room: body?.room ?? "0",
//     list_students: Array.isArray(body?.list_students) ? body.list_students : [],
//   };
// };

// /* ===================== Controllers ===================== */

// const getAll = async (req, res) => {
//   try {
//     const lessons = await Lesson.find().lean();
//     return res.status(200).json({ ok: true, lessons });
//   } catch (err) {
//     logWithSource("Lesson.getAll", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// const getOne = async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!mongoose.Types.ObjectId.isValid(id))
//       return res.status(400).json({ ok: false, message: "invalid id" });

//     const lesson = await Lesson.findById(id);
//     if (!lesson) return res.status(404).json({ ok: false, message: "غير موجود" });

//     lesson.num_in_list = (lesson.list_students || []).length;
//     return res.status(200).json({ ok: true, lesson });
//   } catch (err) {
//     logWithSource("Lesson.getOne", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// // ✅ GET /api/lessons/query?day=&teacher=&helper=&room=
// const getLessonsByQuery = async (req, res) => {
//   try {
//     const { day, teacher, helper, room } = req.query;

//     const filter = {};
//     if (day !== undefined && day !== "") filter["date.day"] = Number(day);
//     if (teacher) filter.teacher = teacher;
//     if (helper) filter.helper = helper;
//     if (room !== undefined && room !== "") filter.room = String(room);

//     const [items, total] = await Promise.all([
//       Lesson.find(filter)
//         .populate("teacher", "_id tz firstname lastname roles")
//         .populate("helper", "_id tz firstname lastname roles")
//         .lean(),
//       Lesson.countDocuments(filter),
//     ]);

//     return res.status(200).json({
//       ok: true,
//       lessons: items,
//       pagination: { total },
//     });
//   } catch (err) {
//     logWithSource("Lesson.getLessonsByQuery", err);
//     return res.status(500).json({
//       ok: false,
//       message: "يوجد خطأ في جلب البيانات المطلوبة",
//     });
//   }
// };

// const postOne = async (req, res) => {
//   try {
//     const model = buildLessonData(req.body);

//     if (!model?.name || !model?.teacher) {
//       return res.status(400).json({ ok: false, message: "missing required fields" });
//     }

//     // ✅ Only possible conflicts: same day AND (same room OR same teacher OR same helper)
//     const sameDay = await Lesson.find({
//       "date.day": model.date.day,
//       $or: [
//         { room: model.room },
//         { teacher: model.teacher },
//         ...(model.helper ? [{ helper: model.helper }] : []),
//       ],
//     }).lean();

//     const conflict = sameDay.some((l) => isConflict(model, l));
//     if (conflict) {
//       return res.status(409).json({
//         ok: false,
//         message: "يوجد تعارض في الساعات (غرفة/مرشد/مساعد)",
//       });
//     }

//     const doc = await Lesson.create({ ...model });
//     doc.num_in_list = (doc.list_students || []).length;

//     // ✅ notify admins (optional)
//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "LESSONS",
//       action: "CREATED",
//       title: "تم إضافة درس جديد",
//       message: `تم إنشاء درس: ${doc.name}`,
//       entity: { kind: "lesson", id: doc._id },
//       meta: {
//         day: doc.date.day,
//         startMin: doc.date.startMin,
//         endMin: doc.date.endMin,
//         room: doc.room,
//         teacher: doc.teacher,
//         helper: doc.helper,
//       },
//       createdBy: req.user?._id || doc.teacher || null,
//     });

//     return res.status(201).json({ ok: true, lesson: doc });
//   } catch (err) {
//     logWithSource("Lesson.postOne", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// const putOne = async (req, res) => {
//   try {
//     const { id } = req.params;
//     console.log(req.body);
//     const current = await Lesson.findById(id);
//     if (!current) return res.status(404).json({ ok: false, message: "غير موجود" });

//     const next = buildLessonData({ ...current.toObject(), ...req.body });

//     const changedSlot =
//       next.date.day !== current.date.day ||
//       next.date.startMin !== current.date.startMin ||
//       next.date.endMin !== current.date.endMin ||
//       String(next.teacher) !== String(current.teacher) ||
//       String(next.helper) !== String(current.helper) ||
//       String(next.room) !== String(current.room);

//     if (changedSlot) {
//       const sameDay = await Lesson.find({
//         _id: { $ne: current._id },
//         "date.day": next.date.day,
//         $or: [
//           { room: next.room },
//           { teacher: next.teacher },
//           ...(next.helper ? [{ helper: next.helper }] : []),
//         ],
//       }).lean();

//       const conflict = sameDay.some((l) => isConflict(next, l));
//       if (conflict) {
//         return res.status(409).json({
//           ok: false,
//           message: "يوجد تعارض في الساعات (غرفة/مرشد/مساعد)",
//         });
//       }
//     }

//     current.name = next.name;
//     current.date.day = next.date.day;
//     current.date.startMin = next.date.startMin;
//     current.date.endMin = next.date.endMin;
//     current.teacher = next.teacher;
//     current.helper = next.helper;
//     current.list_students = next.list_students;
//     current.room = next.room;
//     current.updatedAt = new Date();

//     await current.save();

//     // ✅ notify admins (optional)
//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "LESSONS",
//       action: "UPDATED",
//       title: "تم تعديل درس",
//       message: `تم تعديل درس: ${current.name}`,
//       entity: { kind: "lesson", id: current._id },
//       meta: {
//         day: current.date.day,
//         startMin: current.date.startMin,
//         endMin: current.date.endMin,
//         room: current.room,
//         teacher: current.teacher,
//         helper: current.helper,
//       },
//       createdBy: req.user?._id || current.teacher || null,
//     });

//     return res.status(200).json({ ok: true, lesson: current });
//   } catch (err) {
//     logWithSource("Lesson.putOne", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// const deleteOne = async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!mongoose.Types.ObjectId.isValid(id))
//       return res.status(400).json({ ok: false, message: "invalid id" });

//     const deleted = await Lesson.findByIdAndDelete(id);
//     if (!deleted) return res.status(404).json({ ok: false, message: "غير موجود" });

//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "LESSONS",
//       action: "DELETED",
//       title: "تم حذف درس",
//       message: `تم حذف درس: ${deleted.name}`,
//       entity: { kind: "lesson", id: deleted._id },
//       meta: {
//         day: deleted.date?.day,
//         startMin: deleted.date?.startMin,
//         endMin: deleted.date?.endMin,
//         room: deleted.room,
//         teacher: deleted.teacher,
//         helper: deleted.helper,
//       },
//       createdBy: req.user?._id || deleted.teacher || null,
//     });

//     return res.status(200).json({ ok: true, removed: true });
//   } catch (err) {
//     logWithSource("Lesson.deleteOne", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// const addToList = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { list_students } = req.body;

//     if (!Array.isArray(list_students) || list_students.length === 0)
//       return res.status(400).json({ ok: false, message: "list_students is empty" });

//     const lesson = await Lesson.findById(id);
//     if (!lesson) return res.status(404).json({ ok: false, message: "غير موجود" });

//     const set = new Set((lesson.list_students || []).map(String));
//     const toAdd = list_students.filter((t) => t != null && !set.has(String(t)));

//     lesson.list_students.push(...toAdd);
//     lesson.list_students = lesson.list_students.filter((t) => t != null);
//     lesson.updatedAt = new Date();
//     await lesson.save();

//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "LESSONS",
//       action: "STUDENTS_ADDED",
//       title: "تحديث قائمة الطلاب",
//       message: `تم إضافة ${toAdd.length} طلاب لدرس: ${lesson.name}`,
//       entity: { kind: "lesson", id: lesson._id },
//       meta: { addedCount: toAdd.length },
//       createdBy: req.user?._id || lesson.teacher || null,
//     });

//     lesson.num_in_list = (lesson.list_students || []).length;
//     return res.status(200).json({ ok: true, lesson });
//   } catch (err) {
//     logWithSource("Lesson.addToList", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// const removeFromList = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const trainees = Array.isArray(req.body?.list_students) ? req.body.list_students : [];
//     if (!trainees.length)
//       return res.status(400).json({ ok: false, message: "list_students is empty" });

//     const lesson = await Lesson.findById(id);
//     if (!lesson) return res.status(404).json({ ok: false, message: "غير موجود" });

//     const removeSet = new Set(trainees.map(String));
//     const before = (lesson.list_students || []).length;

//     lesson.list_students = (lesson.list_students || []).filter(
//       (t) => !removeSet.has(String(t))
//     );

//     const removedCount = before - (lesson.list_students || []).length;
//     lesson.updatedAt = new Date();
//     await lesson.save();

//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "LESSONS",
//       action: "STUDENTS_REMOVED",
//       title: "تحديث قائمة الطلاب",
//       message: `تم حذف ${removedCount} طلاب من درس: ${lesson.name}`,
//       entity: { kind: "lesson", id: lesson._id },
//       meta: { removedCount },
//       createdBy: req.user?._id || lesson.teacher || null,
//     });

//     return res.status(200).json({ ok: true, lesson });
//   } catch (err) {
//     logWithSource("Lesson.removeFromList", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// /* ===================== Copy month + delete month (your code, unchanged) ===================== */
// function isInt(n) { return Number.isInteger(Number(n)); }

// function sameSlot(a, b) {
//   return (
//     Number(a?.date?.day) === Number(b?.date?.day) &&
//     Number(a?.date?.startMin ?? a?.date?.hh * 60) === Number(b?.date?.startMin ?? b?.date?.hh * 60) &&
//     String(a?.teacher || "") === String(b?.teacher || "")
//   );
// }

// const copyMonth = async (req, res) => {
//   try {
//     const q = { ...req.query, ...(req.body || {}) };

//     const now = new Date();
//     const fromMonth = isInt(q.fromMonth) ? Number(q.fromMonth) : (now.getMonth() + 1);
//     const fromYear = isInt(q.fromYear) ? Number(q.fromYear) : now.getFullYear();

//     const d = new Date(fromYear, fromMonth - 1, 1);
//     d.setMonth(d.getMonth() + 1);
//     const toMonth = isInt(q.toMonth) ? Number(q.toMonth) : (d.getMonth() + 1);
//     const toYear = isInt(q.toYear) ? Number(q.toYear) : d.getFullYear();

//     const overwrite = q.overwrite === "true" || q.overwrite === true;
//     const keepTrainees = q.keepTrainees === "true" || q.keepTrainees === true;
//     const teacherOnly = q.teacherOnly ? String(q.teacherOnly) : null;

//     const filterFrom = { "date.month": fromMonth, "date.year": fromYear };
//     if (teacherOnly) filterFrom.teacher = new mongoose.Types.ObjectId(teacherOnly);

//     const sourceLessons = await Lesson.find(filterFrom).lean();
//     if (!sourceLessons.length) {
// ملاحظة عربية
//     }

//     const filterTo = { "date.month": toMonth, "date.year": toYear };
//     const targetLessons = await Lesson.find(filterTo).lean();

//     const ops = [];
//     let copied = 0, skipped = 0, removed = 0;

//     if (overwrite && targetLessons.length) {
//       const idsToDelete = [];
//       for (const src of sourceLessons) {
//         const match = targetLessons.find((t) => sameSlot(src, t));
//         if (match) idsToDelete.push(match._id);
//       }
//       if (idsToDelete.length) {
//         ops.push({ deleteMany: { filter: { _id: { $in: idsToDelete } } } });
//         removed += idsToDelete.length;
//       }
//     }

//     for (const src of sourceLessons) {
//       const already = targetLessons.find((t) => sameSlot(src, t));
//       if (already && !overwrite) { skipped++; continue; }

//       const startMin = (src?.date?.startMin ?? (src?.date?.hh * 60)) ?? 8 * 60;
//       const endMin = (src?.date?.endMin ?? (startMin + 45));

//       ops.push({
//         insertOne: {
//           document: {
//             name: src.name,
//             date: { day: src.date.day, startMin, endMin },
//             teacher: src.teacher,
//             helper: src.helper,
//             room: src.room,
//             list_students: keepTrainees ? (src.list_students || []) : [],
//             createdAt: new Date(),
//             updatedAt: null,
//           },
//         },
//       });
//       copied++;
//     }

//     if (!ops.length) {
// ملاحظة عربية
//     }

//     const result = await Lesson.bulkWrite(ops, { ordered: false });

//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "LESSONS",
//       action: "COPIED_MONTH",
//       title: "نسخ دروس شهر",
//       message: `تم نسخ ${copied} (تخطّي ${skipped} / حذف ${removed})`,
//       entity: { kind: "lessons", id: "copyMonth" },
//       meta: { fromMonth, fromYear, toMonth, toYear, copied, skipped, removed },
//       createdBy: req.user?._id || null,
//     });

//     return res.status(200).json({ ok: true, copied, skipped, removed, result });
//   } catch (err) {
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// const deletePerMonth = async (req, res) => {
//   try {
//     const { month, year } = req.params;

//     if (!isInt(month) || !isInt(year)) {
//       return res.status(400).json({ ok: false, message: "invalid month/year" });
//     }

//     const result = await Lesson.deleteMany({ "date.month": Number(month), "date.year": Number(year) });

//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "LESSONS",
//       action: "DELETED_MONTH",
//       title: "حذف دروس شهر",
//       message: `تم حذف ${result.deletedCount} دروس`,
//       entity: { kind: "lessons", id: "deletePerMonth" },
//       meta: { month: Number(month), year: Number(year), deletedCount: result.deletedCount },
//       createdBy: req.user?._id || null,
//     });

//     return res.status(200).json({ ok: true, deletedCount: result.deletedCount });
//   } catch (err) {
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };
// const getDow1to7 = (d = new Date()) => {
//   const js = d.getDay();
//   return js === 0 ? 1 : js + 1;
// };

// const getLessonsByToDay = async (req, res) => {
//   try {
//     const dow = getDow1to7(new Date());

//     const lessons = await Lesson.find({ "date.day": dow })
//       .populate("teacher", "firstname lastname name")
//       .select("name date room teacher helper list_students")
//       .lean();

//     return res.status(200).json({ ok: true, lessons });
//   } catch (err) {
//     console.error("lessons/today error:", err);
//     return res.status(500).json({ ok: false, message: "server error" });
//   }
// }
// module.exports = {
//   getAll,
//   getOne,
//   postOne,
//   putOne,
//   deleteOne,
//   addToList,
//   removeFromList,
//   copyMonth,
//   deletePerMonth,
//   getLessonsByQuery,
//   getLessonsByToDay,
// };


SOURCE: apps/system/src/utils/lessonSchedule.js

// Lesson days run 1 (Sunday) to 7 (Saturday).
export const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export const PROGRAM_START = 13 * 60;
export const PROGRAM_END = 22 * 60;
export const PROGRAM_HOURS_MESSAGE = "يجب أن يكون موعد البرنامج بين 13:00 و22:00، وأن تكون ساعة الانتهاء بعد ساعة البدء.";
export const validProgramHours = (start, end) => Number.isInteger(start) && Number.isInteger(end) && start >= PROGRAM_START && end <= PROGRAM_END && end > start;
export const initialProgramStart = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && value != null && value !== "" ? Math.max(PROGRAM_START, Math.min(number, PROGRAM_END - 45)) : PROGRAM_START;
};
export const timelinePosition = (minute) => {
  const fraction = (minute - PROGRAM_START) / (PROGRAM_END - PROGRAM_START);
  return `calc(${fraction * 100}% + ${20 - 40 * fraction}px)`;
};
export const timelineDuration = (duration) => {
  const fraction = duration / (PROGRAM_END - PROGRAM_START);
  return `calc(${fraction * 100}% - ${40 * fraction}px)`;
};
export const timelineMinuteAt = (offset, height) => PROGRAM_START + Math.round((offset - 20) / Math.max(1, height - 40) * (PROGRAM_END - PROGRAM_START));

export const startOf = (lesson) => lesson?.date?.startMin ?? (lesson?.date?.hh ?? 8) * 60;
export const endOf = (lesson) => lesson?.date?.endMin ?? startOf(lesson) + 45;

export const toHHMM = (min) => {
  const m = Math.max(0, Math.min(min ?? 0, 24 * 60));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export const lessonsForDay = (lessons, day) =>
  (lessons || [])
    .filter((lesson) => lesson?.date && Number(lesson.date.day) === Number(day))
    .sort((a, b) => startOf(a) - startOf(b));

export const countLessonsByDay = (lessons) => {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const lesson of lessons || []) {
    const day = Number(lesson?.date?.day);
    if (day >= 1 && day <= 7) counts[day - 1] += 1;
  }
  return counts;
};

export const lessonDayOf = (date = new Date()) => date.getDay() + 1;


SOURCE: apps/system/src/Components/Lesson/EditLesson.jsx

import React, { useEffect, useMemo, useState } from 'react';
import { useUnsavedChanges } from '../../utils/unsavedChanges';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getOneLesson,
  createLesson,
  updateLesson,
  getAllLesson,
  addToList,
} from '../../WebServer/services/lesson/functionsLesson';
import styles from './EditLesson.module.css';
import { toast } from '../../ALERT/SystemToasts';

import { getAll as getAllS} from '../../WebServer/services/student/functionsStudent';
import { getAll as getAllU } from '../../WebServer/services/user/functionsUser';
import { canStored, getStoredUserId } from '../../utils/session';
import { resolveRole } from '../../utils/roles';
import { buildAddPayload, countAdded, unwrapCreated } from '../../utils/lessonRoster';
import { useI18n } from '../../i18n/I18nContext';
import { ROOM_OPTIONS } from '../../utils/rooms';
import { initialProgramStart, validProgramHours, PROGRAM_HOURS_MESSAGE } from '../../utils/lessonSchedule';
import sectionStyles from '../UI/FormSection.module.css';
import LessonRoster from './LessonRoster';
import Button from '../UI/Button';
import useItemLock from '../../locks/useItemLock';
import LockedScreen from '../../locks/LockedScreen';
import SaveNotice from '../../locks/SaveNotice';
import useReloadOnUnblock from '../../locks/useReloadOnUnblock';
import { handleSaveError, withBaseVersion } from '../../locks/staleSave';
import { useLockRecovery } from '../../locks/LockLostBanner';
const EditLesson = () => {
  const { id } = useParams(); // ملاحظة عربية
  const { t } = useI18n();
  // A guide (no students.viewAll) must be on the lessons he creates.
  const viewAll = canStored('students.viewAll');
  const myId = getStoredUserId();
  // Students found by ID number on a lesson that is not saved yet.
  const [pendingLooked, setPendingLooked] = useState([]);
  const isAdmin = canStored(id === "new" ? "lessons.create" : "lessons.edit");

  const navigate = useNavigate();
  const searchParams = new URLSearchParams(window.location.search);
  const dayFromUrl = Number(searchParams.get('day')) || 1;
  const hhFromUrl = initialProgramStart(searchParams.get('startMin')) / 60;

  const [lesson, setLesson] = useState({
    name: '',
    date: {
      day: dayFromUrl,
      startMin: hhFromUrl*60,           // ملاحظة عربية
      endMin:   hhFromUrl*60 + 45,
    },
      teacher: '',
      helper: '',
      room: '-1',
      list_students: [],
      kind: 'regular',
  });
  const [error, setError] = useState({
    name: '',
    date: { day: '', startMin: '', endMin: '' },
    teacher: '',
    helper: '',
    room: '',
    list_students: [],
  });

  // ملاحظة عربية
  const toMin = (hhmm) => {
    const [hh, mm] = (hhmm || '00:00').split(':').map(Number);
    return (hh*60 + (mm||0))|0;
  };
  const toHHMM = (min) => {
    const h = Math.floor(min/60);
    const m = min%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  };

  // handleChange عربيالسبتالأربعاءالجمعةعربي ساعات
  const handleTimeChange = (name, hhmm) => {
    setLesson(prev => {
      let startMin = prev.date.startMin;
      let endMin   = prev.date.endMin;
      if (name === 'start') {
        startMin = toMin(hhmm);
        if (endMin <= startMin) endMin = startMin + 45
      } else {
        endMin = toMin(hhmm);
        if (endMin <= startMin + 45) endMin = startMin + 45; // ملاحظة عربية
      }
      return { ...prev, date: { ...prev.date, startMin, endMin } };
    });
  };
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [helpers, setHelpers] = useState([]);
  const [allLessons, setAllLessons] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // The lesson as opened: its updatedAt is the baseVersion of the save.
  const [opened, setOpened] = useState(null);
  const [notice, setNotice] = useState(null);
  const lockKey = id === 'new' ? null : `lesson:${id}`;
  const lock = useItemLock(lockKey, { enabled: isAdmin });
  const readonly = lock.status === 'readonly';
  const editing = isAdmin && !readonly;
  // Counts the server sends for display are not edits.
  const editable = useMemo(() => {
    const { hiddenCount, num_in_list, ...rest } = lesson;
    return rest;
  }, [lesson]);
  useUnsavedChanges(editable, loaded);

  // ملاحظة عربية
  useEffect(() => {
    if (id === 'new') {
      setLesson((prev) => ({
        ...prev,
        date: { ...prev.date, day: dayFromUrl, startMin: hhFromUrl*60, endMin:   hhFromUrl*60 + 45 },
        teacher: prev.teacher || (!viewAll ? myId : ''),
      }));
    }
  }, [id, dayFromUrl, hhFromUrl, viewAll, myId]);

  // ملاحظة عربية
  const loadData = async () => {
    try {
      const usersRes = await getAllU();
      if (usersRes?.ok) {
        const allUsers = usersRes.users || [];
        // A lesson's guide is a guide or an administrator: administrators may
        // have lessons of their own (owner, 2026-11-03). The role is read from
        // role or roles (resolveRole). The system account is never in the list
        // (the server leaves it out).
        setTeachers(allUsers.filter((u) => ['مرشد', 'ادارة'].includes(resolveRole(u))));
        setHelpers(allUsers.filter((u) => resolveRole(u) === 'مساعد'));
      } else{
        throw new Error(usersRes?.message)
      }
    }
    catch(err){
      console.error(err.message)
    }
    try{
      if (id !== 'new') {
        const resL = await getOneLesson(id);
        if(!resL.ok) throw new Error(resL.message);
        const l = resL.lesson;
        if (l) {
          setLesson({...l, list_students: l.list_students.filter(t => t != null && t != undefined)});
          setOpened(l);
        } else {
          navigate(-1);
        }
      }
    } catch (e) {
      console.error(e);
      navigate(-1);
    }
    try{
      const resT = await getAllS();
      if(!resT.ok) throw new Error(resT.message);
      setStudents(resT.students);
      const resAll = await getAllLesson();
      if (resAll?.ok) setAllLessons(resAll.lessons || []);
    }
    catch(err){
      console.error(err.message)
    }
  };

  useEffect(() => {
    setLoaded(false);
    loadData().finally(() => setLoaded(true));
  }, [id]);

  useReloadOnUnblock(lock.status, loadData);
  const recovery = useLockRecovery(lock, { reload: loadData, draft: lesson.name });

  // ملاحظة عربية
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'day' || name === 'hh') {
      setLesson((prev) => ({
        ...prev,
        date: { ...prev.date, [name]: Number(value) },
      }));
      return;
    }

    setLesson((prev) => ({ ...prev, [name]: value }));
  };

    const validateBeforeSave = async() => {
      if (!lesson.name?.trim()) return 'اسم البرنامج مطلوب';
      if (!lesson.teacher) return 'المرشد مطلوب';
      if (!lesson.room || lesson.room === '-1') return 'المكان مطلوب';
      const d = Number(lesson.date.day);
      const start = Number(lesson.date.startMin);
      const end = Number(lesson.date.endMin);
      if (Number.isNaN(d) || d < 1 || d > 7) return 'يوم غير صالح';
      if (!validProgramHours(start, end)) return PROGRAM_HOURS_MESSAGE;

      return null;
    };

  // Adds a student found by full ID number to a saved lesson. The server
  // answers ok even if it dropped the entry, so the lesson is read again
  // before and after to see whether the student really joined.
  const addFoundStudent = async (student) => {
    if (id === 'new') {
      setPendingLooked((prev) => [...prev, student]);
      return true;
    }
    const before = await getOneLesson(id);
    const res = await addToList(id, buildAddPayload({ looked: [student] }));
    if (!res.ok) return false;
    // The roster change bumped the lesson's version: the form's next save
    // builds on it (else the save would be refused as stale, naming the user).
    if (res.updatedAt) setOpened((prev) => (prev ? { ...prev, updatedAt: res.updatedAt } : prev));
    const after = await getOneLesson(id);
    if (after.ok && after.lesson?.updatedAt) setOpened((prev) => (prev ? { ...prev, updatedAt: after.lesson.updatedAt } : prev));
    if (!before.ok || !after.ok) return false;
    const had = new Set(before.lesson.list_students.map(String));
    const fresh = after.lesson.list_students.map(String).filter((x) => !had.has(x));
    setLesson((prev) => ({
      ...prev,
      list_students: [...prev.list_students, ...fresh.filter((x) => !prev.list_students.map(String).includes(x))],
      hiddenCount: after.lesson.hiddenCount,
      num_in_list: after.lesson.num_in_list,
    }));
    const resS = await getAllS();
    if (resS.ok) setStudents(resS.students);
    return countAdded(before.lesson, after.lesson) > 0;
  };

  const handleSave = async () => {
    const validationError = await validateBeforeSave();
    if (validationError) { toast.warn(validationError); return; }
    try {
      // Display-only fields from the server are never sent back.
      const { hiddenCount, num_in_list, ...body } = lesson;
      const resL =
        id === 'new'
          ? await createLesson({ ...body, ...buildAddPayload({ ids: lesson.list_students, looked: pendingLooked }) })
          : await updateLesson(id, withBaseVersion(body, opened));

      if (!resL) return;
      if (resL.ok) {
        if (id === 'new') {
          const expected = lesson.list_students.length + pendingLooked.length;
          // The create answer is unscoped and wrapped; re-read the lesson as this viewer sees it.
          const createdId = unwrapCreated(resL.lesson)?._id;
          const fresh = createdId ? await getOneLesson(createdId) : null;
          if (!fresh?.ok || countAdded({ num_in_list: 0 }, fresh.lesson) < expected) toast.warn(t('roster.someNotAdded'));
        }
        toast.success(id === 'new' ? 'تمت إضافة البرنامج بنجاح' : 'تم حفظ البرنامج بنجاح');
        navigate(-1);
      } else {
        if (handleSaveError(resL, { draft: lesson.name, setNotice, onReload: loadData })) return;
        toast.warn(resL.message || 'تعذّر حفظ البرنامج');
      }
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'تعذّر حفظ البرنامج');
    }
  };


  if (lock.status === 'blocked') {
    return <LockedScreen holder={lock.holder} />;
  }
  // Nothing is editable until the lock is resolved.
  if (lock.status === 'loading') {
    return <div className={styles.editLessonContainer} role="status">جارٍ تحميل البيانات…{recovery.element}</div>;
  }

  return (
    <div className={styles.editLessonContainer}>
      <SaveNotice notice={notice} />
      {recovery.element}
      {
      isAdmin ? (
      <center><h1>{id != "new" ? "تعديل بيانات البرنامج" : "إضافة برنامج جديد"}</h1></center>
      ) : (
        <h2>معلومات البرنامج</h2>
      )}

      <fieldset className={sectionStyles.formSection} data-tour="lesson-details">
        <legend>بيانات البرنامج</legend>
        <div className={styles.formControl}>
          <label htmlFor="lesson-name">اسم البرنامج:<span style={{color: "red"}}>*</span></label>
          <input
            type="text"
            name="name"
            id="lesson-name"
            data-tour="lesson-name"
            value={lesson.name}
            onChange={handleChange}
            placeholder="أدخل اسم البرنامج"
            disabled={!editing}
          />
          <label style={{color: "red"}}>{error.name}</label>
        </div>
      </fieldset>

      <fieldset className={sectionStyles.formSection} data-tour="lesson-schedule">
        <legend>الموعد والمكان</legend>
        <p>ساعات البرامج: 13:00–22:00</p>
        {!validProgramHours(Number(lesson.date.startMin), Number(lesson.date.endMin)) && <p role="alert">{PROGRAM_HOURS_MESSAGE}</p>}
        <div className={styles.formControl}>
          <label htmlFor="lesson-day">يوم البرنامج:<span style={{color: "red"}}>*</span></label>
          <select
            name="day"
            id="lesson-day"
            data-tour="lesson-day"
            value={lesson.date.day}
            onChange={handleChange}
            disabled={!editing}
          >
            {['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس','الجمعة','السبت'].map((d, i) => (
              <option value={i+1} key={i+1}>
                {d}
              </option>
            ))}
          </select>
          <label style={{color: "red"}}>{error.date.day}</label>
        </div>

        <div className={styles.timeRow}>
          <div className={styles.formControl}>
            <label htmlFor="lesson-start">ساعة البدء:<span style={{color: "red"}}>*</span></label>
            <input
              type="time"
              min="13:00"
              max="21:15"
              value={toHHMM(lesson.date.startMin)}
            id="lesson-start"
            data-tour="lesson-start"
              onChange={(e) => handleTimeChange('start', e.target.value)}
              disabled={!editing}
            />
          </div>
          <div className={styles.formControl}>
            <label htmlFor="lesson-end">ساعة الانتهاء:<span style={{color: "red"}}>*</span></label>
            <input
              type="time"
              min="13:45"
              max="22:00"
              value={toHHMM(lesson.date.endMin)}
            id="lesson-end"
              onChange={(e) => handleTimeChange('end', e.target.value)}
              disabled={!editing}
            />
          </div>
        </div>

        <div className={styles.formControl}>
          <label htmlFor="lesson-room">المكان:<span style={{color: "red"}}>*</span></label>
          <select
            name="room"
            id="lesson-room"
            data-tour="lesson-room"
            value={lesson.room}
            onChange={handleChange}
            disabled={!editing}
          >
            <option value="">اختر المكان</option>
            {ROOM_OPTIONS.map(({ value, label }) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
          <label style={{color: "red"}}>{error.room}</label>
        </div>
      </fieldset>

      <fieldset className={sectionStyles.formSection} data-tour="lesson-staff">
        <legend>الطاقم</legend>
        <div className={styles.formControl}>
          <label htmlFor="lesson-kind">نوع البرنامج:<span style={{color: "red"}}>*</span></label>
          <select name="kind" id="lesson-kind" value={lesson.kind || 'regular'} onChange={handleChange} disabled={!editing}>
            <option value="regular">برنامج عادي</option>
            <option value="educational">برنامج تربوي</option>
          </select>
          {lesson.kind === 'educational' && <small>كل طلاب المرشد المسؤول ينضمون إلى هذا البرنامج تلقائيًا، ولكل مرشد برنامج تربوي واحد.</small>}
        </div>
        <div className={styles.formControl}>
          <label htmlFor="lesson-teacher">المرشد / الإدارة:<span style={{color: "red"}}>*</span></label>
          {id === 'new' && !viewAll && <small>{t('roster.teacherHint')}</small>}
          <select
            name="teacher"
            id="lesson-teacher"
            data-tour="lesson-teacher"
            value={lesson.teacher}
            onChange={handleChange}
            disabled={!editing}
          >
            <option value="">اختر المرشد أو أحد الإدارة</option>
            {myId && !viewAll && !teachers.some((u) => String(u._id) === myId) && (
              <option value={myId}>{t('common.you')}</option>
            )}
            {[['مرشد', 'المرشدون'], ['ادارة', 'الإدارة']].map(([role, label]) => {
              const group = (Array.isArray(teachers) ? teachers : []).filter((u) => resolveRole(u) === role);
              return group.length > 0 && (
                <optgroup key={role} label={label}>
                  {group.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.firstname} {u.lastname}{u.tz ? ` (${String(u.tz).slice(-4)})` : ''}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <label style={{color: "red"}}>{error.teacher}</label>
        </div>

        <div className={styles.formControl}>
          <label htmlFor="lesson-helper">المساعد:</label>
          <select
            name="helper"
            id="lesson-helper"
            value={lesson.helper}
            onChange={handleChange}
            disabled={!editing}
          >
            <option value="">اختر المساعد</option>
            {Array.isArray(helpers) &&
              helpers.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.firstname} {t.lastname}{t.tz ? ` (${String(t.tz).slice(-4)})` : ''}
                </option>
              ))}
          </select>
          <label style={{color: "red"}}>{error.helper}</label>
        </div>
      </fieldset>

      <fieldset className={sectionStyles.formSection} data-tour="lesson-roster">
        <legend>الطلاب في البرنامج ({(lesson.list_students?.length || 0) + (Number(lesson.hiddenCount) || 0) + pendingLooked.length})</legend>
        <LessonRoster
          lesson={lesson}
          students={students}
          allLessons={allLessons}
          canEdit={editing}
          hiddenCount={lesson.hiddenCount}
          pending={pendingLooked}
          onLookupAdd={editing ? addFoundStudent : undefined}
          onRemovePending={(student) => setPendingLooked((prev) => prev.filter((x) => x._id !== student._id))}
          onChange={(ids) => setLesson((prev) => ({ ...prev, list_students: ids }))}
        />
      </fieldset>

      {isAdmin && (
        <div className={styles.buttonRow} style={{ gap: 8, flexWrap: "wrap" }}>
          <Button type="button" data-tour="lesson-save" onClick={handleSave} disabled={readonly}>
            {id !== 'new' ? 'حفظ التعديلات' : 'حفظ البرنامج'}
          </Button>
          {/* Deleting is on the lesson's page (owner, 2026-11-02). */}
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>الرجوع للقائمة</Button>
        </div>
      )}
    </div>
  );
};

export default EditLesson;


SOURCE: apps/system/src/Components/Lesson/ViewAllLesson.jsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./ViewAllLesson.module.css";
import { getAllLesson, getSportSchedule, updateLesson } from "../../WebServer/services/lesson/functionsLesson";
import useLiveRefresh from "../../locks/useLiveRefresh";
import { useNavigate } from "react-router-dom";
import Fabtn from "./../Global/Fabtn/Fabtn";
import { toast } from "../../ALERT/SystemToasts";
import { canStored } from "../../utils/session";
import { isLessonVisible } from "../../utils/lessonVisibility";
import { roomLabel } from "../../utils/rooms";
import { PROGRAM_START, PROGRAM_END, initialProgramStart, validProgramHours, timelinePosition, timelineDuration, timelineMinuteAt, lessonDayOf } from "../../utils/lessonSchedule";
import { SYSTEM_TEACHER, lessonLabel, mergeSchedule } from "../../utils/sportSchedule";
import MobileLessonList from "./MobileLessonList";
import { ask } from "../Provides/confirmBus";
import FilterDialog from "../UI/FilterDialog.jsx";
import Button from "../UI/Button";

/* =======================
   Helpers
======================= */
const BASE_MIN = PROGRAM_START;
const END_MIN = PROGRAM_END;
const dayNames = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"]; // 1..7

const toHHMM = (min) => {
  const m = Math.max(0, Math.min(min ?? 0, 24 * 60));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};


const getStart = (l) => l?.date?.startMin ?? ((l?.date?.hh ?? 8) * 60);
const getEnd   = (l) => l?.date?.endMin   ?? (getStart(l) + 45);

/* =======================
   Update lesson (shared)
======================= */
async function saveReschedule({ lesson, newDay, newRoom, newStartMin, onReload }) {
  const dur = Math.max(1, getEnd(lesson) - getStart(lesson));
  const start = Math.max(BASE_MIN, Math.min(newStartMin, END_MIN - 1));
  const end = start + dur;
  if (!validProgramHours(start, end)) { toast.warn("يجب أن يبقى البرنامج كاملًا بين 13:00 و22:00."); return; }

  const confirmed = await ask("change", {
    title: "نقل البرنامج",
    message: `هل تريد نقل برنامج «${lesson.name}» إلى يوم ${dayNames[(newDay || 1) - 1]} الساعة ${toHHMM(start)}؟`,
  }).catch(() => false);
  if (!confirmed) return;

  try {
    // ملاحظة عربية
    const payload = {
      name: lesson.name,
      teacher: lesson.teacher,
      list_students: lesson.list_students,
      room: newRoom, // number
      date: { day: newDay, startMin: start, endMin: end }
    };

    const res = await updateLesson(lesson._id, payload);

    if (res?.ok || res?.status === 200) {
      toast.success("تم نقل البرنامج بنجاح");
      onReload?.();
    } else {
      toast.error(res?.message || "تعذّر نقل البرنامج");
    }
  } catch (e) {
    toast.error("تعذّر نقل البرنامج");
  }
}

/* =======================
   WEEK VIEW (days columns)
   Columns: days (1..7)
======================= */
function WeekTimeline({
  lessons,
  canEdit,
  showMyLessons,
  navigate,
  onReload,
  setTooltip,
  teacherNames,
  onShowDetails,
}) {
  const byDay = useMemo(() => {
    const map = {1:[],2:[],3:[],4:[],5:[],6:[],7:[]};
    const uid = localStorage.getItem("user_id");
    const canViewAll = canStored("lessons.viewAll");

    for (const l of (lessons || [])) {
      if (!l?.date) continue;
      const day = Number(l.date.day);
      if (!(day >= 1 && day <= 7)) continue;

      if (isLessonVisible(l, { showMyLessons, canViewAll, uid })) {
        map[day].push(l);
      }
    }

    for (const d of Object.keys(map)) {
      map[d].sort((a,b) => getStart(a) - getStart(b));
    }
    return map;
  }, [lessons, showMyLessons]);

  const hourMarks = Array.from({ length: 10 }, (_, i) => 13 + i);

  return (
    <div className={styles.timelineGrid}>
      <div className={styles.headerSpacer} />
      {dayNames.map((dn, i) => (
        <div key={i} className={styles.dayHeader}>{dn}</div>
      ))}

      {/* hours gutter */}
      <div className={styles.hoursGutter}>
        {hourMarks.map((h, idx) => (
          <div key={idx}>
            <div className={styles.hourLine} style={{ top: timelinePosition(h * 60) }} />
            <div className={styles.hourLabel} style={{ top: timelinePosition(h * 60) }}>
              {String(h).padStart(2, "0")}:00
            </div>
          </div>
        ))}
      </div>

      {/* day columns */}
      {dayNames.map((_dn, idx) => {
        const day = idx + 1; // 1..7

        return (
          <div
            key={day}
            className={styles.dayCol}
            onClick={(e) => {
              if (!canEdit) return;
              if (!canStored("lessons.edit")) return;

              const rect = e.currentTarget.getBoundingClientRect();
              const offsetY = e.clientY - rect.top;
              const clickedMin = timelineMinuteAt(offsetY, rect.height);

              navigate(`/lessons/new?day=${day}&startMin=${initialProgramStart(clickedMin)}`);
            }}
            onDragOver={(e) => {
              if (canEdit && canStored("lessons.edit")) e.preventDefault();
            }}
            onDrop={(e) => {
              if (!canEdit) return;
              if (!canStored("lessons.edit")) return;

              const lessonId = e.dataTransfer.getData("lesson-id");
              if (!lessonId) return;

              const rect = e.currentTarget.getBoundingClientRect();
              const offsetY = e.clientY - rect.top;
              const targetStartMin = timelineMinuteAt(offsetY, rect.height);

              const all = Object.values(byDay).flat();
              const l = all.find(x => String(x._id) === String(lessonId));
              if (!l) return;

              saveReschedule({
                lesson: l,
                newDay: day,
                newRoom: Number(l?.room ?? 0),
                newStartMin: targetStartMin,
                onReload
              });
            }}
          >
            {(byDay[day] || []).map((l) => {
              const top = timelinePosition(getStart(l));
              const height = timelineDuration(getEnd(l) - getStart(l));
              return (
                <div
                  key={l._id}
                  className={styles.lessonBlock}
                  data-tour="lessons-open"
                  style={{ top, height }}
                  draggable={!l.readOnly && canEdit && canStored("lessons.edit")}
                  onClick={(ev) => {
                    if (l.readOnly) {
                      ev.stopPropagation();
                      onShowDetails?.(l);
                      return;
                    }
                    // Everyone who sees the lesson opens its page; editing is a button there.
                    ev.stopPropagation();
                    navigate(`/lessons/${l._id}`);
                  }}
                  onDragStart={(e) => e.dataTransfer.setData("lesson-id", l._id)}
                  onMouseEnter={(e) => {
                    setTooltip?.({
                      show: true,
                      x: e.clientX,
                      y: e.clientY,
                      content: (
                        <>
                          <div><b>الاسم:</b> {lessonLabel(l)}</div>
                          <div><b>المرشد:</b> {l.readOnly ? SYSTEM_TEACHER : (teacherNames?.[l.teacher] || "…")}</div>
                          <div><b>الوقت:</b> {toHHMM(getStart(l))}–{toHHMM(getEnd(l))}</div>
                          <div><b>اليوم:</b> {dayNames[(Number(l.date.day) || 1) - 1]}</div>
                          <div><b>المكان:</b> {roomLabel(l?.room)}</div>
                        </>
                      )
                    });
                  }}
                  onMouseMove={(e) => setTooltip?.({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTooltip?.({ show: false })}
                >
                  <div className={styles.lessonTitle}>{lessonLabel(l)}</div>
                  <div className={styles.lessonMeta}>
                    {toHHMM(getStart(l))}–{toHHMM(getEnd(l))}
                    {" · "}
                    {roomLabel(l?.room)}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* =======================
   DAY VIEW (rooms columns)
   Columns: rooms
======================= */
function DayRoomsTimeline({
  lessons,
  selectedDay,
  canEdit,
  showMyLessons,
  navigate,
  onReload,
  setTooltip,
  teacherNames,
  onShowDetails,
}) {
  const roomsList = useMemo(() => {
    const uid = localStorage.getItem("user_id");
    const canViewAll = canStored("lessons.viewAll");
    const set = new Set();

    for (const l of (lessons || [])) {
      if (!l?.date) continue;

      if (!isLessonVisible(l, { showMyLessons, canViewAll, uid })) continue;

      set.add(String(l?.room ?? 0));
    }

    if (set.size === 0) set.add("0");
    return Array.from(set).sort((a,b)=>Number(a)-Number(b));
  }, [lessons, showMyLessons]);

  const byRoom = useMemo(() => {
    const uid = localStorage.getItem("user_id");
    const canViewAll = canStored("lessons.viewAll");
    const map = Object.fromEntries(roomsList.map(r => [r, []]));

    for (const l of (lessons || [])) {
      if (!l?.date) continue;
      if (Number(l.date.day) !== Number(selectedDay)) continue;

      if (!isLessonVisible(l, { showMyLessons, canViewAll, uid })) continue;

      const rk = String(l?.room ?? 0);
      (map[rk] ??= []).push(l);
    }

    for (const k of Object.keys(map)) {
      map[k].sort((a,b) => getStart(a) - getStart(b));
    }
    return map;
  }, [lessons, roomsList, selectedDay, showMyLessons]);

  const hourMarks = Array.from({ length: 10 }, (_, i) => 13 + i);

  return (
    <div className={styles.timelineGridRooms} style={{ ["--cols"]: roomsList.length }}>
      <div className={styles.headerSpacer} />
      {roomsList.map((r) => (
        <div key={r} className={styles.dayHeader}>
          {roomLabel(r)}
        </div>
      ))}

      <div className={styles.hoursGutter}>
        {hourMarks.map((h, idx) => (
          <div key={idx}>
            <div className={styles.hourLine} style={{ top: timelinePosition(h * 60) }} />
            <div className={styles.hourLabel} style={{ top: timelinePosition(h * 60) }}>
              {String(h).padStart(2, "0")}:00
            </div>
          </div>
        ))}
      </div>

      {roomsList.map((room) => (
        <div
          key={room}
          className={styles.roomCol}
          onClick={(e) => {
            if (!canEdit) return;
            if (!canStored("lessons.edit")) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const offsetY = e.clientY - rect.top;
            const clickedMin = timelineMinuteAt(offsetY, rect.height);

            navigate(`/lessons/new?day=${selectedDay}&room=${room}&startMin=${initialProgramStart(clickedMin)}`);
          }}
          onDragOver={(e) => {
            if (canEdit && canStored("lessons.edit")) e.preventDefault();
          }}
          onDrop={(e) => {
            if (!canEdit) return;
            if (!canStored("lessons.edit")) return;

            const lessonId = e.dataTransfer.getData("lesson-id");
            if (!lessonId) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const offsetY = e.clientY - rect.top;
            const targetStartMin = timelineMinuteAt(offsetY, rect.height);

            const l = (lessons || []).find(x => String(x._id) === String(lessonId));
            if (!l) return;

            saveReschedule({
              lesson: l,
              newDay: Number(selectedDay),
              newRoom: Number(room),
              newStartMin: targetStartMin,
              onReload
            });
          }}
        >
          {(byRoom[room] || []).map((l) => {
            const top = timelinePosition(getStart(l));
            const height = timelineDuration(getEnd(l) - getStart(l));

            return (
              <button
                key={l._id}
                className={styles.lessonBlock}
                data-tour="lessons-open"
                style={{ top, height }}
                draggable={!l.readOnly && canEdit && canStored("lessons.edit")}
                onClick={(ev) => {
                  if (l.readOnly) {
                    ev.stopPropagation();
                    onShowDetails?.(l);
                    return;
                  }
                  ev.stopPropagation();
                  navigate(`/lessons/${l._id}`);
                }}
                onDragStart={(e) => e.dataTransfer.setData("lesson-id", l._id)}
                onMouseEnter={(e) => {
                  setTooltip?.({
                    show: true,
                    x: e.clientX,
                    y: e.clientY,
                    content: (
                      <>
                        <div><b>الاسم:</b> {lessonLabel(l)}</div>
                        <div><b>المرشد:</b> {l.readOnly ? SYSTEM_TEACHER : (teacherNames?.[l.teacher] || "…")}</div>
                        <div><b>الوقت:</b> {toHHMM(getStart(l))}–{toHHMM(getEnd(l))}</div>
                        <div><b>اليوم:</b> {dayNames[(Number(l.date.day) || 1) - 1]}</div>
                        <div><b>المكان:</b> {roomLabel(room)}</div>
                      </>
                    )
                  });
                }}
                onMouseMove={(e) => setTooltip?.({ x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTooltip?.({ show: false })}
              >
                <div className={styles.lessonTitle}>{lessonLabel(l)}</div>
                <div className={styles.lessonMeta}>
                  {toHHMM(getStart(l))}–{toHHMM(getEnd(l))}
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* =======================
   Read-only football lesson details
======================= */
function SportLessonDetails({ lesson, canOpenSports, onClose, onOpenSports }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = lessonLabel(lesson);
  return (
    <div className={styles.detailsBackdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.detailsBox} role="dialog" aria-modal="true" aria-label={name}>
        <h2 className={styles.detailsTitle}>{name}</h2>
        <p><b>اليوم والوقت:</b> {dayNames[(Number(lesson.date?.day) || 1) - 1]} {toHHMM(getStart(lesson))}–{toHHMM(getEnd(lesson))}</p>
        <p><b>المكان:</b> {roomLabel(lesson.room)}</p>
        <p><b>المرشد:</b> {SYSTEM_TEACHER}</p>
        <p><b>عدد اللاعبين:</b> {lesson.playersCount ?? 0}</p>
        <div className={styles.detailsActions}>
          {canOpenSports && (
            <button type="button" className={styles.detailsLink} onClick={onOpenSports}>إدارة من قسم الرياضة</button>
          )}
          <button type="button" className={styles.detailsClose} onClick={onClose}>إغلاق</button>
        </div>
      </div>
    </div>
  );
}

/* =======================
   MAIN PAGE
======================= */
export default function ViewAllLesson() {
  const navigate = useNavigate();
  const canCreateLessons = canStored("lessons.create");
  const canSeeSports = ["sports.view", "sports.coach", "sports.manage"].some((key) => canStored(key));

  const [showFab, setShowFab] = useState(false);
  const [addBtnEl, setAddBtnEl] = useState(null);
  const addBtnRef = useCallback((node) => {
    setAddBtnEl(node); // node = DOM element of the main button (or null)
  }, []);

  useEffect(() => {
    // if button not rendered (no admin) -> hide FAB
    if (!addBtnEl) {
      setShowFab(false);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        // if main button is NOT in viewport -> show FAB
        setShowFab(!entry.isIntersecting);
      },
      { root: null, threshold: 0.01 }
    );

    io.observe(addBtnEl);
    return () => io.disconnect();
  }, [addBtnEl]);


  const [canEdit, setCanEdit] = useState(true);
  useEffect(() => { localStorage.setItem("canEdit", String(canEdit)); }, [canEdit]);

  const [isLoading, setIsLoading] = useState(false);
  const [lessons, setLessons] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [teacherNames, setTeacherNames] = useState({});
  const [details, setDetails] = useState(null); // a read-only sport lesson
  // Tooltips
  const [tooltipInfo, setTooltipInfo] = useState({ show:false, content:"", x:0, y:0 });

  // Filters
  const canViewAllLessons = canStored("lessons.viewAll");
  const [showMyLessons, setShowMyLessons] = useState(!canViewAllLessons);

  const [viewMode, setViewMode] = useState("week"); // "week" | "dayRooms"
  const [selectedDay, setSelectedDay] = useState(() => (new Date().getDay() + 1)); // 1..7

  const [filterDay, setFilterDay] = useState(0); // 0=all, 1..7 specific day (used mainly in week view)
  const [filterRoom, setFilterRoom] = useState("all"); // all | "0" | "1" | ...
  const [filterTeacher, setFilterTeacher] = useState("all"); // all | teacherId
  const [query, setQuery] = useState("");

  // quiet: a live refresh keeps the schedule on screen instead of showing the loading state.
  const loadData = async ({ quiet = false } = {}) => {
    try {
      if (!quiet) setIsLoading(true);
      const [res, sportRes] = await Promise.all([getAllLesson(), getSportSchedule()]);
      if (!res?.ok) throw new Error(res?.message || "Load failed");

      // Football lessons are extra and read-only: the schedule still loads without them.
      const list = mergeSchedule(
        Array.isArray(res.lessons) ? res.lessons : [],
        sportRes?.ok ? sportRes.lessons : [],
      );
      // clean list_students
      const cleaned = list.map(lesson => ({
        ...lesson,
        list_students: Array.isArray(lesson.list_students)
          ? lesson.list_students.filter(x => x != null)
          : []
      }));

      setLessons(cleaned);
      // The staff names come with the lessons, so a guide (who may not read
      // the user list) sees them too; the filter offers only staff on lessons.
      const names = res.names || {};
      setTeacherNames(names);
      setTeachers(Object.entries(names)
        .map(([_id, name]) => ({ _id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, "ar")));

    } catch {
      if (quiet) return;
      toast.error("تعذّر تحميل البرامج");
      setLessons([]);
      setTeacherNames({});
      setTeachers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);
  useLiveRefresh(["lesson", "sportLesson", "user"], () => { loadData({ quiet: true }); });

  // Options from lessons
  const roomOptions = useMemo(() => {
    const set = new Set((lessons || []).map(l => String(l?.room ?? 0)));
    if (set.size === 0) set.add("0");
    return Array.from(set).sort((a,b)=>Number(a)-Number(b));
  }, [lessons]);

  // Apply filters to a single list (always one calendar)
  const filteredLessons = useMemo(() => {
    const uid = localStorage.getItem("user_id");
    return (lessons || []).filter(l => {
      if (!l?.date) return false;

      // Filter day (global filter)
      if (filterDay !== 0 && Number(l.date.day) !== Number(filterDay)) return false;

      // Filter room
      const r = String(l?.room ?? 0);
      if (filterRoom !== "all" && r !== String(filterRoom)) return false;

      // Filter teacher
      if (filterTeacher !== "all" && String(l.teacher) !== String(filterTeacher)) return false;

      // Only my lessons (unless admin)
      if (!isLessonVisible(l, { showMyLessons, canViewAll: canViewAllLessons, uid })) return false;
      // search query by lesson name
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const name = String(l.name || "").toLowerCase();
        if (!name.includes(q)) return false;
      }

      return true;
    });
  }, [lessons, filterDay, filterRoom, filterTeacher, showMyLessons, query]);

  // Same breakpoint as .mobileView in ViewAllLesson.module.css.
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 900);
  useEffect(() => {
    const handleResize = () => {
      const m = window.innerWidth <= 900;
      setIsMobile(m);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // The day filter counts only where it shows (the week view on a desktop).
  const activeFilterCount =
    (filterRoom !== "all") + (filterTeacher !== "all") + (viewMode !== "dayRooms" && !isMobile && filterDay !== 0);
  const clearFilters = () => {
    setFilterRoom("all");
    setFilterTeacher("all");
    setFilterDay(0);
  };
  const [mobileDay, setMobileDay] = useState(() => lessonDayOf());

  const newLessonDay = isMobile
    ? mobileDay
    : viewMode === "dayRooms" ? selectedDay : (filterDay || 1);
  const addButton = canCreateLessons && (
    <Button
      ref={addBtnRef}
      id="page-add-lesson"
      data-tour="lessons-add"
      onClick={() => navigate(`/lessons/new?day=${newLessonDay}`)}
    >
      + إضافة برنامج جديد
    </Button>
  );

  const outsideHours = filteredLessons.filter((lesson) => !validProgramHours(getStart(lesson), getEnd(lesson)));
  const timelineLessons = filteredLessons.filter((lesson) => validProgramHours(getStart(lesson), getEnd(lesson)));
  return (
    <div>
      <h1 className={styles.title}>برنامج الأسبوع</h1>
      <p>ساعات البرامج: 13:00–22:00</p>

      {/* ===== Filters + Controls ===== */}
      <div className={styles.controlsBar} data-tour="lessons-filters">
        <div className={styles.controlsCenter}>
          {!isMobile && <div className={styles.filterGroup}>
            <label>نوع الجدول</label>
            <select data-tour="lessons-view-mode" value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
              <option value="week">أسبوعي (حسب الأيام)</option>
              <option value="dayRooms">يومي (حسب الأماكن)</option>
            </select>
          </div>}

          {viewMode === "dayRooms" && (
            <div className={styles.filterGroup}>
              <label>اليوم</label>
              <select value={selectedDay} onChange={(e)=>setSelectedDay(Number(e.target.value))}>
                {dayNames.map((d, i)=>(
                  <option key={i+1} value={i+1}>{d}</option>
                ))}
              </select>
            </div>
          )}

          <div className={styles.filterGroup}>
            <label htmlFor="lesson-search">بحث</label>
            <input
              id="lesson-search"
              data-tour="lessons-search"
              type="search"
              placeholder="اسم البرنامج…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <FilterDialog count={activeFilterCount} onClear={clearFilters}>
            {viewMode !== "dayRooms" && !isMobile && <label>اليوم
              <select value={filterDay} onChange={(e)=>setFilterDay(Number(e.target.value))}>
                <option value={0}>الكل</option>
                {dayNames.map((d, i)=>(
                  <option key={i+1} value={i+1}>{d}</option>
                ))}
              </select>
            </label>}

            <label>المكان
              <select value={filterRoom} onChange={(e)=>setFilterRoom(e.target.value)}>
                <option value="all">الكل</option>
                {roomOptions.map(r=>(
                  <option key={r} value={r}>{roomLabel(r)}</option>
                ))}
              </select>
            </label>

            <label>المرشد
              <select value={filterTeacher} onChange={(e)=>setFilterTeacher(e.target.value)}>
                <option value="all">الكل</option>
                {(teachers || []).map(t => (
                  <option key={t._id} value={t._id}>{t.name}</option>
                ))}
              </select>
            </label>
          </FilterDialog>
          {!isMobile && addButton}
        </div>
        {isMobile && addButton}
      </div>

      {outsideHours.length > 0 && <section className={styles.outsideHours} aria-label="برامج خارج الساعات المحددة"><strong>برامج موجودة خارج 13:00–22:00</strong>{outsideHours.map((lesson) => <button type="button" key={lesson._id} onClick={() => lesson.readOnly ? setDetails(lesson) : navigate(`/lessons/${lesson._id}`)}>{lessonLabel(lesson)} · {toHHMM(getStart(lesson))}–{toHHMM(getEnd(lesson))}</button>)}</section>}
      {/* ===== Calendar (ONE) ===== */}
      {isLoading ? (
        <div className={styles.loaderWrap}>
          <div />
          {[...Array(7)].map((_, i) => <div key={i} className={styles.loaderBox} />)}
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className={styles.desktopView} data-tour={isMobile ? undefined : "lessons-calendar"}>
            {viewMode === "week" ? (
              <WeekTimeline
                lessons={timelineLessons}
                canEdit={canEdit}
                showMyLessons={showMyLessons}
                navigate={navigate}
                onReload={loadData}
                setTooltip={(t)=> setTooltipInfo(prev => ({ ...prev, ...t }))}
                teacherNames={teacherNames}
                onShowDetails={setDetails}
              />
            ) : (
              <DayRoomsTimeline
                lessons={timelineLessons}
                selectedDay={selectedDay}
                canEdit={canEdit}
                showMyLessons={showMyLessons}
                navigate={navigate}
                onReload={loadData}
                setTooltip={(t)=> setTooltipInfo(prev => ({ ...prev, ...t }))}
                teacherNames={teacherNames}
                onShowDetails={setDetails}
              />
            )}
          </div>

          <div className={styles.mobileView} data-tour={isMobile ? "lessons-calendar" : undefined}>
            <MobileLessonList
              lessons={filteredLessons}
              day={mobileDay}
              onDayChange={setMobileDay}
              teacherNames={teacherNames}
              onOpen={(l) => navigate(`/lessons/${l._id}`)}
              onShowDetails={setDetails}
            />
          </div>
        </>
      )}

      {details && (
        <SportLessonDetails
          lesson={details}
          canOpenSports={canSeeSports}
          onClose={() => setDetails(null)}
          onOpenSports={() => navigate("/sports")}
        />
      )}

      {/* Tooltip */}
      {tooltipInfo.show && (
        <div
          style={{
            position: "fixed",
            top: tooltipInfo.y + 12,
            left: tooltipInfo.x + 12,
            background: "black",
            color: "white",
            padding: 10,
            borderRadius: 6,
            pointerEvents: "none",
            zIndex: 9999,
            maxWidth: 300
          }}
        >
          {tooltipInfo.content}
        </div>
      )}

      <Fabtn
        anchor="#page-add-lesson"
        visible={showFab && canCreateLessons}
        label="إضافة برنامج"
        onClick={() => navigate(`/lessons/new?day=${newLessonDay}`)}
      />
    </div>
  );
}


SOURCE: apps/system/src/Components/Lesson/ViewAllLesson.module.css

/* ملاحظة عربية */
.scheduleContainer {
  direction: rtl;
  padding: 20px;
  position: relative;
  color: #fff;
  background: rgb(197, 197, 221);
  border-radius: 16px;
  box-shadow: white 0 0 0 4px, var(--shadow);
}

/* ملاحظة عربية */
.title {
  text-align: center;
  font-weight: 800;
  letter-spacing: .4px;
  margin-bottom: 18px;
}

/* ملاحظة عربية */
.monthControls {
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
  margin: 8px 0 18px;
}

.navBtn, .addBtn {
  padding: 10px 16px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-weight: 700;
  cursor: pointer;
  transition: transform .1s ease, box-shadow .2s ease, filter .2s ease;
  background: skyblue;
  border: 1px solid var(--border);
  box-shadow: var(--shadow);

}
.navBtn:hover { filter: brightness(1.1); transform: translateY(-1px); }
.addBtn {
  background: linear-gradient(180deg, #f8d77c, #64b3ed);
  border: none;
  color: #fff;
}
.addBtn:hover { filter: brightness(1.03); }

/* ملاحظة عربية */
.desktopView { display: block; }
.mobileView  { display: none; }

.timelineGrid {
  display: grid;
  grid-template-columns: 58px repeat(7, minmax(0, 1fr));  /* عربيالجمعةالجمعةعربيالجمعةعربي ساعات + 5 أيام */
  grid-template-rows: 42px clamp(360px, calc(100dvh - 300px), 540px);               /* ملاحظة عربية */
  column-gap: 8px;
  row-gap: 20px;
}

/* ملاحظة عربية */
.headerSpacer {}
.dayHeader {
  display: grid;
  place-items: center;
  border-radius: 140px;
  font-weight: 700;
  letter-spacing: .4px;
  position: relative;
  /* The system's dark blue with white text (over 4.5:1). The old pale
     yellow-to-white fill carried white text inherited from the container,
     which was hard to read. */
  background: var(--color-primary-600);
  border: 1px solid var(--color-primary-700);
  color: var(--color-text-on-primary);
  box-shadow: var(--shadow);
}

/* ملاحظة عربية */
.hoursGutter {
  position: relative;
  border-radius: 14px;
  background:
      repeating-linear-gradient(
        to bottom,
        rgba(143, 225, 228, 0.1) 0 1px,            /* ملاحظة عربية */
        transparent 1px 30px
      ),
      linear-gradient(150deg, #df9458, #f7e81c);
      border: 1px solid gray;
  overflow: hidden;
}

/* عربيالجمعةالجمعةعربي ساعة */
.hourLine {
  position: absolute;
  inset-inline: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(231, 68, 117, 0.2), transparent);
}
.hourLabel {
  position: absolute;
  right: 10px;
  font-size: 12px;
  transform: translateY(-50%);
  color: #fff;
  font-weight: 800;
}

/* ملاحظة عربية */
.dayCol {
  position: relative;
  border-radius: 14px;
  border: 1px solid gay;
  background:
    repeating-linear-gradient(
      to bottom,
      rgba(149, 216, 163, 0.1) 0 1px,            /* ملاحظة عربية */
      transparent 1px 30px
    ),
    linear-gradient(150deg, #1e7cf8, #115ef8);
  overflow: hidden;
  box-shadow: var(--shadow);
}

/* درس */
.lessonBlock {
  position: absolute;
  inset-inline: 8px;
  border-radius: 14px;
  background: rgba(56,189,248,.55);;
  border: 1px solid rgba(56,189,248,.55);
  color: var(--text);
  padding: 8px 10px;
  font-size: 14px;
  line-height: 1.2;
  cursor: grab;
  user-select: none;
  box-shadow: 0 8px 20px rgba(2,132,199,.25);
  backdrop-filter: blur(3px);
  transition: transform .08s ease, box-shadow .2s ease;
}
.lessonBlock:hover { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(2,132,199,.33); }
.lessonBlock:active { cursor: grabbing; }

/* ملاحظة عربية */
.lessonTitle {
  font-weight: 800;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lessonMeta {
  font-size: 12px;
  color: var(--muted);
}

/* ملاحظة عربية */
.nowLine {
  position: absolute;
  left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--danger), transparent);
  box-shadow: 0 0 18px rgba(239,68,68,.6);
}

/* ملاحظة عربية */
.loaderWrap {
  display: grid;
  grid-template-columns: 110px repeat(5, 1fr);
  column-gap: 8px;
  row-gap: 10px;
}
.loaderBox {
  height: 140px;
  border-radius: 14px;
  background: linear-gradient(90deg,#1b2742 25%,#223055 37%,#1b2742 63%);
  background-size: 400% 100%;
  animation: shimmer 1.2s ease-in-out infinite;
}
@keyframes shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}

/* ملاحظة عربية */
@media (max-width: 900px) {
  .desktopView { display: none; }
  .mobileView  { display: block; }

  .lessonCard {
    border-radius: 14px;
    padding: 12px;
    margin-bottom: 12px;
    box-shadow: var(--shadow);
    background: linear-gradient(180deg, #ffffff, #f2f7fd);
    border: 1px solid var(--border);
    color: var(--text);
  }
  .lessonCard p { margin: .25rem 0; }
}

/* عربيالجمعةالثلاثاءعربي FAB */
.fabAnchor { display: block; height: 1px; width: 1px; }


/* ===== Controls / Filters ===== */
.controlsBar{
  display:flex;
  /* justify-content: space-between; */
  /* align-items: flex-end; */
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255,255,255,.12);
  border: 1px solid rgba(255,255,255,.28);
  margin: 10px 0 14px;
}

.monthLabel{
  font-weight: 800;
  color: #fff;
}

.controlsCenter{
  display:flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.filterGroup{
  display:flex;
  flex-direction: column;
  gap: 6px;
  min-width: 150px;
}

.filterGroup label{
  font-size: 12px;
  font-weight: 800;
  /* color: #fff; */
  opacity: .9;
}

.filterGroup select,
.filterGroup input{
  border-radius: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(255,255,255,.35);
  background: rgba(255,255,255,.85);
  outline: none;
}

.checkbox{
  display:flex;
  gap: 8px;
  align-items:center;
  font-weight: 800;
  color:#fff;
  padding-bottom: 6px;
}

/* ===== Day view (rooms columns) ===== */
.timelineGridRooms{
  --cols: 1;
  display: grid;
  grid-template-columns: 58px repeat(var(--cols), minmax(0, 1fr));
  grid-template-rows: 42px clamp(360px, calc(100dvh - 300px), 540px);
  column-gap: 8px;
  row-gap: 20px;
}

.roomCol{
  position: relative;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,.25);
  background:
    repeating-linear-gradient(
      to bottom,
      rgba(149, 216, 163, 0.1) 0 1px,
      transparent 1px 30px
    ),
    linear-gradient(150deg, #1e7cf8, #115ef8);
  overflow: hidden;
  box-shadow: var(--shadow);
}

/* ===== Mobile cards ===== */
.lessonCard {
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 12px;
  box-shadow: var(--shadow);
  background: linear-gradient(180deg, #ffffff, #f2f7fd);
  border: 1px solid var(--border);
  color: var(--text);
}

/* ===== Phone: filters fold behind one button ===== */
.filterToggle{
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text-primary);
  font: inherit;
  cursor: pointer;
}

.filterCount{
  min-width: 20px;
  padding: 0 6px;
  border-radius: var(--radius-full);
  background: var(--color-primary-600);
  color: var(--color-text-on-primary);
  font-size: var(--fs-xs);
  line-height: 20px;
  text-align: center;
}

@media (max-width: 900px) {
  .controlsBar{
    align-items: center;
    justify-content: space-between;
    margin: 4px 12px 8px;
    padding: 0;
    border: 0;
    background: none;
  }

  .controlsCenter{
    order: 3;
    flex-basis: 100%;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }

  .controlsCenter .filterGroup{
    flex: 1 1 100%;
    min-width: 0;
  }
}

/* ===== Read-only football lesson details ===== */
.detailsBackdrop{
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(13, 48, 64, 0.55);
}

.detailsBox{
  width: min(360px, 100%);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text-primary);
  direction: rtl;
}

.detailsTitle{
  margin: 0 0 var(--space-3);
  font-size: 1.1rem;
}

.detailsBox p{ margin: var(--space-1) 0; }

.detailsActions{
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  justify-content: flex-end;
  margin-top: var(--space-4);
}

.detailsLink,
.detailsClose{
  min-height: 40px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-full);
  font: inherit;
  cursor: pointer;
}

.detailsLink{
  border: 0;
  background: var(--color-primary-600);
  color: var(--color-text-on-primary);
}

.detailsClose{
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-text-primary);
}

.outsideHours { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 12px; margin-bottom: 14px; background: var(--color-surface); color: var(--color-text-primary); border-radius: 10px; }
.outsideHours button { font: inherit; padding: 6px 10px; color: var(--color-primary-700); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 6px; cursor: pointer; }


SOURCE: server/test/lesson-bad-input.test.js

const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { actorFor } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");

// Bad input to the lesson routes answers 4xx in Arabic, never a 500 with the
// database's own message, and never stores an id that is no student.

function load(file, dependencies) {
  const filename = path.join(__dirname, "../Entities", file);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, Date, console: { log() {}, warn() {}, error() {} },
    require(name) {
      if (!Object.hasOwn(dependencies, name) && Object.hasOwn(live.deps, name)) return live.deps[name];
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return module.exports;
}

const ADMIN = { _id: "a".repeat(24), tz: "900000001", firstname: "Ad", lastname: "Min", roles: ["ادارة"] };
const REAL = "5".repeat(24);
const WAITING = "7".repeat(24);

function world() {
  let stored = { _id: "lesson-1", name: "X", teacher: null, helper: null, room: "1", date: { day: 1, startMin: 840 }, list_students: [] };
  const lessons = {
    dbName: "tamheed_db", collections: { active: "Lessons" },
    async get() { return { success: true, result: [{ ...stored, list_students: [...stored.list_students] }] }; },
    async update(filter, patch) { stored = { ...stored, ...patch }; return { success: true, result: stored }; },
    async updateExisting(filter, patch) { stored = { ...stored, ...patch }; return { success: true, result: stored }; },
    async create(data) { stored = { _id: "lesson-new", ...data }; return { success: true, result: stored }; },
  };
  const students = {
    async get(filter) {
      const id = String(filter?._id || "");
      if (id === WAITING) return { success: true, result: [{ _id: WAITING, tz: "000000026", status: "ينتظر" }] };
      return { success: true, result: id === REAL ? [{ _id: REAL, tz: "000000018", status: "عادي" }] : [] };
    },
  };
  const none = { async get() { return { success: true, result: [] }; } };
  const lesson = load("Lesson/Lesson.controller.js", {
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/studentScope": require("../utils/studentScope"),
    "../../middleware/logger": { logWithSource() {} },
    "../Notification/Notification.controller": {},
    ...auditStub().deps,
    "./Lesson.model": { LessonModelDef: lessons },
    "../Sport/SportLesson.model": { SportLessonModelDef: none },
    "../../utils/lessonConflict": require("../utils/lessonConflict"),
    "../Student/Student.model": { StudentModelDef: students },
    "../User/User.model": { UserModelDef: none },
  });
  return { lesson, stored: () => stored };
}

const res = () => ({ statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });
const req = (body) => ({ actor: actorFor(ADMIN), user: { id: ADMIN._id }, params: { id: "lesson-1" }, body });

for (const name of ["addToList", "removeFromList"]) {
  test(`${name} with list_students that is not a list answers 400`, async () => {
    const w = world();
    const out = res();
    await w.lesson[name](req({ list_students: "abc" }), out);
    assert.equal(out.statusCode, 400);
    assert.equal(out.body.ok, false);
  });
}

test("an admin adding an id that is no student stores nothing", async () => {
  const w = world();
  const out = res();
  await w.lesson.addToList(req({ list_students: ["not-a-student", "b".repeat(24), REAL] }), out);
  assert.equal(out.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(w.stored().list_students.map(String))), [REAL]);
});

test("a lesson id that is not an ObjectId answers 404 before the handler", () => {
  const { objectIdParam } = require("../middleware/objectIdParam");
  const out = res();
  let next = false;
  objectIdParam({}, out, () => { next = true; }, "xyz");
  assert.equal(next, false);
  assert.equal(out.statusCode, 404);
  assert.equal(out.body.ok, false);
  objectIdParam({}, res(), () => { next = true; }, "a".repeat(24));
  assert.equal(next, true);
});

test("the lesson router checks :id with objectIdParam", () => {
  const src = fs.readFileSync(path.join(__dirname, "../Entities/Lesson/Lesson.route.js"), "utf8");
  assert.match(src, /router\.param\(\s*['"]id['"]\s*,\s*objectIdParam\s*\)/);
});

test("an admin cannot add a student who is still on the waiting list", async () => {
  const w = world();
  const out = res();
  await w.lesson.addToList(req({ list_students: [WAITING, REAL] }), out);
  assert.equal(out.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(w.stored().list_students.map(String))), [REAL]);
});

const LESSON_BODY = { name: "Math", teacher: "t".repeat(24), room: "1", date: { day: 2, startMin: 840, endMin: 885 } };

test("an admin creating a lesson stores only existing, accepted students", async () => {
  const w = world();
  const out = res();
  await w.lesson.postOne(req({ ...LESSON_BODY, list_students: ["bogus", WAITING, REAL] }), out);
  assert.equal(out.statusCode, 201, JSON.stringify(out.body));
  assert.deepEqual(JSON.parse(JSON.stringify(w.stored().list_students.map(String))), [REAL]);
});

test("an admin saving the lesson form adds only existing, accepted students and keeps those already on it", async () => {
  const w = world();
  const out = res();
  await w.lesson.putOne(req({ ...LESSON_BODY, list_students: ["bogus", WAITING, REAL] }), out);
  assert.equal(out.statusCode, 200, JSON.stringify(out.body));
  assert.deepEqual(JSON.parse(JSON.stringify(w.stored().list_students.map(String))), [REAL]);
});

for (const [startMin, endMin] of [[779, 840], [780, 1321], [1320, 1320], [900, 840], [-1, 840], [780.5, 840], ["bad", 840], [null, 840], [780, null]]) {
  test(`creation and editing refuse invalid program hours ${startMin}–${endMin} without writing`, async () => {
    for (const operation of ["postOne", "putOne"]) {
      const w = world(); const before = JSON.stringify(w.stored()); const out = res();
      await w.lesson[operation](req({ ...LESSON_BODY, date: { day: 2, startMin, endMin } }), out);
      assert.equal(out.statusCode, 400);
      assert.equal(out.body.code, "PROGRAM_HOURS");
      assert.equal(JSON.stringify(w.stored()), before);
    }
  });
}
for (const [startMin, endMin] of [[780, 825], [1275, 1320]]) {
  test(`creation and editing accept program boundary ${startMin}–${endMin} exactly`, async () => {
    for (const operation of ["postOne", "putOne"]) {
      const w = world(); const out = res();
      await w.lesson[operation](req({ ...LESSON_BODY, date: { day: 2, startMin, endMin } }), out);
      assert.equal(out.statusCode, operation === "postOne" ? 201 : 200);
      assert.equal(w.stored().date.startMin, startMin);
      assert.equal(w.stored().date.endMin, endMin);
    }
  });
}


SOURCE: apps/system/src/utils/lessonSchedule.test.js

import { countLessonsByDay, endOf, lessonDayOf, lessonsForDay, toHHMM, initialProgramStart, validProgramHours, timelinePosition, timelineDuration, timelineMinuteAt } from "./lessonSchedule";

test("program bounds accept 13:00 and 22:00, and reject spillover or reversed times", () => {
  expect(validProgramHours(780, 825)).toBe(true);
  expect(validProgramHours(1275, 1320)).toBe(true);
  for (const [start, end] of [[779, 825], [1275, 1321], [1320, 1320], [900, 840], [NaN, 840]]) expect(validProgramHours(start, end)).toBe(false);
  expect(initialProgramStart(null)).toBe(780);
  expect(initialProgramStart("600")).toBe(780);
  expect(initialProgramStart("1320")).toBe(1275);
});

test("compact timeline hit testing maps the same hours at different desktop heights", () => {
  for (const height of [360, 450, 540]) {
    expect(timelineMinuteAt(20, height)).toBe(780);
    expect(timelineMinuteAt(height - 20, height)).toBe(1320);
    expect(timelineMinuteAt(height / 2, height)).toBe(1050);
  }
  expect(timelinePosition(780)).toBe("calc(0% + 20px)");
  expect(timelinePosition(1320)).toBe("calc(100% + -20px)");
  expect(timelineDuration(540)).toBe("calc(100% - 40px)");
});

test.each([
  [840, "14:00"],
  [905, "15:05"],
  [0, "00:00"],
  [-5, "00:00"],
  [null, "00:00"],
])("minute %p shows as %p", (min, want) => {
  expect(toHHMM(min)).toBe(want);
});

test("a lesson without an end time lasts 45 minutes", () => {
  expect(endOf({ date: { day: 1, startMin: 840 } })).toBe(885);
});

const lesson = (name, day, startMin) => ({ name, date: { day, startMin, endMin: startMin + 45 } });

test("a day's lessons are sorted from the earliest start", () => {
  const lessons = [lesson("c", 2, 1020), lesson("x", 3, 600), lesson("a", 2, 840), lesson("b", 2, 900)];
  expect(lessonsForDay(lessons, 2).map((l) => l.name)).toEqual(["a", "b", "c"]);
});

test("a day stored as a string still matches", () => {
  expect(lessonsForDay([lesson("a", "4", 840)], 4).map((l) => l.name)).toEqual(["a"]);
});

test("lessons without a date are left out", () => {
  expect(lessonsForDay([{ name: "broken" }, lesson("a", 1, 840)], 1).map((l) => l.name)).toEqual(["a"]);
});

test("lesson counts are listed for Sunday through Saturday", () => {
  const lessons = [lesson("a", 1, 840), lesson("b", 1, 900), lesson("c", 7, 960), { name: "broken" }];
  expect(countLessonsByDay(lessons)).toEqual([2, 0, 0, 0, 0, 0, 1]);
});

test.each([
  ["2026-09-27T10:00:00", 1],
  ["2026-09-26T10:00:00", 7],
  ["2026-09-30T10:00:00", 4],
])("%s is lesson day %p", (iso, want) => {
  expect(lessonDayOf(new Date(iso))).toBe(want);
});


SOURCE: apps/system/src/Components/Lesson/ViewAllLesson.test.js

import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});
jest.mock("../../WebServer/services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() }, API_BASE_URL: "/api" }));
jest.mock("../../WebServer/services/user/functionsUser", () => ({ getAll: jest.fn() }));
jest.mock("../../WebServer/services/lesson/functionsLesson", () => ({
  getAllLesson: jest.fn(), getSportSchedule: jest.fn(), updateLesson: jest.fn(),
}));
jest.mock("../../locks/useLiveRefresh", () => ({ __esModule: true, default: () => {} }));
jest.mock("../../utils/session", () => ({
  ...jest.requireActual("../../utils/session"),
  canStored: (k) => ["lessons.view"].includes(k),
}));

import { getAll as getAllUsers } from "../../WebServer/services/user/functionsUser";
import { getAllLesson, getSportSchedule } from "../../WebServer/services/lesson/functionsLesson";
import ViewAllLesson from "./ViewAllLesson";

global.IS_REACT_ACT_ENVIRONMENT = true;

// A guide's lesson list (owner, 2026-11-01) comes with its staff names, so the
// page never asks for the user list (which a guide may not read: 403).

let container, root;
beforeEach(async () => {
  localStorage.setItem("user_id", "g1");
  getAllLesson.mockResolvedValue({
    ok: true,
    lessons: [{ _id: "L1", name: "Math", teacher: "g1", helper: "h1", room: "1", date: { day: 1, startMin: 600, endMin: 660 }, list_students: [] }],
    names: { g1: "Gu Ide", h1: "He Lper" },
  });
  getSportSchedule.mockResolvedValue({ ok: true, lessons: [] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<MemoryRouter><ViewAllLesson /></MemoryRouter>));
});
afterEach(() => { act(() => root.unmount()); container.remove(); localStorage.removeItem("user_id"); });

test("the page does not ask for the user list", () => {
  expect(getAllUsers).not.toHaveBeenCalled();
});

test("desktop timeline shows 13:00–22:00 and retains legacy morning programs in a separate list", () => {
  const labels = [...container.querySelectorAll('[class*="hourLabel"]')].map((node) => node.textContent);
  expect(labels).toContain("13:00");
  expect(labels).toContain("22:00");
  expect(labels).not.toContain("08:00");
  const outside = container.querySelector('section[aria-label="برامج خارج الساعات المحددة"]');
  expect(outside.textContent).toContain("Math");
  expect(outside.textContent).toContain("10:00–11:00");
});

test("the guide filter is filled from the names that come with the lessons", async () => {
  // The filters sit in the «فلتر» window (owner, 2026-11-03).
  expect([...container.querySelectorAll("select")].some((s) => [...s.options].some((o) => o.text === "Gu Ide"))).toBe(false);
  const open = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "فلتر");
  await act(async () => open.click());
  const filter = [...container.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.text === "Gu Ide"));
  expect(filter).toBeTruthy();
});
