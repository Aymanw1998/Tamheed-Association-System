const { renderAlert, defaultSeverity } = require("./alertTemplates");

// Immediate alerts, raised by the action that causes them. Controllers call
// these fire-and-forget (never awaited, errors only logged), so an alert can
// neither slow down nor break the action itself. Dedup keys carry the
// Jerusalem day where the same event may repeat, so a user gets the same
// alert at most once a day.
const TIME_ZONE = "Asia/Jerusalem";

function jerusalemDay(now) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now);
  const pick = (type) => parts.find((p) => p.type === type).value;
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

const fullName = (person = {}) => [person.firstname, person.lastname].filter(Boolean).join(" ").trim();
const VEHICLE_KINDS = new Set(["license", "test", "insurance"]);

// Unlocking and auditing are IT actions: their alerts go to the IT users (not
// blocked), linked to the user's page on the IT site.
function itUserLink(tz) {
  const host = String(process.env.IT_HOST || "").trim();
  return host ? `https://${host}/users/${tz}` : `/users/${tz}`;
}

function createAlertEvents({ engine, now = () => new Date() } = {}) {
  const getEngine = () => engine || require("./alertEngine").getAlertEngine();
  const day = () => jerusalemDay(now());

  async function send(type, { params = {}, rule, link, dedupKey, severity = defaultSeverity(type) }) {
    const e = getEngine();
    const recipients = await e.recipientsFor(rule);
    if (!recipients.length) return { created: [] };
    return e.raise({ type, severity, text: renderAlert(type, params), link, dedupKey, recipients });
  }

  // A parent's registration request (Students, source "اهل", status "ينتظر").
  const parentRegistered = (student = {}) => send("parent_registration", {
    params: { name: fullName(student) },
    rule: { permissions: ["students.viewAll", "students.edit"] },
    link: "/students",
    dedupKey: `parent_registration:${student._id || `${fullName(student)}:${day()}`}`,
  });

  // A self-registered user entered the waiting room.
  // To the users IT marked, among those who may approve; with none, to everyone
  // who may approve, so no request is lost.
  const userWaiting = async (user = {}) => {
    const marked = { permission: "users.approve", requestAlerts: true };
    const anyMarked = (await getEngine().recipientsFor(marked)).length > 0;
    return send("user_waiting", {
      params: { name: fullName(user) },
      rule: anyMarked ? marked : { permission: "users.approve" },
      link: "/users",
      dedupKey: `user_waiting:${user.tz}:${day()}`,
    });
  };

  // The group's weekly tasks: the guide only; the management gets no alert about them.
  const weeklyTasks = (user = {}, count = 0, week = "") => send("weekly_tasks", {
    params: { count },
    rule: { tz: user.tz },
    link: "/weekly-tasks",
    dedupKey: `weekly_tasks:${user.tz}:${week}`,
  });
  const weeklyTaskAdded = (user = {}, taskId = "", week = "") => send("weekly_task_added", {
    rule: { tz: user.tz },
    link: "/weekly-tasks",
    dedupKey: `weekly_task_added:${user.tz}:${taskId}:${week}`,
  });
  const weeklyTasksOverdue = (user, remaining, week) => send("weekly_tasks_overdue", {
    params: { remaining, week }, rule: { tz: user.tz }, link: "/weekly-tasks",
    dedupKey: `weekly_tasks_overdue:${user.tz}:${week}`,
  });
  const weeklyTasksGreeting = (user, text, deliveryId) => send("weekly_tasks_greeting", {
    params: { text }, rule: { tz: user.tz }, link: "/weekly-tasks",
    dedupKey: `weekly_tasks_greeting:${deliveryId}`,
  });

  // An administrator added or promoted one: IT should know.
  const adminAdded = (user = {}) => send("admin_added", {
    params: { name: fullName(user) },
    rule: { it: true },
    link: itUserLink(user.tz),
    dedupKey: `admin_added:${user.tz}:${day()}`,
  });

  // The automatic lock after repeated failed sign-ins.
  const accountLocked = (user = {}) => send("account_locked", {
    params: { name: fullName(user) },
    rule: { it: true, system: true },
    link: itUserLink(user.tz),
    dedupKey: `account_locked:${user.tz}:${day()}`,
  });

  // A role or permission change: the IT users (linked to the user's page on
  // the IT site) and the user (own text, linked to their profile). The actor who
  // made the change is never alerted about his own action.
  async function accessChanged(target = {}, { change = "permissions", actorTz } = {}) {
    const kind = change === "role" ? "role" : "permissions";
    const dedupKey = `access_changed:${kind}:${target.tz}:${day()}`;
    const actor = String(actorTz ?? "").trim();
    const notActor = (tz) => !actor || tz !== actor;
    const e = getEngine();
    const self = (await e.recipientsFor({ tz: target.tz })).filter(notActor);
    const others = (await e.recipientsFor({ it: true }))
      .filter((tz) => !self.includes(tz) && tz !== String(target.tz) && notActor(tz));
    const severity = defaultSeverity("access_changed");
    const created = [];
    if (others.length) {
      const text = renderAlert("access_changed", { name: fullName(target), change: kind, self: false });
      const link = itUserLink(target.tz);
      created.push(...(await e.raise({ type: "access_changed", severity, text, link, dedupKey, recipients: others })).created);
    }
    if (self.length) {
      const text = renderAlert("access_changed", { name: fullName(target), change: kind, self: true });
      created.push(...(await e.raise({ type: "access_changed", severity, text, link: "/profile", dedupKey, recipients: self })).created);
    }
    return { created };
  }

  // Every 5th consecutive failed sign-in on the system account.
  const systemLoginFailures = (count) => send("system_login_failures", {
    params: { count },
    rule: { system: true },
    link: "/",
    dedupKey: `system_login_failures:${day()}:${Number(count) || 0}`,
  });

  // A new vehicle notice from the nightly check (same dedup key as the notice).
  function vehicleStage(alert = {}, notice = {}) {
    const kind = VEHICLE_KINDS.has(alert.kind) ? alert.kind : null;
    if (!kind || !notice.dedupKey) return Promise.resolve({ created: [] });
    return send(`vehicle_${kind}`, {
      params: alert,
      rule: { permission: "vehicles.view" },
      link: notice.link || `/vehicles/${alert.vehicleId}`,
      dedupKey: notice.dedupKey,
      severity: notice.severity || defaultSeverity(`vehicle_${kind}`),
    });
  }

  return { weeklyTasks, weeklyTaskAdded, weeklyTasksOverdue, weeklyTasksGreeting, parentRegistered, userWaiting, adminAdded, accountLocked, accessChanged, systemLoginFailures, vehicleStage };
}

const events = createAlertEvents();

module.exports = { ...events, createAlertEvents, jerusalemDay };
