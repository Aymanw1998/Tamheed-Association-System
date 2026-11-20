const assert = require("node:assert/strict");
const test = require("node:test");
const { studentsWithAssistantGuide } = require("../utils/assistantGuides");

// Owner, 2026-11-19: IT lists students whose responsible guide is an assistant.
const store = (rows) => ({ async get() { return { success: true, result: rows }; } });

test("only students of an active assistant are listed, archived ones left out", async () => {
  const users = store([
    { _id: "h1", firstname: "سامي", lastname: "م", role: "مساعد" },
    { _id: "g1", firstname: "أحمد", lastname: "ر", role: "مرشد" },
  ]);
  const students = store([
    { _id: "s1", firstname: "علي", lastname: "أ", main_teacher: "h1" },
    { _id: "s2", firstname: "عمر", lastname: "ب", main_teacher: "g1" },
    { _id: "s3", firstname: "زيد", lastname: "ج", main_teacher: "h1", archivedAt: new Date() },
    { _id: "s4", firstname: "هاني", lastname: "د", main_teacher: null },
  ]);
  assert.deepEqual(await studentsWithAssistantGuide({ students, users }), [{ studentId: "s1", student: "علي أ", assistant: "سامي م" }]);
});

test("a failed read throws (the route answers 500)", async () => {
  await assert.rejects(studentsWithAssistantGuide({ students: store([]), users: { async get() { return { success: false }; } } }));
});
