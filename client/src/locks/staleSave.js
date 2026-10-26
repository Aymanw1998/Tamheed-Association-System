import React from "react";

const LOCKED_MESSAGE = "هذا العنصر مفتوح الآن لدى مستخدم آخر";

// Sends the version the user opened, so the server can refuse an older one.
export function withBaseVersion(body, openedDoc) {
  return { ...body, baseVersion: openedDoc?.updatedAt };
}

function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) return Promise.resolve(navigator.clipboard.writeText(text)).catch(() => {});
  } catch {}
  return Promise.resolve();
}

// The user's draft, read-only, with «نسخ»; onReload adds «تحميل أحدث نسخة»
// (the screen reads the item again; the draft stays here to copy).
export function StaleNotice({ message, draft, onReload }) {
  return React.createElement(
    "div",
    { role: "alert" },
    React.createElement("p", null, message),
    React.createElement("textarea", {
      readOnly: true,
      value: draft || "",
      rows: 6,
      style: { width: "100%", direction: "rtl" },
      "aria-label": "نصّك",
    }),
    React.createElement("button", { type: "button", onClick: () => copyText(draft || "") }, "نسخ"),
    typeof onReload === "function"
      ? React.createElement("button", { type: "button", onClick: () => onReload(), style: { marginInlineStart: 8 } }, "تحميل أحدث نسخة")
      : null
  );
}

// Returns true when it handled the error (409 STALE or 423 LOCKED): the draft
// is left untouched and a notice is passed to setNotice (a string or an element).
export function handleSaveError(err, { draft = "", setNotice, onReload } = {}) {
  const status = err?.response?.status ?? err?.status;
  const data = err?.response?.data ?? err?.data ?? {};
  if (status === 409 && data.code === "STALE") {
    const current = data.current || {};
    const who = current.updatedByName || current.updatedBy?.name || "مستخدم آخر";
    const message = `تم تعديل هذا العنصر من قِبل ${who} أثناء غيابك. نُسخ نصّك أدناه لتحفظه من جديد.`;
    copyText(draft);
    setNotice?.(React.createElement(StaleNotice, { message, draft, onReload }));
    return true;
  }
  if (status === 423) {
    const holder = data.holder;
    const message = holder?.name
      ? `هذا العنصر مفتوح الآن لدى ${holder.name}${holder.tz ? ` (${holder.tz})` : ""}`
      : LOCKED_MESSAGE;
    setNotice?.(message);
    return true;
  }
  return false;
}
