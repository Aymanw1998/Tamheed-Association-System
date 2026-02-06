const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: "Lessons", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Students", required: true },

    dateKey: { type: Number, index: true }, // YYYYMMDD
    status: { type: String, enum: ["حاضر", "غائب", "متأخر"], default: "حاضر", required: true },

    day: { type: Number, required: true, min: 1, max: 31 },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },

    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

schema.index({ lesson: 1, student: 1, dateKey: 1 }, { unique: true });
schema.index({ student: 1, dateKey: -1 });
schema.index({ lesson: 1, dateKey: -1 });

module.exports = mongoose.model("Attendances", schema);
