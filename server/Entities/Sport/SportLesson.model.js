const api = require("../api");
const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");

const SportLessonModelDef = {
    dbName: process.env.DB_NAME || "tamheed_db",

    collections: {
        active: "SportLessons",
    },

    fields: {
        sportId: { type: "string", required: true },
        name: { type: "string", required: true },
        // day: 1 = Sunday (الأحد) .. 7 = Saturday, like Lesson.date.day; times are minutes from midnight.
        date: { type: "object", required: true },
        room: { type: "string", required: false, default: "9" },
        players: { type: "array", required: false, default: [] }, // [{ studentId, joinedAt }]
        createdAt: { type: "date", required: false },
        updatedAt: { type: "date", required: false },
    },
};

SportLessonModelDef.get = async function (filter = {}) {
    return await api.read({ dbName: this.dbName, collection: this.collections.active, filter });
};

SportLessonModelDef.create = async function (data) {
    return await api.create({ dbName: this.dbName, collection: this.collections.active, data });
};

SportLessonModelDef.update = async function (filter, newData) {
    return await api.update({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

SportLessonModelDef.updateExisting = async function (filter, newData) {
    return await api.updateExisting({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

SportLessonModelDef.delete = async function (filter) {
    return await api.delete({ dbName: this.dbName, collection: this.collections.active, filter });
};

const SPORT_LESSON_INDEXES = [{ key: { sportId: 1 } }, { key: { "players.studentId": 1 } }];
const ensureSportLessonIndexes = (collection) => ensureIndexes(
    collection || collectionOf({ dbName: SportLessonModelDef.dbName, collection: SportLessonModelDef.collections.active }),
    SPORT_LESSON_INDEXES,
);

module.exports = { SportLessonModelDef, SPORT_LESSON_INDEXES, ensureSportLessonIndexes };
