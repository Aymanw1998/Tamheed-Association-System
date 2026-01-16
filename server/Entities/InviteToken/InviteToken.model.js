// models/InviteToken.js
const mongoose = require('mongoose');

const inviteTokenSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false },
});

inviteTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); 
// מוחק אוטומטית אחרי פקיעה

const InviteToken = mongoose.model('InviteToken', inviteTokenSchema);
module.exports = InviteToken;
