const mongoose = require('mongoose');

// Define the Meeting Schema
const schema = new mongoose.Schema({
    name: { type: String, required: true },
    date: {
        day: { type: Number, required: true, min: 1, max: 7 }, // 0=Sun..6=Sat
        startMin: { type: Number, required: true, min: 0, max: 1439 }, // 0..1439
        endMin: { type: Number, required: true, min: 1, max: 1440 }, // 0..1439
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId, // teacher
        ref: 'Users',
    },
    helper: {
        type: mongoose.Schema.Types.ObjectId, // 
        ref: 'Users', default: undefined,
    },
    list_students: [{
        type: mongoose.Schema.Types.ObjectId, //students
        ref: 'Students',
    }],
    room: {type: String, required: true},
    createdAt: {type: Date, default: Date.now},
    updatedAt: {type: Date},
},{timeseries: false});

// Create the Meeting model
const Lesson = mongoose.model('Lessons', schema);

module.exports = Lesson;
