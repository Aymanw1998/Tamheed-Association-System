const mongoose = require('mongoose');
const { logWithSource } = require('../middleware/logger');
const connectDB = async () => {
   //console.log("***************start - connectDB************")
    try{
        console.log("Connecting to MongoDB...".yellow, "URI:", process.env.MONGO_URI.green);
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`.green);
        ////console.log("***************end - connectDB************")
    }
    catch(err){
        logWithSource(`err ${err}`.red)
        process.exit(1);
    }
   //console.log("***************end - connectDB************")

};

module.exports = connectDB;
