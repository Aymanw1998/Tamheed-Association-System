// A hidden IT user is missing from everything everyday users can reach.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.SYSTEM_ADMIN_TZ = "000000026";
const { isHiddenUser } = require("../utils/permissions");
const { guideContact } = require("../utils/guideContact");
const { createStorageRecipients } = require("../services/storageRecipients");

const HIDDEN = { _id: "h1", tz: "100000009", firstname: "Real", lastname: "Person", phone: "050", isIT: true };
const GUIDE = { _id: "g1", tz: "100000017", firstname: "A", lastname: "Guide", phone: "051", role: "مرشد", roles: ["مرشد"] };

test("a blocked IT user with no role stays out of everyday lists too", () => {
  assert.equal(isHiddenUser({ ...HIDDEN, itBlockedAt: new Date() }), true);
  assert.equal(isHiddenUser(GUIDE), false);
  assert.equal(isHiddenUser({ ...GUIDE, isIT: true }), false);
});

test("a hidden IT user has no contact card", () => {
  assert.equal(guideContact(HIDDEN, {}), null);
  assert.ok(guideContact(GUIDE, {}));
});

test("a hidden IT user is no storage recipient", async () => {
  const seen = [];
  const recipients = createStorageRecipients({ listActiveUsers: async () => { seen.push(1); return [HIDDEN, GUIDE]; }, findEntriesByPath: async () => [], folderCandidatesOf: () => [], systemTz: "000000026" });
  const out = await recipients([], { extraTzs: [HIDDEN.tz, GUIDE.tz] });
  assert.equal(seen.length, 1);
  assert.ok(!JSON.stringify([...out]).includes(HIDDEN.tz));
});

test("every place that leaves out the system account by record also leaves out a hidden IT user", () => {
  for (const file of [
    "Entities/Lesson/Lesson.controller.js",
    "Entities/Notice/Notice.service.js",
    "Entities/Storage/Storage.controller.js",
    "Entities/Student/Student.controller.js",
    "Entities/Vehicle/Vehicle.controller.js",
    "Entities/Attendance/Attendance.controller.js",
    "routes/tours.routes.js",
    "services/assistant/toolRegistry.js",
    "services/assistant/actionRunner.js",
    "services/assistant/tools/navigate.js",
    "services/assistant/tools/pending_items.js",
  ]) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.match(source, /isHiddenUser/, file);
  }
});
