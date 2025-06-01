const mongoose = require('mongoose');

const connectDB = async () => {
   //console.log("***************start - connectDB************")
    try{
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`.green);
        ////console.log("***************end - connectDB************")
    }
    catch(err){console.log("ErrorMongoDB ", err)}
   //console.log("***************end - connectDB************")

};

module.exports = connectDB;
