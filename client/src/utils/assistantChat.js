import { safeLink } from "./alertDisplay";

// Pure helpers for the assistant's chat tab.

const own = (map, key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(map, key);

// Only the text of a message: a plain `text`, or the text blocks of a stored
// Anthropic `content` array (never tool_use, tool_result or thinking blocks).
const textOf = (message) => {
  if (typeof message?.text === "string") return message.text;
  if (typeof message?.content === "string") return message.content;
  if (Array.isArray(message?.content)) {
    return message.content
      .filter((block) => block?.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("\n\n");
  }
  return "";
};

const isToolResults = (message) =>
  Array.isArray(message?.content) && message.content.length > 0
  && message.content.every((block) => block?.type === "tool_result");

// Stored history -> the messages the window shows: user and assistant text
// only. System context, tool calls, tool results and thinking never show.
// The chat tab exists only while AI is switched on (GET /api/ai/status);
// alerts are not AI and always stay.
export const visibleTabs = (aiOn) => (aiOn === true ? ["chat", "alerts"] : ["alerts"]);

export const toDisplayMessages = (messages) =>
  (Array.isArray(messages) ? messages : [])
    .map((message, index) => {
      if (!message || (message.role !== "user" && message.role !== "assistant")) return null;
      if (message.role === "user" && isToolResults(message)) return null;
      const text = textOf(message);
      if (!text.trim()) return null;
      return { id: `h${index}`, role: message.role, text };
    })
    .filter(Boolean);

export const newStreamingMessage = (id) => ({
  id, role: "assistant", text: "", tools: [], links: [], streaming: true, errorCode: "",
});

// One SSE event applied to the assistant message being streamed. Returns a
// new object when something changed, the same one otherwise.
export const applyStreamEvent = (message, item) => {
  const event = item?.event;
  const data = item?.data && typeof item.data === "object" ? item.data : {};
  switch (event) {
    case "delta":
      return typeof data.text === "string" && data.text ? { ...message, text: message.text + data.text } : message;
    case "tool": {
      const name = typeof data.name === "string" ? data.name : "";
      if (!name || message.tools.includes(name)) return message;
      return { ...message, tools: [...message.tools, name] };
    }
    case "navigate": {
      const path = safeLink(data.path);
      if (!path || message.links.some((link) => link.path === path)) return message;
      return { ...message, links: [...message.links, { screen: String(data.screen || ""), path }] };
    }
    case "done":
      return { ...message, streaming: false };
    case "error":
      return { ...message, streaming: false, errorCode: typeof data.code === "string" && data.code ? data.code : "SERVER_ERROR" };
    default:
      return message;
  }
};

// After a turn the window shows the stored history (the stored text can
// differ from what streamed: refusal or cut-off notes). The screen buttons
// are not stored, so the streamed ones stay on the turn's assistant message.
export const mergeFinal = (stored, live) => {
  const list = Array.isArray(stored) ? stored : [];
  const links = Array.isArray(live?.links) ? live.links : [];
  const last = list[list.length - 1];
  if (!links.length || last?.role !== "assistant") return list;
  return [...list.slice(0, -1), { ...last, links }];
};

// A synchronous guard against a double send (two Enter presses before React
// re-renders with `sending`): enter() is true only for the first caller.
export const createSendGate = () => {
  let busy = false;
  return {
    enter() {
      if (busy) return false;
      busy = true;
      return true;
    },
    leave() {
      busy = false;
    },
    busy: () => busy,
  };
};

// Suggested questions by what the account may do (not by role name).
export const suggestionKeys = (can) => {
  const allowed = (key) => typeof can === "function" && can(key) === true;
  if (allowed("users.approve") || allowed("students.viewAll")) {
    return ["pending", ...(allowed("vehicles.view") ? ["vehicles"] : []), "absentAll", "today"];
  }
  if (allowed("students.edit")) return ["absentMine", "today", "myReports"];
  return ["today", "myReports", "help"];
};

// Every code with a text under assistant.chat.errors.
export const ERROR_KEYS = Object.freeze([
  "INVALID_MESSAGE", "NOT_FOUND", "RATE_LIMITED", "NOT_CONFIGURED", "AI_UNAVAILABLE",
  "AI_BUSY", "AI_ERROR", "SERVER_ERROR", "NETWORK", "FORBIDDEN", "SESSION",
  "BUSY", "CONVERSATION_FULL",
]);
const ERROR_CODES = Object.fromEntries(ERROR_KEYS.map((key) => [key, 1]));
export const errorKey = (code) => (own(ERROR_CODES, code) ? code : "SERVER_ERROR");

const FAILED = Object.freeze({ ok: false, code: "SERVER_ERROR" });

// Runs one turn's request; whatever goes wrong (a throw, no result) becomes a
// SERVER_ERROR result, so the chat window always leaves its sending state.
export const settleTurn = async (run) => {
  try {
    const result = await run();
    return result && typeof result === "object" ? result : { ...FAILED };
  } catch {
    return { ...FAILED };
  }
};

// The end of a turn: the streamed message stops streaming, and `frozen` is
// what stays in the list (what streamed, then the error message if any). An
// error event wins over the result code; a stopped turn (ABORTED) shows none.
export const finishTurn = (live, result, errorText) => {
  const outcome = result && typeof result === "object" ? result : FAILED;
  let current = { ...live, streaming: false };
  if (!outcome.ok && !current.errorCode && outcome.code !== "ABORTED") {
    current = { ...current, errorCode: outcome.code || "SERVER_ERROR" };
  }
  const frozen = [];
  if (current.text.trim() || current.links.length) {
    frozen.push({ id: current.id, role: "assistant", text: current.text, links: current.links });
  }
  if (current.errorCode) {
    frozen.push({ id: `err-${current.id}`, role: "assistant", text: errorText(current.errorCode), isError: true });
  }
  return { current, frozen };
};

const TOOLS = {
  attendance_summary: 1, get_student: 1, list_lessons: 1, my_reports: 1, navigate: 1,
  notices: 1, pending_items: 1, search_students: 1, vehicle_alerts: 1, whoami: 1,
};
export const toolKey = (name) => (own(TOOLS, name) ? name : "other");
