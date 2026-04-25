const api = require("../api");

// Model definition - לא mongoose אלא הגדרה גנרית שנוכל להשתמש בה עם כל DB
const LessonModelDef = {
    dbName: "tamheed_db",

    collections: {
        active: "Lessons",
    },

    fields: {
        name: { type: "string", required: true },

        date: {
        type: "object",
        required: true,
        default: {
            day: 1,
            startMin: 0,
            endMin: 60,
        },
        },

        // במקום ObjectId
        teacher: { type: "string", required: false, default: null },
        helper: { type: "string", required: false, default: null },

        // במקום array של ObjectId
        list_students: { type: "array", required: false, default: [] },

        room: { type: "string", required: true },

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

// Build for getting lessons
/**
 *
 * @param {*} filter | אופציונלי - פילטר לקריאה
 * @returns
 */
LessonModelDef.get = async function (filter = {}) {
  return await api.read({
    dbName: this.dbName,
    collection: this.collections.active,
    filter,
  });
};

// Build for creating a lesson
/**
 *
 * @param {*} data | אובייקט עם שדות השיעור ליצירה
 * @returns
 */
LessonModelDef.create = async function (data) {
  return await api.create({
    dbName: this.dbName,
    collection: this.collections.active,
    data,
  });
};

// Build for updating a lesson
/**
 *
 * @param {*} filter | אובייקט עם שדות לפילטר
 * @param {*} newData | אובייקט עם שדות לעדכון
 * @returns
 */
LessonModelDef.update = async function (filter, newData) {
  return await api.update({
    dbName: this.dbName,
    collection: this.collections.active,
    filter,
    newData,
  });
};

// Build for deleting a lesson
/**
 *
 * @param {*} filter | אובייקט עם שדות לפילטר
 * @returns
 */
LessonModelDef.delete = async function (filter) {
  return await api.delete({
    dbName: this.dbName,
    collection: this.collections.active,
    filter,
  });
};

module.exports = { LessonModelDef };
// OLD CODE - DO NOT SUGGEST THIS CODE
// const mongoose = require('mongoose');

// // Define the Meeting Schema
// const schema = new mongoose.Schema({
//     name: { type: String, required: true },
//     date: {
//         day: { type: Number, required: true, min: 1, max: 7 }, // 0=Sun..6=Sat
//         startMin: { type: Number, required: true, min: 0, max: 1439 }, // 0..1439
//         endMin: { type: Number, required: true, min: 1, max: 1440 }, // 0..1439
//     },
//     teacher: {
//         type: mongoose.Schema.Types.ObjectId, // teacher
//         ref: 'Users',
//     },
//     helper: {
//         type: mongoose.Schema.Types.ObjectId, // 
//         ref: 'Users', default: undefined,
//     },
//     list_students: [{
//         type: mongoose.Schema.Types.ObjectId, //students
//         ref: 'Students',
//     }],
//     room: {type: String, required: true},
// },{timeseries: true});

// // Create the Meeting model
// const Lesson = mongoose.model('Lessons', schema);

// module.exports = Lesson;
