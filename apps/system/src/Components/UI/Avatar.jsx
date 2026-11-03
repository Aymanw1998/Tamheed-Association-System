import React, { useEffect, useState } from "react";
import styles from "./Avatar.module.css";

// A small round profile photo; the first letter of the name in a circle when
// there is no photo or it does not load. Self-contained: pass the final src.
export default function Avatar({ src, name = "", size = 36 }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  const box = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (src && !failed) {
    return (
      <img
        className={styles.avatar}
        style={box}
        src={src}
        alt={name}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  const letter = String(name || "").trim()[0] || "؟";
  return (
    <span className={`${styles.avatar} ${styles.letter}`} style={box} aria-hidden="true">
      {letter}
    </span>
  );
}
