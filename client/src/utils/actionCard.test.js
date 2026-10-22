import {
  ACTION_REASONS, ACTION_TYPES, applyOutcome, canAct, describeCard, disabledReason, effectiveStatus,
  expiryTime, initialActionState, needsConfirm, normalizeCard, outcomeOf, startAction, upsertCards,
} from "./actionCard";
import { assistantStrings } from "../i18n/assistantStrings";

const NOW = Date.parse("2026-10-20T10:00:00Z");
const future = new Date(NOW + 10 * 60 * 1000).toISOString();
const past = new Date(NOW - 1000).toISOString();

const card = (over = {}) => ({
  id: "a1", type: "report",
  summary: { ar: "s" },
  details: { date: "2026-10-20", title: "T", text: "line1\nline2 <b>x</b>" },
  expiresAt: future, ...over,
});

describe("normalizeCard", () => {
  test("keeps a well-formed card and drops bad input", () => {
    expect(normalizeCard(card()).id).toBe("a1");
    expect(normalizeCard(null)).toBeNull();
    expect(normalizeCard({ ...card(), id: "" })).toBeNull();
    expect(normalizeCard({ ...card(), type: "delete_everything" })).toBeNull();
    expect(normalizeCard({ ...card(), details: null })).toBeNull();
    expect(normalizeCard({ ...card(), expiresAt: "nope" })).toBeNull();
  });
  test("knows the five types", () => {
    expect([...ACTION_TYPES].sort()).toEqual(["add_student_to_lesson", "approve_user", "attendance", "notice", "report"]);
  });
});

describe("upsertCards", () => {
  test("adds new cards by id and keeps existing ones", () => {
    const list = upsertCards([], [card()]);
    expect(list).toHaveLength(1);
    expect(upsertCards(list, [card({ id: "a1" }), card({ id: "a2" })]).map((c) => c.id)).toEqual(["a1", "a2"]);
    expect(upsertCards(list, [null, { id: "x" }])).toBe(list);
  });
});

describe("state machine", () => {
  test("pending until used", () => {
    const s = initialActionState();
    expect(effectiveStatus(card(), s, NOW)).toBe("pending");
    expect(canAct(card(), s, { streaming: false, now: NOW })).toBe(true);
  });
  test("disabled while the turn is streaming", () => {
    expect(canAct(card(), initialActionState(), { streaming: true, now: NOW })).toBe(false);
    expect(disabledReason(card(), initialActionState(), { streaming: true, now: NOW })).toBe("streaming");
  });
  test("expired by time without a server call", () => {
    const c = card({ expiresAt: past });
    expect(effectiveStatus(c, initialActionState(), NOW)).toBe("expired");
    expect(canAct(c, initialActionState(), { streaming: false, now: NOW })).toBe(false);
    expect(disabledReason(c, initialActionState(), { streaming: false, now: NOW })).toBe("expired");
  });
  test("a done card stays done even after its time passes", () => {
    const s = applyOutcome(startAction(initialActionState(), "approve"), { kind: "done" });
    expect(effectiveStatus(card({ expiresAt: past }), s, NOW)).toBe("done");
  });
  test("approving blocks a second click", () => {
    const s = startAction(initialActionState(), "approve");
    expect(s.status).toBe("approving");
    expect(canAct(card(), s, { streaming: false, now: NOW })).toBe(false);
    expect(startAction(s, "cancel")).toBe(s);
  });
  test("terminal states cannot act", () => {
    for (const kind of ["done", "cancelled", "refused", "expired"]) {
      const s = applyOutcome(startAction(initialActionState(), "approve"), { kind, reason: "FORBIDDEN" });
      expect(s.status).toBe(kind);
      expect(canAct(card(), s, { streaming: false, now: NOW })).toBe(false);
      expect(startAction(s, "approve")).toBe(s);
    }
  });
  test("retry and busy outcomes return to pending", () => {
    const busy = applyOutcome(startAction(initialActionState(), "approve"), { kind: "busy" });
    expect(busy.status).toBe("pending");
    expect(busy.notice).toBe("BUSY");
    const net = applyOutcome(startAction(initialActionState(), "approve"), { kind: "retry", reason: "NETWORK" });
    expect(net.status).toBe("pending");
    expect(net.notice).toBe("NETWORK");
    expect(startAction(net, "approve").notice).toBe("");
  });
  test("confirm only for notice and approve_user", () => {
    expect(needsConfirm("notice")).toBe(true);
    expect(needsConfirm("approve_user")).toBe(true);
    for (const t of ["attendance", "add_student_to_lesson", "report"]) expect(needsConfirm(t)).toBe(false);
  });
});

describe("outcomeOf", () => {
  test("approve", () => {
    expect(outcomeOf("approve", 200, { ok: true, status: "done" })).toEqual({ kind: "done" });
    expect(outcomeOf("approve", 403, { code: "FORBIDDEN" })).toEqual({ kind: "refused", reason: "FORBIDDEN" });
    expect(outcomeOf("approve", 422, { code: "NOT_POSSIBLE" })).toEqual({ kind: "refused", reason: "NOT_POSSIBLE" });
    expect(outcomeOf("approve", 500, { code: "FAILED" })).toEqual({ kind: "refused", reason: "FAILED" });
    expect(outcomeOf("approve", 404, { code: "NOT_FOUND" })).toEqual({ kind: "refused", reason: "NOT_FOUND" });
    expect(outcomeOf("approve", 409, { code: "ALREADY_USED", status: "failed" })).toEqual({ kind: "refused", reason: "ALREADY_USED" });
    expect(outcomeOf("approve", 410, { code: "EXPIRED" })).toEqual({ kind: "expired" });
    expect(outcomeOf("approve", 409, { code: "BUSY" })).toEqual({ kind: "busy" });
  });
  test("cancel", () => {
    expect(outcomeOf("cancel", 200, { ok: true, status: "cancelled" })).toEqual({ kind: "cancelled" });
    expect(outcomeOf("cancel", 410, { code: "EXPIRED" })).toEqual({ kind: "expired" });
  });
  test("ALREADY_USED reports the recorded outcome, never 'not carried out' unless it failed", () => {
    expect(outcomeOf("approve", 409, { code: "ALREADY_USED", status: "done" })).toEqual({ kind: "done" });
    expect(outcomeOf("approve", 409, { code: "ALREADY_USED", status: "cancelled" })).toEqual({ kind: "cancelled" });
    expect(outcomeOf("cancel", 409, { code: "ALREADY_USED", status: "done" })).toEqual({ kind: "done" });
    expect(outcomeOf("approve", 409, { code: "ALREADY_USED", status: "approving" })).toEqual({ kind: "handled" });
    expect(outcomeOf("approve", 409, { code: "ALREADY_USED" })).toEqual({ kind: "handled" });
    expect(outcomeOf("approve", 409, { code: "ALREADY_USED", status: "weird" })).toEqual({ kind: "handled" });
  });
  test("a lost approve answer, then a retry answered 409 done, ends as done", () => {
    let s = startAction(initialActionState(), "approve");
    s = applyOutcome(s, outcomeOf("approve", 0, null));
    expect(s.status).toBe("pending");
    s = startAction(s, "approve");
    s = applyOutcome(s, outcomeOf("approve", 409, { ok: false, code: "ALREADY_USED", status: "done" }));
    expect(s.status).toBe("done");
    expect(s.reason).toBe("");
  });
  test("handled is a final, neutral state", () => {
    const s = applyOutcome(startAction(initialActionState(), "approve"), { kind: "handled" });
    expect(s.status).toBe("handled");
    expect(s.reason).toBe("");
    expect(canAct(card(), s, { streaming: false, now: NOW })).toBe(false);
    expect(startAction(s, "approve")).toBe(s);
  });
  test("only 500 FAILED is final; other 500s stay retryable", () => {
    expect(outcomeOf("approve", 500, { code: "FAILED" })).toEqual({ kind: "refused", reason: "FAILED" });
    expect(outcomeOf("approve", 500, { code: "SERVER_ERROR" })).toEqual({ kind: "retry", reason: "SERVER_ERROR" });
    expect(outcomeOf("approve", 500, {})).toEqual({ kind: "retry", reason: "SERVER_ERROR" });
  });
  test("network, session and unknown failures are retryable, not consumed", () => {
    expect(outcomeOf("approve", 0, { code: "NETWORK" })).toEqual({ kind: "retry", reason: "NETWORK" });
    expect(outcomeOf("approve", 401, {})).toEqual({ kind: "retry", reason: "SESSION" });
    expect(outcomeOf("approve", 429, {})).toEqual({ kind: "retry", reason: "SERVER_ERROR" });
    expect(outcomeOf("approve", 200, null)).toEqual({ kind: "retry", reason: "SERVER_ERROR" });
  });
  test("unknown codes map to a known reason", () => {
    expect(outcomeOf("approve", 422, { code: "WHATEVER" }).reason).toBe("NOT_POSSIBLE");
    expect(outcomeOf("approve", 403, { code: "WHATEVER" }).reason).toBe("FORBIDDEN");
    // Only 500 FAILED is final (fix 3); any other 500 stays retryable.
    expect(outcomeOf("approve", 500, { code: "WHATEVER" })).toEqual({ kind: "retry", reason: "SERVER_ERROR" });
  });
});

describe("describeCard", () => {
  test("report shows the full text unchanged", () => {
    const d = describeCard(card());
    expect(d.fields).toEqual([
      { labelKey: "date", value: "2026-10-20" },
      { labelKey: "title", value: "T" },
      { labelKey: "text", value: "line1\nline2 <b>x</b>", block: true },
    ]);
    expect(d.rows).toEqual([]);
  });
  test("notice shows the full body and the translated severity", () => {
    const body = "x".repeat(1990);
    const c = card({ type: "notice", details: { title: "N", body, severity: "critical" } });
    const d = describeCard(c);
    expect(d.fields.find((f) => f.labelKey === "body").value).toBe(body);
    expect(d.fields.find((f) => f.labelKey === "severity").value).toBe("عاجل");
  });
  test("attendance lists every row with name, status in Arabic, and full note", () => {
    const note = "n".repeat(250);
    const rows = Array.from({ length: 30 }, (_, i) => ({ studentId: `s${i}`, studentName: `Name ${i}`, status: i % 2 ? "غائب" : "حاضر", notes: i === 0 ? note : "" }));
    const c = card({
      type: "attendance",
      details: { lessonId: "l", lessonName: "Math", date: "2026-10-19", rows },
      before: [{ studentId: "s1", status: "حاضر" }],
    });
    const d = describeCard(c);
    expect(d.fields).toEqual([{ labelKey: "lesson", value: "Math" }, { labelKey: "date", value: "2026-10-19" }]);
    expect(d.rows).toHaveLength(30);
    expect(d.rows[0]).toEqual({ id: "s0", name: "Name 0", status: "حاضر", tone: "present", notes: note, before: "" });
    expect(d.rows[1].status).toBe("غائب");
    expect(d.rows[1].tone).toBe("absent");
    expect(d.rows[1].before).toBe("حاضر");
  });
  test("add student shows name when known, else the ID number", () => {
    const c = card({ type: "add_student_to_lesson", details: { lessonId: "l", lessonName: "Math", tz: "123456789", studentName: "Sara" } });
    expect(describeCard(c).fields).toEqual([
      { labelKey: "lesson", value: "Math" }, { labelKey: "student", value: "Sara" }, { labelKey: "tz", value: "123456789" },
    ]);
    const c2 = card({ type: "add_student_to_lesson", details: { lessonId: "l", lessonName: "Math", tz: "123456789", studentName: null } });
    expect(describeCard(c2).fields.map((f) => f.labelKey)).toEqual(["lesson", "tz"]);
  });
  test("approve_user shows name, ID number and the role", () => {
    const c = card({ type: "approve_user", details: { tz: "123456789", name: "Omar", role: "مرشد" } });
    expect(describeCard(c).fields).toEqual([
      { labelKey: "user", value: "Omar" }, { labelKey: "tz", value: "123456789" }, { labelKey: "role", value: "مرشد" },
    ]);
  });
  test("unknown values pass through as plain text; bad details give nothing", () => {
    const c = card({ type: "approve_user", details: { tz: "1", name: "<i>x</i>", role: "weird" } });
    expect(describeCard(c).fields[2].value).toBe("weird");
    expect(describeCard(card({ type: "report", details: null }))).toEqual({ fields: [], rows: [] });
    expect(describeCard(c).fields[0].value).toBe("<i>x</i>");
  });
});

describe("expiryTime", () => {
  test("shows Asia/Jerusalem time (summer UTC+3)", () => {
    expect(expiryTime("2026-07-01T12:00:00Z")).toBe("15:00");
    expect(expiryTime("bad")).toBe("");
  });
});

describe("strings", () => {
  test("every reason, label and state has Arabic text", () => {
    const labels = ["lesson", "date", "student", "tz", "user", "role", "title", "text", "body", "severity", "rows", "before", "name", "status", "notes"];
    const a = assistantStrings.ar.chat.action;
    for (const k of ACTION_REASONS) expect(typeof a.reasons[k]).toBe("string");
    for (const k of labels) expect(typeof a.labels[k]).toBe("string");
    for (const k of ACTION_TYPES) expect(typeof a.types[k]).toBe("string");
    for (const k of ["approve", "cancel", "approving", "done", "cancelled", "refused", "expired", "waiting", "expiresAt", "confirmNotice", "confirmApproveUser", "handled"]) {
      expect(typeof a[k]).toBe("string");
      expect(a[k].length).toBeGreaterThan(0);
    }
    expect(a.busyRetry).toBeUndefined();
  });
});
