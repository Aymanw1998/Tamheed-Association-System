const express = require("express");
const { logWithSource } = require("../middleware/logger");

// The assistant (/api/ai). Every route: signed in, active user, ai.use.
//   POST   /chat               { conversationId?, message } -> SSE (see services/ai.service.js):
//                              conversation, delta, tool, navigate, action, done | error
//                              400 INVALID_MESSAGE, 404 NOT_FOUND (not the caller's), 429 RATE_LIMITED,
//                              409 BUSY (that conversation is still answering; not counted),
//                              409 CONVERSATION_FULL (MAX_STORED_MESSAGES stored; start a new one).
//                              The message is exempt from xss-clean (server.js): it reaches the
//                              model and storage as typed, and is only ever rendered as text.
//   GET    /conversations      the caller's conversations (newest first, no messages)
//   GET    /conversations/:id  one of them, with the messages as the chat window shows them
//   DELETE /conversations/:id  deletes one of them (hard delete)
// Each chat message bills a real Anthropic request: 30 per user per hour.
const MAX_MESSAGE = 4000;
const PING_MS = 15 * 1000;
const RATE_LIMITED = { ok: false, code: "RATE_LIMITED", message: "وصلت إلى حدّ الرسائل للمساعد في هذه الساعة، حاول لاحقًا." };
const NOT_FOUND = { ok: false, code: "NOT_FOUND", message: "المحادثة غير موجودة." };
const INVALID_MESSAGE = { ok: false, code: "INVALID_MESSAGE", message: "الرسالة فارغة أو طويلة جدًا." };
const BUSY = { ok: false, code: "BUSY", message: "المساعد ما زال يجيب في هذه المحادثة، انتظر حتى ينتهي." };
const CONVERSATION_FULL = { ok: false, code: "CONVERSATION_FULL", message: "هذه المحادثة طويلة جدًا. ابدأ محادثة جديدة." };
const SERVER_ERROR = { ok: false, code: "SERVER_ERROR", message: "حدث خطأ غير متوقع، حاول مرة أخرى." };

const conversationView = (c) => ({ id: String(c._id), title: c.title || "", createdAt: c.createdAt, updatedAt: c.updatedAt });

function createAiRouter({
  requireAuth, loadActor, requirePermission, assistant, conversations, rate, displayMessages,
  maxStoredMessages = require("../Entities/AiConversation/AiConversation.model").MAX_STORED_MESSAGES,
}) {
  const router = express.Router();
  const show = displayMessages || require("../services/ai.service").displayMessages;

  async function chat(req, res) {
    const actor = req.actor;
    const { message, conversationId } = req.body || {};
    const text = typeof message === "string" ? message.trim() : "";
    if (!text || text.length > MAX_MESSAGE) return res.status(400).json(INVALID_MESSAGE);
    if (conversationId != null && typeof conversationId !== "string") return res.status(400).json(INVALID_MESSAGE);

    const startStream = () => {
      res.status(200).set({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
    };
    const send = (type, data) => {
      if (!res.writableEnded) res.write(`event: ${type}\ndata: ${JSON.stringify(data ?? {})}\n\n`);
    };

    // An existing conversation answers one turn at a time: its lock is taken
    // before the message is counted, and released however the turn ends.
    let lock = null;
    try {
      try {
        // Not configured: answer politely, without counting the message.
        if (!assistant.isConfigured()) {
          startStream();
          await assistant.runAssistantTurn({ actor, conversationId, userText: text, onEvent: send });
          return res.end();
        }
        if (conversationId) {
          const conversation = await conversations.findOwn(actor.tz, conversationId);
          if (!conversation) return res.status(404).json(NOT_FOUND);
          const stored = Array.isArray(conversation.messages) ? conversation.messages.length : 0;
          if (stored >= maxStoredMessages) return res.status(409).json(CONVERSATION_FULL);
          lock = await conversations.lock(actor.tz, conversationId, new Date());
          if (!lock) return res.status(409).json(BUSY);
        }
        if (!(await rate.hit(actor.tz, new Date())).allowed) return res.status(429).json(RATE_LIMITED);
      } catch (error) {
        logWithSource("ai.chat", String(error?.name || "Error"));
        return res.status(500).json(SERVER_ERROR);
      }

      startStream();
      // The browser went away: stop the turn (nothing half-stored).
      const controller = new AbortController();
      res.on("close", () => { if (!res.writableEnded) controller.abort(); });
      const ping = setInterval(() => { if (!res.writableEnded) res.write(": ping\n\n"); }, PING_MS);
      try {
        await assistant.runAssistantTurn({ actor, conversationId, userText: text, onEvent: send, signal: controller.signal });
      } finally {
        clearInterval(ping);
        res.end();
      }
      return undefined;
    } finally {
      if (lock) {
        await conversations.unlock(actor.tz, conversationId, lock).catch((error) => {
          logWithSource("ai.chat.unlock", String(error?.name || "Error"));
        });
      }
    }
  }

  async function list(req, res) {
    try {
      const { result, total } = await conversations.listFor(req.actor.tz);
      return res.json({ ok: true, result: result.map(conversationView), total });
    } catch (error) {
      logWithSource("ai.list", String(error?.name || "Error"));
      return res.status(500).json(SERVER_ERROR);
    }
  }

  async function getOne(req, res) {
    try {
      const conversation = await conversations.findOwn(req.actor.tz, req.params.id);
      if (!conversation) return res.status(404).json(NOT_FOUND);
      return res.json({ ok: true, conversation: { ...conversationView(conversation), messages: show(conversation.messages) } });
    } catch (error) {
      logWithSource("ai.get", String(error?.name || "Error"));
      return res.status(500).json(SERVER_ERROR);
    }
  }

  async function remove(req, res) {
    try {
      const deleted = await conversations.remove(req.actor.tz, req.params.id);
      if (!deleted) return res.status(404).json(NOT_FOUND);
      return res.json({ ok: true });
    } catch (error) {
      logWithSource("ai.delete", String(error?.name || "Error"));
      return res.status(500).json(SERVER_ERROR);
    }
  }

  router.post("/chat", requireAuth, loadActor, requirePermission("ai.use"), chat);
  router.get("/conversations", requireAuth, loadActor, requirePermission("ai.use"), list);
  router.get("/conversations/:id", requireAuth, loadActor, requirePermission("ai.use"), getOne);
  router.delete("/conversations/:id", requireAuth, loadActor, requirePermission("ai.use"), remove);

  return router;
}

function defaultRouter() {
  const { requireAuth } = require("../middleware/authMiddleware");
  const { loadActor, requirePermission } = require("../middleware/permissionMiddleware");
  const service = require("../services/ai.service");
  return createAiRouter({
    requireAuth,
    loadActor,
    requirePermission,
    assistant: { isConfigured: service.isConfigured, runAssistantTurn: service.runAssistantTurn },
    conversations: require("../Entities/AiConversation/AiConversation.model").AiConversationModelDef,
    rate: require("../Entities/AiUsage/AiRate.model").AiRateModelDef,
    displayMessages: service.displayMessages,
  });
}

module.exports = defaultRouter();
module.exports.createAiRouter = createAiRouter;
