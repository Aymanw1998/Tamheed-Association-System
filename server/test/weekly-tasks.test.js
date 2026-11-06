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
