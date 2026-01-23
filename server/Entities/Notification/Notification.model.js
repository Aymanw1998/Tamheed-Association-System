const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    toRoles: { type: [String], default: ["ادارة"], index: true }, // لمن
    toUsers: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] }, // اختياري

    module: { type: String, default: "SYSTEM", index: true }, // LESSONS / REPORTS / USERS ...
    action: { type: String, default: "INFO" }, // CREATED / UPDATED / DELETED ...
    type: { type: String, default: "INFO" }, // SUCCESS / WARN / ERROR / INFO

    title: { type: String, default: "Notification" },
    message: { type: String, default: "" },

    entity: {
      kind: { type: String, default: "" }, // lesson/report/user/...
      id: { type: String, default: "" },
    },

    meta: { type: mongoose.Schema.Types.Mixed, default: {} },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    readBy: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
    readAt: { type: Date, default: null }, // اختياري: آخر وقت قراءة
  },
  { timestamps: true }
);

NotificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Notifications", NotificationSchema);
