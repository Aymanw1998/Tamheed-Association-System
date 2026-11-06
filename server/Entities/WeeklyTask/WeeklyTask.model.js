const api = require("../api");

const dbName = process.env.DB_NAME || "tamheed_db";

const modelFor = (collection) => ({
  dbName,
  collection,
  async get(filter = {}) { return api.read({ dbName, collection, filter }); },
  async create(data) { return api.create({ dbName, collection, data }); },
  async createOnce(filter, data) {
    await ensureWeeklyTaskIndexes(); // Never send twice if startup index creation failed.
    try { return { ...(await api.create({ dbName, collection, data })), created: true }; }
    catch (error) {
      if (error.code !== 11000) throw error;
      const result = (await api.read({ dbName, collection, filter }))?.result?.[0];
      if (!result) throw error;
      return { result, created: false };
    }
  },
  // api.update upserts: one row for each week, task and guide.
  async update(filter, newData) {
    await ensureWeeklyTaskIndexes();
    try { return await api.update({ dbName, collection, filter, newData }); }
    catch (error) {
      if (error.code !== 11000) throw error;
      return api.updateExisting({ dbName, collection, filter, newData });
    }
  },
  async updateExisting(filter, newData) { return api.updateExisting({ dbName, collection, filter, newData }); },
  async delete(filter) { return api.delete({ dbName, collection, filter }); },
});

// { title, details, createdByName, createdAt }
const WeeklyTaskModelDef = modelFor("WeeklyTasks");
// { taskId, groupId (= lesson _id), createdAt }: persists until management changes it.
// Owner-only legacy rows stay untouched: a lesson cannot be guessed from an owner.
const TaskAssignmentModelDef = modelFor("WeeklyTaskLessonAssignments");
// { weekKey, taskId, groupId, doneAt, doneByName, approvedAt }
const TaskStatusModelDef = modelFor("WeeklyTaskLessonStatuses");
// { weekKey, guideId, total, done, finished, seenAt }: what a week came to.
const TaskSummaryModelDef = modelFor("WeeklyTaskLessonSummaries");
const TaskGreetingModelDef = modelFor("WeeklyTaskGreetings");

let indexesReady;
function ensureWeeklyTaskIndexes() {
  if (indexesReady) return indexesReady;
  indexesReady = (async () => {
    const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");
    for (const [model, key] of [
    [TaskAssignmentModelDef, { taskId: 1, groupId: 1 }],
    [TaskStatusModelDef, { weekKey: 1, taskId: 1, groupId: 1 }],
    [TaskSummaryModelDef, { weekKey: 1, guideId: 1 }],
    [TaskGreetingModelDef, { actorId: 1, requestId: 1, guideId: 1 }],
    ]) await ensureIndexes(collectionOf(model), [{ key, options: { unique: true } }]);
  })().catch((error) => { indexesReady = null; throw error; });
  return indexesReady;
}

module.exports = { WeeklyTaskModelDef, TaskAssignmentModelDef, TaskStatusModelDef, TaskSummaryModelDef, TaskGreetingModelDef, ensureWeeklyTaskIndexes };
