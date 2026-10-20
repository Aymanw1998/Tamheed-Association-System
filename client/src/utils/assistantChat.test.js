import { applyStreamEvent, createSendGate, ERROR_KEYS, errorKey, finishTurn, mergeFinal, newStreamingMessage, settleTurn, suggestionKeys, toDisplayMessages, toolKey } from "./assistantChat";
import { assistantStrings } from "../i18n/assistantStrings";

describe("toDisplayMessages", () => {
  test("keeps user and assistant text with stable ids", () => {
    expect(toDisplayMessages([{ role: "user", text: "q" }, { role: "assistant", text: "a" }])).toEqual([
      { id: "h0", role: "user", text: "q" },
      { id: "h1", role: "assistant", text: "a" },
    ]);
  });

  test("never shows system, tool or thinking content raw", () => {
    const stored = [
      { role: "user", content: [{ type: "text", text: "q" }] },
      { role: "system", content: "context: secret" },
      { role: "assistant", content: [{ type: "thinking", thinking: "hmm" }, { type: "tool_use", id: "t", name: "search_students", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "{\"rows\":1}" }] },
      { role: "assistant", content: [{ type: "text", text: "answer" }] },
    ];
    const out = toDisplayMessages(stored);
    expect(out.map((m) => [m.role, m.text])).toEqual([["user", "q"], ["assistant", "answer"]]);
    expect(JSON.stringify(out)).not.toMatch(/secret|hmm|rows/);
  });

  test("bad input gives an empty list and empty texts are skipped", () => {
    expect(toDisplayMessages(null)).toEqual([]);
    expect(toDisplayMessages([{ role: "assistant", text: "  " }, null, { role: "user", text: 5 }])).toEqual([]);
  });
});

describe("applyStreamEvent", () => {
  const base = () => newStreamingMessage("s1");

  test("starts empty and streaming", () => {
    expect(base()).toEqual({ id: "s1", role: "assistant", text: "", tools: [], links: [], streaming: true, errorCode: "" });
  });

  test("delta appends text without mutating the input", () => {
    const m0 = base();
    const m1 = applyStreamEvent(m0, { event: "delta", data: { text: "Hel" } });
    const m2 = applyStreamEvent(m1, { event: "delta", data: { text: "lo" } });
    expect(m2.text).toBe("Hello");
    expect(m0.text).toBe("");
  });

  test("tool adds a chip once per tool name", () => {
    let m = base();
    m = applyStreamEvent(m, { event: "tool", data: { name: "search_students" } });
    m = applyStreamEvent(m, { event: "tool", data: { name: "search_students" } });
    m = applyStreamEvent(m, { event: "tool", data: { name: "list_lessons" } });
    m = applyStreamEvent(m, { event: "tool", data: {} });
    expect(m.tools).toEqual(["search_students", "list_lessons"]);
  });

  test("navigate adds an in-app button and ignores unsafe or repeated paths", () => {
    let m = base();
    m = applyStreamEvent(m, { event: "navigate", data: { screen: "student", id: "1", path: "/students/123" } });
    m = applyStreamEvent(m, { event: "navigate", data: { screen: "student", id: "1", path: "/students/123" } });
    m = applyStreamEvent(m, { event: "navigate", data: { screen: "x", path: "https://evil.com" } });
    m = applyStreamEvent(m, { event: "navigate", data: { screen: "x", path: "//evil.com" } });
    expect(m.links).toEqual([{ screen: "student", path: "/students/123" }]);
  });

  test("done and error stop streaming; error keeps the code", () => {
    expect(applyStreamEvent(base(), { event: "done", data: {} }).streaming).toBe(false);
    const e = applyStreamEvent(base(), { event: "error", data: { code: "AI_BUSY", message: "x" } });
    expect(e.streaming).toBe(false);
    expect(e.errorCode).toBe("AI_BUSY");
    expect(applyStreamEvent(base(), { event: "error", data: {} }).errorCode).toBe("SERVER_ERROR");
  });

  test("unknown and reserved events (action) leave the message unchanged", () => {
    const m = base();
    expect(applyStreamEvent(m, { event: "action", data: { pendingAction: {} } })).toBe(m);
    expect(applyStreamEvent(m, { event: "whatever", data: {} })).toBe(m);
    expect(applyStreamEvent(m, null)).toBe(m);
  });
});

describe("suggestionKeys", () => {
  const can = (...keys) => (key) => keys.includes(key);

  test("admin-like accounts get approvals and vehicles", () => {
    expect(suggestionKeys(can("students.viewAll", "users.approve", "vehicles.view"))).toEqual(["pending", "vehicles", "absentAll", "today"]);
    expect(suggestionKeys(can("users.approve"))).toEqual(["pending", "absentAll", "today"]);
  });

  test("guide-like accounts get their own students", () => {
    expect(suggestionKeys(can("students.view", "students.edit"))).toEqual(["absentMine", "today", "myReports"]);
  });

  test("assistant-like accounts get lessons and reports", () => {
    expect(suggestionKeys(can("students.view"))).toEqual(["today", "myReports", "help"]);
    expect(suggestionKeys(can())).toEqual(["today", "myReports", "help"]);
  });
});

test("errorKey maps known codes and falls back to SERVER_ERROR", () => {
  expect(errorKey("RATE_LIMITED")).toBe("RATE_LIMITED");
  expect(errorKey("NOT_CONFIGURED")).toBe("NOT_CONFIGURED");
  expect(errorKey("NETWORK")).toBe("NETWORK");
  expect(errorKey("SESSION")).toBe("SESSION");
  expect(errorKey("weird")).toBe("SERVER_ERROR");
  expect(errorKey(undefined)).toBe("SERVER_ERROR");
});

test("toolKey maps known tools and falls back to other", () => {
  expect(toolKey("search_students")).toBe("search_students");
  expect(toolKey("navigate")).toBe("navigate");
  expect(toolKey("__proto__")).toBe("other");
  expect(toolKey("nope")).toBe("other");
});

describe("mergeFinal", () => {
  const live = { ...newStreamingMessage("s"), text: "partial", tools: ["search_students"], links: [{ screen: "student", path: "/students/1" }], streaming: false };

  test("uses the stored text and keeps the streamed buttons on the last assistant message", () => {
    const stored = [{ id: "h0", role: "user", text: "q" }, { id: "h1", role: "assistant", text: "final stored text" }];
    expect(mergeFinal(stored, live)).toEqual([
      { id: "h0", role: "user", text: "q" },
      { id: "h1", role: "assistant", text: "final stored text", links: [{ screen: "student", path: "/students/1" }] },
    ]);
  });

  test("leaves stored history alone when the turn had no buttons or ends on a user message", () => {
    const stored = [{ id: "h0", role: "user", text: "q" }, { id: "h1", role: "assistant", text: "a" }];
    expect(mergeFinal(stored, { ...live, links: [] })).toEqual(stored);
    expect(mergeFinal([{ id: "h0", role: "user", text: "q" }], live)).toEqual([{ id: "h0", role: "user", text: "q" }]);
    expect(mergeFinal(stored, null)).toEqual(stored);
  });
});

describe("createSendGate", () => {
  test("lets one send in until it leaves; a second enter in the same tick is refused", () => {
    const gate = createSendGate();
    expect(gate.enter()).toBe(true);
    expect(gate.enter()).toBe(false);
    expect(gate.busy()).toBe(true);
    gate.leave();
    expect(gate.busy()).toBe(false);
    expect(gate.enter()).toBe(true);
  });
});

test("errorKey knows BUSY and CONVERSATION_FULL, and every error key has ar/he/en text", () => {
  expect(errorKey("BUSY")).toBe("BUSY");
  expect(errorKey("CONVERSATION_FULL")).toBe("CONVERSATION_FULL");
  for (const lang of ["ar", "he", "en"]) {
    for (const key of ERROR_KEYS) {
      expect(typeof assistantStrings[lang].chat.errors[key]).toBe("string");
      expect(assistantStrings[lang].chat.errors[key].length).toBeGreaterThan(0);
    }
  }
  expect(assistantStrings.en.chat.errors.CONVERSATION_FULL).toMatch(/new/i);
});

describe("settleTurn", () => {
  test("passes a result through", async () => {
    await expect(settleTurn(async () => ({ ok: true }))).resolves.toEqual({ ok: true });
    await expect(settleTurn(async () => ({ ok: false, code: "BUSY" }))).resolves.toEqual({ ok: false, code: "BUSY" });
  });

  test("a throw or a missing result becomes SERVER_ERROR", async () => {
    await expect(settleTurn(async () => { throw new Error("x"); })).resolves.toEqual({ ok: false, code: "SERVER_ERROR" });
    await expect(settleTurn(() => { throw new Error("sync"); })).resolves.toEqual({ ok: false, code: "SERVER_ERROR" });
    await expect(settleTurn(async () => undefined)).resolves.toEqual({ ok: false, code: "SERVER_ERROR" });
  });
});

describe("finishTurn", () => {
  const errorText = (code) => `text:${code}`;
  const base = { ...newStreamingMessage("s1"), text: "partial", links: [{ screen: "students", path: "/students" }] };

  test("a failed turn keeps what streamed and adds the error message", () => {
    const { current, frozen } = finishTurn(base, { ok: false, code: "BUSY" }, errorText);
    expect(current.streaming).toBe(false);
    expect(current.errorCode).toBe("BUSY");
    expect(frozen).toEqual([
      { id: "s1", role: "assistant", text: "partial", links: base.links },
      { id: "err-s1", role: "assistant", text: "text:BUSY", isError: true },
    ]);
  });

  test("an error event wins over the result code; ABORTED adds no error; an empty turn freezes nothing", () => {
    expect(finishTurn({ ...base, errorCode: "AI_BUSY" }, { ok: false, code: "SERVER_ERROR" }, errorText).frozen[1].text).toBe("text:AI_BUSY");
    expect(finishTurn(base, { ok: false, code: "ABORTED" }, errorText).frozen).toHaveLength(1);
    expect(finishTurn(newStreamingMessage("s2"), { ok: true }, errorText).frozen).toEqual([]);
  });

  test("a missing result is a SERVER_ERROR", () => {
    expect(finishTurn(newStreamingMessage("s3"), undefined, errorText).frozen).toEqual([
      { id: "err-s3", role: "assistant", text: "text:SERVER_ERROR", isError: true },
    ]);
  });
});
