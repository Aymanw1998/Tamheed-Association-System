// The assistant's chat turn: one user message -> a streamed answer, with the
// Claude tool loop in between (spec, part 1).
//
//   createAssistant({ getClient, conversations, tools, forModel, now, log, maxRounds, historyLimit })
//     -> { isConfigured(), runAssistantTurn({ actor, conversationId?, userText, onEvent, signal? }) }
//   runAssistantTurn / isConfigured   the same on the real client, AiConversations and tool registry
//
// onEvent(type, data) receives, in order:
//   conversation { id, title }      once, before the answer
//   delta { text }                  answer text as it is written
//   tool { name }                   a tool is being run
//   navigate { screen, id, path }   a screen button (the path goes to the browser only)
//   action { pendingAction }        a proposed action card (Task 7)
//   done {}                         the answer is complete and stored
//   error { code, message }         the turn failed (instead of done)
// runAssistantTurn resolves to { ok, code?, conversationId? } and never throws.
//
// History is append-only. A turn's messages are stored only when a round has
// fully completed (the assistant message and, after tool use, every
// tool_result), so a failure never leaves an unanswered tool_use behind
// (Review Focus #5). The user's message and the context system message are
// stored together with the first completed round.
const Anthropic = require("@anthropic-ai/sdk");
const systemPrompt = require("./assistant/systemPrompt");

const MODEL = "claude-opus-5-5";
const MAX_TOKENS = 4000;
const MAX_ROUNDS = 8;
const HISTORY_LIMIT = 40;
const TITLE_LENGTH = 60;
const CLIENT_TIMEOUT_MS = 120 * 1000;
const EPHEMERAL = Object.freeze({ type: "ephemeral" });

const ERRORS = Object.freeze({
  NOT_CONFIGURED: "المساعد غير مفعّل على هذا الخادم حاليًا.",
  NOT_FOUND: "المحادثة غير موجودة.",
  AI_UNAVAILABLE: "المساعد غير متاح حاليًا. أبلغ مدير النظام.",
  AI_BUSY: "المساعد مشغول الآن، حاول بعد قليل.",
  AI_ERROR: "تعذّر الحصول على رد من المساعد، حاول مرة أخرى.",
  SERVER_ERROR: "حدث خطأ غير متوقع، حاول مرة أخرى.",
});
const REFUSAL_TEXT = "عذرًا، لا أستطيع المساعدة في هذا الطلب. هل هناك شيء آخر أستطيع مساعدتك فيه؟";
const MAX_TOKENS_NOTE = "(توقّف الرد لأنه طويل جدًا. اطلب مني المتابعة أو اسأل سؤالًا أدق.)";
const ROUND_LIMIT_NOTE = "توقّفت لأن الطلب احتاج خطوات كثيرة. جرّب سؤالًا أبسط أو أدق.";
const EMPTY_NOTE = "(لا يوجد رد.)";
const INTERRUPTED_NOTE = "(انقطع الرد قبل اكتماله.)";

const textBlock = (text) => ({ type: "text", text });
const isToolResultMessage = (m) =>
  m?.role === "user" && Array.isArray(m.content) && m.content.some((b) => b?.type === "tool_result");
const isUserTurn = (m) => m?.role === "user" && !isToolResultMessage(m);

// The last `limit` messages at most, starting at a user's own message (a turn
// boundary), so no tool_result or context message is cut from its turn.
function trimHistory(messages, limit = HISTORY_LIMIT) {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = Math.max(0, list.length - limit); i < list.length; i++) {
    if (isUserTurn(list[i])) return list.slice(i);
  }
  return [];
}

const textOf = (content) =>
  typeof content === "string"
    ? content
    : (Array.isArray(content) ? content : []).filter((b) => b?.type === "text").map((b) => b.text).join("\n\n");

// What the chat window shows of a stored conversation: the user's messages
// and the assistant's text (one entry per answer); no context, tool calls,
// tool results or thinking.
function displayMessages(messages) {
  const out = [];
  for (const m of Array.isArray(messages) ? messages : []) {
    if (isUserTurn(m)) {
      out.push({ role: "user", text: textOf(m.content) });
    } else if (m?.role === "assistant") {
      const text = textOf(m.content);
      if (!text) continue;
      const last = out.at(-1);
      if (last?.role === "assistant") last.text = `${last.text}\n\n${text}`;
      else out.push({ role: "assistant", text });
    }
  }
  return out;
}

const titleFrom = (text) => String(text).replace(/\s+/g, " ").trim().slice(0, TITLE_LENGTH);
const cleanMessage = (m) => ({ role: m.role, content: m.content });

function errorCode(error) {
  if (error?.code === "NOT_FOUND") return "NOT_FOUND";
  if (error instanceof Anthropic.AuthenticationError) return "AI_UNAVAILABLE";
  if (error instanceof Anthropic.RateLimitError) return "AI_BUSY";
  if (error instanceof Anthropic.APIError) return "AI_ERROR";
  return "SERVER_ERROR";
}

class Aborted extends Error {}
class ConversationGone extends Error { constructor() { super("conversation gone"); this.code = "NOT_FOUND"; } }

function createAssistant({
  getClient,
  conversations,
  tools,
  forModel = require("./assistant/toolRegistry").forModel,
  now = () => new Date(),
  log = () => {},
  maxRounds = MAX_ROUNDS,
  historyLimit = HISTORY_LIMIT,
}) {
  const isConfigured = () => Boolean(getClient());

  // Cache breakpoints on the tools and the static system prompt (stable
  // prefix: tools -> system), plus automatic caching of the conversation.
  function requestParams(messages) {
    const defs = tools.definitions;
    return {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: systemPrompt.STATIC, cache_control: EPHEMERAL }],
      tools: defs.map((d, i) => (i === defs.length - 1 ? { ...d, cache_control: EPHEMERAL } : d)),
      messages: messages.map(cleanMessage),
      output_config: { effort: "low" },
      cache_control: EPHEMERAL,
    };
  }

  async function runAssistantTurn({ actor, conversationId, userText, onEvent = () => {}, signal } = {}) {
    const emit = (type, data = {}) => { if (!signal?.aborted) onEvent(type, data); };
    const fail = (code) => { emit("error", { code, message: ERRORS[code] }); return { ok: false, code }; };

    const client = getClient();
    if (!client) return fail("NOT_CONFIGURED");

    let conversation;
    let created = false;
    let stored = 0;
    let lastStored = null;
    try {
      if (conversationId) {
        conversation = await conversations.findOwn(actor.tz, conversationId);
        if (!conversation) return fail("NOT_FOUND");
      } else {
        conversation = await conversations.create(actor.tz, titleFrom(userText), now());
        created = true;
      }
    } catch (error) {
      log("conversation", { error: String(error?.name || "Error") });
      return fail("SERVER_ERROR");
    }
    const id = String(conversation._id);
    emit("conversation", { id, title: conversation.title || "" });

    const persist = async (messages) => {
      const ok = await conversations.append(actor.tz, id, messages, now());
      if (!ok) throw new ConversationGone();
      stored += messages.length;
      lastStored = messages.at(-1);
    };
    const checkAbort = () => { if (signal?.aborted) throw new Aborted(); };

    const history = trimHistory(conversation.messages, historyLimit);
    // Messages of this turn not yet stored; sent but kept until a round completes.
    let unsaved = [
      { role: "user", content: [textBlock(userText)] },
      { role: "system", content: systemPrompt.context(actor, now()) },
    ];
    const saved = [];

    try {
      for (let round = 1; ; round++) {
        let streamed = false;
        const stream = client.beta.messages.stream(requestParams([...history, ...saved, ...unsaved]), { signal });
        stream.on("text", (delta) => { if (delta) { streamed = true; emit("delta", { text: delta }); } });
        const message = await stream.finalMessage();
        checkAbort();
        const u = message.usage || {};
        log("usage", {
          actor: String(actor.id ?? ""), round, model: message.model, stop_reason: message.stop_reason,
          input_tokens: u.input_tokens, output_tokens: u.output_tokens,
          cache_read_input_tokens: u.cache_read_input_tokens, cache_creation_input_tokens: u.cache_creation_input_tokens,
        });

        // Check refusal before reading the content.
        if (message.stop_reason === "refusal") {
          emit("delta", { text: `${streamed ? "\n\n" : ""}${REFUSAL_TEXT}` });
          await persist([...unsaved, { role: "assistant", content: [textBlock(REFUSAL_TEXT)] }]);
          break;
        }

        const content = Array.isArray(message.content) ? message.content : [];

        // end_turn: the answer is complete.
        if (message.stop_reason === "end_turn") {
          if (!content.length) emit("delta", { text: EMPTY_NOTE });
          await persist([...unsaved, { role: "assistant", content: content.length ? content : [textBlock(EMPTY_NOTE)] }]);
          break;
        }

        if (message.stop_reason !== "tool_use" || !content.some((b) => b.type === "tool_use")) {
          // max_tokens, model_context_window_exceeded, pause_turn, stop_sequence, ...:
          // only the text plus a note, so an unanswered tool_use is never stored
          // (Review Focus #5).
          const note = message.stop_reason === "max_tokens" ? MAX_TOKENS_NOTE : INTERRUPTED_NOTE;
          const texts = content.filter((b) => b.type === "text" && b.text).map((b) => textBlock(b.text));
          emit("delta", { text: `${streamed ? "\n\n" : ""}${note}` });
          await persist([...unsaved, { role: "assistant", content: [...texts, textBlock(note)] }]);
          break;
        }

        // tool_use: run the tools, store the round, then the next round.
        const assistantMessage = { role: "assistant", content }; // every block, unchanged
        const calls = content.filter((b) => b.type === "tool_use");
        const results = await Promise.all(calls.map(async (block) => {
          emit("tool", { name: block.name });
          let result;
          try {
            result = await tools.run(block.name, block.input, actor);
          } catch (error) {
            log("tool", { tool: block.name, error: String(error?.name || "Error") });
            result = { error: "FAILED" };
          }
          if (result?.navigate) {
            const { screen, id: recordId = null, path } = result.navigate;
            emit("navigate", { screen, id: recordId, path });
          }
          if (result?.pendingAction) emit("action", { pendingAction: result.pendingAction });
          const toolResult = { type: "tool_result", tool_use_id: block.id, content: JSON.stringify(forModel(result) ?? null) };
          if (result?.error) toolResult.is_error = true;
          return toolResult;
        }));
        checkAbort();
        const roundMessages = [...unsaved, assistantMessage, { role: "user", content: results }];
        await persist(roundMessages);
        saved.push(...roundMessages);
        unsaved = [];
        if (round >= maxRounds) {
          emit("delta", { text: `\n\n${ROUND_LIMIT_NOTE}` });
          await persist([{ role: "assistant", content: [textBlock(ROUND_LIMIT_NOTE)] }]);
          break;
        }
      }
    } catch (error) {
      const aborted = Boolean(signal?.aborted) || error instanceof Aborted;
      if (!aborted) log("turn failed", { actor: String(actor.id ?? ""), error: String(error?.name || "Error"), status: error?.status });
      // Close a turn that stopped after a stored tool round, so the history
      // never ends on unanswered tool results.
      if (isToolResultMessage(lastStored)) {
        await persist([{ role: "assistant", content: [textBlock(INTERRUPTED_NOTE)] }]).catch(() => {});
      }
      if (created && stored === 0) await conversations.remove(actor.tz, id).catch(() => {});
      if (aborted) return { ok: false, code: "ABORTED", conversationId: id };
      return { ...fail(errorCode(error)), conversationId: id };
    }

    emit("done", {});
    return { ok: true, conversationId: id };
  }

  return { isConfigured, runAssistantTurn };
}

let sharedClient = null;
function defaultClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!sharedClient) sharedClient = new Anthropic({ timeout: CLIENT_TIMEOUT_MS, maxRetries: 1 });
  return sharedClient;
}

let defaultAssistant = null;
function getDefaultAssistant() {
  if (!defaultAssistant) {
    const registry = require("./assistant/toolRegistry");
    const { logWithSource } = require("../middleware/logger");
    defaultAssistant = createAssistant({
      getClient: defaultClient,
      conversations: require("../Entities/AiConversation/AiConversation.model").AiConversationModelDef,
      tools: { definitions: registry.definitions, run: registry.run },
      forModel: registry.forModel,
      log: (...args) => logWithSource("[assistant]", ...args),
    });
  }
  return defaultAssistant;
}

module.exports = {
  createAssistant,
  runAssistantTurn: (args) => getDefaultAssistant().runAssistantTurn(args),
  isConfigured: () => getDefaultAssistant().isConfigured(),
  trimHistory,
  displayMessages,
  MODEL,
  MAX_TOKENS,
  MAX_ROUNDS,
  HISTORY_LIMIT,
  ERRORS,
};
