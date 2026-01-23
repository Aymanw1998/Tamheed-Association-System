// services/notify.js
const Notification = require("./Notification.model");

async function notify(payload) {
  const doc = await Notification.create({
    toRoles: payload.toRoles || ["ادارة"],
    toUsers: payload.toUsers || [],
    module: payload.module || "SYSTEM",
    action: payload.action || "INFO",
    type: payload.type || "INFO",
    title: payload.title || "Notification",
    message: payload.message || "",
    entity: payload.entity || { kind: "", id: "" },
    meta: payload.meta || {},
    createdBy: payload.createdBy || null,
  });

  return doc;
}

const { logWithSource } = require("../../middleware/logger");

// GET /api/notifications?unreadOnly=1&module=LESSONS
const getAll = async (req, res) => {
  try {
    const { unreadOnly, module } = req.query;
    const userId = req.user?.id; // لازم auth middleware

    // لو ما في user (حسب مشروعك) رجّع خطأ
    if (!userId) return res.status(401).json({ ok: false, message: "unauthorized" });

    const roles = req.user?.roles || [];
    const filter = {
      $or: [
        { toRoles: { $in: roles } },
        { toUsers: userId },
      ],
    };

    if (module) filter.module = module;

    if (unreadOnly === "1" || unreadOnly === 1 || unreadOnly === true) {
      filter.readBy = { $ne: userId };
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const unreadCount = await Notification.countDocuments({
      ...filter,
      readBy: { $ne: userId },
    });

    return res.status(200).json({ ok: true, notifications, unreadCount });
  } catch (e) {
    logWithSource("Notification.getAll", e);
    return res.status(500).json({ ok: false, message: e.message });
  }
};

// PUT /api/notifications/:id/read
const markRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, message: "unauthorized" });

    const n = await Notification.findById(id);
    if (!n) return res.status(404).json({ ok: false, message: "not found" });

    const already = (n.readBy || []).some((x) => String(x) === String(userId));
    if (!already) n.readBy.push(userId);

    n.readAt = new Date();
    await n.save();

    return res.status(200).json({ ok: true });
  } catch (e) {
    logWithSource("Notification.markRead", e);
    return res.status(500).json({ ok: false, message: e.message });
  }
};

// PUT /api/notifications/read-all
const markAllRead = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, message: "unauthorized" });

    const roles = req.user?.roles || [];

    await Notification.updateMany(
      {
        $or: [
          { toRoles: { $in: roles } },
          { toUsers: userId },
        ],
        readBy: { $ne: userId },
      },
      {
        $addToSet: { readBy: userId },
        $set: { readAt: new Date() },
      }
    );

    return res.status(200).json({ ok: true });
  } catch (e) {
    logWithSource("Notification.markAllRead", e);
    return res.status(500).json({ ok: false, message: e.message });
  }
};

module.exports = { getAll, markRead, markAllRead, notify };

