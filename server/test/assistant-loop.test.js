// The assistant's chat turn (services/ai.service.js) and its HTTP routes
// (routes/ai.routes.js), with a stub Anthropic client: no network calls.
//   - a round is stored only after it fully completes (Review Focus #5)
//   - tools run as the signed-in user; every tool_result goes back in one user message
//   - refusal / max_tokens / 8 rounds / API errors leave a consistent history
//   - 30 messages per user per hour; conversations are the owner's only
const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");

const { createAssistant, trimHistory, displayMessages, MODEL } = require("../services/ai.service");
const { createAiRouter } = require("../routes/ai.routes");
const { createRateModel, RATE_LIMIT, RATE_WINDOW_SECONDS, AI_RATE_INDEXES } = require("../Entities/AiUsage/AiRate.model");
const { requirePermission } = require("../middleware/permissionMiddleware");
const systemPrompt = require("../services/assistant/systemPrompt");
const { forModel } = require("../services/assistant/toolRegistry");
const { actorFor } = require("./helpers/actors");
const { matches } = require("./helpers/memoryModel");

const NOW = new Date("2026-10-20T09:00:00Z");
const GUIDE = actorFor({ _id: "u-guide", tz: "T-GUIDE", firstname: "مرشد", lastname: "تجربة", roles: ["مرشد"] });
const OTHER = actorFor({ _id: "u-other", tz: "T-OTHER", firstname: "آخر", lastname: "تجربة", roles: ["مرشد"] });

/* ---------------- stand-ins ---------------- */

// AiConversations in memory, with the model's interface.
function conversationStore() {
  const docs = [];
  let next = 1;
  const own = (tz, id) => docs.find((d) => d._id === String(id) && d.ownerTz === String(tz));
  return {
    docs,
    appends: [],
    failAppend: null,
    async create(ownerTz, title = "", at = new Date()) {
      const doc = { _id: String(next++).padStart(24, "a"), ownerTz: String(ownerTz), title, messages: [], createdAt: at, updatedAt: at };
      docs.push(doc);
      return { ...doc, messages: [] };
    },
    async listFor(ownerTz) {
      const result = docs.filter((d) => d.ownerTz === String(ownerTz)).map(({ messages, ...rest }) => rest);
      return { result, total: result.length };
    },
    async findOwn(ownerTz, id) {
      const doc = own(ownerTz, id);
      return doc ? structuredClone(doc) : null;
    },
    async append(ownerTz, id, messages, at) {
      if (this.failAppend) throw this.failAppend;
      const doc = own(ownerTz, id);
      if (!doc) return null;
      this.appends.push(structuredClone(messages));
      doc.messages.push(...structuredClone(messages));
      doc.updatedAt = at;
      return { _id: doc._id };
    },
    // The per-conversation in-flight lock (AiConversation.model lock/unlock).
    async lock(ownerTz, id, at) {
      const doc = own(ownerTz, id);
      if (!doc || (doc.busyUntil && doc.busyUntil > at)) return null;
      doc.busyUntil = new Date(at.getTime() + 5 * 60 * 1000);
      return doc.busyUntil;
    },
    async unlock(ownerTz, id, token) {
      const doc = own(ownerTz, id);
      if (!doc || !doc.busyUntil || +doc.busyUntil !== +token) return null;
      doc.busyUntil = null;
      return { _id: doc._id };
    },
    async remove(ownerTz, id) {
      const i = docs.findIndex((d) => d._id === String(id) && d.ownerTz === String(ownerTz));
      if (i < 0) return 0;
      docs.splice(i, 1);
      return 1;
    },
  };
}

// A tool registry stub that records who ran what.
function toolStub(results = {}) {
  const calls = [];
  return {
    calls,
    definitions: [
      { name: "search_students", description: "s", input_schema: { type: "object" }, strict: true },
      { name: "navigate", description: "n", input_schema: { type: "object" }, strict: true },
    ],
    async run(name, input, actor) {
      calls.push({ name, input, actor });
      const r = results[name];
      return typeof r === "function" ? r(input, actor) : r ?? { ok: true };
    },
  };
}

// Each step of `script` answers one round: { deltas, message } or an Error.
function stubClient(script) {
  const calls = [];
  const client = {
    calls,
    beta: {
      messages: {
        stream(params, options) {
          calls.push({ params: structuredClone(params), options });
          const step = script.shift();
          const handlers = {};
          return {
            on(event, cb) { (handlers[event] ||= []).push(cb); return this; },
            async finalMessage() {
              if (!step) throw new Error("stub: no more rounds scripted");
              if (step instanceof Error) throw step;
              if (step.wait) {
                // Held until the test releases it, or the request is aborted.
                await new Promise((resolve, reject) => {
                  step.wait.then(resolve);
                  options?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
                });
              }
              if (step.fail) throw step.fail;
              for (const d of step.deltas || []) for (const h of handlers.text || []) h(d, d);
              return step.message;
            },
          };
        },
      },
    },
  };
  return client;
}

const msg = (stop_reason, content) => ({
  id: "msg_x", type: "message", role: "assistant", model: MODEL, stop_reason, content,
  usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
});
const text = (t) => ({ type: "text", text: t });
const toolUse = (id, name, input = {}) => ({ type: "tool_use", id, name, input });
const thinking = { type: "thinking", thinking: "", signature: "sig-1" };

function setup({ script = [], tools = toolStub(), conversations = conversationStore(), configured = true, ...rest } = {}) {
  const client = stubClient(script);
  const logs = [];
  const assistant = createAssistant({
    getClient: () => (configured ? client : null),
    conversations,
    tools,
    now: () => NOW,
    log: (...args) => logs.push(args),
    ...rest,
  });
  return { assistant, client, conversations, tools, logs };
}

async function turn(assistant, args) {
  const events = [];
  const result = await assistant.runAssistantTurn({ actor: GUIDE, onEvent: (type, data) => events.push({ type, data }), ...args });
  return { events, result };
}
const ofType = (events, type) => events.filter((e) => e.type === type).map((e) => e.data);

/* ---------------- the turn ---------------- */

test("a text-only turn streams the text and stores user, context and answer", async () => {
  const { assistant, client, conversations } = setup({
    script: [{ deltas: ["مرحبا", " بك"], message: msg("end_turn", [text("مرحبا بك")]) }],
  });
  const { events, result } = await turn(assistant, { userText: "مرحبا" });

  assert.equal(result.ok, true);
  assert.deepEqual(events.map((e) => e.type), ["conversation", "delta", "delta", "done"]);
  assert.equal(ofType(events, "conversation")[0].title, "مرحبا");
  assert.deepEqual(ofType(events, "delta").map((d) => d.text), ["مرحبا", " بك"]);

  const params = client.calls[0].params;
  assert.equal(params.model, "claude-opus-5-5");
  assert.equal(params.max_tokens, 4000);
  assert.deepEqual(params.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(params.fallbacks, "default");
  assert.deepEqual(params.output_config, { effort: "low" });
  assert.equal(params.thinking, undefined, "adaptive thinking is the default: never sent");
  assert.equal(params.tool_choice, undefined, "auto is the default");
  assert.deepEqual(params.system, [{ type: "text", text: systemPrompt.STATIC, cache_control: { type: "ephemeral" } }]);
  assert.deepEqual(params.tools.at(-1).cache_control, { type: "ephemeral" });
  assert.equal(params.tools.length, 2);
  assert.deepEqual(params.messages, [
    { role: "user", content: [text("مرحبا")] },
    { role: "system", content: systemPrompt.context(GUIDE, NOW) },
  ]);

  const doc = conversations.docs[0];
  assert.equal(doc.ownerTz, "T-GUIDE");
  assert.deepEqual(doc.messages, [
    { role: "user", content: [text("مرحبا")] },
    { role: "system", content: systemPrompt.context(GUIDE, NOW) },
    { role: "assistant", content: [text("مرحبا بك")] },
  ]);
});

test("a tool round runs the tool as the signed-in user, then the final answer follows", async () => {
  const tools = toolStub({ search_students: { result: [{ _id: "s1", name: "طالب" }] } });
  const { assistant, client, conversations } = setup({
    tools,
    script: [
      { deltas: ["أبحث"], message: msg("tool_use", [thinking, text("أبحث"), toolUse("tu1", "search_students", { q: "طالب" })]) },
      { deltas: ["وجدت طالبًا"], message: msg("end_turn", [text("وجدت طالبًا")]) },
    ],
  });
  const { events } = await turn(assistant, { userText: "ابحث عن طالب" });

  assert.equal(tools.calls.length, 1);
  assert.equal(tools.calls[0].actor, GUIDE, "the tool runs as the signed-in user");
  assert.deepEqual(tools.calls[0].input, { q: "طالب" });
  assert.deepEqual(ofType(events, "tool"), [{ name: "search_students" }]);
  assert.equal(events.at(-1).type, "done");

  // Round 2 sees round 1's assistant message unchanged (thinking included) and the result.
  const second = client.calls[1].params.messages;
  assert.equal(second.length, 4);
  assert.deepEqual(second[2], { role: "assistant", content: [thinking, text("أبحث"), toolUse("tu1", "search_students", { q: "طالب" })] });
  assert.deepEqual(second[3], {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: "tu1", content: JSON.stringify({ result: [{ _id: "s1", name: "طالب" }] }) }],
  });
  assert.equal(conversations.docs[0].messages.length, 5);
  assert.deepEqual(conversations.docs[0].messages.at(-1), { role: "assistant", content: [text("وجدت طالبًا")] });
});

test("parallel tool_use blocks all run and are answered in one user message; failures are is_error", async () => {
  let running = 0;
  let peak = 0;
  const tools = toolStub({
    search_students: async () => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 10)); running--; return { result: [] }; },
    navigate: async () => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 10)); running--; return { error: "FORBIDDEN" }; },
  });
  const { assistant, client } = setup({
    tools,
    script: [
      { message: msg("tool_use", [toolUse("a", "search_students", { q: "x" }), toolUse("b", "navigate", { screen: "users" })]) },
      { message: msg("end_turn", [text("تم")]) },
    ],
  });
  await turn(assistant, { userText: "سؤال" });

  assert.equal(peak, 2, "tools run in parallel");
  const results = client.calls[1].params.messages.at(-1);
  assert.equal(results.role, "user");
  assert.deepEqual(results.content, [
    { type: "tool_result", tool_use_id: "a", content: JSON.stringify({ result: [] }) },
    { type: "tool_result", tool_use_id: "b", content: JSON.stringify({ error: "FORBIDDEN" }), is_error: true },
  ]);
});

test("navigate: the browser gets the path, the model only the forModel() view", async () => {
  const nav = { navigate: { screen: "student", id: "abc", path: "/students/T-CHILD" } };
  const tools = toolStub({ navigate: nav });
  const { assistant, client, conversations } = setup({
    tools,
    script: [
      { message: msg("tool_use", [toolUse("n1", "navigate", { screen: "student", id: "abc" })]) },
      { message: msg("end_turn", [text("هذا الزر")]) },
    ],
  });
  const { events } = await turn(assistant, { userText: "افتح الطالب" });

  assert.deepEqual(ofType(events, "navigate"), [{ screen: "student", id: "abc", path: "/students/T-CHILD" }]);
  const sent = client.calls[1].params.messages.at(-1).content[0].content;
  assert.equal(sent, JSON.stringify(forModel(nav)));
  assert.ok(!sent.includes("T-CHILD"));
  assert.ok(!JSON.stringify(conversations.docs[0].messages).includes("T-CHILD"), "the path is never stored");
});

test("refusal: a polite answer is stored in place of the refused text, then done", async () => {
  const { assistant, conversations } = setup({
    script: [{ deltas: ["جزء"], message: msg("refusal", [text("جزء")]) }],
  });
  const { events, result } = await turn(assistant, { userText: "طلب" });

  assert.equal(result.ok, true);
  assert.equal(events.at(-1).type, "done");
  const stored = conversations.docs[0].messages;
  assert.equal(stored.length, 3);
  assert.equal(stored[2].role, "assistant");
  assert.notEqual(stored[2].content[0].text, "جزء");
  assert.ok(ofType(events, "delta").some((d) => d.text.includes(stored[2].content[0].text)));
});

test("max_tokens: the text so far plus a note is stored", async () => {
  const { assistant, conversations } = setup({
    script: [{ deltas: ["نص طويل"], message: msg("max_tokens", [thinking, text("نص طويل")]) }],
  });
  const { events } = await turn(assistant, { userText: "اشرح" });
  assert.equal(events.at(-1).type, "done");
  const last = conversations.docs[0].messages.at(-1);
  assert.equal(last.role, "assistant");
  assert.equal(last.content[0].text, "نص طويل");
  assert.equal(last.content.length, 2, "only text blocks, plus the note");
  assert.ok(ofType(events, "delta").some((d) => d.text === `\n\n${last.content[1].text}`));
});

test("max_tokens in the middle of a tool call: no unanswered tool_use is stored", async () => {
  const { assistant, conversations } = setup({
    script: [{ message: msg("max_tokens", [text("أبحث"), toolUse("t", "search_students", {})]) }],
  });
  await turn(assistant, { userText: "اشرح" });
  const stored = conversations.docs[0].messages;
  assert.ok(!JSON.stringify(stored).includes("tool_use"));
  assert.equal(stored.at(-1).role, "assistant");
});

test("any other stop reason (context window, pause, ...) stores text only, so the next request's history is valid", async () => {
  const conversations = conversationStore();
  const { assistant, client } = setup({
    conversations,
    script: [
      { deltas: ["أبحث"], message: msg("model_context_window_exceeded", [thinking, text("أبحث"), toolUse("t1", "search_students", {})]) },
      { message: msg("end_turn", [text("تم")]) },
    ],
  });
  const first = await turn(assistant, { userText: "سؤال" });
  assert.equal(first.events.at(-1).type, "done");
  const stored = conversations.docs[0].messages;
  assert.ok(!JSON.stringify(stored).includes("tool_use"), "no unanswered tool_use is stored");
  const last = stored.at(-1);
  assert.equal(last.role, "assistant");
  assert.equal(last.content[0].text, "أبحث");
  assert.ok(last.content.length === 2 && last.content.every((b) => b.type === "text"), "text plus a note");
  assert.ok(ofType(first.events, "delta").some((d) => d.text === `\n\n${last.content[1].text}`));

  await turn(assistant, { conversationId: first.result.conversationId, userText: "وبعد؟" });
  const sent = client.calls[1].params.messages;
  const uses = sent.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === "tool_use");
  assert.deepEqual(uses, [], "the next request carries no unanswered tool_use");
  assert.deepEqual(sent.at(-2), { role: "user", content: [text("وبعد؟")] });
});

test("the loop stops after 8 tool rounds with an answered history and a note", async () => {
  const script = Array.from({ length: 8 }, (_, i) => ({ message: msg("tool_use", [toolUse(`t${i}`, "search_students", {})]) }));
  const { assistant, client, conversations, tools } = setup({ script });
  const { events } = await turn(assistant, { userText: "حلقة" });

  assert.equal(client.calls.length, 8);
  assert.equal(tools.calls.length, 8);
  assert.equal(events.at(-1).type, "done");
  const stored = conversations.docs[0].messages;
  assert.equal(stored.at(-1).role, "assistant", "the last tool results are followed by an assistant note");
  assert.equal(stored.at(-2).content[0].type, "tool_result");
});

test("an API error: error event, nothing half-stored, a new conversation is removed", async () => {
  const { assistant, conversations } = setup({
    script: [new Anthropic.InternalServerError(500, { type: "error" }, "boom", new Headers())],
  });
  const { events, result } = await turn(assistant, { userText: "سؤال" });

  assert.equal(result.ok, false);
  assert.deepEqual(events.at(-1), { type: "error", data: { code: "AI_ERROR", message: events.at(-1).data.message } });
  assert.ok(events.at(-1).data.message);
  assert.ok(!events.some((e) => e.type === "done"));
  assert.equal(conversations.docs.length, 0, "the empty new conversation is not left behind");
});

test("an API error after a completed tool round keeps the history well-formed", async () => {
  const conversations = conversationStore();
  const existing = await conversations.create("T-GUIDE", "قديمة", NOW);
  const before = [
    { role: "user", content: [text("قبل")] },
    { role: "assistant", content: [text("رد")] },
  ];
  conversations.docs[0].messages.push(...before);
  const { assistant } = setup({
    conversations,
    script: [
      { message: msg("tool_use", [toolUse("t", "search_students", {})]) },
      new Anthropic.RateLimitError(429, { type: "error" }, "slow", new Headers()),
    ],
  });
  const { events } = await turn(assistant, { conversationId: existing._id, userText: "سؤال" });

  assert.equal(events.at(-1).data.code, "AI_BUSY");
  const stored = conversations.docs[0].messages;
  assert.deepEqual(stored.slice(0, 2), before, "earlier turns are never edited");
  assert.equal(stored[5].content[0].type, "tool_result");
  assert.equal(stored.at(-1).role, "assistant", "a note closes the interrupted turn");
  assert.equal(conversations.docs.length, 1);
});

test("an API error before any round of an existing conversation stores nothing", async () => {
  const conversations = conversationStore();
  const existing = await conversations.create("T-GUIDE", "قديمة", NOW);
  const { assistant } = setup({
    conversations,
    script: [new Anthropic.AuthenticationError(401, { type: "error" }, "key", new Headers())],
  });
  const { events } = await turn(assistant, { conversationId: existing._id, userText: "سؤال" });
  assert.equal(events.at(-1).data.code, "AI_UNAVAILABLE");
  assert.equal(conversations.docs[0].messages.length, 0);
  assert.equal(conversations.docs.length, 1, "an existing conversation is kept");
});

test("an earlier conversation is sent before the new turn, and its context message stays", async () => {
  const conversations = conversationStore();
  const existing = await conversations.create("T-GUIDE", "قديمة", NOW);
  const earlier = [
    { role: "user", content: [text("قبل")] },
    { role: "system", content: "old context" },
    { role: "assistant", content: [text("رد")] },
  ];
  conversations.docs[0].messages.push(...earlier);
  const { assistant, client } = setup({ conversations, script: [{ message: msg("end_turn", [text("نعم")]) }] });
  const { events } = await turn(assistant, { conversationId: existing._id, userText: "وبعد؟" });

  assert.deepEqual(ofType(events, "conversation"), [{ id: existing._id, title: "قديمة" }]);
  assert.deepEqual(client.calls[0].params.messages.slice(0, 3), earlier);
  assert.equal(client.calls[0].params.messages.length, 5);
});

test("another user's conversation is not found and nothing is called", async () => {
  const conversations = conversationStore();
  const theirs = await conversations.create("T-OTHER", "لهم", NOW);
  const { assistant, client } = setup({ conversations });
  const { events, result } = await turn(assistant, { conversationId: theirs._id, userText: "x" });
  assert.equal(result.ok, false);
  assert.equal(events.at(-1).data.code, "NOT_FOUND");
  assert.equal(client.calls.length, 0);
});

test("no API key: a friendly NOT_CONFIGURED error and no SDK call", async () => {
  const { assistant, conversations } = setup({ configured: false });
  assert.equal(assistant.isConfigured(), false);
  const { events } = await turn(assistant, { userText: "مرحبا" });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "error");
  assert.equal(events[0].data.code, "NOT_CONFIGURED");
  assert.ok(events[0].data.message);
  assert.equal(conversations.docs.length, 0);
});

test("usage is logged per round, never the tool results", async () => {
  const tools = toolStub({ search_students: { result: [{ name: "اسم-سري" }] } });
  const { assistant, logs } = setup({
    tools,
    script: [
      { message: msg("tool_use", [toolUse("t", "search_students", { q: "اسم-سري" })]) },
      { message: msg("end_turn", [text("تم")]) },
    ],
  });
  await turn(assistant, { userText: "سؤال" });
  const usage = logs.filter((l) => l[0] === "usage");
  assert.equal(usage.length, 2);
  assert.equal(usage[0][1].input_tokens, 10);
  assert.ok(!JSON.stringify(logs).includes("اسم-سري"));
});

test("an aborted request (browser closed) stores nothing and sends no error", async () => {
  const controller = new AbortController();
  const tools = toolStub({ search_students: async () => { controller.abort(); return { result: [] }; } });
  const { assistant, client, conversations } = setup({
    tools,
    script: [{ message: msg("tool_use", [toolUse("t", "search_students", {})]) }, { message: msg("end_turn", [text("x")]) }],
  });
  const { events } = await turn(assistant, { userText: "سؤال", signal: controller.signal });
  assert.equal(client.calls.length, 1, "no new round after the abort");
  assert.ok(!events.some((e) => e.type === "error" || e.type === "done"));
  assert.equal(conversations.docs.length, 0, "the unfinished round is dropped with its empty new conversation");
});

/* ---------------- history helpers ---------------- */

test("trimHistory keeps at most the limit and starts at a real user turn", () => {
  const turnOf = (i) => [
    { role: "user", content: [text(`q${i}`)] },
    { role: "system", content: "ctx" },
    { role: "assistant", content: [toolUse(`t${i}`, "x")] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: `t${i}`, content: "{}" }] },
    { role: "assistant", content: [text(`a${i}`)] },
  ];
  const history = Array.from({ length: 10 }, (_, i) => turnOf(i)).flat(); // 50 messages
  const trimmed = trimHistory(history, 40);
  assert.ok(trimmed.length <= 40);
  assert.deepEqual(trimmed[0], { role: "user", content: [text("q2")] });
  assert.deepEqual(trimmed.at(-1), history.at(-1));
  assert.deepEqual(trimHistory(history.slice(0, 5), 40), history.slice(0, 5));
});

test("displayMessages shows the user's text and the assistant's text only", () => {
  const view = displayMessages([
    { role: "user", content: [text("سؤال")] },
    { role: "system", content: "ctx" },
    { role: "assistant", content: [thinking, text("أبحث"), toolUse("t", "x")] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "{\"secret\":1}" }] },
    { role: "assistant", content: [text("الجواب")] },
  ]);
  assert.deepEqual(view, [
    { role: "user", text: "سؤال" },
    { role: "assistant", text: "أبحث\n\nالجواب" },
  ]);
});

/* ---------------- rate limit model ---------------- */

function fakeApi() {
  const docs = [];
  let next = 1;
  return {
    docs,
    async create({ data }) { const d = { _id: String(next++), ...data }; docs.push(d); return { success: true, result: d }; },
    async read({ filter }) { return { success: true, result: docs.filter((d) => matches(d, filter)) }; },
    async delete({ filter }) {
      const before = docs.length;
      for (let i = docs.length - 1; i >= 0; i--) if (matches(docs[i], filter)) docs.splice(i, 1);
      return { success: true, result: { deletedCount: before - docs.length } };
    },
  };
}

test("rate limit: 30 messages per user per hour, the 31st refused and not counted", async () => {
  const api = fakeApi();
  const rate = createRateModel(api);
  assert.equal(RATE_LIMIT, 30);
  assert.equal(RATE_WINDOW_SECONDS, 3600);
  assert.deepEqual(AI_RATE_INDEXES.find((i) => i.options?.expireAfterSeconds), { key: { at: 1 }, options: { expireAfterSeconds: 3600 } });
  for (let i = 0; i < 30; i++) assert.equal((await rate.hit("T-GUIDE", NOW)).allowed, true);
  assert.equal((await rate.hit("T-GUIDE", NOW)).allowed, false);
  assert.equal(api.docs.length, 30, "a refused message is not counted");
  assert.equal((await rate.hit("T-OTHER", NOW)).allowed, true, "per user");
  const later = new Date(NOW.getTime() + 3601 * 1000);
  assert.equal((await rate.hit("T-GUIDE", later)).allowed, true, "an hour later it is allowed again");
});

/* ---------------- routes ---------------- */

async function startApp({ assistant, conversations, rate, users = { "T-GUIDE": GUIDE, "T-OTHER": OTHER } }) {
  const requireAuth = (req, res, next) => {
    const tz = req.headers["x-tz"];
    if (!tz) return res.status(401).json({ code: "NO_TOKEN" });
    req.user = { tz };
    return next();
  };
  const loadActor = (req, res, next) => {
    const actor = users[req.user.tz];
    if (!actor) return res.status(401).json({ code: "USER_NOT_FOUND" });
    req.actor = actor;
    return next();
  };
  const app = express();
  app.use(express.json());
  app.use("/api/ai", createAiRouter({ requireAuth, loadActor, requirePermission, assistant, conversations, rate }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

const post = (base, tz, body) => fetch(`${base}/api/ai/chat`, {
  method: "POST", headers: { "content-type": "application/json", ...(tz ? { "x-tz": tz } : {}) }, body: JSON.stringify(body),
});

function parseSse(raw) {
  return raw.split("\n\n").filter((b) => b.trim()).map((block) => {
    const lines = block.split("\n");
    const event = lines.find((l) => l.startsWith("event: "))?.slice(7);
    const data = lines.find((l) => l.startsWith("data: "))?.slice(6);
    return { event, data: data ? JSON.parse(data) : null };
  });
}

const allowAll = { async hit() { return { allowed: true }; } };

test("POST /chat streams SSE events", async () => {
  const { assistant, conversations } = setup({ script: [{ deltas: ["أهلا"], message: msg("end_turn", [text("أهلا")]) }] });
  const { server, base } = await startApp({ assistant, conversations, rate: allowAll });
  try {
    const res = await post(base, "T-GUIDE", { message: "  مرحبا  " });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/event-stream/);
    const events = parseSse(await res.text());
    assert.deepEqual(events.map((e) => e.event), ["conversation", "delta", "done"]);
    assert.deepEqual(events[1].data, { text: "أهلا" });
    assert.deepEqual(conversations.docs[0].messages[0], { role: "user", content: [text("مرحبا")] });
  } finally { server.close(); }
});

test("POST /chat: bad message 400, signed out 401, no ai.use 403", async () => {
  const { assistant, conversations } = setup();
  const noAi = actorFor({ _id: "u3", tz: "T-NOAI", roles: ["مرشد"] });
  noAi.permissions = new Set([...noAi.permissions].filter((k) => k !== "ai.use"));
  const { server, base } = await startApp({ assistant, conversations, rate: allowAll, users: { "T-GUIDE": GUIDE, "T-NOAI": noAi } });
  try {
    assert.equal((await post(base, "T-GUIDE", { message: "   " })).status, 400);
    assert.equal((await post(base, "T-GUIDE", { message: "x".repeat(4001) })).status, 400);
    assert.equal((await post(base, "T-GUIDE", { message: 5 })).status, 400);
    assert.equal((await post(base, "T-GUIDE", { message: "x", conversationId: { $ne: "" } })).status, 400);
    assert.equal((await post(base, null, { message: "x" })).status, 401);
    assert.equal((await post(base, "T-NOAI", { message: "x" })).status, 403);
  } finally { server.close(); }
});

test("POST /chat: the 31st message in an hour is 429 RATE_LIMITED", async () => {
  const { assistant, conversations } = setup({
    script: Array.from({ length: 30 }, () => ({ message: msg("end_turn", [text("ok")]) })),
  });
  const rate = createRateModel(fakeApi());
  const { server, base } = await startApp({ assistant, conversations, rate });
  try {
    for (let i = 0; i < 30; i++) {
      const res = await post(base, "T-GUIDE", { message: `m${i}` });
      assert.equal(res.status, 200);
      await res.text();
    }
    const res = await post(base, "T-GUIDE", { message: "m31" });
    assert.equal(res.status, 429);
    assert.equal((await res.json()).code, "RATE_LIMITED");
  } finally { server.close(); }
});

test("POST /chat with another user's conversation is 404 and costs nothing", async () => {
  const { assistant, conversations, client } = setup();
  const theirs = await conversations.create("T-OTHER", "لهم", NOW);
  let hits = 0;
  const rate = { async hit() { hits++; return { allowed: true }; } };
  const { server, base } = await startApp({ assistant, conversations, rate });
  try {
    const res = await post(base, "T-GUIDE", { message: "x", conversationId: theirs._id });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).code, "NOT_FOUND");
    assert.equal(hits, 0);
    assert.equal(client.calls.length, 0);
  } finally { server.close(); }
});

test("POST /chat without an API key streams NOT_CONFIGURED and does not count", async () => {
  const { assistant, conversations } = setup({ configured: false });
  let hits = 0;
  const rate = { async hit() { hits++; return { allowed: true }; } };
  const { server, base } = await startApp({ assistant, conversations, rate });
  try {
    const res = await post(base, "T-GUIDE", { message: "x" });
    const events = parseSse(await res.text());
    assert.deepEqual(events.map((e) => e.event), ["error"]);
    assert.equal(events[0].data.code, "NOT_CONFIGURED");
    assert.equal(hits, 0);
  } finally { server.close(); }
});

test("conversations: list, read and delete are the owner's only", async () => {
  const { assistant, conversations } = setup();
  const mine = await conversations.create("T-GUIDE", "لي", NOW);
  conversations.docs[0].messages.push(
    { role: "user", content: [text("سؤال")] },
    { role: "system", content: "ctx" },
    { role: "assistant", content: [text("جواب")] },
  );
  const theirs = await conversations.create("T-OTHER", "لهم", NOW);
  const { server, base } = await startApp({ assistant, conversations, rate: allowAll });
  const get = (path, tz = "T-GUIDE", method = "GET") => fetch(`${base}/api/ai${path}`, { method, headers: { "x-tz": tz } });
  try {
    const list = await (await get("/conversations")).json();
    assert.deepEqual(list.result.map((c) => c.title), ["لي"]);

    const one = await (await get(`/conversations/${mine._id}`)).json();
    assert.equal(one.conversation.title, "لي");
    assert.deepEqual(one.conversation.messages, [{ role: "user", text: "سؤال" }, { role: "assistant", text: "جواب" }]);
    assert.equal(one.conversation.ownerTz, undefined);

    assert.equal((await get(`/conversations/${theirs._id}`)).status, 404);
    assert.equal((await get(`/conversations/${theirs._id}`, "T-GUIDE", "DELETE")).status, 404);
    assert.equal(conversations.docs.length, 2);
    assert.equal((await get(`/conversations/${mine._id}`, "T-GUIDE", "DELETE")).status, 200);
    assert.equal(conversations.docs.length, 1);
  } finally { server.close(); }
});

/* ---------------- final-review fixes: lock, full conversation, raw text ---------------- */

const until = async (check, ms = 2000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
};
const countingRate = () => { const r = { hits: 0, async hit() { r.hits++; return { allowed: true }; } }; return r; };

test("POST /chat: a second message to a conversation still answering is 409 BUSY and not counted", async () => {
  let release;
  const wait = new Promise((r) => { release = r; });
  const { assistant, conversations, client } = setup({
    script: [
      { wait, message: msg("end_turn", [text("أولى")]) },
      { message: msg("end_turn", [text("ثالثة")]) },
    ],
  });
  const existing = await conversations.create("T-GUIDE", "قديمة", NOW);
  const rate = countingRate();
  const { server, base } = await startApp({ assistant, conversations, rate });
  try {
    const first = post(base, "T-GUIDE", { message: "1", conversationId: existing._id });
    await until(() => client.calls.length === 1);
    const second = await post(base, "T-GUIDE", { message: "2", conversationId: existing._id });
    assert.equal(second.status, 409);
    assert.equal((await second.json()).code, "BUSY");
    assert.equal(rate.hits, 1, "the refused message is not counted");
    assert.equal(client.calls.length, 1);

    release();
    assert.equal((await first).status, 200);
    await (await first).text();
    const third = await post(base, "T-GUIDE", { message: "3", conversationId: existing._id });
    assert.equal(third.status, 200, "the lock is released when the turn ends");
    await third.text();
  } finally { server.close(); }
});

test("POST /chat: the lock is released after a failed turn and after the browser goes away", async () => {
  let never;
  const hold = new Promise((r) => { never = r; });
  const { assistant, conversations, client } = setup({
    script: [
      new Anthropic.InternalServerError(500, { type: "error" }, "boom", new Headers()),
      { wait: hold, message: msg("end_turn", [text("x")]) },
      { message: msg("end_turn", [text("ok")]) },
    ],
  });
  const existing = await conversations.create("T-GUIDE", "قديمة", NOW);
  const { server, base } = await startApp({ assistant, conversations, rate: allowAll });
  try {
    const failed = await post(base, "T-GUIDE", { message: "1", conversationId: existing._id });
    assert.equal(parseSse(await failed.text()).at(-1).event, "error");
    assert.equal(conversations.docs[0].busyUntil, null, "released after an error");

    const controller = new AbortController();
    const pending = fetch(`${base}/api/ai/chat`, {
      method: "POST", headers: { "content-type": "application/json", "x-tz": "T-GUIDE" },
      body: JSON.stringify({ message: "2", conversationId: existing._id }), signal: controller.signal,
    }).then((r) => r.text()).catch(() => null);
    await until(() => client.calls.length === 2);
    assert.ok(conversations.docs[0].busyUntil, "held while answering");
    controller.abort();
    await pending;
    await until(() => conversations.docs[0].busyUntil === null);

    const after = await post(base, "T-GUIDE", { message: "3", conversationId: existing._id });
    assert.equal(after.status, 200);
    await after.text();
  } finally { never(); server.close(); }
});

test("POST /chat: a refused rate limit releases the lock", async () => {
  const { assistant, conversations } = setup();
  const existing = await conversations.create("T-GUIDE", "قديمة", NOW);
  const rate = { async hit() { return { allowed: false }; } };
  const { server, base } = await startApp({ assistant, conversations, rate });
  try {
    const res = await post(base, "T-GUIDE", { message: "x", conversationId: existing._id });
    assert.equal(res.status, 429);
    assert.equal(conversations.docs[0].busyUntil, null);
  } finally { server.close(); }
});

test("POST /chat: a conversation with 400 stored messages is 409 CONVERSATION_FULL and costs nothing", async () => {
  const { assistant, conversations, client } = setup();
  const full = await conversations.create("T-GUIDE", "طويلة", NOW);
  for (let i = 0; i < 200; i++) {
    conversations.docs[0].messages.push({ role: "user", content: [text("q")] }, { role: "assistant", content: [text("a")] });
  }
  const rate = countingRate();
  const { server, base } = await startApp({ assistant, conversations, rate });
  try {
    const res = await post(base, "T-GUIDE", { message: "x", conversationId: full._id });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, "CONVERSATION_FULL");
    assert.equal(rate.hits, 0);
    assert.equal(client.calls.length, 0);
    assert.ok(!conversations.docs[0].busyUntil);
  } finally { server.close(); }
});

test("POST /chat: the message reaches the model and storage as typed, not HTML-escaped by xss-clean", async () => {
  const xss = require("xss-clean");
  const { skipFor } = require("../middleware/skipFor");
  const { assistant, conversations, client } = setup({ script: [{ message: msg("end_turn", [text("ok")]) }] });
  const users = { "T-GUIDE": GUIDE };
  const app = express();
  app.use(express.json());
  app.use(skipFor(["/api/ai/chat"], xss()));
  app.post("/api/echo", (req, res) => res.json(req.body));
  const requireAuth = (req, res, next) => { req.user = { tz: req.headers["x-tz"] }; next(); };
  const loadActor = (req, res, next) => { req.actor = users[req.user.tz]; next(); };
  app.use("/api/ai", createAiRouter({ requireAuth, loadActor, requirePermission, assistant, conversations, rate: allowAll }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await (await post(base, "T-GUIDE", { message: "<3 & a<b" })).text();
    assert.deepEqual(client.calls[0].params.messages[0], { role: "user", content: [text("<3 & a<b")] });
    assert.deepEqual(conversations.docs[0].messages[0], { role: "user", content: [text("<3 & a<b")] });
    const echo = await (await fetch(`${base}/api/echo`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ v: "<b>" }),
    })).json();
    assert.notEqual(echo.v, "<b>", "every other route is still cleaned");
  } finally { server.close(); }
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "server.js"), "utf8");
  assert.match(source, /skipFor\(\[\s*["']\/api\/ai\/chat["']\s*\],\s*xss\(\)\)/, "server.js mounts xss-clean through skipFor");
});
