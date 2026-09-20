const mongoose = require('mongoose');
require('colors');
const { logWithSource } = require('../middleware/logger');


const connectDB = async () => {
    const uri = process.env.MONGO_URI;
    try{
        console.log("Connecting to MongoDB...".yellow);
        const conn = await mongoose.connect(uri);
        console.log(`MongoDB Connected`.green);
    }
    catch(err){
        logWithSource(`err ${err}`.red)
        process.exit(1);
    }
};

module.exports = connectDB;
