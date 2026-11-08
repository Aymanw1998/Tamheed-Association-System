import React from "react";
import styles from "./PersonCard.module.css";
import Avatar from "./Avatar.jsx";
import EmptyState from "./EmptyState.jsx";

// Compact card for people lists on phones (students, users). With `onOpen`,
// tapping the main area opens the person; `actions` stay as separate buttons.
export function PersonCardList({ emptyText, emptyHint, emptyIcon = "inbox", children }) {
  const items = React.Children.toArray(children);
  if (!items.length) return <EmptyState compact icon={emptyIcon} title={emptyText} hint={emptyHint} />;
  return <ul className={styles.list}>{items}</ul>;
}

// photo: a profile photo link (an empty one shows the first letter); leave it
// out for a card without photos.
// tour: a journey anchor (data-tour) on the open button.
export default function PersonCard({ initial, photo, name, summary, note, tags, badge, onOpen, actions, tour, background }) {
  const content = (
    <>
      {photo === undefined
        ? <span className={styles.avatar} aria-hidden="true">{initial}</span>
        : <Avatar src={photo} name={name} size={40} />}
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
    <li className={styles.card} style={background ? { background } : undefined}>
      {onOpen ? (
        <button type="button" className={`${styles.main} ${styles.mainButton}`} data-tour={tour} onClick={onOpen}>
          {content}
        </button>
      ) : (
        <div className={styles.main}>{content}</div>
      )}
      {actions && <div className={styles.actions}>{actions}</div>}
    </li>
  );
}
