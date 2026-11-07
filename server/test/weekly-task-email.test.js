const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

test("weekly greetings send the exact custom text only to the chosen mailbox, without HTML interpretation", async () => {
  const sent = [];
  const module = { exports: {} };
  const configurations = [];
  vm.runInNewContext(fs.readFileSync(require.resolve("../utils/sendEmail"), "utf8"), {
    module, console, process: { env: { SMTP_SERVER: "smtp.example.test", SMTP_PORT: "587", SMTP_FROM: "sender@example.org" } },
    require(name) {
      if (name === "../services/mailDelivery") return require("../services/mailDelivery");
      assert.equal(name, "nodemailer");
      return { createTransport(options) { configurations.push(options); return { sendMail: async (message) => sent.push(message) }; } };
    },
  });
  const text = '<b>بارك الله فيكم</b>\nشكراً';
  await module.exports.sendWeeklyTaskEmail("owner@example.org", text);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "owner@example.org");
  assert.equal(sent[0].text, text);
  assert.equal(sent[0].html, undefined);
  assert.equal(sent[0].bcc, undefined);
  assert.ok(configurations[0].socketTimeout <= 20000);
});
