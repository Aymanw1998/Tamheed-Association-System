// Read-only review reproductions. No database, environment file, network or app edits.
// Assertions document the observed bugs; these are not passing regression guarantees.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function autoUpdateRace(app) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(root, `apps/${app}/src/pwa/autoUpdate.js`), 'utf8');
  vm.runInNewContext(source.replace(/export /g, '') + '\nmodule.exports = { createAutoUpdate };', { module });
  const listeners = {};
  let currentPath = '/old';
  let at = 1000000;
  const guard = module.exports.createAutoUpdate({
    doc: { addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener() {}, querySelector: () => ({ tagName: 'INPUT' }) },
    getPath: () => currentPath, now: () => at, store: { getItem: () => null },
  });
  currentPath = '/new';
  // Typing after navigation, before the next 1-second safety poll.
  listeners.input({ target: { tagName: 'INPUT' } });
  assert.equal(guard.safeNow(), false);
  at += 3001;
  assert.equal(guard.safeNow(), true, 'BUG: reload is allowed despite unsaved input on the new page');
  console.log(`CONFIRMED ${app}: input on the new page is forgotten by the navigation poll`);
}

async function rosterRace() {
  const { createEducationalLessons } = require(path.join(root, 'server/services/educationalLesson'));
  let lesson = { _id: 'lesson', teacher: 'guide', kind: 'educational', list_students: [] };
  const lessons = {
    async get() { return { result: [structuredClone(lesson)] }; },
    async updateExisting(filter, data) { lesson = { ...lesson, ...data }; return { result: lesson }; },
  };
  const edu = createEducationalLessons({ lessons, students: {} });
  await Promise.all([edu.moveStudent('student-a', null, 'guide'), edu.moveStudent('student-b', null, 'guide')]);
  assert.equal(lesson.list_students.length, 1, 'BUG: one successful enrolment overwrites the other');
  console.log('CONFIRMED educational roster: two successful concurrent enrolments leave only one student');
}

function consentController({ failStudentWrite = false } = {}) {
  const consents = [];
  const student = { _id: 'student', tz: 'synthetic-id' };
  const rules = { version: 1, text: 'Synthetic rules' };
  const module = { exports: {} };
  const deps = {
    crypto: require('node:crypto'),
    './InviteToken.model': {},
    './Rules.model': {
      RulesModelDef: { get: async () => ({ success: true, result: [rules] }) },
      ConsentModelDef: {
        get: async () => ({ success: true, result: consents }),
        create: async (data) => { consents.push(data); return { success: true, result: data }; },
      },
    },
    '../../utils/grades': {},
    '../Student/Student.model': { StudentModelDef: {
      get: async () => ({ success: true, result: [student] }),
      updateExisting: async (filter, data) => {
        if (failStudentWrite) { failStudentWrite = false; throw new Error('synthetic write failure'); }
        Object.assign(student, data); return { success: true, result: student };
      },
    } },
    '../UploadFile/file': {},
    '../../services/passportPhotoJob': {},
    '../../middleware/logger': { logWithSource() {} },
    '../../utils/israeliId': {},
    '../../services/liveHub': { notifyChange() {} },
    '../../utils/tzUnique': { isDuplicateKey: () => false },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'server/Entities/InviteToken/InviteToken.controller.js'), 'utf8'), {
    module, Buffer, require: (name) => { assert.ok(Object.hasOwn(deps, name), name); return deps[name]; },
  });
  const req = {
    params: { studentId: 'student' },
    // Matches middleware/permissionMiddleware.js: names are under actor.user, not actor.
    actor: { id: 'staff', name: 'Synthetic Staff', user: { firstname: 'Synthetic', lastname: 'Staff' } },
    body: { rulesVersion: 1, rulesAccepted: 'true', signerName: 'Synthetic Parent', signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY4sAAAAASUVORK5CYII=' },
  };
  return { consents, student, async sign() {
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await module.exports.signConsent(req, res); return res;
  } };
}

async function delayedPraise() {
  const { createWeeklyTasks } = require(path.join(root, 'server/services/weeklyTasks'));
  const store = (rows = []) => {
    const matches = (row, filter) => Object.entries(filter).every(([key, value]) => row[key] === value);
    return {
      rows,
      async get(filter = {}) { return { result: rows.filter((row) => matches(row, filter)) }; },
      async create(data) { const row = { _id: String(rows.length + 1), ...data }; rows.push(row); return { result: row }; },
      async createOnce(filter, data) {
        const found = rows.find((row) => matches(row, filter));
        if (found) return { result: found, created: false };
        const row = { _id: String(rows.length + 1), ...data }; rows.push(row); return { result: row, created: true };
      },
      async update(filter, data) { const row = rows.find((item) => matches(item, filter)); if (row) Object.assign(row, data); else rows.push({ ...filter, ...data }); },
    };
  };
  let at = new Date('2026-11-10T10:00:00Z');
  const summaries = store();
  const service = createWeeklyTasks({
    tasks: store([{ _id: 'task', title: 'Synthetic task' }]),
    assignments: store([{ taskId: 'task', groupId: 'lesson' }]),
    statuses: store(), summaries, runs: store(), lessons: store([{ _id: 'lesson', name: 'Synthetic lesson', teacher: 'guide' }]),
    users: { listActive: async () => ({ result: [{ _id: 'guide', firstname: 'Synthetic' }] }) }, now: () => at,
  });
  await service.setDone('guide', 'task', 'lesson', true, 'Synthetic guide');
  at = new Date('2026-11-15T10:00:00Z');
  await service.closeLastWeek(); // Scheduled job, no user visit.
  const earned = summaries.rows.find((row) => row.weekKey === '2026-11-08');
  assert.equal(earned.finished, true);
  assert.equal(earned.seenAt, null);
  at = new Date('2026-11-22T10:00:00Z'); // First subsequent visit, a week later.
  assert.equal((await service.mine('guide')).praise, true);
  assert.equal(earned.seenAt, null);
  console.log('RESOLVED weekly praise: an earned unseen message survives a visit more than one week later');
}

(async () => {
  autoUpdateRace('system');
  autoUpdateRace('sport');
  await rosterRace();
  const audit = consentController();
  assert.equal((await audit.sign()).code, 200);
  assert.equal(audit.consents[0].recordedBy, '', 'BUG: actual actor shape loses staff attribution');
  console.log('CONFIRMED consent: recordedBy is empty for the real middleware actor shape');
  const partial = consentController({ failStudentWrite: true });
  assert.equal((await partial.sign()).code, 500);
  const retry = await partial.sign();
  assert.equal(retry.code, 409);
  assert.equal(retry.body.code, 'ALREADY_SIGNED');
  assert.equal(partial.consents.length, 1);
  assert.equal(partial.student.consentAt, undefined);
  console.log('CONFIRMED consent: a transient student write failure leaves an unsigned marker that retry cannot repair');
  await delayedPraise();
})().catch((error) => { console.error(error); process.exitCode = 1; });
