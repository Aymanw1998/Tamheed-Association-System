// Weekly tasks are joined to lessons. Staff see all their lessons together.
// The joins stay week after week; only what was done
// belongs to a week, so a new week starts empty on its own. A week runs from Sunday and
// ends on Saturday night, Israel time.
const TIME_ZONE = "Asia/Jerusalem";
const JOB = "weekly-tasks-lessons";
const MAX_TITLE = 120;
const MAX_DETAILS = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_GREETING = "بارك الله فيكم على مجهودكم";
const { hasRealEmail } = require("../utils/permissions");

const rows = (res) => (Array.isArray(res?.result) ? res.result : []);
const same = (a, b) => String(a) === String(b);
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

function weekOf(now) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const pick = (type) => Number(parts.find((part) => part.type === type).value);
  const noon = Date.UTC(pick("year"), pick("month") - 1, pick("day"), 12);
  const sunday = noon - new Date(noon).getUTCDay() * DAY_MS;
  return new Date(sunday).toISOString().slice(0, 10);
}
const weekBefore = (week) => new Date(new Date(`${week}T12:00:00Z`).getTime() - 7 * DAY_MS).toISOString().slice(0, 10);

const isComplete = (status) => Boolean(status?.doneAt || status?.approvedAt);
const nameOf = (user) => `${user?.firstname || ""} ${user?.lastname || ""}`.trim();

function createWeeklyTasks({ tasks, assignments, statuses, summaries, greetings, runs, users, lessons, alerts = {}, sendMail = async () => { throw new Error("Email unavailable"); }, now = () => new Date(), log = () => {} }) {
  const guideRows = async () => rows(await users.listActive());

  async function groups() {
    const people = await guideRows();
    const active = new Map(people.map((person) => [String(person._id), person]));
    return rows(await lessons.get({})).map((lesson) => {
      const ownerIds = [...new Set([lesson.teacher, lesson.helper].filter(Boolean).map(String))].filter((id) => active.has(id));
      return { id: String(lesson._id), name: lesson.name || "برنامج", day: lesson.date?.day || null,
        ownerIds, ownerNames: ownerIds.map((id) => nameOf(active.get(id))) };
    }).filter((group) => group.ownerIds.length);
  }
  async function guides() {
    const owners = new Set((await groups()).flatMap((group) => group.ownerIds));
    return (await guideRows()).filter((user) => owners.has(String(user._id)))
      .map((user) => ({ id: String(user._id), tz: user.tz, name: nameOf(user) }));
  }

  const statusOf = (list, taskId, groupId) => list.find((row) => same(row.taskId, taskId) && same(row.groupId, groupId)) || null;
  const checkWeek = (week) => {
    if (week !== weekOf(now())) throw fail(409, "WEEK_CLOSED", "انتهى هذا الأسبوع. حدّث الصفحة لعرض مهمات الأسبوع الجديد.");
  };

  // Once per week: what the week that ended came to, per guide, and word of the new week.
  let closing = null;
  let closedWeek = null;
  async function closeLastWeek() {
    const week = weekOf(now());
    if (closedWeek === week) return;
    if (!closing) {
      closing = (async () => {
        const last = weekBefore(week);
        if (!rows(await runs.get({ job: JOB, date: last })).length) {
          const joined = rows(await assignments.get({})).filter((row) => !row.createdAt || weekOf(new Date(row.createdAt)) <= last);
          const done = rows(await statuses.get({ weekKey: last }));
          const allGroups = await groups();
          const byGuide = new Map();
          for (const row of joined) {
            const group = allGroups.find((item) => same(item.id, row.groupId));
            for (const guideId of group?.ownerIds || []) {
              const entry = byGuide.get(guideId) || { total: 0, done: 0 };
              entry.total += 1;
              if (isComplete(statusOf(done, row.taskId, row.groupId))) entry.done += 1;
              byGuide.set(guideId, entry);
            }
          }
          const people = await guideRows();
          let notificationFailed = false;
          for (const [guideId, entry] of byGuide) {
            const filter = { weekKey: last, guideId };
            const [existing] = rows(await summaries.get(filter));
            const summary = existing || (await summaries.createOnce(filter, { ...filter, total: entry.total, done: entry.done, finished: entry.total > 0 && entry.done === entry.total, seenAt: null, warningSentAt: null })).result;
            const user = people.find((row) => same(row._id, guideId));
            if (user && !summary.finished && !summary.warningSentAt) {
              try {
                await alerts.weeklyTasksOverdue?.(user, summary.total - summary.done, last);
                await summaries.updateExisting(filter, { warningSentAt: now() });
              } catch (error) { notificationFailed = true; log("weeklyTasks.warning", error); }
            }
            if (user) await Promise.resolve(alerts.weeklyTasks?.(user, entry.total, week)).catch((error) => log("weeklyTasks.alert", error));
          }
          if (notificationFailed) return; // Retry the durable warning at the next poll.
          await runs.create({ job: JOB, date: last, finishedAt: now() });
        }
        closedWeek = week;
      })().finally(() => { closing = null; });
    }
    await closing;
  }

  async function mine(guideId) {
    await closeLastWeek();
    const week = weekOf(now());
    const own = (await groups()).filter((group) => group.ownerIds.includes(String(guideId)));
    const ownIds = new Set(own.map((group) => group.id));
    const joined = rows(await assignments.get({})).filter((row) => ownIds.has(String(row.groupId)));
    const all = rows(await tasks.get({}));
    const done = rows(await statuses.get({ weekKey: week }));
    const list = joined
      .map((row) => {
        const task = all.find((item) => same(item._id, row.taskId));
        if (!task) return null;
        const status = statusOf(done, row.taskId, row.groupId);
        const group = own.find((item) => same(item.id, row.groupId));
        return { taskId: String(task._id), groupId: group.id, groupName: group.name, day: group.day,
          title: task.title, details: task.details || "", done: isComplete(status), approved: Boolean(status?.approvedAt) };
      })
      .filter(Boolean).sort((a, b) => Number(a.done) - Number(b.done));
    const summary = rows(await summaries.get({ guideId: String(guideId) }))
      .filter((row) => row.finished && !row.seenAt).sort((a, b) => a.weekKey.localeCompare(b.weekKey))[0];
    return { week, tasks: list, remaining: list.filter((task) => !task.done).length,
      praise: Boolean(summary), praiseWeek: summary?.weekKey || null, greeting: DEFAULT_GREETING };
  }

  async function setDone(guideId, taskId, groupId, done, byName, expectedWeek = weekOf(now())) {
    await closeLastWeek();
    checkWeek(expectedWeek);
    const group = (await groups()).find((item) => same(item.id, groupId));
    if (!group?.ownerIds.includes(String(guideId)) || !rows(await assignments.get({ groupId: String(groupId), taskId: String(taskId) })).length) {
      throw fail(403, "NOT_YOUR_TASK", "هذه المهمة ليست لمجموعتك.");
    }
    const week = weekOf(now());
    const filter = { weekKey: week, taskId: String(taskId), groupId: String(groupId) };
    const [status] = rows(await statuses.get(filter));
    if (!done && status?.approvedAt) throw fail(409, "ALREADY_APPROVED", "أكّدت الإدارة هذه المهمة.");
    checkWeek(expectedWeek);
    await statuses.update(filter, { ...filter, doneAt: done ? now() : null, doneByName: done ? byName || "" : "" });
    return mine(guideId);
  }

  async function board() {
    await closeLastWeek();
    const week = weekOf(now());
    const last = weekBefore(week);
    return {
      week,
      defaultGreeting: DEFAULT_GREETING,
      tasks: rows(await tasks.get({})).map((task) => ({ id: String(task._id), title: task.title, details: task.details || "" })),
      guides: (await guides()).map(({ id, name }) => ({ id, name })),
      groups: await groups(),
      assignments: rows(await assignments.get({})).map((row) => ({ taskId: String(row.taskId), groupId: String(row.groupId) })),
      statuses: rows(await statuses.get({ weekKey: week })).map((row) => ({
        taskId: String(row.taskId), groupId: String(row.groupId), done: isComplete(row), approved: Boolean(row.approvedAt),
      })),
      lastWeek: rows(await summaries.get({ weekKey: last })).map((row) => ({ guideId: String(row.guideId), total: row.total, done: row.done })),
    };
  }

  const cleanTask = (body = {}) => {
    const title = String(body.title ?? "").trim();
    const details = String(body.details ?? "").trim().slice(0, MAX_DETAILS);
    if (!title) throw fail(400, "TITLE_REQUIRED", "اسم المهمة مطلوب.");
    if (title.length > MAX_TITLE) throw fail(400, "TITLE_TOO_LONG", "اسم المهمة طويل جدًا.");
    return { title, details };
  };

  async function addTask(body, byName) {
    await closeLastWeek();
    const created = await tasks.create({ ...cleanTask(body), createdByName: byName || "", createdAt: now() });
    return String(created?.result?._id);
  }
  async function editTask(id, body) {
    await closeLastWeek();
    if (!rows(await tasks.get({ _id: String(id) })).length) throw fail(404, "NOT_FOUND", "المهمة غير موجودة.");
    await tasks.updateExisting({ _id: String(id) }, { ...cleanTask(body), updatedAt: now() });
  }
  async function removeTask(id) {
    await closeLastWeek();
    await assignments.delete({ taskId: String(id) });
    await statuses.delete({ taskId: String(id), weekKey: weekOf(now()) });
    await tasks.delete({ _id: String(id) });
  }

  async function assign(taskId, groupId) {
    await closeLastWeek();
    if (!rows(await tasks.get({ _id: String(taskId) })).length) throw fail(404, "NOT_FOUND", "المهمة غير موجودة.");
    const group = (await groups()).find((row) => same(row.id, groupId));
    if (!group) throw fail(400, "NOT_A_GROUP", "البرنامج غير موجود أو ليس له مسؤول نشط.");
    const pair = { taskId: String(taskId), groupId: String(groupId) };
    if (rows(await assignments.get(pair)).length) return;
    await assignments.createOnce(pair, { ...pair, createdAt: now() });
    for (const guide of (await guides()).filter((person) => group.ownerIds.includes(person.id))) {
      await Promise.resolve(alerts.weeklyTaskAdded?.(guide, `${groupId}:${taskId}`, weekOf(now()))).catch((error) => log("weeklyTasks.alert", error));
    }
  }
  async function unassign(taskId, groupId) {
    await closeLastWeek();
    const pair = { taskId: String(taskId), groupId: String(groupId) };
    await assignments.delete(pair);
    await statuses.delete({ ...pair, weekKey: weekOf(now()) });
  }

  // The management's check: on, or off, which sends the task back to the guide.
  async function setApproved(taskId, groupId, approved, expectedWeek = weekOf(now())) {
    await closeLastWeek();
    checkWeek(expectedWeek);
    const pair = { taskId: String(taskId), groupId: String(groupId) };
    if (!rows(await assignments.get(pair)).length) throw fail(404, "NOT_FOUND", "المهمة ليست لهذه المجموعة.");
    const filter = { weekKey: weekOf(now()), ...pair };
    await statuses.update(filter, approved ? { ...filter, approvedAt: now() } : { ...filter, approvedAt: null, doneAt: null, doneByName: "" });
  }

  async function praiseSeen(guideId, week) {
    const selected = week || (await mine(guideId)).praiseWeek;
    if (selected) await summaries.updateExisting({ weekKey: selected, guideId: String(guideId), finished: true }, { seenAt: now() });
  }

  // Explicit management action, independent of whether the group finished.
  // Durable per-recipient receipts prevent a retried HTTP request sending twice.
  async function sendGreeting(body, actorId) {
    const text = String(body?.text ?? "").trim();
    const ids = [...new Set(Array.isArray(body?.guideIds) ? body.guideIds.map(String) : [])];
    const requestId = String(body?.requestId ?? "");
    if (!text || text.length > 500 || !ids.length || ids.length > 100 || !/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) {
      throw fail(400, "INVALID_GREETING", "اختر المستلمين واكتب بركة حتى 500 حرف.");
    }
    const eligible = new Set((await guides()).map((guide) => guide.id));
    const people = await guideRows();
    if (ids.some((id) => !eligible.has(id))) throw fail(400, "NOT_A_GUIDE", "أحد المستلمين لم يعد مسؤولًا عن مجموعة. حدّث الصفحة.");
    const deliveries = [];
    for (const guideId of ids) {
      const key = { actorId: String(actorId), requestId, guideId };
      const receipt = await greetings.createOnce(key, { ...key, text, createdAt: now(), state: "sending" });
      if (receipt.result.text !== text) throw fail(409, "GREETING_CHANGED", "هذه الرسالة أرسلت بنص آخر. ابدأ رسالة جديدة.");
      if (!receipt.created) {
        deliveries.push({ guideId, ...(receipt.result.delivery || { notified: false, email: "pending" }) });
        continue;
      }
      const user = people.find((person) => same(person._id, guideId));
      const delivery = { notified: false, email: "missing" };
      try { await alerts.weeklyTasksGreeting(user, text, String(receipt.result._id)); delivery.notified = true; }
      catch (error) { log("weeklyTasks.greetingAlert", error); }
      if (hasRealEmail(user)) {
        try { await sendMail(String(user.email).trim(), text); delivery.email = "sent"; }
        catch (error) { delivery.email = "failed"; log("weeklyTasks.greetingEmail", error); }
      }
      await greetings.updateExisting(key, { state: "finished", delivery, finishedAt: now() });
      deliveries.push({ guideId, ...delivery });
    }
    return { deliveries };
  }

  return { closeLastWeek, mine, setDone, board, addTask, editTask, removeTask, assign, unassign, setApproved, praiseSeen, sendGreeting };
}

function defaultDeps() {
  const m = require("../Entities/WeeklyTask/WeeklyTask.model");
  const { UserModelDef } = require("../Entities/User/User.model");
  const { LessonModelDef } = require("../Entities/Lesson/Lesson.model");
  const { JobRunModelDef } = require("../Entities/Notice/Notice.model");
  const { isHiddenUser } = require("../utils/permissions");
  const events = require("./alertEvents");
  const { logWithSource } = require("../middleware/logger");
  return {
    tasks: m.WeeklyTaskModelDef,
    assignments: m.TaskAssignmentModelDef,
    statuses: m.TaskStatusModelDef,
    summaries: m.TaskSummaryModelDef,
    greetings: m.TaskGreetingModelDef,
    runs: JobRunModelDef,
    lessons: LessonModelDef,
    users: {
      listActive: async () => {
        const res = await UserModelDef.get({}, "active");
        return { result: (res?.result || []).filter((user) => !isHiddenUser(user)) };
      },
    },
    alerts: { weeklyTasks: events.weeklyTasks, weeklyTaskAdded: events.weeklyTaskAdded, weeklyTasksOverdue: events.weeklyTasksOverdue, weeklyTasksGreeting: events.weeklyTasksGreeting },
    sendMail: (...args) => require("../utils/sendEmail").sendWeeklyTaskEmail(...args),
    log: logWithSource,
  };
}

let shared = null;
const weeklyTasks = () => {
  if (!shared) shared = createWeeklyTasks(defaultDeps());
  return shared;
};

function startWeeklyTasksJob() {
  const cron = require("node-cron");
  const run = () => weeklyTasks().closeLastWeek().catch((error) => console.error("[weeklyTasks] close failed:", error?.message || error));
  // Saturday night ended; a server that was down catches up at its next start.
  cron.schedule("*/5 * * * *", run, { timezone: TIME_ZONE });
  setTimeout(run, 60 * 1000).unref?.();
}

module.exports = { createWeeklyTasks, weeklyTasks, startWeeklyTasksJob, weekOf, weekBefore, DEFAULT_GREETING };
