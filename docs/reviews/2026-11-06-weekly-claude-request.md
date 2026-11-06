PENDING actual Claude Code independent review. Codex implements; review only the supplied source, no tools, edits or recursive reviewers. The most recent actual Claude response was its weekly-quota error until Nov 8 16:00 Asia/Jerusalem. This packet has been refreshed after that response and is not reviewed.
Final owner clarification: each group is a separate lesson. Teachers/helpers see all their lessons together, irrespective of account role. Completing the same duty in one lesson must not complete another. Done tasks sort last. Management starts with personal tasks, explicitly opens association tasks, then update/distribution. Assignments persist until management releases or rearranges them. No daily deadlines inferred from the reference photo. Week completion resets; old unfinished weeks warn, current unfinished tasks remind on login. Preserve editable private greetings to selected staff and email delivery reporting.
Context: Mongo API update uses $set/upsert; updateExisting never inserts. Unique indexes protect task/group and week/task/group. Old owner-only collections remain untouched; no inferred migration. Active staff are read from each lesson teacher/helper, hidden IT users excluded. Management requires tasks.manage. Source only, no env, credentials, runtime logs or user records. Verification: npm run verify passed 1457 server tests, 1054 client tests, System production build. Return actionable findings with file/line and concrete failure scenario.

SOURCE: server/services/weeklyTasks.js

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
      return { id: String(lesson._id), name: lesson.name || "درس", day: lesson.date?.day || null,
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
    if (!group) throw fail(400, "NOT_A_GROUP", "الدرس غير موجود أو ليس له مسؤول نشط.");
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


SOURCE: server/Entities/WeeklyTask/WeeklyTask.model.js

const api = require("../api");

const dbName = process.env.DB_NAME || "tamheed_db";

const modelFor = (collection) => ({
  dbName,
  collection,
  async get(filter = {}) { return api.read({ dbName, collection, filter }); },
  async create(data) { return api.create({ dbName, collection, data }); },
  async createOnce(filter, data) {
    await ensureWeeklyTaskIndexes(); // Never send twice if startup index creation failed.
    try { return { ...(await api.create({ dbName, collection, data })), created: true }; }
    catch (error) {
      if (error.code !== 11000) throw error;
      const result = (await api.read({ dbName, collection, filter }))?.result?.[0];
      if (!result) throw error;
      return { result, created: false };
    }
  },
  // api.update upserts: one row for each week, task and guide.
  async update(filter, newData) {
    await ensureWeeklyTaskIndexes();
    try { return await api.update({ dbName, collection, filter, newData }); }
    catch (error) {
      if (error.code !== 11000) throw error;
      return api.updateExisting({ dbName, collection, filter, newData });
    }
  },
  async updateExisting(filter, newData) { return api.updateExisting({ dbName, collection, filter, newData }); },
  async delete(filter) { return api.delete({ dbName, collection, filter }); },
});

// { title, details, createdByName, createdAt }
const WeeklyTaskModelDef = modelFor("WeeklyTasks");
// { taskId, groupId (= lesson _id), createdAt }: persists until management changes it.
// Owner-only legacy rows stay untouched: a lesson cannot be guessed from an owner.
const TaskAssignmentModelDef = modelFor("WeeklyTaskLessonAssignments");
// { weekKey, taskId, groupId, doneAt, doneByName, approvedAt }
const TaskStatusModelDef = modelFor("WeeklyTaskLessonStatuses");
// { weekKey, guideId, total, done, finished, seenAt }: what a week came to.
const TaskSummaryModelDef = modelFor("WeeklyTaskLessonSummaries");
const TaskGreetingModelDef = modelFor("WeeklyTaskGreetings");

let indexesReady;
function ensureWeeklyTaskIndexes() {
  if (indexesReady) return indexesReady;
  indexesReady = (async () => {
    const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");
    for (const [model, key] of [
    [TaskAssignmentModelDef, { taskId: 1, groupId: 1 }],
    [TaskStatusModelDef, { weekKey: 1, taskId: 1, groupId: 1 }],
    [TaskSummaryModelDef, { weekKey: 1, guideId: 1 }],
    [TaskGreetingModelDef, { actorId: 1, requestId: 1, guideId: 1 }],
    ]) await ensureIndexes(collectionOf(model), [{ key, options: { unique: true } }]);
  })().catch((error) => { indexesReady = null; throw error; });
  return indexesReady;
}

module.exports = { WeeklyTaskModelDef, TaskAssignmentModelDef, TaskStatusModelDef, TaskSummaryModelDef, TaskGreetingModelDef, ensureWeeklyTaskIndexes };


SOURCE: server/Entities/WeeklyTask/WeeklyTask.route.js

const express = require("express");
const { requireAuth } = require("../../middleware/authMiddleware");
const { loadActor, requirePermission, actorLabel } = require("../../middleware/permissionMiddleware");
const { logWithSource } = require("../../middleware/logger");
const { weeklyTasks } = require("../../services/weeklyTasks");

// /me: the signed-in user's own tasks, whoever he is: only those joined to him.
// The rest: tasks.manage.
const router = express.Router();
router.use(requireAuth, loadActor);

const ACTOR_NAME = (req) => actorLabel(req.actor).actorName;

const handle = (work) => async (req, res) => {
  try {
    return res.status(200).json({ ok: true, ...((await work(req)) || {}) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
    logWithSource("WeeklyTask", error);
    return res.status(500).json({ ok: false, message: "حدث خطأ غير متوقع، حاول مرة أخرى" });
  }
};
router.get("/me", handle((req) => weeklyTasks().mine(req.actor.id)));
router.post("/me/praise-seen", handle((req) => weeklyTasks().praiseSeen(req.actor.id, req.body?.week)));
router.post("/me/:taskId", handle((req) => weeklyTasks().setDone(req.actor.id, req.params.taskId, req.body?.groupId, req.body?.done === true, ACTOR_NAME(req), req.body?.week || "")));

router.get("/board", requirePermission("tasks.manage"), handle(() => weeklyTasks().board()));
router.post("/greetings", requirePermission("tasks.manage"), handle((req) => weeklyTasks().sendGreeting(req.body, req.actor.id)));
router.post("/", requirePermission("tasks.manage"), handle(async (req) => ({ id: await weeklyTasks().addTask(req.body, ACTOR_NAME(req)) })));
router.put("/:id", requirePermission("tasks.manage"), handle((req) => weeklyTasks().editTask(req.params.id, req.body)));
router.delete("/:id", requirePermission("tasks.manage"), handle((req) => weeklyTasks().removeTask(req.params.id)));
router.post("/:id/assign/:groupId", requirePermission("tasks.manage"), handle((req) => weeklyTasks().assign(req.params.id, req.params.groupId)));
router.delete("/:id/assign/:groupId", requirePermission("tasks.manage"), handle((req) => weeklyTasks().unassign(req.params.id, req.params.groupId)));
router.post("/:id/approve/:groupId", requirePermission("tasks.manage"), handle((req) => weeklyTasks().setApproved(req.params.id, req.params.groupId, req.body?.approved === true, req.body?.week || "")));

module.exports = router;


SOURCE: apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.jsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { approveTask, getMyTasks, getTaskBoard, setMyTaskDone } from "../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { canStored } from "../../utils/session";
import Button from "../UI/Button.jsx";
import styles from "./WeeklyTasks.module.css";

const CheckIcon = ({ on }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
    {on ? (
      <>
        <circle cx="12" cy="12" r="11" fill="currentColor" />
        <path d="M7 12.500l3.200 3.200L17 9" fill="none" stroke="#fff" strokeWidth="2.400" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ) : (
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.400" />
    )}
  </svg>
);

const weekLabel = (week) => {
  const [y, m, d] = String(week || "").split("-");
  return y ? `${d}/${m}/${y}` : "";
};

// What the person himself must do this week: to do, then done in green.
function MyTasks({ tasks, onToggle, busy }) {
  const open = tasks.filter((task) => !task.done);
  const done = tasks.filter((task) => task.done);
  return (
    <section className={styles.panel} aria-label="مهماتي">
      <h2>مهمات مجموعتي هذا الأسبوع</h2>
      <p className={styles.muted}>أكّد إنجاز المهمات حتى نهاية يوم السبت. يبدأ أسبوع جديد بعد ذلك، وتُغلق مهمات الأسبوع السابق.</p>
      {open.length === 0 && <p className={styles.muted}>لا توجد مهمات متبقية.</p>}
      <ul className={styles.list}>
        {open.map((task) => (
          <li key={`${task.groupId}:${task.taskId}`} className={styles.item}>
            <span className={styles.text}><strong dir="auto">{task.title}</strong><small dir="auto">{task.groupName}</small>{task.details && <small dir="auto">{task.details}</small>}</span>
            <Button size="sm" loading={busy === `${task.groupId}:${task.taskId}`} onClick={() => onToggle(task, true)}>تم</Button>
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <>
          <h3 className={styles.doneTitle}>تم إنجازها</h3>
          <ul className={styles.list}>
            {done.map((task) => (
              <li key={`${task.groupId}:${task.taskId}`} className={`${styles.item} ${styles.done}`}>
                <span className={styles.text}><strong dir="auto">{task.title}</strong><small dir="auto">{task.groupName}</small>{task.approved && <small>أكّدتها الإدارة</small>}</span>
                {!task.approved && <Button size="sm" variant="secondary" loading={busy === `${task.groupId}:${task.taskId}`} onClick={() => onToggle(task, false)}>إلغاء</Button>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// The management's register: each group and its tasks, each with its check.
function Register({ board, onToggle, busy }) {
  const groups = useMemo(() => board.groups.map((group) => ({
    ...group,
    tasks: board.assignments
      .filter((row) => row.groupId === group.id)
      .map((row) => {
        const task = board.tasks.find((item) => item.id === row.taskId);
        const status = board.statuses.find((item) => item.taskId === row.taskId && item.groupId === group.id);
        return task ? { ...task, done: Boolean(status?.done), approved: Boolean(status?.approved) } : null;
      })
      .filter(Boolean).sort((a, b) => Number(a.done) - Number(b.done)),
  })).filter((group) => group.tasks.length > 0), [board]);

  return (
    <section className={styles.panel} aria-label="سجل المهمات">
      <h2>سجل المهمات</h2>
      {groups.length === 0 && <p className={styles.muted}>لم تُربط مهمات بالمجموعات بعد.</p>}
      <div className={styles.groups}>
        {groups.map((group) => (
          <div key={group.id} className={styles.group}>
            <h3 dir="auto">{group.name}</h3>
            <small dir="auto">{group.ownerNames?.join("، ")}</small>
            <ul className={styles.list}>
              {group.tasks.map((task) => {
                const key = `${task.id}:${group.id}`;
                return (
                  <li key={key} className={`${styles.item} ${task.done ? styles.done : ""}`}>
                    <button
                      type="button"
                      className={`${styles.check} ${task.approved ? styles.checkOn : ""}`}
                      aria-pressed={task.approved}
                      aria-label={`${task.approved ? "إلغاء تأكيد" : "تأكيد"} ${task.title}`}
                      disabled={busy === key}
                      onClick={() => onToggle(task, group, !task.approved)}
                    >
                      <CheckIcon on={task.approved} />
                    </button>
                    <span className={styles.text}>
                      <span dir="auto">{task.title}</span>
                      {task.done && !task.approved && <small>أنجزها المرشد</small>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// «المهمات الأسبوعية»: what one must do, and for the management the register and the
// way to the page where tasks are written and joined to groups.
export default function WeeklyTasksPage() {
  const navigate = useNavigate();
  const canManage = canStored("tasks.manage");
  const [mine, setMine] = useState(null);
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    const own = await getMyTasks();
    if (!own.ok) setError(own.message);
    else { setError(""); setMine(own); }
    if (canManage && showAll) {
      const res = await getTaskBoard();
      if (res.ok) setBoard(res);
      else setError(res.message);
    }
  }, [canManage, showAll]);
  useEffect(() => { load(); }, [load]);

  const toggleMine = async (task, done) => {
    setBusy(`${task.groupId}:${task.taskId}`);
    const res = await setMyTaskDone(task.taskId, task.groupId, done, mine.week);
    setBusy("");
    if (!res.ok) { if (res.code === "WEEK_CLOSED") await load(); return toast.warn(res.message); }
    setMine(res);
    if (canManage) load();
    return undefined;
  };
  const toggleRegister = async (task, group, approved) => {
    const key = `${task.id}:${group.id}`;
    setBusy(key);
    const res = await approveTask(task.id, group.id, approved, board.week || mine.week);
    setBusy("");
    if (!res.ok) { if (res.code === "WEEK_CLOSED") await load(); return toast.warn(res.message); }
    return load();
  };

  return (
    <div className={styles.page} dir="rtl">
      <header className={styles.head}>
        <div>
          <h1>المهمات الأسبوعية</h1>
          {mine?.week && <p className={styles.muted}>الأسبوع الذي بدأ في {weekLabel(mine.week)}</p>}
        </div>
        {canManage && <div className={styles.row}>
          <Button variant="secondary" onClick={() => setShowAll((shown) => !shown)}>{showAll ? "عرض مهماتي" : "عرض مهمات الجمعية"}</Button>
          {showAll && <Button onClick={() => navigate("/weekly-tasks/manage")}>تعديل المهمات والمجموعات</Button>}
        </div>}
      </header>
      {error && <div role="alert" className={styles.error}>{error}</div>}
      {mine && !showAll && <MyTasks tasks={mine.tasks} onToggle={toggleMine} busy={busy} />}
      {canManage && showAll && board && <Register board={board} onToggle={toggleRegister} busy={busy} />}
    </div>
  );
}


SOURCE: apps/system/src/Components/WeeklyTasks/ManageWeeklyTasks.jsx

import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addTask, assignTask, editTask, getTaskBoard, removeTask, unassignTask } from "../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
import { ask } from "../Provides/confirmBus.js";
import Button from "../UI/Button.jsx";
import RequiredMark from "../UI/RequiredMark";
import GreetingDialog from "./GreetingDialog";
import styles from "./WeeklyTasks.module.css";

// Two parts: the tasks, and the groups they belong to. A task joins a group by pressing
// it and then the group, or on a computer by dragging it onto the group.
export default function ManageWeeklyTasks() {
  const navigate = useNavigate();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ title: "", details: "" });
  const [editing, setEditing] = useState(null); // { id, title, details }
  const [picked, setPicked] = useState("");
  const [saving, setSaving] = useState(false);
  const [greeting, setGreeting] = useState(false);

  const load = useCallback(async () => {
    const res = await getTaskBoard();
    if (res.ok) { setBoard(res); setError(""); } else setError(res.message);
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (request) => {
    const res = await request();
    if (!res.ok) { toast.warn(res.message); return false; }
    await load();
    return true;
  };

  const create = async (event) => {
    event.preventDefault();
    setSaving(true);
    const done = await run(() => addTask(draft));
    setSaving(false);
    if (done) setDraft({ title: "", details: "" });
  };
  const saveEdit = async () => {
    const done = await run(() => editTask(editing.id, editing));
    if (done) setEditing(null);
  };
  const remove = async (task) => {
    let confirmed = false;
    try {
      confirmed = await ask("", { title: "حذف مهمة", message: `حذف «${task.title}» من كل المجموعات؟`, confirmText: "حذف", cancelText: "إلغاء", danger: true });
    } catch {
      return;
    }
    if (!confirmed) return;
    await run(() => removeTask(task.id));
    if (picked === task.id) setPicked("");
  };
  const join = async (taskId, guideId) => {
    if (taskId) await run(() => assignTask(taskId, guideId));
  };

  if (error && !board) return <div className={styles.page} dir="rtl"><div role="alert" className={styles.error}>{error}</div></div>;
  if (!board) return <div className={styles.page} role="status">جارٍ التحميل…</div>;

  const pickedTask = board.tasks.find((task) => task.id === picked);
  return (
    <div className={styles.page} dir="rtl">
      {greeting && <GreetingDialog guides={board.guides} defaultText={board.defaultGreeting} onClose={() => setGreeting(false)} />}
      <header className={styles.head}>
        <h1>تعديل المهمات والمجموعات</h1>
        <Button disabled={!board.guides.length} onClick={() => setGreeting(true)}>إرسال بركة</Button>
        <Button variant="secondary" onClick={() => navigate("/weekly-tasks")}>العودة إلى المهمات</Button>
      </header>

      <section className={styles.panel} aria-label="المهمات">
        <h2>المهمات</h2>
        <form className={styles.form} onSubmit={create}>
          <label htmlFor="task-title">اسم المهمة<RequiredMark /></label>
          <input id="task-title" maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          <label htmlFor="task-details">تفاصيل</label>
          <input id="task-details" maxLength={500} value={draft.details} onChange={(event) => setDraft({ ...draft, details: event.target.value })} />
          <div><Button type="submit" loading={saving} disabled={!draft.title.trim()}>إضافة مهمة</Button></div>
        </form>
        {board.tasks.length === 0 && <p className={styles.muted}>لا توجد مهمات بعد.</p>}
        <ul className={styles.list}>
          {board.tasks.map((task) => (
            <li
              key={task.id}
              className={`${styles.item} ${picked === task.id ? styles.picked : ""}`}
              draggable={!editing}
              onDragStart={(event) => event.dataTransfer.setData("text/plain", task.id)}
            >
              {editing?.id === task.id ? (
                <span className={styles.form}>
                  <input aria-label="اسم المهمة" maxLength={120} value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} />
                  <input aria-label="تفاصيل" maxLength={500} value={editing.details} onChange={(event) => setEditing({ ...editing, details: event.target.value })} />
                  <span className={styles.row}>
                    <Button size="sm" onClick={saveEdit}>حفظ</Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>إلغاء</Button>
                  </span>
                </span>
              ) : (
                <>
                  <button type="button" className={styles.pick} aria-pressed={picked === task.id} onClick={() => setPicked(picked === task.id ? "" : task.id)}>
                    <strong dir="auto">{task.title}</strong>
                    {task.details && <small dir="auto">{task.details}</small>}
                  </button>
                  <span className={styles.row}>
                    <Button size="sm" variant="secondary" onClick={() => setEditing({ ...task })}>تعديل</Button>
                    <Button size="sm" variant="danger" onClick={() => remove(task)}>حذف</Button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.panel} aria-label="المجموعات">
        <h2>المجموعات</h2>
        <p className={styles.muted}>
          {pickedTask ? `اضغط على مجموعة لربطها بـ«${pickedTask.title}».` : "اختر مهمة ثم اضغط على مجموعة، أو اسحبها إليها من الحاسوب. تبقى المهمات لمجموعاتها كل أسبوع إلى أن تغيّرها."}
        </p>
        {board.groups.length === 0 && <p className={styles.muted}>لا توجد دروس لها مسؤولون نشطون بعد.</p>}
        <div className={styles.groups}>
          {board.groups.map((guide) => {
            const joined = board.assignments.filter((row) => row.groupId === guide.id);
            return (
              <div
                key={guide.id}
                className={`${styles.group} ${picked ? styles.groupTarget : ""}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); join(event.dataTransfer.getData("text/plain"), guide.id); }}
              >
                <button type="button" className={styles.groupHead} disabled={!picked} onClick={() => join(picked, guide.id)}>
                  <h3 dir="auto">{guide.name}</h3>
                  <small dir="auto">{guide.ownerNames?.join("، ")}</small>
                </button>
                <ul className={styles.chips}>
                  {joined.map((row) => {
                    const task = board.tasks.find((item) => item.id === row.taskId);
                    return task && (
                      <li key={row.taskId} className={styles.chip}>
                        <span dir="auto">{task.title}</span>
                        <button type="button" aria-label={`إزالة ${task.title} من ${guide.name}`} onClick={() => run(() => unassignTask(row.taskId, guide.id))}>×</button>
                      </li>
                    );
                  })}
                  {joined.length === 0 && <li className={styles.muted}>لا مهمات</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}


SOURCE: apps/system/src/Components/WeeklyTasks/WeeklyTasksPage.test.js

import React, { act } from "react";
import { createRoot } from "react-dom/client";

const mockNavigate = jest.fn();
let mockManage = false;
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));
jest.mock("../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx", () => ({
  getMyTasks: jest.fn(), setMyTaskDone: jest.fn(), getTaskBoard: jest.fn(), approveTask: jest.fn(),
}));
jest.mock("../../ALERT/SystemToasts.jsx", () => ({ toast: { warn: jest.fn(), success: jest.fn() } }));
jest.mock("../../utils/session", () => ({ canStored: () => mockManage }));

import { approveTask, getMyTasks, getTaskBoard, setMyTaskDone } from "../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx";
import WeeklyTasksPage from "./WeeklyTasksPage";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const WEEK = "2026-11-08";
const task = (over) => ({ taskId: "t1", groupId: "g1", groupName: "Guide One", title: "نظافة الغرفة", details: "", done: false, approved: false, ...over });
const BOARD = {
  ok: true,
  tasks: [{ id: "t1", title: "نظافة الغرفة", details: "" }],
  groups: [{ id: "g1", name: "Guide One" }, { id: "g2", name: "Empty Group" }],
  assignments: [{ taskId: "t1", groupId: "g1" }],
  statuses: [],
  lastWeek: [{ groupId: "g1", total: 3, done: 2 }],
};

let host, root;
const mount = async () => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<WeeklyTasksPage />));
};
const button = (text) => [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === text);

beforeEach(() => {
  mockManage = false;
  mockNavigate.mockReset();
  getMyTasks.mockResolvedValue({ ok: true, week: WEEK, tasks: [task()] });
  getTaskBoard.mockResolvedValue(BOARD);
  setMyTaskDone.mockResolvedValue({ ok: true, week: WEEK, tasks: [task({ done: true })] });
  approveTask.mockResolvedValue({ ok: true });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

test("a guide sees his task, marks it done, and it moves down to the done part", async () => {
  await mount();
  expect(getTaskBoard).not.toHaveBeenCalled();
  expect(button("تعديل المهمات والمجموعات")).toBeUndefined();
  expect(host.textContent).not.toContain("تم إنجازها");
  await act(async () => button("تم").click());
  expect(setMyTaskDone).toHaveBeenCalledWith("t1", "g1", true, WEEK);
  expect(host.textContent).toContain("تم إنجازها");
  expect(button("إلغاء")).toBeTruthy();
});

test("a task the management confirmed cannot be undone by the guide", async () => {
  getMyTasks.mockResolvedValue({ ok: true, week: WEEK, tasks: [task({ done: true, approved: true })] });
  await mount();
  expect(host.textContent).toContain("أكّدتها الإدارة");
  expect(button("إلغاء")).toBeUndefined();
});

test("the management sees the register and the way to editing; an empty group is not listed", async () => {
  mockManage = true;
  getMyTasks.mockResolvedValue({ ok: true, week: WEEK, tasks: [] });
  await mount();
  await act(async () => button("عرض مهمات الجمعية").click());
  expect(host.textContent).toContain("Guide One");
  expect(host.textContent).not.toContain("Empty Group");

  expect(host.textContent).not.toContain("مهمات مجموعتي");
  await act(async () => button("تعديل المهمات والمجموعات").click());
  expect(mockNavigate).toHaveBeenCalledWith("/weekly-tasks/manage");
});

test("a manager responsible for a group also sees his own tasks", async () => {
  mockManage = true;
  await mount();
  expect(host.textContent).toContain("مهمات مجموعتي");
  expect(host.textContent).not.toContain("سجل المهمات");
  expect(getTaskBoard).not.toHaveBeenCalled();
  await act(async () => button("عرض مهمات الجمعية").click());
  expect(host.textContent).toContain("سجل المهمات");
  await act(async () => button("عرض مهماتي").click());
  expect(host.textContent).toContain("مهمات مجموعتي");
});

test("the management's check confirms a task, and pressing it again takes it back", async () => {
  mockManage = true;
  getMyTasks.mockResolvedValue({ ok: true, week: WEEK, tasks: [] });
  await mount();
  await act(async () => button("عرض مهمات الجمعية").click());
  const check = () => host.querySelector("button[aria-pressed]");
  expect(check().getAttribute("aria-pressed")).toBe("false");
  await act(async () => check().click());
  expect(approveTask).toHaveBeenCalledWith("t1", "g1", true, WEEK);
  getTaskBoard.mockResolvedValue({ ...BOARD, statuses: [{ taskId: "t1", groupId: "g1", done: true, approved: true }] });
  await act(async () => check().click());
  await act(async () => check().click());
  expect(approveTask).toHaveBeenLastCalledWith("t1", "g1", false, WEEK);
});

test("the same duty in two lessons has independent controls, and a completed duty moves below the open one", async () => {
  getMyTasks.mockResolvedValue({ ok: true, week: WEEK, tasks: [task(), task({ groupId: "second", groupName: "Second lesson" })] });
  setMyTaskDone.mockResolvedValue({ ok: true, week: WEEK, tasks: [task({ done: true }), task({ groupId: "second", groupName: "Second lesson" })] });
  await mount();
  await act(async () => button("تم").click());
  expect(setMyTaskDone).toHaveBeenCalledWith("t1", "g1", true, WEEK);
  const items = [...host.querySelectorAll("li")];
  expect(items[0].textContent).toContain("Second lesson");
  expect(items[1].textContent).toContain("Guide One");
  await act(async () => button("تم").click());
  expect(setMyTaskDone).toHaveBeenLastCalledWith("t1", "second", true, WEEK);
});


SOURCE: apps/system/src/Components/WeeklyTasks/ManageWeeklyTasks.test.js

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ManageWeeklyTasks from "./ManageWeeklyTasks";
import { assignTask, getTaskBoard, unassignTask } from "../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx";
jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }));
jest.mock("../../ALERT/SystemToasts.jsx", () => ({ toast: { warn: jest.fn() } }));
jest.mock("../Provides/confirmBus.js", () => ({ ask: async () => true }));
jest.mock("../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx", () => ({
  getTaskBoard: jest.fn(), assignTask: jest.fn(), unassignTask: jest.fn(), addTask: jest.fn(), editTask: jest.fn(), removeTask: jest.fn(),
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
beforeEach(() => {
  jest.clearAllMocks();
  getTaskBoard.mockResolvedValue({ ok: true, guides: [{ id: "owner", name: "Same owner" }],
    groups: [{ id: "first", name: "First lesson", ownerNames: ["Same owner"] }, { id: "second", name: "Second lesson", ownerNames: ["Same owner"] }],
    tasks: [{ id: "task", title: "Duty" }], assignments: [{ taskId: "task", groupId: "first" }],
  });
  assignTask.mockResolvedValue({ ok: true });
  unassignTask.mockResolvedValue({ ok: true });
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

test("management distributes and releases a task by lesson, even when two lessons share one owner", async () => {
  await act(async () => root.render(<ManageWeeklyTasks />));
  await act(async () => host.querySelector("button[aria-pressed]").click());
  const second = [...host.querySelectorAll("button")].find((button) => button.textContent.includes("Second lesson"));
  await act(async () => second.click());
  expect(assignTask).toHaveBeenCalledWith("task", "second");
  const release = host.querySelector('button[aria-label="إزالة Duty من First lesson"]');
  await act(async () => release.click());
  expect(unassignTask).toHaveBeenCalledWith("task", "first");
});


SOURCE: apps/system/src/WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx

import api from "../api";

const namespace = "/weekly-tasks";

// Never throws: { ok, ... } or { ok: false, message }.
const call = async (request) => {
  try {
    const { data } = await request();
    return { ok: true, ...(data || {}) };
  } catch (err) {
    return { ok: false, status: err.response?.status || 0, code: err.response?.data?.code || "", message: err.response?.data?.message || "تعذّر إتمام العملية." };
  }
};

export const getMyTasks = () => call(() => api.get(`${namespace}/me`));
export const setMyTaskDone = (taskId, groupId, done, week) => call(() => api.post(`${namespace}/me/${encodeURIComponent(taskId)}`, { groupId, done, week }));
export const markPraiseSeen = (week) => call(() => api.post(`${namespace}/me/praise-seen`, { week }));
export const sendGreeting = (body) => call(() => api.post(`${namespace}/greetings`, body));
export const getTaskBoard = () => call(() => api.get(`${namespace}/board`));
export const addTask = (task) => call(() => api.post(namespace, task));
export const editTask = (id, task) => call(() => api.put(`${namespace}/${encodeURIComponent(id)}`, task));
export const removeTask = (id) => call(() => api.delete(`${namespace}/${encodeURIComponent(id)}`));
export const assignTask = (id, guideId) => call(() => api.post(`${namespace}/${encodeURIComponent(id)}/assign/${encodeURIComponent(guideId)}`, {}));
export const unassignTask = (id, guideId) => call(() => api.delete(`${namespace}/${encodeURIComponent(id)}/assign/${encodeURIComponent(guideId)}`));
export const approveTask = (id, guideId, approved, week) => call(() => api.post(`${namespace}/${encodeURIComponent(id)}/approve/${encodeURIComponent(guideId)}`, { approved, week }));


SOURCE: server/test/weekly-tasks.test.js

const assert = require("node:assert/strict");
const test = require("node:test");
const { createWeeklyTasks, weekOf, weekBefore } = require("../services/weeklyTasks");

function store(docs = []) {
  let next = 1;
  const rows = docs;
  const matches = (doc, filter) => Object.keys(filter).every((key) => String(doc[key]) === String(filter[key]));
  return {
    rows,
    async get(filter = {}) { return { result: rows.filter((doc) => matches(doc, filter)) }; },
    async create(data) { const doc = { _id: `id${next++}`, ...data }; rows.push(doc); return { result: doc }; },
    async createOnce(filter, data) {
      const existing = rows.find((row) => matches(row, filter));
      if (existing) return { result: existing, created: false };
      const doc = { _id: `id${next++}`, ...data }; rows.push(doc); return { result: doc, created: true };
    },
    async update(filter, data) {
      const found = rows.find((doc) => matches(doc, filter));
      if (found) Object.assign(found, data); else rows.push({ _id: `id${next++}`, ...filter, ...data });
    },
    async updateExisting(filter, data) { const found = rows.find((doc) => matches(doc, filter)); if (found) Object.assign(found, data); },
    async delete(filter) { for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], filter)) rows.splice(i, 1); },
  };
}

function setup(start = "2026-11-10T10:00:00Z") {
  const clock = { now: new Date(start) };
  const raised = [];
  const deps = {
    tasks: store(), assignments: store(), statuses: store(), summaries: store(), greetings: store(), runs: store(),
    lessons: store([{ _id: "g1", name: "Guide lesson", teacher: "g1" }, { _id: "m1", name: "Manager lesson", teacher: "m1" }]),
    users: { listActive: async () => ({ result: [
      { _id: "g1", tz: "1", firstname: "Guide", lastname: "One", email: "guide@example.org" },
      { _id: "m1", tz: "2", firstname: "Manager", lastname: "Two" },
      { _id: "x1", tz: "3", firstname: "No", lastname: "Students" },
    ] }) },
    alerts: {
      weeklyTasks: async (user, count, week) => raised.push(["week", user.tz, count, week]),
      weeklyTaskAdded: async (guide, taskId, week) => raised.push(["added", guide.tz, week]),
      weeklyTasksOverdue: async (guide, count, week) => raised.push(["overdue", guide.tz, count, week]),
      weeklyTasksGreeting: async (guide, text, deliveryId) => raised.push(["greeting", guide.tz, text, deliveryId]),
    },
    sendMail: async (to, text) => raised.push(["email", to, text]),
    now: () => clock.now,
  };
  return { ...deps, clock, raised, service: createWeeklyTasks(deps) };
}

test("a week runs from Sunday to Saturday night, Israel time", () => {
  assert.equal(weekOf(new Date("2026-11-08T10:00:00Z")), "2026-11-08"); // Sunday
  assert.equal(weekOf(new Date("2026-11-14T21:30:00Z")), "2026-11-08"); // Saturday 23:30 in Israel
  assert.equal(weekOf(new Date("2026-11-14T22:30:00Z")), "2026-11-15"); // Sunday 00:30 in Israel
  assert.equal(weekBefore("2026-11-15"), "2026-11-08");
});

test("a task joined to a guide shows on his page, and also for a manager who is responsible", async () => {
  const { service } = setup();
  const id = await service.addTask({ title: "نظافة الغرفة" }, "Admin");
  await service.assign(id, "g1");
  await service.assign(id, "m1");
  assert.deepEqual((await service.mine("g1")).tasks.map((t) => [t.title, t.done]), [["نظافة الغرفة", false]]);
  assert.equal((await service.mine("m1")).tasks.length, 1);
  assert.equal((await service.mine("x1")).tasks.length, 0);
});

test("only someone responsible for students is a group", async () => {
  const { service } = setup();
  const id = await service.addTask({ title: "t" });
  await assert.rejects(service.assign(id, "x1"), (e) => e.code === "NOT_A_GROUP");
  assert.deepEqual((await service.board()).guides.map((g) => g.id).sort(), ["g1", "m1"]);
});

test("joining twice keeps one, and tells the guide once", async () => {
  const { service, assignments, raised } = setup();
  const id = await service.addTask({ title: "t" });
  await service.assign(id, "g1");
  await service.assign(id, "g1");
  assert.equal(assignments.rows.length, 1);
  assert.equal(raised.filter((r) => r[0] === "added").length, 1);
});

test("a guide marks his own task done and can undo it; another's is refused", async () => {
  const { service } = setup();
  const id = await service.addTask({ title: "t" });
  await service.assign(id, "g1");
  assert.equal((await service.setDone("g1", id, "g1", true, "G")).tasks[0].done, true);
  assert.equal((await service.setDone("g1", id, "g1", false, "G")).tasks[0].done, false);
  await assert.rejects(service.setDone("m1", id, "m1", true), (e) => e.code === "NOT_YOUR_TASK");
});

test("the management's check counts as done; taking it off sends the task back", async () => {
  const { service } = setup();
  const id = await service.addTask({ title: "t" });
  await service.assign(id, "g1");
  await service.setDone("g1", id, "g1", true);
  await service.setApproved(id, "g1", true);
  assert.deepEqual((await service.board()).statuses[0], { taskId: id, groupId: "g1", done: true, approved: true });
  await assert.rejects(service.setDone("g1", id, "g1", false), (e) => e.code === "ALREADY_APPROVED");
  await service.setApproved(id, "g1", false);
  assert.equal((await service.mine("g1")).tasks[0].done, false);
});

test("the new week starts empty, the joins stay, and the guide is told", async () => {
  const { service, clock, raised, summaries } = setup();
  const id = await service.addTask({ title: "t" });
  await service.assign(id, "g1");
  await service.setDone("g1", id, "g1", true);
  clock.now = new Date("2026-11-15T08:00:00Z");
  const next = await service.mine("g1");
  assert.equal(next.tasks.length, 1);
  assert.equal(next.tasks[0].done, false);
  assert.deepEqual(raised.at(-1), ["week", "1", 1, "2026-11-15"]);
  assert.equal(summaries.rows[0].finished, true);
});

test("a guide who finished is praised once; one who did not is not", async () => {
  const { service, clock } = setup();
  const one = await service.addTask({ title: "a" });
  const two = await service.addTask({ title: "b" });
  await service.assign(one, "g1");
  await service.assign(one, "m1");
  await service.assign(two, "m1");
  await service.setDone("g1", one, "g1", true);
  await service.setDone("m1", one, "m1", true); // m1 did one of two
  clock.now = new Date("2026-11-15T08:00:00Z");
  assert.equal((await service.mine("g1")).praise, true);
  assert.equal((await service.mine("m1")).praise, false);
  await service.praiseSeen("g1");
  assert.equal((await service.mine("g1")).praise, false);
});

test("a task the management only checked counts as finished too", async () => {
  const { service, clock } = setup();
  const id = await service.addTask({ title: "a" });
  await service.assign(id, "g1");
  await service.setApproved(id, "g1", true);
  clock.now = new Date("2026-11-15T08:00:00Z");
  assert.equal((await service.mine("g1")).praise, true);
});

test("closing a week twice writes one summary, also from a new process", async () => {
  const ctx = setup();
  const id = await ctx.service.addTask({ title: "a" });
  await ctx.service.assign(id, "g1");
  ctx.clock.now = new Date("2026-11-15T08:00:00Z");
  await ctx.service.closeLastWeek();
  await ctx.service.closeLastWeek();
  await createWeeklyTasks({ ...ctx, now: () => ctx.clock.now }).closeLastWeek();
  assert.equal(ctx.summaries.rows.length, 1);
});

test("removing a task takes its joins; a name is required", async () => {
  const { service, assignments } = setup();
  await assert.rejects(service.addTask({ title: "  " }), (e) => e.code === "TITLE_REQUIRED");
  const id = await service.addTask({ title: "t" });
  await service.assign(id, "g1");
  await service.removeTask(id);
  assert.equal(assignments.rows.length, 0);
  assert.equal((await service.mine("g1")).tasks.length, 0);
});

test("a failing alert changes nothing", async () => {
  const ctx = setup();
  ctx.alerts.weeklyTaskAdded = async () => { throw new Error("down"); };
  const service = createWeeklyTasks(ctx);
  const id = await service.addTask({ title: "t" });
  await service.assign(id, "g1");
  assert.equal(ctx.assignments.rows.length, 1);
});

test("an unfinished week warns its owner once, closes, and does not carry debt", async () => {
  const ctx = setup();
  const id = await ctx.service.addTask({ title: "t" });
  await ctx.service.assign(id, "g1");
  await ctx.service.assign(id, "m1");
  await ctx.service.setDone("m1", id, "m1", true);
  ctx.clock.now = new Date("2026-11-15T08:00:00Z");
  await ctx.service.closeLastWeek();
  await createWeeklyTasks({ ...ctx, now: () => ctx.clock.now }).closeLastWeek();
  assert.deepEqual(ctx.raised.filter((item) => item[0] === "overdue"), [["overdue", "1", 1, "2026-11-08"]]);
  const mine = await ctx.service.mine("g1");
  assert.equal(mine.remaining, 1);
  assert.equal(mine.tasks.length, 1, "only this week's recurring instance is shown");
  assert.equal(mine.week, "2026-11-15");
});

test("a failed end-of-week warning is retried without duplicating its summary", async () => {
  const ctx = setup();
  const id = await ctx.service.addTask({ title: "t" });
  await ctx.service.assign(id, "g1");
  let tries = 0;
  ctx.alerts.weeklyTasksOverdue = async () => { if (++tries === 1) throw new Error("offline"); };
  ctx.clock.now = new Date("2026-11-15T08:00:00Z");
  await ctx.service.closeLastWeek();
  await ctx.service.closeLastWeek();
  assert.equal(tries, 2);
  assert.equal(ctx.summaries.rows.length, 1);
  assert.ok(ctx.summaries.rows[0].warningSentAt);
});

test("a first midweek assignment does not invent an overdue task for last week", async () => {
  const ctx = setup();
  const id = await ctx.service.addTask({ title: "t" });
  await ctx.service.assign(id, "g1");
  ctx.runs.rows.length = 0;
  await createWeeklyTasks({ ...ctx, now: () => ctx.clock.now }).closeLastWeek();
  assert.equal(ctx.summaries.rows.length, 0);
  assert.equal(ctx.raised.filter((item) => item[0] === "overdue").length, 0);
});

test("a form from the closed week cannot complete this week's task or approve it", async () => {
  const ctx = setup();
  const id = await ctx.service.addTask({ title: "t" });
  await ctx.service.assign(id, "g1");
  const week = (await ctx.service.mine("g1")).week;
  ctx.clock.now = new Date("2026-11-15T08:00:00Z");
  await assert.rejects(ctx.service.setDone("g1", id, "g1", true, "G", week), (e) => e.code === "WEEK_CLOSED");
  await assert.rejects(ctx.service.setApproved(id, "g1", true, week), (e) => e.code === "WEEK_CLOSED");
  assert.equal((await ctx.service.mine("g1")).tasks[0].done, false);
});

test("earned praise survives a skipped week and acknowledgment targets only its owner/week", async () => {
  const ctx = setup();
  const id = await ctx.service.addTask({ title: "t" });
  await ctx.service.assign(id, "g1");
  await ctx.service.setDone("g1", id, "g1", true);
  ctx.clock.now = new Date("2026-11-15T08:00:00Z");
  await ctx.service.closeLastWeek();
  ctx.clock.now = new Date("2026-11-22T08:00:00Z");
  const own = await ctx.service.mine("g1");
  assert.equal(own.praise, true);
  assert.equal(own.praiseWeek, "2026-11-08");
  await ctx.service.praiseSeen("m1", own.praiseWeek);
  assert.equal((await ctx.service.mine("g1")).praise, true);
  await ctx.service.praiseSeen("g1", own.praiseWeek);
  assert.equal((await ctx.service.mine("g1")).praise, false);
});

test("management greetings reach selected owners even before completion, with honest email results", async () => {
  const ctx = setup();
  const body = { guideIds: ["g1", "m1"], text: "بارك الله فيكم على مجهودكم", requestId: "request_123" };
  const result = await ctx.service.sendGreeting(body, "admin");
  assert.deepEqual(result.deliveries, [{ guideId: "g1", notified: true, email: "sent" }, { guideId: "m1", notified: true, email: "missing" }]);
  assert.equal(ctx.raised.filter((item) => item[0] === "greeting").length, 2);
  assert.deepEqual(ctx.raised.find((item) => item[0] === "email"), ["email", "guide@example.org", body.text]);
  await ctx.service.sendGreeting(body, "admin");
  assert.equal(ctx.raised.filter((item) => item[0] === "email").length, 1, "retry does not resend");
  await assert.rejects(ctx.service.sendGreeting({ ...body, text: "different" }, "admin"), (e) => e.code === "GREETING_CHANGED");
});

test("greeting failures are per recipient; no mail or alert for unselected or invalid owners", async () => {
  const ctx = setup();
  ctx.sendMail = async () => { throw new Error("SMTP down"); };
  const service = createWeeklyTasks(ctx);
  const body = { guideIds: ["g1"], text: "Thanks", requestId: "request_123" };
  await assert.rejects(service.sendGreeting({ ...body, guideIds: ["g1", "x1"] }, "admin"), (e) => e.code === "NOT_A_GUIDE");
  assert.equal(ctx.raised.length, 0);
  assert.deepEqual((await service.sendGreeting(body, "admin")).deliveries, [{ guideId: "g1", notified: true, email: "failed" }]);
  assert.equal(ctx.raised.filter((item) => item[0] === "greeting").length, 1);
});

test("assistant group owners have the same personal tasks as guides and management", async () => {
  const ctx = setup();
  ctx.lessons.rows.push({ _id: "x1", name: "Assistant lesson", teacher: "x1" });
  const id = await ctx.service.addTask({ title: "t" });
  await ctx.service.assign(id, "x1");
  assert.equal((await ctx.service.setDone("x1", id, "x1", true)).tasks[0].done, true);
  await assert.rejects(ctx.service.setDone("g1", id, "g1", true), (e) => e.code === "NOT_YOUR_TASK");
});

test("concurrent repeats of one greeting request send each recipient only once", async () => {
  const ctx = setup();
  const body = { guideIds: ["g1"], text: "Thanks", requestId: "concurrent_1" };
  await Promise.all([ctx.service.sendGreeting(body, "admin"), ctx.service.sendGreeting(body, "admin")]);
  assert.equal(ctx.raised.filter((item) => item[0] === "email").length, 1);
  assert.equal(ctx.raised.filter((item) => item[0] === "greeting").length, 1);
});

test("one owner sees two lessons; completing the same task in one leaves the other open and first", async () => {
  const ctx = setup();
  ctx.lessons.rows.push({ _id: "second", name: "Second lesson", teacher: "g1" });
  const id = await ctx.service.addTask({ title: "Same duty" });
  await ctx.service.assign(id, "g1");
  await ctx.service.assign(id, "second");
  const result = await ctx.service.setDone("g1", id, "g1", true);
  assert.deepEqual(result.tasks.map((task) => [task.groupId, task.groupName, task.done]), [
    ["second", "Second lesson", false], ["g1", "Guide lesson", true],
  ]);
  assert.equal(result.remaining, 1);
  assert.equal(ctx.statuses.rows.length, 1);
  ctx.clock.now = new Date("2026-11-15T08:00:00Z");
  const next = await ctx.service.mine("g1");
  assert.equal(next.tasks.length, 2, "assignments persist without management redistributing them");
  assert.equal(next.remaining, 2, "only completion resets");
  assert.deepEqual(ctx.raised.filter((entry) => entry[0] === "overdue"), [["overdue", "1", 1, "2026-11-08"]]);
});

test("the lesson helper shares group completion; unrelated staff and former staff cannot write it", async () => {
  const ctx = setup();
  ctx.lessons.rows[0].helper = "x1";
  const id = await ctx.service.addTask({ title: "t" });
  await ctx.service.assign(id, "g1");
  assert.equal((await ctx.service.setDone("x1", id, "g1", true)).tasks[0].done, true);
  assert.equal((await ctx.service.mine("g1")).tasks[0].done, true);
  await assert.rejects(ctx.service.setDone("m1", id, "g1", true), (error) => error.code === "NOT_YOUR_TASK");
  ctx.lessons.rows[0].helper = null;
  assert.equal((await ctx.service.mine("x1")).tasks.length, 0);
  await assert.rejects(ctx.service.setDone("x1", id, "g1", false), (error) => error.code === "NOT_YOUR_TASK");
});

test("management can release a task from one lesson without affecting another", async () => {
  const ctx = setup();
  ctx.lessons.rows.push({ _id: "second", name: "Second lesson", teacher: "g1" });
  const id = await ctx.service.addTask({ title: "t" });
  await ctx.service.assign(id, "g1");
  await ctx.service.assign(id, "second");
  await ctx.service.setDone("g1", id, "g1", true);
  await ctx.service.unassign(id, "second");
  const own = await ctx.service.mine("g1");
  assert.equal(own.tasks.length, 1);
  assert.equal(own.tasks[0].done, true);
});
