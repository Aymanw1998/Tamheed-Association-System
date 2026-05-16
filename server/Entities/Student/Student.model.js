const api = require("../api");

// ملاحظة عربية
const StudentModelDef = {
    dbName: "tamheed_db",

    collections: {
        active: "Students",
    },

    fields: {
        tz: { type: "string", required: true },
        firstname: { type: "string", required: false, default: "" },
        lastname: { type: "string", required: false, default: "" },
        birth_date: { type: "date", required: false, default: null },
        gender: { type: "string", required: false, default: "ذكر" },
        phone: { type: "string", required: false, default: "" },
        email: { type: "string", required: false, default: "" },
        city: { type: "string", required: false, default: "" },
        street: { type: "string", required: false, default: "" },
        photo: { type: "string", required: false, default: "" },

        father_name: { type: "string", required: false, default: "" },
        mother_name: { type: "string", required: false, default: "" },
        father_phone: { type: "string", required: false, default: "" },
        mother_phone: { type: "string", required: false, default: "" },
        father_work: { type: "string", required: false, default: "" },
        mother_work: { type: "string", required: false, default: "" },
        school: { type: "string", required: false, default: "" },
        layer: { type: "string", required: false, default: "" },
        health_status: { type: "string", required: false, default: "" },
        notes: { type: "string", required: false, default: "" },

        main_teacher: { type: "string", required: false, default: null },
        source: { type: "string", required: false, default: "جمعية" },
        status: { type: "string", required: false, default: "عادي" },

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

// Build for getting students
/**
 *
 * ملاحظة عربية
 * @returns
 */
StudentModelDef.get = async function (filter = {}) {
    return await api.read({
        dbName: this.dbName,
        collection: this.collections.active,
        filter,
    });
};

// Build for creating a student
/**
 *
 * ملاحظة عربية
 * @returns
 */
StudentModelDef.create = async function (data) {
    return await api.create({
        dbName: this.dbName,
        collection: this.collections.active,
        data,
    });
};

// Build for updating a student
/**
 *
 * ملاحظة عربية
 * ملاحظة عربية
 * @returns
 */
StudentModelDef.update = async function (filter, newData) {
    return await api.update({
        dbName: this.dbName,
        collection: this.collections.active,
        filter,
        newData,
    });
};

// Build for deleting a student
/**
 *
 * ملاحظة عربية
 * @returns
 */
StudentModelDef.delete = async function (filter) {
    return await api.delete({
        dbName: this.dbName,
        collection: this.collections.active,
        filter,
    });
};

module.exports = { StudentModelDef };

// OLD CODE - DO NOT SUGGEST
// const mongoose = require('mongoose');

// const bcrypt = require('bcryptjs');
// const { StudentInterface } = require('../Person/Person.interface');

// const StudentSchema = new mongoose.Schema({...StudentInterface,
//     main_teacher: {type:mongoose.Schema.Types.ObjectId, ref: 'Users', default: null},
//     source: {type: String, enum:['جمعية', 'اهل'], default: 'جمعية'},
//     status: {type: String, enum:['عادي', 'ينتظر'], default: 'عادي'}
// }, {timestamps: true} );

// StudentSchema.index({ tz: 1 }, { unique: true });

// const Student = mongoose.model('Students', StudentSchema);
// module.exports = Student;
