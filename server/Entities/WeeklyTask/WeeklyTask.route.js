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
