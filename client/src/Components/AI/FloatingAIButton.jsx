import { useEffect, useMemo, useRef, useState } from "react";
import { chatWithAI } from "../../WebServer/services/ai/functionsAI";
import { useI18n } from "../../i18n/I18nContext";
import styles from "./FloatingAIButton.module.css";

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

const getInitialMessages = (t) => [
  {
    id: "welcome",
    role: "assistant",
    text: t("ai.welcome"),
  },
];

export default function FloatingAIButton() {
  const { dir, language, t } = useI18n();
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [messageLanguage, setMessageLanguage] = useState(language);
  const [panelSize, setPanelSize] = useState(getStoredSize);
  const [messages, setMessages] = useState(() => getInitialMessages(t));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);
  const prompts = t("ai.prompts", []);

  useEffect(() => {
    try {
      localStorage.setItem(SIZE_KEY, panelSize);
    } catch {}
  }, [panelSize]);

  useEffect(() => {
    if (messageLanguage === language) return;
    setMessageLanguage(language);
    setMessages(getInitialMessages(t));
    setError("");
    setInput("");
  }, [language, messageLanguage, t]);

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
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, loading, open]);

  const submitMessage = async (overrideMessage) => {
    const text = String(overrideMessage || input || "").trim();
    if (!text || loading) return;

    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: "user",
        text,
      },
    ]);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const result = await chatWithAI(text, {
        language,
        page: window.location.pathname,
      });
      if (!result?.ok) {
        throw new Error(result?.message || t("ai.errors.response"));
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: result.answer || t("ai.errors.empty"),
        },
      ]);
    } catch (err) {
      const message = err.message || t("ai.errors.connection");
      setError(message);
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          text: message,
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    submitMessage();
  };

  const resetChat = () => {
    setMessages(getInitialMessages(t));
    setError("");
    setInput("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
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
            <span>Tamheed AI</span>
            <h2>{t("ai.title")}</h2>
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
            <button type="button" onClick={resetChat}>{t("common.new")}</button>
            <button type="button" className={styles.closeButton} onClick={() => setOpen(false)} aria-label={t("common.close")}>×</button>
          </div>
        </header>

        <div className={styles.quickPrompts} aria-label="Quick prompts">
          {Array.isArray(prompts) && prompts.map((prompt) => (
            <button type="button" key={prompt} disabled={loading} onClick={() => submitMessage(prompt)}>
              {prompt}
            </button>
          ))}
        </div>

        <div className={styles.messages} aria-live="polite">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`${styles.message} ${message.role === "user" ? styles.userMessage : styles.assistantMessage} ${message.isError ? styles.errorMessage : ""}`}
            >
              <div className={styles.avatar}>{message.role === "user" ? String(t("common.you")).charAt(0) : "AI"}</div>
              <div className={styles.bubble}>
                <span>{message.role === "user" ? t("common.you") : t("ai.assistantName")}</span>
                <p>{message.text}</p>
              </div>
            </article>
          ))}

          {loading && (
            <article className={`${styles.message} ${styles.assistantMessage}`}>
              <div className={styles.avatar}>AI</div>
              <div className={styles.bubble}>
                <span>{t("ai.assistantName")}</span>
                <div className={styles.typingDots} aria-label={t("ai.thinking")}>
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </article>
          )}

          <div ref={messagesEndRef} />
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form className={styles.composer} onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitMessage();
              }
            }}
            placeholder={t("ai.placeholder")}
            rows={3}
          />
          <button type="submit" disabled={!canSend}>
            {loading ? t("common.sending") : t("common.send")}
          </button>
        </form>
      </aside>

      <button
        type="button"
        className={`${styles.floatingButton} ${open ? styles.active : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? t("common.close") : t("ai.open")}
        title={t("ai.title")}
      >
        <span className={styles.icon}>{open ? "×" : "AI"}</span>
        {!open && <span className={styles.pulse} />}
      </button>
    </>
  );
}
