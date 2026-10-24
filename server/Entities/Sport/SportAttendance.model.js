const api = require("../api");
const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");

const SportAttendanceModelDef = {
    dbName: process.env.DB_NAME || "tamheed_db",

    collections: {
        active: "SportAttendance",
    },

    fields: {
        sportLessonId: { type: "string", required: true },
        studentId: { type: "string", required: true },
        date: { type: "string", required: true }, // "YYYY-MM-DD", Israel local time
        status: { type: "string", required: true }, // حاضر | غائب | متأخر
        createdAt: { type: "date", required: false },
        updatedAt: { type: "date", required: false },
    },
};

SportAttendanceModelDef.get = async function (filter = {}) {
    return await api.read({ dbName: this.dbName, collection: this.collections.active, filter });
};

SportAttendanceModelDef.create = async function (data) {
    return await api.create({ dbName: this.dbName, collection: this.collections.active, data });
};

SportAttendanceModelDef.update = async function (filter, newData) {
    return await api.update({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

SportAttendanceModelDef.updateExisting = async function (filter, newData) {
    return await api.updateExisting({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

SportAttendanceModelDef.delete = async function (filter) {
    return await api.delete({ dbName: this.dbName, collection: this.collections.active, filter });
};

const SPORT_ATTENDANCE_INDEXES = [{ key: { sportLessonId: 1, studentId: 1, date: 1 }, options: { unique: true } }];
const ensureSportAttendanceIndexes = (collection) => ensureIndexes(
    collection || collectionOf({ dbName: SportAttendanceModelDef.dbName, collection: SportAttendanceModelDef.collections.active }),
    SPORT_ATTENDANCE_INDEXES,
);

module.exports = { SportAttendanceModelDef, SPORT_ATTENDANCE_INDEXES, ensureSportAttendanceIndexes };
