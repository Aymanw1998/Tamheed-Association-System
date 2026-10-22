import api, { API_BASE_URL, getAuthToken, refreshSession, setAuthTokens } from "../api";
import { createSseParser } from "../../../utils/assistantStream";
import { isDemo } from "../../../journey/demoMode";

// The assistant's chat (/api/ai). POST /chat answers with Server-Sent Events,
// which axios cannot stream in the browser, so it is read through fetch with
// the same access token as `api`; on 401 TOKEN_EXPIRED the token is refreshed
// once (shared refresh) and the request is sent again.
//
//   const result = await streamChat({ conversationId, message, onEvent, signal });
//   result: { ok: true } after `done`, or { ok: false, code } where code is a
//   server code (RATE_LIMITED, NOT_FOUND, BUSY, CONVERSATION_FULL, AI_BUSY, ...),
//   NETWORK (the stream broke), ABORTED (signal) or SESSION (signed out,
//   blocked, locked, or a password change is required), or DEMO (training
//   mode: nothing is sent).

const postChat = (body, signal) => {
  const token = getAuthToken();
  return fetch(`${API_BASE_URL}/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
};

// The JSON body as an object; {} for anything else (no body, null, text).
const readJson = async (response) => {
  try {
    const data = await response.json();
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
};

// Refusals that end the session for this app: the shared api layer decides.
const SESSION_403 = new Set(["BLOCKED", "PASSWORD_CHANGE_REQUIRED"]);

const refreshOnce = async () => {
  try {
    const data = await refreshSession();
    if (!data?.accessToken) return false;
    setAuthTokens(data.accessToken, data.expirationTime);
    try {
      window.dispatchEvent(new CustomEvent("ACCESS_TOKEN_REFRESHED", { detail: { accessToken: data.accessToken } }));
    } catch {}
    return true;
  } catch {
    return false;
  }
};

// Let the shared api layer decide about the session (it signs out when the
// token cannot be refreshed), so there is a single sign-out path.
const handOverSession = () => {
  api.get("/ai/conversations").catch(() => {});
};

const isAbort = (error) => error?.name === "AbortError";

export async function streamChat({ conversationId, message, onEvent, signal } = {}) {
  if (isDemo()) return { ok: false, code: "DEMO" };
  const body = { message: String(message || "").trim() };
  if (conversationId) body.conversationId = conversationId;

  let response;
  try {
    response = await postChat(body, signal);
    if (response.status === 401) {
      const { code } = await readJson(response);
      if (code === "TOKEN_EXPIRED" && (await refreshOnce())) {
        response = await postChat(body, signal);
      }
    }
  } catch (error) {
    return { ok: false, code: isAbort(error) ? "ABORTED" : "NETWORK" };
  }

  if (response.status === 401) {
    handOverSession();
    return { ok: false, code: "SESSION" };
  }
  // 423 is ACCOUNT_LOCKED (permissionMiddleware): like a 401.
  if (response.status === 423) {
    handOverSession();
    return { ok: false, code: "SESSION" };
  }
  if (response.status === 403) {
    const { code } = await readJson(response);
    if (SESSION_403.has(code)) {
      handOverSession();
      return { ok: false, code: "SESSION" };
    }
    return { ok: false, code: typeof code === "string" && code ? code : "FORBIDDEN" };
  }
  const type = response.headers.get("content-type") || "";
  if (!response.ok || !type.includes("text/event-stream") || !response.body) {
    const { code } = await readJson(response);
    return { ok: false, code: typeof code === "string" && code ? code : "SERVER_ERROR" };
  }

  let outcome = null;
  const parser = createSseParser((item) => {
    if (item.event === "done") outcome = { ok: true };
    if (item.event === "error") outcome = { ok: false, code: item.data?.code || "SERVER_ERROR" };
    try {
      if (typeof onEvent === "function") onEvent(item);
    } catch (error) {
      console.error("assistant stream handler error", error);
    }
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
  } catch (error) {
    return outcome || { ok: false, code: isAbort(error) ? "ABORTED" : "NETWORK" };
  }
  return outcome || { ok: false, code: "NETWORK" };
}

// True only when the server says AI is switched on; any error counts as off.
export async function getAiStatus() {
  try {
    const { data } = await api.get("/ai/status");
    return data?.enabled === true;
  } catch {
    return false;
  }
}

export async function listConversations() {
  const { data } = await api.get("/ai/conversations");
  return Array.isArray(data?.result) ? data.result : [];
}

// Resolves to null when the conversation no longer exists (404).
export async function getConversation(id) {
  try {
    const { data } = await api.get(`/ai/conversations/${encodeURIComponent(id)}`);
    return data?.conversation || null;
  } catch (error) {
    if (error?.response?.status === 404) return null;
    throw error;
  }
}

export async function deleteConversation(id) {
  await api.delete(`/ai/conversations/${encodeURIComponent(id)}`);
}

// Approve or cancel an action the assistant proposed. Resolves to
// { status, body } for ANY server answer (409, 410, 403, 422... are normal
// outcomes the card shows), and status 0 when nothing came back (network).
const decideAction = async (id, verb) => {
  try {
    const response = await api.post(`/ai/actions/${encodeURIComponent(id)}/${verb}`);
    return { status: response.status, body: response.data && typeof response.data === "object" ? response.data : {} };
  } catch (error) {
    const response = error?.response;
    if (!response) return { status: 0, body: { code: "NETWORK" } };
    return { status: response.status, body: response.data && typeof response.data === "object" ? response.data : {} };
  }
};

export const approveAction = (id) => decideAction(id, "approve");
export const cancelAction = (id) => decideAction(id, "cancel");
