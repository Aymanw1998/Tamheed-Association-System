const mongoose = require('mongoose');
require('colors');
const { logWithSource } = require('../middleware/logger');

const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/tamheed_db';

const connectDB = async () => {
    const uri = process.env.MONGO_URI || DEFAULT_MONGO_URI;
    try{
        console.log("Connecting to MongoDB...".yellow, "URI:", uri.green);
        const conn = await mongoose.connect(uri);
        console.log(`MongoDB Connected: ${conn.connection.host}`.green);
    }
    catch(err){
        logWithSource(`err ${err}`.red)
        process.exit(1);
    }
};

module.exports = connectDB;
