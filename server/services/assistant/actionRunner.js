// Actions the assistant proposes and the user approves (spec, part 2).
//
//   createActionRunner({ deps }) -> {
//     propose({ actor, conversationId, type, params })
//         checks the shape and the user's CURRENT permission and rules, stores an
//         AiPendingActions row (valid PENDING_TTL_MS, used once) and returns
//         { pendingActionId, summary, pendingAction } (the card; the model sees
//         only the id and the clipped summary, see toolRegistry.forModel), or
//         { error: "FORBIDDEN" | "NOT_FOUND" | "NOT_ADDABLE" | "INVALID_INPUT" }.
//         Nothing is changed.
//     approve({ actor, id, ip }) -> { status, body }
//         200 { ok, status: "done", result }    run and audited (via: "assistant")
//         404 NOT_FOUND       not the caller's action (or its conversation is gone)
//         409 ALREADY_USED    approved, cancelled or discarded before (atomic claim);
//                             body.status: done | cancelled | failed | approving
//         410 EXPIRED         older than 15 minutes
//         409 BUSY            its conversation is still answering; try again after it
//         403 FORBIDDEN       the permission is no longer held (the action is used up)
//         422 NOT_POSSIBLE    the rules no longer allow it (e.g. the student left
//                             the user's scope); used up, nothing changed
//         500 FAILED          the controller failed
//     cancel({ actor, id }) -> { status, body }   200, or 404 / 409 / 410 / 409 BUSY as above
//     discard(ownerTz, ids)   proposals whose chat round was never stored
//     pendingCards({ actor, conversationId })  the cards still waiting in one of
//                             the caller's conversations (shown again after a reload)
//
// The card ({ id, type, summary, details, expiresAt, before? }) shows exactly
// what will be written: details holds every field execute() passes to the
// controller, free text in full (the summary is clipped, for the model).
//     execute(action, req) -> { ok, status, result }
//   }
//
// Execution goes through the very controller functions the HTTP routes call
// (Attendance.bulkSave, Lesson.addToList with list_tz, Report.post,
// Notice.create, User.changeRoom), with a request carrying req.actor and
// req.via = "assistant", so the routes' own scope rules and audit rows apply.
// The checks here are the routes' permission gates plus the rules the
// controllers would apply silently (a roster or scope filter), so a proposal
// that would do nothing, or something else, is refused instead.
// Every outcome is appended to the conversation as a system message naming
// the type, the action id and server-side facts only (the lesson name from
// the database, the last 4 digits of an ID number, counts, the validated
// date/severity/role; never a name a registrant typed), never text
// the model wrote (a title, a body, a note), so the model cannot plant
// "system" text through its own proposal.
const { can, isSystemTz, normalizeRole } = require("../../utils/permissions");
const { createStudentScope } = require("../../utils/studentScope");
const { OBJECT_ID_RE, jerusalemDate, fullName, rows, clip } = require("./tools/_shared");

const PENDING_TTL_MS = 15 * 60 * 1000;
const VIA = "assistant";

const STATUS = {
  "حاضر": { he: "נוכח", en: "present" },
  "غائب": { he: "נעדר", en: "absent" },
  "متأخر": { he: "איחור", en: "late" },
};
const ROLE = {
  "ادارة": { he: "הנהלה", en: "management" },
  "مرشد": { he: "מדריך", en: "guide" },
  "مساعد": { he: "עוזר", en: "assistant" },
};
const SEVERITY = {
  critical: { ar: "عاجل", he: "קריטי" },
  important: { ar: "مهم", he: "חשוב" },
  info: { ar: "معلومة", he: "לידיעה" },
};

const err = (error, message) => (message ? { error, message } : { error });
const FORBIDDEN = { error: "FORBIDDEN" };
const NOT_FOUND = { error: "NOT_FOUND" };
// The model never gets a full ID number back (spec, part 5).
const last4 = (tz) => String(tz).slice(-4);
const text = (value) => String(value ?? "").trim();

const MESSAGES = {
  NOT_FOUND: "الإجراء المقترح غير موجود.",
  ALREADY_USED: "تم التعامل مع هذا الإجراء من قبل.",
  EXPIRED: "انتهت صلاحية هذا الاقتراح (15 دقيقة). اطلب من المساعد اقتراحه من جديد.",
  BUSY: "المساعد ما زال يجيب في هذه المحادثة، انتظر حتى ينتهي.",
  FORBIDDEN: "لا توجد لديك صلاحية لتنفيذ هذا الإجراء الآن.",
  NOT_POSSIBLE: "لم يعد بالإمكان تنفيذ هذا الإجراء كما اقتُرح، ولم يتغيّر شيء.",
  FAILED: "تعذّر تنفيذ الإجراء، حاول مرة أخرى.",
};
const reply = (status, code, extra = {}) => ({ status, body: { ok: false, code, message: MESSAGES[code], ...extra } });

// What a used action's 409 ALREADY_USED reports, so a client whose approve
// answer was lost can show the real outcome on retry:
//   done | cancelled (also a discarded proposal: it never ran) |
//   failed (refused or failed: not carried out) | approving (still running,
//   or its outcome was never recorded).
const USED_OUTCOME = { done: "done", cancelled: "cancelled", discarded: "cancelled", failed: "failed", refused: "failed" };
const alreadyUsed = (action) => reply(409, "ALREADY_USED", {
  status: Object.hasOwn(USED_OUTCOME, String(action?.status)) ? USED_OUTCOME[action.status] : "approving",
});

/* ------------------------------------------------------------ action types */

// The lock key of the item a type writes to (the same keys the routes lock),
// or null when the action has no existing target (it only creates), in which
// case it runs without a lock check: report, notice.
const TARGET_KEYS = {
  attendance: async (p) => `attendance:${p.lessonId}:${p.date}`,
  add_student_to_lesson: async (p) => `lesson:${p.lessonId}`,
  approve_user: async (p, controllers) => {
    const user = await controllers.user.getUserInRoomByTz(p.tz, "waiting");
    return user?._id ? `user:${user._id}` : null;
  },
  report: async () => null,
  notice: async () => null,
};
const heldMessage = (holder) => `مفتوح الآن لدى ${holder?.name || ""}${holder?.tz ? ` (${holder.tz})` : ""}`;

// Each type: the route's permission gate, prepare() (rules + summary, run at
// proposal AND at approval) and run() (the controller call).
const TYPES = {
  attendance: {
    permission: "attendance.record",
    async prepare(p, actor, env) {
      const lesson = await env.lesson(p.lessonId);
      if (!lesson) return NOT_FOUND;
      if (p.date > jerusalemDate(env.now())) return err("INVALID_INPUT", "attendance cannot be saved for a future date");
      const ids = p.rows.map((r) => String(r.studentId));
      if (new Set(ids).size !== ids.length) return err("INVALID_INPUT", "each student may appear once");
      // Only students on this lesson's roster that the user can see
      // (bulkSave would silently skip the others).
      const roster = new Set((lesson.list_students || []).map(String));
      const visible = await env.visible(actor);
      if (ids.some((sid) => !roster.has(sid) || (visible && !visible.has(sid)))) return NOT_FOUND;

      const names = new Map(rows(await env.models.Student.get({ _id: { $in: ids } })).map((s) => [String(s._id), fullName(s)]));
      const dateKey = Number(p.date.replace(/-/g, ""));
      const existing = rows(await env.models.Attendance.get({ lesson: String(lesson._id), dateKey }));
      const before = existing
        .filter((r) => ids.includes(String(r.student)))
        .map((r) => ({ studentId: String(r.student), status: r.status }));

      const params = {
        lessonId: String(lesson._id),
        date: p.date,
        rows: p.rows.map((r) => ({ studentId: String(r.studentId), status: r.status, notes: text(r.notes) })),
      };
      const line = (lang) => params.rows.map((r) => {
        const status = lang === "ar" ? r.status : STATUS[r.status][lang];
        return `- ${names.get(r.studentId) || "?"}: ${status}${r.notes ? ` (${clip(r.notes, 100)})` : ""}`;
      }).join("\n");
      const n = params.rows.length;
      return {
        params,
        before,
        details: {
          lessonId: params.lessonId,
          lessonName: String(lesson.name || ""),
          date: params.date,
          rows: params.rows.map((r) => ({ studentId: r.studentId, studentName: names.get(r.studentId) || "", status: r.status, notes: r.notes })),
        },
        summary: {
          ar: `حفظ حضور درس «${lesson.name || ""}» بتاريخ ${p.date} (${n} طلاب):\n${line("ar")}`,
          he: `שמירת נוכחות בשיעור «${lesson.name || ""}» בתאריך ${p.date} (${n} תלמידים):\n${line("he")}`,
          en: `Save attendance for the lesson "${lesson.name || ""}" on ${p.date} (${n} students):\n${line("en")}`,
        },
      };
    },
    async run(p, req, controllers) {
      const [year, month, day] = p.date.split("-").map(Number);
      const items = p.rows.map((r) => ({ studentId: r.studentId, status: r.status, notes: r.notes }));
      const out = await call(controllers.attendance.bulkSave, { ...req, body: { lessonId: p.lessonId, year, month, day, items } });
      return { ...out, result: { rowsSaved: items.length } };
    },
  },

  add_student_to_lesson: {
    permission: "lessons.roster",
    async prepare(p, actor, env) {
      const lesson = await env.lesson(p.lessonId);
      if (!lesson) return NOT_FOUND;
      // The list_tz rule (exact ID number, not waiting), from Lesson.controller.
      // Unknown, waiting and already-listed numbers get the same answer.
      const [studentId] = await env.controllers.lesson.idsFromTz([p.tz]);
      const roster = new Set((lesson.list_students || []).map(String));
      if (!studentId || roster.has(String(studentId))) return err("NOT_ADDABLE", "this ID number cannot be added to this lesson");
      const visible = await env.visible(actor);
      let name = "";
      if (!visible || visible.has(String(studentId))) {
        name = fullName(rows(await env.models.Student.get({ _id: String(studentId) }))[0] || {});
      }
      const who = { ar: name ? ` ${name}` : "", he: name ? ` ${name}` : "", en: name ? ` ${name}` : "" };
      return {
        params: { lessonId: String(lesson._id), tz: p.tz },
        // The full ID number goes to the card (the user typed it), never to the model.
        details: { lessonId: String(lesson._id), lessonName: String(lesson.name || ""), tz: p.tz, studentName: name || null },
        summary: {
          ar: `إضافة الطالب${who.ar} (رقم هوية ينتهي بـ ${last4(p.tz)}) إلى درس «${lesson.name || ""}»`,
          he: `הוספת התלמיד${who.he} (ת"ז המסתיימת ב-${last4(p.tz)}) לשיעור «${lesson.name || ""}»`,
          en: `Add the student${who.en} (ID number ending ${last4(p.tz)}) to the lesson "${lesson.name || ""}"`,
        },
      };
    },
    async run(p, req, controllers) {
      const out = await call(controllers.lesson.addToList, {
        ...req, params: { id: p.lessonId }, body: { list_students: [], list_tz: [p.tz] },
      });
      return { ...out, result: { added: 1 } };
    },
  },

  report: {
    permission: "reports.create",
    async prepare(p) {
      const title = text(p.title);
      const body = text(p.text);
      if (!title || !body) return err("INVALID_INPUT", "title and text are required");
      const excerpt = clip(body, 120);
      return {
        params: { date: p.date, title, text: body },
        details: { date: p.date, title, text: body },
        summary: {
          ar: `إنشاء تقرير يومي بتاريخ ${p.date}: «${title}» — ${excerpt}`,
          he: `יצירת דוח יומי לתאריך ${p.date}: «${title}» — ${excerpt}`,
          en: `Create a daily report dated ${p.date}: "${title}" — ${excerpt}`,
        },
      };
    },
    async run(p, req, controllers) {
      // The form's subtitle is the report's title; its tags (title[]) stay empty.
      const out = await call(controllers.report.post, { ...req, body: { date: p.date, stitle: p.title, info: p.text, title: [] } });
      return { ...out, result: { created: 1 } };
    },
  },

  notice: {
    permission: "notices.post",
    async prepare(p) {
      const title = text(p.title);
      const body = text(p.body);
      if (!title) return err("INVALID_INPUT", "title is required");
      const excerpt = body ? ` — ${clip(body, 120)}` : "";
      return {
        params: { title, body, severity: p.severity },
        details: { title, body, severity: p.severity },
        summary: {
          ar: `نشر إعلان (${SEVERITY[p.severity].ar}): «${title}»${excerpt}`,
          he: `פרסום הודעה (${SEVERITY[p.severity].he}): «${title}»${excerpt}`,
          en: `Post a notice (${p.severity}): "${title}"${excerpt}`,
        },
      };
    },
    async run(p, req, controllers) {
      const out = await call(controllers.notice.create, { ...req, body: { title: p.title, body: p.body, severity: p.severity } });
      return { ...out, result: { posted: 1 } };
    },
  },

  approve_user: {
    permission: "users.approve",
    async prepare(p, actor, env) {
      const role = normalizeRole(p.role);
      if (!role) return err("INVALID_INPUT", "unknown role");
      const user = await env.controllers.user.getUserInRoomByTz(p.tz, "waiting");
      // Exact ID number only (the lookup also matches _id); never the system account.
      if (!user || String(user.tz) !== p.tz || isSystemTz(user.tz, env.systemTz)) return NOT_FOUND;
      // The approval rule (changeRoom): a first role below the approver's own.
      if (!env.controllers.user.canApproveAs(actor, user, role)) return FORBIDDEN;
      const name = fullName(user) || "?";
      return {
        params: { tz: p.tz, role },
        details: { tz: p.tz, name: fullName(user) || "", role },
        summary: {
          ar: `قبول المستخدم ${name} (رقم هوية ينتهي بـ ${last4(p.tz)}) بدور ${role}`,
          he: `אישור המשתמש ${name} (ת"ז המסתיימת ב-${last4(p.tz)}) בתפקיד ${ROLE[role].he}`,
          en: `Approve the user ${name} (ID number ending ${last4(p.tz)}) as ${ROLE[role].en}`,
        },
      };
    },
    async run(p, req, controllers) {
      const out = await call(controllers.user.changeRoom, {
        ...req, params: { tz: p.tz }, body: { from: "waiting", to: "active", role: p.role },
      });
      return { ...out, result: { approved: 1 } }; // never the user record the controller returns
    },
  },
};

// The card the browser shows, from a stored row.
function cardOf(doc) {
  const card = { id: String(doc._id), type: doc.type, summary: doc.summary, details: doc.details ?? null, expiresAt: doc.expiresAt };
  if (doc.before) card.before = doc.before;
  return card;
}

// Calls an Express handler and captures what it answered.
async function call(handler, req) {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
    set() { return this; },
    end() { return this; },
  };
  await handler(req, res);
  return { status: res.statusCode, body: res.body };
}

// The request a controller sees: the approving user, as loadActor built him.
function requestFor(actor, ip) {
  return {
    actor,
    // _id too: several controllers record createdBy from req.user._id.
    user: { _id: actor.id, id: actor.id, tz: actor.tz, roles: actor.role ? [actor.role] : [] },
    params: {},
    query: {},
    body: {},
    headers: {},
    get: () => undefined,
    ip,
    via: VIA,
  };
}

// What the action was, from server-side facts in details only. Names a
// registrant typed (a waiting user's or a student's name) stay out: those
// people are named by the last 4 digits of their ID number.
function noteLabel(type, details) {
  const d = details && typeof details === "object" ? details : {};
  switch (type) {
    case "attendance":
      return `attendance for the lesson "${d.lessonName || ""}" on ${d.date || ""} (${Array.isArray(d.rows) ? d.rows.length : 0} students)`;
    case "add_student_to_lesson":
      return `adding the student with ID number ending ${last4(d.tz ?? "")} to the lesson "${d.lessonName || ""}"`;
    case "report":
      return `a daily report dated ${d.date || ""}`;
    case "notice":
      return `a notice (${SEVERITY[d.severity] ? d.severity : ""})`;
    case "approve_user":
      return `approving the user with ID number ending ${last4(d.tz ?? "")} as ${Object.hasOwn(ROLE, String(d.role)) ? ROLE[d.role].en : ""}`;
    default:
      return "";
  }
}

const systemNote = (action, outcome) => {
  const what = `the proposed action ${action._id} (${action.type}: ${noteLabel(action.type, action.details)})`;
  const head = "Action update (from the system, not from the user):";
  if (outcome === "cancelled") return `${head} the user cancelled ${what}. Nothing was changed.`;
  if (outcome === "done") return `${head} the user approved ${what}. Result: done.`;
  return `${head} the user approved ${what}, but it was not carried out (${outcome}). Nothing was changed.`;
};

/* ------------------------------------------------------------ the runner */

function defaultDeps() {
  const { logWithSource } = require("../../middleware/logger");
  return {
    models: {
      Lesson: require("../../Entities/Lesson/Lesson.model").LessonModelDef,
      Student: require("../../Entities/Student/Student.model").StudentModelDef,
      Attendance: require("../../Entities/Attendance/Attendance.model").AttendanceModelDef,
      User: require("../../Entities/User/User.model").UserModelDef,
    },
    controllers: {
      attendance: require("../../Entities/Attendance/Attendance.controller"),
      lesson: require("../../Entities/Lesson/Lesson.controller"),
      report: require("../../Entities/Report/Report.controller"),
      notice: require("../../Entities/Notice/Notice.controller"),
      user: require("../../Entities/User/User.controller"),
    },
    pending: require("../../Entities/AiPendingAction/AiPendingAction.model").AiPendingActionModelDef,
    conversations: require("../../Entities/AiConversation/AiConversation.model").AiConversationModelDef,
    now: () => new Date(),
    log: (...args) => logWithSource("[assistant.action]", ...args),
  };
}

function createActionRunner({ deps } = {}) {
  let resolved = deps || null;
  const getDeps = () => (resolved ||= defaultDeps());
  let scope = null;

  function env() {
    const d = getDeps();
    scope ||= createStudentScope({ lessonModel: d.models.Lesson, studentModel: d.models.Student });
    return {
      models: d.models,
      controllers: d.controllers,
      systemTz: d.systemTz ?? process.env.SYSTEM_ADMIN_TZ,
      now: () => (d.now ? d.now() : new Date()),
      visible: (actor) => scope.visibleStudentIds(actor),
      async lesson(lessonId) {
        if (!OBJECT_ID_RE.test(String(lessonId))) return null;
        return rows(await d.models.Lesson.get({ _id: String(lessonId) }))[0] || null;
      },
    };
  }

  // Permission gate + rules, for the actor as he is now.
  async function check(type, params, actor) {
    const def = Object.hasOwn(TYPES, type) ? TYPES[type] : null;
    if (!def) return err("INVALID_INPUT", "unknown action");
    if (!actor || !(actor.permissions instanceof Set) || !can(actor, def.permission)) return FORBIDDEN;
    return def.prepare(params, actor, env());
  }

  async function propose({ actor, conversationId, type, params } = {}) {
    if (!conversationId) return err("INVALID_INPUT", "no conversation");
    const prepared = await check(type, params, actor);
    if (prepared.error) return prepared;
    const d = getDeps();
    const at = env().now();
    const doc = await d.pending.create({
      ownerTz: String(actor.tz),
      conversationId: String(conversationId),
      type,
      params: prepared.params,
      summary: prepared.summary,
      details: prepared.details,
      before: prepared.before ?? null,
      createdAt: at,
      expiresAt: new Date(at.getTime() + PENDING_TTL_MS),
    });
    const id = String(doc._id);
    d.log?.("proposed", { actor: String(actor.id ?? ""), type, id });
    return { pendingActionId: id, summary: prepared.summary, pendingAction: cardOf(doc) };
  }

  async function pendingCards({ actor, conversationId } = {}) {
    if (!actor?.tz || !conversationId) return [];
    const docs = await getDeps().pending.listOpen(actor.tz, conversationId, env().now());
    return docs
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map(cardOf);
  }

  // Actions obey item locks: if anyone holds the target, the action does not
  // run. Returns the failed outcome (with the holder message), or null.
  async function heldOutcome(action) {
    const d = getDeps();
    const keyOf = TARGET_KEYS[action.type];
    const key = keyOf ? await keyOf(action.params, d.controllers) : null;
    if (!key) return null;
    try {
      await (d.assertFree || require("../../middleware/lockGuard").assertFree)(key);
    } catch (error) {
      if (error?.status !== 423) throw error;
      return { ok: false, status: 423, result: { code: "LOCKED" }, message: heldMessage(error.holder) };
    }
    return null;
  }

  async function execute(action, req) {
    const def = TYPES[action.type];
    const out = await def.run(action.params, req, getDeps().controllers);
    const ok = out.status >= 200 && out.status < 300;
    return { ok, status: out.status, result: ok ? out.result : { code: out.body?.code || null } };
  }

  // Finds the caller's action and holds its conversation; or the reply.
  async function open(actor, id, at) {
    const d = getDeps();
    const action = actor?.tz ? await d.pending.findOwn(actor.tz, id) : null;
    if (!action) return { reply: reply(404, "NOT_FOUND") };
    if (action.usedAt) return { reply: alreadyUsed(action) };
    if (!(new Date(action.expiresAt) > at)) return { reply: reply(410, "EXPIRED") };
    // One writer per conversation: the system message must not land in the
    // middle of a turn that is still being stored.
    const lock = await d.conversations.lock(actor.tz, action.conversationId, at);
    if (!lock) {
      const exists = await d.conversations.findOwn(actor.tz, action.conversationId);
      return { reply: exists ? reply(409, "BUSY") : reply(404, "NOT_FOUND") };
    }
    return { action, lock };
  }

  // Claims the action (once, atomically); null reply when it was claimed.
  async function claim(actor, action, at, status) {
    const d = getDeps();
    const claimed = await d.pending.claim(actor.tz, action._id, at, status);
    if (claimed) return null;
    const now = await d.pending.findOwn(actor.tz, action._id);
    return now?.usedAt ? alreadyUsed(now) : reply(410, "EXPIRED");
  }

  async function note(actor, action, outcome) {
    const d = getDeps();
    await d.conversations.append(actor.tz, action.conversationId, [{ role: "system", content: systemNote(action, outcome) }], env().now())
      .catch((error) => d.log?.("note failed", { error: String(error?.name || "Error") }));
  }

  async function approve({ actor, id, ip } = {}) {
    const d = getDeps();
    const at = env().now();
    const opened = await open(actor, id, at);
    if (opened.reply) return opened.reply;
    const { action, lock } = opened;
    try {
      const lost = await claim(actor, action, at, "approving");
      if (lost) return lost;
      return await approveClaimed(actor, action, ip);
    } finally {
      await d.conversations.unlock(actor.tz, action.conversationId, lock).catch(() => {});
    }
  }

  // The action is ours (claimed): check, run, record the outcome. A failure
  // of the check itself ends the action as failed, never left "approving".
  async function approveClaimed(actor, action, ip) {
    const d = getDeps();
    let prepared;
    try {
      // Permissions and rules again, as they are now (not as at the proposal).
      prepared = await check(action.type, action.params, actor);
    } catch (error) {
      d.log?.("check failed", { type: action.type, error: String(error?.name || "Error") });
      await d.pending.finish(actor.tz, action._id, { status: "failed", result: { code: null } }).catch(() => {});
      await note(actor, action, "FAILED");
      return reply(500, "FAILED");
    }
    // The outcome is recorded best-effort: once the action ran, a failed
    // bookkeeping write must not turn the answer into an error.
    const finish = (fields) => d.pending.finish(actor.tz, action._id, fields)
      .catch((error) => d.log?.("finish failed", { error: String(error?.name || "Error") }));
    if (prepared.error) {
      const code = prepared.error === "FORBIDDEN" ? "FORBIDDEN" : "NOT_POSSIBLE";
      await finish({ status: "refused", result: { code: prepared.error } });
      await note(actor, action, code);
      return reply(code === "FORBIDDEN" ? 403 : 422, code);
    }

    let outcome;
    try {
      outcome = (await heldOutcome(action)) || await execute(action, requestFor(actor, ip));
    } catch (error) {
      d.log?.("execute failed", { type: action.type, error: String(error?.name || "Error") });
      outcome = { ok: false, status: 500, result: { code: null } };
    }
    d.log?.("approved", { actor: String(actor.id ?? ""), type: action.type, id: String(action._id), status: outcome.status });
    if (!outcome.ok) {
      await finish({ status: "failed", result: outcome.result });
      const code = outcome.status === 403 ? "FORBIDDEN" : outcome.status >= 500 || outcome.status === 423 ? "FAILED" : "NOT_POSSIBLE";
      await note(actor, action, code);
      if (outcome.status === 423) return reply(423, "FAILED", { message: outcome.message });
      return reply(code === "FORBIDDEN" ? 403 : code === "FAILED" ? 500 : 422, code);
    }
    await finish({ status: "done", result: outcome.result });
    await note(actor, action, "done");
    return { status: 200, body: { ok: true, status: "done", type: action.type, result: outcome.result } };
  }

  async function cancel({ actor, id } = {}) {
    const d = getDeps();
    const at = env().now();
    const opened = await open(actor, id, at);
    if (opened.reply) return opened.reply;
    const { action, lock } = opened;
    try {
      const lost = await claim(actor, action, at, "cancelled");
      if (lost) return lost;
      await note(actor, action, "cancelled");
      return { status: 200, body: { ok: true, status: "cancelled" } };
    } finally {
      await d.conversations.unlock(actor.tz, action.conversationId, lock).catch(() => {});
    }
  }

  async function discard(ownerTz, ids) {
    if (!Array.isArray(ids) || !ids.length) return 0;
    return getDeps().pending.discard(String(ownerTz), ids, env().now());
  }

  return { propose, approve, cancel, discard, execute, check, pendingCards, TYPES };
}

let defaultRunner = null;
const getDefault = () => (defaultRunner ||= createActionRunner());

module.exports = {
  createActionRunner,
  PENDING_TTL_MS,
  TYPES,
  propose: (args) => getDefault().propose(args),
  approve: (args) => getDefault().approve(args),
  cancel: (args) => getDefault().cancel(args),
  discard: (ownerTz, ids) => getDefault().discard(ownerTz, ids),
  execute: (action, req) => getDefault().execute(action, req),
  pendingCards: (args) => getDefault().pendingCards(args),
};
