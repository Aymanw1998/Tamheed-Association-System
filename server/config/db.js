const mongoose = require('mongoose');
require('colors');
const { logWithSource } = require('../middleware/logger');


const connectDB = async () => {
    const uri = process.env.MONGO_URI;
    // mongodb+srv:// needs an SRV lookup through Node's own resolver, which can
    // pick an unusable DNS server (e.g. 127.0.0.1) even when the OS resolves fine.
    const dnsServers = (process.env.DNS_SERVERS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (dnsServers.length) require('dns').setServers(dnsServers);
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
