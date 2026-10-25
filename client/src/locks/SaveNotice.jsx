import React from "react";

// Shows what handleSaveError passed to setNotice: a string (the item is held
// by someone else) or an element (the stale-save notice with the user's draft).
export default function SaveNotice({ notice }) {
  if (!notice) return null;
  if (typeof notice === "string") {
    return (
      <div role="alert" style={{ color: "#b91c1c", margin: "8px 0" }}>
        {notice}
      </div>
    );
  }
  return <div style={{ margin: "8px 0" }}>{notice}</div>;
}
