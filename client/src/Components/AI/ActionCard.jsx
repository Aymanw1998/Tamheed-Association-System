import { useEffect, useState } from "react";
import { canAct, describeCard, disabledReason, effectiveStatus, expiryTime } from "../../utils/actionCard";
import { useI18n } from "../../i18n/I18nContext";
import styles from "./ActionCard.module.css";

// An action the assistant proposed, shown for approval. Everything comes from
// `card.details` and is rendered as React text (never HTML); long text keeps
// its line breaks through CSS (white-space: pre-wrap).
export default function ActionCard({ card, state, streaming, onApprove, onCancel }) {
  const { language, t } = useI18n();
  const x = (key) => t(`assistant.chat.action.${key}`);
  const [now, setNow] = useState(() => Date.now());

  // Re-evaluate the expiry while the card is open and waiting.
  useEffect(() => {
    if (state.status !== "pending") return undefined;
    const left = new Date(card.expiresAt).getTime() - Date.now();
    if (left <= 0) return undefined;
    const id = window.setTimeout(() => setNow(Date.now()), Math.min(left + 50, 2147483000));
    return () => window.clearTimeout(id);
  }, [card.expiresAt, state.status]);

  const status = effectiveStatus(card, state, now);
  const options = { streaming, now };
  const enabled = canAct(card, state, options);
  const why = disabledReason(card, state, options);
  const { fields, rows } = describeCard(card, language);
  const reasonText = state.reason ? x(`reasons.${state.reason}`) : "";

  return (
    <article className={`${styles.card} ${styles[`status_${status}`] || ""}`} aria-label={x("heading")}>
      <header className={styles.head}>
        <span className={styles.kind}>{x(`types.${card.type}`)}</span>
        <span className={styles.heading}>{x("heading")}</span>
      </header>

      <dl className={styles.fields}>
        {fields.map((field) => (
          <div key={field.labelKey} className={field.block ? styles.fieldBlock : styles.field}>
            <dt>{x(`labels.${field.labelKey}`)}</dt>
            <dd className={field.block ? styles.longText : styles.value}>{field.value}</dd>
          </div>
        ))}
      </dl>

      {rows.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{x("labels.name")}</th>
                <th>{x("labels.status")}</th>
                <th>{x("labels.notes")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.id}-${index}`}>
                  <td className={styles.longText}>{row.name}</td>
                  <td>
                    <span className={`${styles.badge} ${styles[`tone_${row.tone}`] || ""}`}>{row.status}</span>
                    {row.before && row.before !== row.status && (
                      <small className={styles.before}>{x("labels.before")}: {row.before}</small>
                    )}
                  </td>
                  <td className={styles.longText}>{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {status === "pending" || status === "approving" ? (
        <footer className={styles.foot}>
          {state.notice && <p className={styles.problem} role="alert">{x(`reasons.${state.notice}`)}</p>}
          {why === "streaming" && <p className={styles.hint}>{x("waiting")}</p>}
          <p className={styles.hint}>{x("expiresAt")} {expiryTime(card.expiresAt, language)}</p>
          <div className={styles.buttons}>
            <button type="button" className={styles.approve} disabled={!enabled} onClick={onApprove}>
              {status === "approving" && state.action === "approve" ? x("approving") : x("approve")}
            </button>
            <button type="button" className={styles.cancel} disabled={!enabled} onClick={onCancel}>
              {status === "approving" && state.action === "cancel" ? x("approving") : x("cancel")}
            </button>
          </div>
        </footer>
      ) : (
        <footer className={styles.foot}>
          <p className={`${styles.result} ${styles[`result_${status}`] || ""}`} role="status">
            {x(status)}
            {status === "refused" && reasonText && <span className={styles.reason}> {reasonText}</span>}
          </p>
          <div className={styles.buttons}>
            <button type="button" className={styles.approve} disabled>{x("approve")}</button>
            <button type="button" className={styles.cancel} disabled>{x("cancel")}</button>
          </div>
        </footer>
      )}
    </article>
  );
}
