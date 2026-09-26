import React from "react";
import styles from "./PersonCard.module.css";

// Compact card for people lists on phones (students, users). With `onOpen`,
// tapping the main area opens the person; `actions` stay as separate buttons.
export function PersonCardList({ emptyText, children }) {
  const items = React.Children.toArray(children);
  if (!items.length) return <p className={styles.empty}>{emptyText}</p>;
  return <ul className={styles.list}>{items}</ul>;
}

export default function PersonCard({ initial, name, summary, note, tags, badge, onOpen, actions }) {
  const content = (
    <>
      <span className={styles.avatar} aria-hidden="true">{initial}</span>
      <span className={styles.text}>
        <span className={styles.name}>{name}</span>
        {summary && <span className={styles.summary}>{summary}</span>}
        {note && <span className={styles.note}>{note}</span>}
        {tags?.length > 0 && (
          <span className={styles.tags}>
            {tags.map((tag) => (
              <span key={tag} className={styles.tag}>{tag}</span>
            ))}
          </span>
        )}
      </span>
      {badge}
    </>
  );

  return (
    <li className={styles.card}>
      {onOpen ? (
        <button type="button" className={`${styles.main} ${styles.mainButton}`} onClick={onOpen}>
          {content}
        </button>
      ) : (
        <div className={styles.main}>{content}</div>
      )}
      {actions && <div className={styles.actions}>{actions}</div>}
    </li>
  );
}
