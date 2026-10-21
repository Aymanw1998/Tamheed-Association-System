import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { approveAction, cancelAction, deleteConversation, getAiStatus, getConversation, listConversations, streamChat } from "../../WebServer/services/ai/functionsAI";
import { listAlerts, markAlertRead, markAllAlertsRead } from "../../WebServer/services/alerts/functionsAlerts";
import { openLiveStream } from "../../WebServer/services/live/liveStream";
import { alertText, alertTime, createThrottle, markReadLocal, mergeAlert, mergeAlerts, normalizeAlert, safeLink, severityClass, unreadCount } from "../../utils/alertDisplay";
import { applyStreamEvent, createSendGate, errorKey, finishTurn, mergeFinal, newStreamingMessage, settleTurn, suggestionKeys, toDisplayMessages, toolKey, visibleTabs } from "../../utils/assistantChat";
import { applyOutcome, canAct, initialActionState, needsConfirm, outcomeOf, startAction, upsertCards } from "../../utils/actionCard";
import ActionCard from "./ActionCard";
import { safeMarkdown } from "../../utils/safeMarkdown";
import { canStored } from "../../utils/session";
import { useI18n } from "../../i18n/I18nContext";
import styles from "./FloatingAIButton.module.css";

// The catch-up refetch when the tab regains focus runs at most this often.
const FOCUS_REFETCH_MS = 10 * 1000;
const COPIED_MS = 1600;
// A BUSY answer (the turn is still closing on the server) is retried once.
const BUSY_RETRY_MS = 1500;

const SIZE_KEY = "tamheed_ai_chat_size";

const sizeOptions = [
  { value: "small", label: "S" },
  { value: "medium", label: "M" },
  { value: "large", label: "L" },
  { value: "wide", label: "XL" },
];

const getStoredSize = () => {
  try {
    const stored = localStorage.getItem(SIZE_KEY);
    return sizeOptions.some((item) => item.value === stored) ? stored : "large";
  } catch {
    return "large";
  }
};

const isOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

// Assistant text rendered as sanitized Markdown (safeMarkdown is the only
// HTML this window injects). In-app links open through the router.
function MarkdownText({ text, onNavigate }) {
  const html = useMemo(() => safeMarkdown(text), [text]);
  const onClick = (event) => {
    const link = event.target?.closest?.("a");
    if (!link) return;
    event.preventDefault();
    const path = safeLink(link.getAttribute("href"));
    if (path) onNavigate(path);
  };
  // eslint-disable-next-line react/no-danger
  return <div className={styles.markdown} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function FloatingAIButton() {
  const { dir, language, t } = useI18n();
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [panelSize, setPanelSize] = useState(getStoredSize);
  const navigate = useNavigate();
  const [tab, setTab] = useState("alerts");
  // AI (the chat) can be switched off on the server; alerts stay either way.
  const [aiOn, setAiOn] = useState(false);
  const a = (key) => t(`assistant.${key}`);

  useEffect(() => {
    let alive = true;
    getAiStatus().then((enabled) => {
      if (!alive) return;
      setAiOn(enabled);
      if (enabled) setTab("chat");
    });
    return () => { alive = false; };
  }, []);
  const c = (key) => t(`assistant.chat.${key}`);

  // ---------------- alerts ----------------
  const [alerts, setAlerts] = useState([]);
  const [alertsState, setAlertsState] = useState("loading"); // loading | ready | error
  const badge = unreadCount(alerts);

  const loadAlerts = useCallback(async () => {
    setAlertsState("loading");
    try {
      const fetched = await listAlerts();
      setAlerts((prev) => mergeAlerts(prev, fetched));
      setAlertsState("ready");
    } catch {
      setAlertsState("error");
    }
  }, []);

  // The one live stream of the app: personal alerts arrive here.
  useEffect(() => {
    loadAlerts();
    return openLiveStream({ onAlert: (alert) => setAlerts((prev) => mergeAlert(prev, normalizeAlert(alert))) });
  }, [loadAlerts]);

  // Catch up after a stream gap: when the panel opens and when the tab regains focus.
  useEffect(() => {
    if (open) loadAlerts();
  }, [open, loadAlerts]);

  // Focus can fire many times in a row (alt-tab, devtools): at most once per 10 s.
  const focusThrottleRef = useRef(null);
  if (!focusThrottleRef.current) focusThrottleRef.current = createThrottle(FOCUS_REFETCH_MS);
  useEffect(() => {
    const onFocus = () => focusThrottleRef.current(loadAlerts);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadAlerts]);

  const goTo = (path) => {
    const link = safeLink(path);
    if (!link) return;
    setOpen(false);
    navigate(link);
  };

  const openAlert = (alert) => {
    setAlerts((prev) => markReadLocal(prev, alert.id));
    if (!alert.read) markAlertRead(alert.id).catch(() => {});
    goTo(alert.link);
  };

  const readAll = async () => {
    setAlerts((prev) => markReadLocal(prev));
    try {
      await markAllAlertsRead();
    } catch {
      loadAlerts();
    }
  };

  // ---------------- chat ----------------
  const [online, setOnline] = useState(isOnline);
  const [conversations, setConversations] = useState([]);
  const [listState, setListState] = useState("idle"); // idle | loading | ready | error
  const [showList, setShowList] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [live, setLive] = useState(null); // the assistant message being streamed
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState(""); // an error key for list/delete/open problems
  const [copiedId, setCopiedId] = useState("");
  const [cards, setCards] = useState([]); // proposed actions of the open conversation
  const [cardStates, setCardStates] = useState({});
  const cardStatesRef = useRef({});
  const abortRef = useRef(null);
  const activeIdRef = useRef(null);
  activeIdRef.current = activeId;

  const suggestions = useMemo(() => suggestionKeys(canStored), []);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // A turn still streaming when the app unmounts is stopped, and nothing
  // that resolves afterwards touches state.
  const mountedRef = useRef(true);
  const sendGateRef = useRef(null);
  if (!sendGateRef.current) sendGateRef.current = createSendGate();
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const loadConversations = useCallback(async () => {
    setListState("loading");
    try {
      const list = await listConversations();
      if (!mountedRef.current) return;
      setConversations(list);
      setListState("ready");
    } catch {
      if (mountedRef.current) setListState("error");
    }
  }, []);

  useEffect(() => {
    if (open && tab === "chat") loadConversations();
  }, [open, tab, loadConversations]);

  const focusInput = () => window.setTimeout(() => inputRef.current?.focus(), 0);

  const startNewChat = () => {
    if (sending) return;
    setActiveId(null);
    setMessages([]);
    setCards([]);
    setLive(null);
    setNotice("");
    setShowList(false);
    focusInput();
  };

  const openConversation = async (id) => {
    if (sending) return;
    setShowList(false);
    setNotice("");
    setLive(null);
    setActiveId(id);
    setMessages([]);
    setCards([]);
    setLoadingConversation(true);
    try {
      const conversation = await getConversation(id);
      if (!mountedRef.current || activeIdRef.current !== id) return;
      if (!conversation) {
        setActiveId(null);
        setNotice("errors.NOT_FOUND");
        loadConversations();
        return;
      }
      setMessages(toDisplayMessages(conversation.messages));
      setCards(upsertCards([], conversation.pendingActions));
    } catch {
      if (mountedRef.current && activeIdRef.current === id) setNotice("loadFailed");
    } finally {
      if (mountedRef.current) setLoadingConversation(false);
    }
  };

  const removeConversation = async (conversation) => {
    if (sending) return;
    if (!window.confirm(c("confirmDelete"))) return;
    try {
      await deleteConversation(conversation.id);
      setConversations((prev) => prev.filter((item) => item.id !== conversation.id));
      if (activeIdRef.current === conversation.id) {
        setActiveId(null);
        setMessages([]);
        setCards([]);
        setLive(null);
      }
    } catch {
      setNotice("deleteFailed");
    }
  };

  const errorText = (code) => c(`errors.${errorKey(code)}`);

  // After the turn. Done: show what was stored, which can differ from what
  // streamed (refusal or cut-off notes). Failed or stopped: keep the screen as
  // it is, but forget a new conversation the server removed.
  const syncStored = async (id, finalLive, succeeded) => {
    try {
      const conversation = await getConversation(id);
      if (!mountedRef.current || activeIdRef.current !== id) return;
      if (!conversation) {
        setActiveId(null);
        activeIdRef.current = null;
        return;
      }
      if (succeeded) setMessages(mergeFinal(toDisplayMessages(conversation.messages), finalLive));
      setCards((prev) => upsertCards(prev, conversation.pendingActions));
    } catch {
      // Keep what streamed on screen.
    }
  };

  const submitMessage = async (override) => {
    const text = String(override ?? input ?? "").trim();
    // The gate is taken before the first await, so a second Enter in the same
    // tick (before `sending` re-renders) cannot start another turn.
    if (!text || !sendGateRef.current.enter()) return;
    try {
      await runTurn(text);
    } finally {
      sendGateRef.current.leave();
    }
  };

  const runTurn = async (text) => {
    setNotice("");
    setShowList(false);
    setInput("");
    setSending(true);
    const userMessage = { id: `u-${Date.now()}`, role: "user", text };
    setMessages((prev) => [...prev, userMessage]);
    let current = newStreamingMessage(`s-${Date.now()}`);
    setLive(current);

    let conversationId = activeIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    // Whatever happens below, the window leaves its sending state: a throw
    // becomes a SERVER_ERROR message (settleTurn / catch), and finally always
    // clears the stop button, the streamed bubble and `sending`.
    let frozenShown = false;
    try {
      const result = await settleTurn(() => streamChat({
        conversationId,
        message: text,
        signal: controller.signal,
        onEvent: (item) => {
          if (!mountedRef.current) return;
          if (item.event === "conversation" && typeof item.data?.id === "string") {
            conversationId = item.data.id;
            setActiveId(item.data.id);
            activeIdRef.current = item.data.id;
            return;
          }
          if (item.event === "action") {
            setCards((prev) => upsertCards(prev, [item.data]));
            return;
          }
          current = applyStreamEvent(current, item);
          setLive(current);
        },
      }));

      abortRef.current = null;
      if (!mountedRef.current) return;
      // Freeze what streamed into the list, then replace it with the stored view.
      const finished = finishTurn(current, result, errorText);
      current = finished.current;
      setMessages((prev) => [...prev, ...finished.frozen]);
      frozenShown = true;
      setLive(null);
      setSending(false);

      if (result.code === "NOT_FOUND") {
        setActiveId(null);
        activeIdRef.current = null;
      } else if (conversationId) {
        await syncStored(conversationId, current, result.ok);
      }
      if (!mountedRef.current) return;
      loadConversations();
      focusInput();
    } catch {
      // Keep what streamed (unless already in the list) and say it failed.
      if (mountedRef.current) {
        const { frozen } = finishTurn({ ...current, errorCode: "SERVER_ERROR" }, { ok: false, code: "SERVER_ERROR" }, errorText);
        setMessages((prev) => [...prev, ...(frozenShown ? frozen.filter((m) => m.isError) : frozen)]);
      }
    } finally {
      abortRef.current = null;
      if (mountedRef.current) {
        setLive(null);
        setSending(false);
      }
    }
  };

  // ---------------- proposed actions ----------------
  const commitCardState = (id, next) => {
    cardStatesRef.current = { ...cardStatesRef.current, [id]: next };
    setCardStates(cardStatesRef.current);
  };

  // After approve/cancel the server added a note to the conversation: fetch
  // it again so the screen matches (any other open cards come back too).
  const refreshCards = async () => {
    const id = activeIdRef.current;
    if (!id) return;
    try {
      const conversation = await getConversation(id);
      if (!mountedRef.current || activeIdRef.current !== id || !conversation) return;
      setCards((prev) => upsertCards(prev, conversation.pendingActions));
    } catch {
      // The card already shows the result.
    }
  };

  const decideCard = async (card, verb) => {
    const before = cardStatesRef.current[card.id] || initialActionState();
    if (sendGateRef.current.busy() || !canAct(card, before, { streaming: false })) return;
    if (verb === "approve" && needsConfirm(card.type)) {
      const text = card.type === "notice" ? c("action.confirmNotice") : c("action.confirmApproveUser");
      if (!window.confirm(text)) return;
    }
    const started = startAction(before, verb);
    commitCardState(card.id, started);
    const send = verb === "approve" ? approveAction : cancelAction;
    let result = await send(card.id);
    let outcome = outcomeOf(verb, result.status, result.body);
    if (outcome.kind === "busy") {
      await new Promise((resolve) => window.setTimeout(resolve, BUSY_RETRY_MS));
      if (!mountedRef.current) return;
      result = await send(card.id);
      outcome = outcomeOf(verb, result.status, result.body);
    }
    if (!mountedRef.current) return;
    commitCardState(card.id, applyOutcome(started, outcome));
    if (outcome.kind !== "busy" && outcome.kind !== "retry") refreshCards();
  };

  const stopStreaming = () => abortRef.current?.abort();

  const copyMessage = async (message) => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId((value) => (value === message.id ? "" : value)), COPIED_MS);
    } catch {}
  };

  const explainAlert = (alert) => {
    if (!sending) startNewChat();
    setInput(`${a("explainPrompt")}${alertText(alert, language)}`);
    setTab("chat");
    focusInput();
  };

  // ---------------- panel ----------------
  useEffect(() => {
    try {
      localStorage.setItem(SIZE_KEY, panelSize);
    } catch {}
  }, [panelSize]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => inputRef.current?.focus(), 180);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open && tab === "chat" && !showList) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, live, open, tab, showList]);

  const canSend = input.trim().length > 0 && !sending;
  const activeTitle = conversations.find((item) => item.id === activeId)?.title || "";

  const renderLinks = (links) =>
    Array.isArray(links) && links.length > 0 && (
      <div className={styles.navButtons}>
        {links.map((link) => (
          <button key={link.path} type="button" onClick={() => goTo(link.path)}>
            {c("open")}: {t(`assistant.chat.screens.${link.screen}`, link.path)}
          </button>
        ))}
      </div>
    );

  const renderMessage = (message) => {
    const isUser = message.role === "user";
    return (
      <article
        key={message.id}
        className={`${styles.message} ${isUser ? styles.userMessage : styles.assistantMessage} ${message.isError ? styles.errorMessage : ""}`}
      >
        <div className={styles.avatar}>{isUser ? String(t("common.you")).charAt(0) : "AI"}</div>
        <div className={styles.bubble}>
          <span>{isUser ? t("common.you") : t("ai.assistantName")}</span>
          {isUser || message.isError ? <p>{message.text}</p> : <MarkdownText text={message.text} onNavigate={goTo} />}
          {renderLinks(message.links)}
          {!isUser && !message.isError && message.text && (
            <button type="button" className={styles.copyButton} onClick={() => copyMessage(message)}>
              {copiedId === message.id ? c("copied") : c("copy")}
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <>
      {open && <button type="button" className={styles.backdrop} aria-label={t("common.close")} onClick={() => setOpen(false)} />}

      <aside
        className={`${styles.chatPanel} ${styles[`size_${panelSize}`]} ${open ? styles.chatPanelOpen : ""} ${dir === "ltr" ? styles.ltrPanel : ""}`}
        dir={dir}
        lang={language}
        aria-hidden={!open}
      >
        <header className={styles.panelHeader}>
          <div>
            <h2>{aiOn ? a("title") : a("tabAlerts")}</h2>
            <span className={`${styles.status} ${online ? styles.statusOn : styles.statusOff}`}>
              <i aria-hidden="true" />
              {online ? c("online") : c("offline")}
            </span>
          </div>
          <div className={styles.panelActions}>
            <div className={styles.sizeControls} aria-label="Chat size">
              {sizeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={panelSize === option.value ? styles.sizeActive : ""}
                  onClick={() => setPanelSize(option.value)}
                  title={option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button type="button" className={styles.closeButton} onClick={() => setOpen(false)} aria-label={t("common.close")}>×</button>
          </div>
        </header>

        <div className={styles.tabs} role="tablist">
          {visibleTabs(aiOn).map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              className={tab === name ? styles.tabActive : ""}
              onClick={() => setTab(name)}
            >
              {a(name === "chat" ? "tabChat" : "tabAlerts")}
              {name === "alerts" && badge > 0 && <b className={styles.tabBadge}>{badge}</b>}
            </button>
          ))}
        </div>

        {tab === "alerts" && (
          <section className={styles.alertsPane} aria-label={a("alertsLabel")}>
            <div className={styles.alertsBar}>
              <button type="button" disabled={badge === 0} onClick={readAll}>{a("markAllRead")}</button>
            </div>
            <div className={styles.alertsList}>
              {alertsState === "loading" && alerts.length === 0 && <p className={styles.alertsNote}>{a("loading")}</p>}
              {alertsState === "error" && (
                <p className={styles.alertsNote}>
                  {a("loadFailed")} <button type="button" onClick={loadAlerts}>{a("retry")}</button>
                </p>
              )}
              {alertsState === "ready" && alerts.length === 0 && <p className={styles.alertsNote}>{a("noAlerts")}</p>}
              {alerts.map((alert) => {
                const sev = severityClass(alert.severity);
                return (
                  <article key={alert.id} className={`${styles.alertItem} ${styles[`sev_${sev}`]} ${alert.read ? "" : styles.alertUnread}`}>
                    <button type="button" className={styles.alertMain} onClick={() => openAlert(alert)}>
                      <span className={styles.alertMeta}>
                        <i className={styles.alertDot} aria-hidden="true" />
                        <span>{a(`severity.${sev}`)}</span>
                        <time dateTime={alert.at}>{alertTime(alert.at, language)}</time>
                        {!alert.read && <em>{a("unread")}</em>}
                      </span>
                      <span className={styles.alertText}>{alertText(alert, language)}</span>
                    </button>
                    {aiOn && <button type="button" className={styles.explainButton} disabled={sending} onClick={() => explainAlert(alert)}>{a("explain")}</button>}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {aiOn && tab === "chat" && (
          <section className={styles.chatPane} aria-label={a("tabChat")}>
            <div className={styles.chatBar}>
              <button
                type="button"
                className={showList ? styles.chatBarActive : ""}
                aria-expanded={showList}
                onClick={() => setShowList((value) => !value)}
              >
                {c("conversations")}
              </button>
              <strong className={styles.chatTitle} title={activeTitle}>{activeId ? activeTitle : c("newChat")}</strong>
              <button type="button" disabled={sending} onClick={startNewChat}>+ {c("newChat")}</button>
            </div>

            {showList ? (
              <div className={styles.conversationList}>
                {listState === "loading" && conversations.length === 0 && <p className={styles.alertsNote}>{a("loading")}</p>}
                {listState === "error" && (
                  <p className={styles.alertsNote}>
                    {c("listFailed")} <button type="button" onClick={loadConversations}>{a("retry")}</button>
                  </p>
                )}
                {listState === "ready" && conversations.length === 0 && <p className={styles.alertsNote}>{c("noConversations")}</p>}
                {conversations.map((conversation) => (
                  <div key={conversation.id} className={`${styles.conversationItem} ${conversation.id === activeId ? styles.conversationActive : ""}`}>
                    <button type="button" className={styles.conversationMain} disabled={sending} onClick={() => openConversation(conversation.id)}>
                      <span>{conversation.title || c("untitled")}</span>
                      <time dateTime={conversation.updatedAt}>{alertTime(conversation.updatedAt, language)}</time>
                    </button>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      disabled={sending}
                      onClick={() => removeConversation(conversation)}
                      aria-label={`${c("delete")}: ${conversation.title || c("untitled")}`}
                    >
                      {c("delete")}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.messages} aria-live="polite">
                {loadingConversation && <p className={styles.alertsNote}>{a("loading")}</p>}

                {!loadingConversation && messages.length === 0 && !live && (
                  <div className={styles.emptyChat}>
                    <p>{c("welcome")}</p>
                    <div className={styles.quickPrompts} aria-label={c("suggestionsLabel")}>
                      {suggestions.map((key) => (
                        <button type="button" key={key} disabled={sending} onClick={() => submitMessage(c(`suggest.${key}`))}>
                          {c(`suggest.${key}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map(renderMessage)}

                {cards.map((card) => (
                  <ActionCard
                    key={card.id}
                    card={card}
                    state={cardStates[card.id] || initialActionState()}
                    streaming={sending}
                    onApprove={() => decideCard(card, "approve")}
                    onCancel={() => decideCard(card, "cancel")}
                  />
                ))}

                {live && (
                  <article className={`${styles.message} ${styles.assistantMessage}`}>
                    <div className={styles.avatar}>AI</div>
                    <div className={styles.bubble}>
                      <span>{t("ai.assistantName")}</span>
                      {live.tools.length > 0 && (
                        <div className={styles.toolChips}>
                          {live.tools.map((name) => (
                            <em key={name}>{c("searching")} {c(`tools.${toolKey(name)}`)}…</em>
                          ))}
                        </div>
                      )}
                      {live.text ? (
                        <MarkdownText text={live.text} onNavigate={goTo} />
                      ) : (
                        <div className={styles.typingDots} aria-label={c("thinking")}>
                          <i />
                          <i />
                          <i />
                        </div>
                      )}
                      {renderLinks(live.links)}
                    </div>
                  </article>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}

            {notice && (
              <div className={styles.error} role="alert">
                {c(notice)}
              </div>
            )}

            <form
              className={styles.composer}
              onSubmit={(event) => {
                event.preventDefault();
                submitMessage();
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                maxLength={4000}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submitMessage();
                  }
                }}
                placeholder={t("ai.placeholder")}
                rows={2}
              />
              {sending ? (
                <button type="button" className={styles.stopButton} onClick={stopStreaming}>{c("stop")}</button>
              ) : (
                <button type="submit" disabled={!canSend}>{t("common.send")}</button>
              )}
            </form>
          </section>
        )}
      </aside>

      <button
        type="button"
        data-tour="assistant-button"
        className={`${styles.floatingButton} ${open ? styles.active : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? t("common.close") : a("title")}
        title={a("title")}
      >
        <span className={styles.icon}>{open ? "×" : "AI"}</span>
        {!open && badge === 0 && <span className={styles.pulse} />}
        {!open && badge > 0 && <span className={styles.badge}>{badge > 9 ? "9+" : badge}</span>}
      </button>
    </>
  );
}
