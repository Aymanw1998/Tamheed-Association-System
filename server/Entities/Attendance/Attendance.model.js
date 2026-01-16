const mongoose = require('mongoose');

// Define the Meeting Schema
const schema = new mongoose.Schema({
    id: { type: String },    
    lesson: {
        type: mongoose.Schema.Types.ObjectId, // lesson
        ref: 'Lessons',
    },
    student: {
        type: mongoose.Schema.Types.ObjectId, //students
        ref: 'Students',
    },
    dateKey: { type: Number, index: true },
    status: { type: String, enum:["حاضر","غائب","متأخر"], default: "حاضر", required: true },
    day: { type: Number, required: true, min: 1, max: 31 }, // 0=Sun..6=Sat
    month: { type: Number, required: true, min: 1, max: 12 }, // 0..23
    year: {type: Number, required: true},
    notes: { type: String, trim: true, default: "" },

},{timestamps: true});

schema.index({ lesson: 1, student: 1, dateKey: 1 }, { unique: true });
schema.index({ student: 1, dateKey: -1 });
schema.index({ lesson: 1, dateKey: -1 });

schema.pre("save", function(next) {
  this.dateKey = this.year * 10000 + this.month * 100 + this.day;
  next();
});
// Create the Meeting model
const Attendance = mongoose.model('Attendances', schema);

module.exports = Attendance;
