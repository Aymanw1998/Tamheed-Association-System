const mongoose = require('mongoose');

// Define the Meeting Schema
const schema = new mongoose.Schema({
    tz: String,
    firstname: String,
    lastname: String,
    birth_date: String,
    gender: String,
    phone: String,
    email: String,
    father_name: String,
    mother_name: String,
    father_phone: String,
    mother_phone: String,
    city: String,
    street: String,
    image_url: String,
    create: Date,
    update: Date,
});

// Create the Meeting model
const Student = mongoose.model('students', schema);

module.exports = Student;
