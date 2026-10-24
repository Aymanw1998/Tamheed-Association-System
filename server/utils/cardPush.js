// «تم تحديث بطاقتك»: a push to a sport player when their card changes (a stat
// bump or a saved attendance mark). At most one per student per 10 minutes;
// the last send time lives on SportPlayer.lastCardPushAt. Dependencies are
// injectable for tests; the default instance loads the real ones lazily.
const COOLDOWN_MS = 10 * 60 * 1000;
const PAYLOAD = { title: "تمهيد - رياضة", body: "تم تحديث بطاقتك", url: "/" };

function createCardPush({ players, push }) {
  // Returns how many students were pushed to.
  return async function notifyCardChanged(studentIds, now = new Date()) {
    const ids = [...new Set((studentIds || []).map(String).filter(Boolean))];
    if (!ids.length) return 0;
    const cutoff = now.getTime() - COOLDOWN_MS;
    const due = new Set();
    for (const studentId of ids) {
      const rows = (await players.get({ studentId }))?.result || [];
      for (const row of rows) {
        const last = row.lastCardPushAt ? new Date(row.lastCardPushAt).getTime() : null;
        if (last !== null && last > cutoff) continue;
        // Claim the slot: only one caller wins if two race on the same row.
        const claimed = await players.updateExisting(
          { _id: row._id, lastCardPushAt: row.lastCardPushAt ?? null }, { lastCardPushAt: now });
        if (claimed?.result) due.add(studentId);
      }
    }
    if (!due.size) return 0;
    await push.sendToStudents([...due], PAYLOAD);
    return due.size;
  };
}

const notifyCardChanged = (studentIds, now) => createCardPush({
  players: require("../Entities/Sport/SportPlayer.model").SportPlayerModelDef,
  push: require("./push").push,
})(studentIds, now);

module.exports = { createCardPush, notifyCardChanged, COOLDOWN_MS };
