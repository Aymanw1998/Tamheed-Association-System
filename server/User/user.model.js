const mongoose = require('mongoose');

// Define the Meeting Schema
const schema = new mongoose.Schema({
    tz: String,
    username:String,
    password: String,
    firstname: String,
    lastname: String,
    birth_date: String,
    gender: String,
    phone: String,
    email: String,
    city: String,
    street: String,
    role: { type: String, enum: ['system', 'user'], required: true },
    create: Date,
    update: Date,
    refreshToken: { type: String, default: null }

});

// Create the Meeting model
const User = mongoose.model('users', schema);

module.exports = User;
