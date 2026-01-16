const { default: mongoose } = require("mongoose");
const {User, UsernoActive} = require("../Entities/User/User.model");
const { removeSubForUser } = require("../Entities/User/User.controller");

const stripTimestamps = (doc) => {
  const { createdAt, updatedAt, __v, ...rest } = doc;
  return rest; // ישאיר גם _id, tz, וכל השאר
}

const haveTraineeWithoutSubs3Month = async() => {
    // 1) להגדיל ספירת "לא פעיל" למתאמנים שאין להם מנוי פעיל
    const incRes = await User.updateMany(
        { role: "מתאמן", $or: [ { "subs.id": { $exists: false } }, { "subs.id": null } ] },
        { $inc: { countnoActive: 1 } }
    );

    // 2) לאפס למי שיש מנוי (כדי “לספור” רק תקופות בלי מנוי)
    const resetRes = await User.updateMany(
        { role: "מתאמן", "subs.id": { $ne: null } },
        { $set: { countnoActive: 0 } }
    );

    // 3) להשבית מי שהגיע ל-3 (שבועות) ולהפוך ל־active:false
    const deactivateRes = await User.updateMany(
        { role: "מתאמן", active: true, countnoActive: { $gte: 3 } },
        { $set: { active: false } }
    );

    // 4) העבר את המשתמש ממקום למקום
      // נשלוף את המועמדים
    const docs = await User.find({active: false, role: "מתאמן"}).lean();
    if (!docs.length) {
        console.log('[moveInactive] no inactive users to move');
        return { moved: 0 };
    }
    const ids = docs.map(d => d._id);
    const session = await mongoose.startSession();
    try{
        await session.withTransaction(async() => {
            const ops = docs.map(d => ({
                updateOne: {filter: {tz: d.tz}, update: {$setOnInsert: stripTimestamps({ _id: d._id, ...d })}, upsert: true}
            }))
            await UsernoActive.bulkWrite(ops, {ordered: false, session});
            await User.deleteMany({ _id: { $in: ids } }, { session });
        })
        console.log(`[moveInactive] moved ${docs.length} users`);
    } catch(err) {
        console.error('[moveInactive] error:', err);
    } finally {
        session.endSession();
    }
    console.log({
        inc: incRes.modifiedCount ?? incRes.nModified,
        reset: resetRes.modifiedCount ?? resetRes.nModified,
        deactivated: deactivateRes.modifiedCount ?? deactivateRes.nModified,
    });

}

const checkSubIsOk = async() => {
    const users = await User.find({ role: "מתאמן"});
    for(const user of users) {
        if(user.subs.id !== null && user.subs.id !== '') {
            if(new Date() >= new Date(user.subs.end)){
                user.subs.id = null;
                user.subs.start = null;
                user.subs.end= null;
                user.active = 0;
                user.updatedAt = new Date();
                console.log(user);
                await user.save();
            }
        }
    }


}
async function runDailyJobs() {
    // await haveTraineeWithoutSubs3Month();
    // await checkSubIsOk();
    // console.log("[daily] running at", new Date().toISOString());
}

module.exports = {runDailyJobs};