const api = require("../api");

// ملاحظة عربية
const ReportModelDef = {
    dbName: "tamheed_db",

    collections: {
        active: "Reports",
    },

    fields: {
        date: {
        type: "date",
        required: true,
        },

        attendance: {
        type: "array", // عربيالسبتعربيالجمعةعربي array السبتعربي tz الأحدالجمعة ids (string)
        required: false,
        default: [],
        },

        title: {
        type: "array", // ملاحظة عربية
        required: false,
        default: [],
        },

        stitle: {
        type: "string",
        required: false,
        default: "",
        },

        info: {
        type: "string",
        required: true,
        },

        createdBy: {
        type: "string", // ملاحظة عربية
        required: false,
        default: null,
        },

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

/* ================= CRUD ================= */

// GET
ReportModelDef.get = async function (filter = {}) {
  return await api.read({
    dbName: this.dbName,
    collection: this.collections.active,
    filter,
  });
};

// CREATE
ReportModelDef.create = async function (data) {
  return await api.create({
    dbName: this.dbName,
    collection: this.collections.active,
    data,
  });
};

// UPDATE
ReportModelDef.update = async function (filter, newData) {
  return await api.update({
    dbName: this.dbName,
    collection: this.collections.active,
    filter,
    newData: {
      ...newData,
      updatedAt: new Date(),
    },
  });
};

// DELETE
ReportModelDef.delete = async function (filter) {
  return await api.delete({
    dbName: this.dbName,
    collection: this.collections.active,
    filter,
  });
};

module.exports = { ReportModelDef };
//OLD CODE, DO NOT SUGGEST
// const mongoose = require('mongoose');

// const reportSchema = new mongoose.Schema(
//     {
//         date: { type: Date, required: true },
//         attendance: [{type: mongoose.Schema.Types.ObjectId, ref: "Users"}],
//         title: [{ type: String, trim: true, default: "" }],
//         stitle: {type: String, trim: true, defualt: ""},
//         info: { type: String, required: true }, // saved rich text as HTML
//         createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
//     },
//     { timestamps: true }
// );

// const Report = mongoose.model("Reports", reportSchema);
// module.exports = Report;