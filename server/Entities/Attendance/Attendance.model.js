const api = require("../api");
const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");

const AttendanceModelDef = {
  dbName: "tamheed_db",

  collections: {
    active: "Attendances",
  },

  fields: {
    lesson: { type: "string", required: true },
    student: { type: "string", required: true },

    dateKey: { type: "number", required: true },
    status: { type: "string", required: true, default: "حاضر" },

    day: { type: "number", required: true },
    month: { type: "number", required: true },
    year: { type: "number", required: true },

    notes: { type: "string", required: false, default: "" },
    // true: created absent by the nightly job; false: saved by a person.
    auto: { type: "boolean", required: false },

    createdAt: {
      type: "date",
      required: false,
      default: () => new Date(),
    },
    updatedAt: {
      type: "date",
      required: false,
      default: () => new Date(),
    },
  },
};

AttendanceModelDef.get = async function (filter = {}) {
  return await api.read({
    dbName: this.dbName,
    collection: this.collections.active,
    filter,
  });
};

AttendanceModelDef.create = async function (data) {
  return await api.create({
    dbName: this.dbName,
    collection: this.collections.active,
    data,
  });
};

AttendanceModelDef.update = async function (filter, newData) {
  return await api.update({
    dbName: this.dbName,
    collection: this.collections.active,
    filter,
    newData,
  });
};

// A student's rows up to toKey, newest first, at most `limit` (alert job).
AttendanceModelDef.latestOfStudent = async function (studentId, toKey, limit = 100) {
  const res = await api.readSorted({
    dbName: this.dbName,
    collection: this.collections.active,
    filter: { student: String(studentId), dateKey: { $lte: toKey } },
    sort: { dateKey: -1, updatedAt: -1 },
    limit,
  });
  return res.result;
};

AttendanceModelDef.delete = async function (filter) {
  return await api.delete({
    dbName: this.dbName,
    collection: this.collections.active,
    filter,
  });
};

// latestOfStudent (the absence-streak check) reads one student's rows by
// dateKey, newest first.
const ATTENDANCE_INDEXES = [{ key: { student: 1, dateKey: -1 } }];
const ensureAttendanceIndexes = (collection) => ensureIndexes(
  collection || collectionOf({ dbName: AttendanceModelDef.dbName, collection: AttendanceModelDef.collections.active }),
  ATTENDANCE_INDEXES,
);

module.exports = { AttendanceModelDef, ATTENDANCE_INDEXES, ensureAttendanceIndexes };

// OLD CODE - DO NOT SUGGEST CHANGES
// const mongoose = require("mongoose");
//
// const schema = new mongoose.Schema(
//   {
//     lesson: { type: mongoose.Schema.Types.ObjectId, ref: "Lessons", required: true },
//     student: { type: mongoose.Schema.Types.ObjectId, ref: "Students", required: true },
//
//     dateKey: { type: Number, index: true }, // YYYYMMDD
//     status: { type: String, enum: ["حاضر", "غائب", "متأخر"], default: "حاضر", required: true },
//
//     day: { type: Number, required: true, min: 1, max: 31 },
//     month: { type: Number, required: true, min: 1, max: 12 },
//     year: { type: Number, required: true },
//
//     notes: { type: String, trim: true, default: "" },
//   },
//   { timestamps: true }
// );
//
// schema.index({ lesson: 1, student: 1, dateKey: 1 }, { unique: true });
// schema.index({ student: 1, dateKey: -1 });
// schema.index({ lesson: 1, dateKey: -1 });
//
// module.exports = mongoose.model("Attendances", schema);
