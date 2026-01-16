const mongoose = require('mongoose');
const { logWithSource } = require('../middleware/logger');
const connectDB = async () => {
   //console.log("***************start - connectDB************")
    try{
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`.green);
        ////console.log("***************end - connectDB************")
    }
    catch(err){
        logWithSource(`err ${err}`.red)
    }
   //console.log("***************end - connectDB************")

};

module.exports = connectDB;
