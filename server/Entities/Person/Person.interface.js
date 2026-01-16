const mongoose = require('mongoose');
const PersonInterface = {
    tz: { type: String, required: true, trim: true, },
    firstname: { type: String, trim: true },
    lastname: { type: String, trim: true },
    birth_date: { type: Date, trim: true }, // אם תרצה תאריך אמיתי: Date
    gender: { type: String, enum: ['ذكر', 'انثى'], default: 'ذكر' },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, match: [/^\S+@\S+\.\S+$/, 'Invalid email'] },
    city: { type: String, trim: true },
    street: { type: String, trim: true },
    photo: { type: String, trim: true, default: ""},
}

const UserInterface = {
    ...PersonInterface,
    password: { type: String, required: () => { return this.isNew }},
    mustChangePassword: { type: Boolean, default: false},
    roles: [{ type: String, enum: ['ادارة', 'مرشد', 'مساعد'], default: 'مرشد'}],
}

const StudentInterface = {
    ...PersonInterface,
    father_name: { type: String, trim: true },
    mother_name: { type: String, trim: true },
    father_phone: { type: String, trim: true },
    mother_phone: { type: String, trim: true },
    father_work: { type: String, trim: true },
    mother_work: { type: String, trim: true },
    school: { type: String, trim: true },
    layer: { type: String, trim: true },
    health_status: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
}

module.exports = {UserInterface, StudentInterface};

