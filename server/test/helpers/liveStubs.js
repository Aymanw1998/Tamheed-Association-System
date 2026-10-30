// Test helper: stand-ins for the lock guard and live hub requires that the
// write controllers and routes make. `changes` records every
// notifyChange(entity, id) call (clear it with `changes.length = 0`);
// `students` records every liveHub.toStudents(ids, type) call as
// [[ids as strings], type]. checkVersion is the real one; route lock checks
// pass (the guard itself is tested in lock-guard.test.js). `holders` sets
// who holds a key for holderOf: holders.set(key, { clientId, name, tz }).
// `photoJobs` records every playerPhotoJob.schedule(studentId) call; the
// stored player photos are an empty in-memory model. `passportJobs` records
// every passportPhotoJob.schedule(link) call.
const { photoVersion } = require("../../utils/photoVersion");
const { checkVersion, editorStamp, sameVersion, nextStamp, raceLost, lockedAnswer } = require("../../middleware/lockGuard");
// Lock holders by key for the controllers that look them up (holderOf); empty = all free.
const holders = new Map();

const changes = [];
const students = [];
const notifyChange = (entity, id) => { changes.push([entity, id]); };
const liveHub = { toStudents: (ids, type) => { students.push([Array.from(ids || [], String), type]); } };
const photoJobs = [];
const playerPhotoJob = { schedule: (id) => { photoJobs.push(String(id)); }, remove: async (id) => { photoJobs.push(`remove:${id}`); }, read: async () => null };
const passportJobs = [];
const passportPhotoJob = { schedule: async (link) => { passportJobs.push(String(link)); }, forget: async () => {}, read: async () => null };
const cutoutReady = (player, link) => Boolean(player?.photoCutout) && player.photoCutout === photoVersion(link);
const noPhotos = { async get() { return { success: true, result: [] }; }, async put() { return { success: true }; }, async delete() { return { success: true, result: { deletedCount: 0 } }; } };
// Sport notices: an in-memory store (clear with `notices.length = 0`), and
// `pushes` records every push.sendToStudents(ids, payload) as [ids, payload].
const notices = [];
let noticeSeq = 0;
const matchesAll = (doc, filter) => Object.entries(filter).every(([k, v]) => String(doc[k]) === String(v));
const noticeStore = {
  async get(filter = {}) { return { success: true, result: notices.filter((n) => matchesAll(n, filter)).map((n) => ({ ...n })) }; },
  async create(data) { noticeSeq += 1; const doc = { _id: noticeSeq.toString(16).padStart(24, "0"), ...data }; notices.push(doc); return { success: true, result: { ...doc } }; },
  async delete(filter) { const before = notices.length; for (let i = notices.length - 1; i >= 0; i -= 1) if (matchesAll(notices[i], filter)) notices.splice(i, 1); return { success: true, result: { deletedCount: before - notices.length } }; },
};
const pushes = [];
const push = { sendToStudents: async (ids, payload) => { pushes.push([Array.from(ids || [], String), payload]); return { sent: 0, removed: 0 }; } };
const requireFreeOrMine = () => (req, res, next) => next();
const deps = {};
for (const suffix of ["", ".js"]) {
  deps[`../../middleware/lockGuard${suffix}`] = { checkVersion, editorStamp, sameVersion, nextStamp, raceLost, requireFreeOrMine, lockedAnswer, holderOf: async (key, clientId) => { const h = holders.get(key); return h && h.clientId !== clientId ? { name: h.name, tz: h.tz } : null; } };
  deps[`../../services/liveHub${suffix}`] = { notifyChange, liveHub };
  deps[`../../services/playerPhotoJob${suffix}`] = { playerPhotoJob, cutoutReady };
  deps[`../../services/passportPhotoJob${suffix}`] = { passportPhotoJob };
  deps[`../../utils/photoVersion${suffix}`] = { photoVersion };
  deps[`./SportPlayerPhoto.model${suffix}`] = { SportPlayerPhotoModelDef: noPhotos };
  deps[`./SportNotice.model${suffix}`] = { SportNoticeModelDef: noticeStore };
  deps[`../../utils/push${suffix}`] = { push };
}

module.exports = { deps, changes, students, holders, photoJobs, passportJobs, notices, pushes };
