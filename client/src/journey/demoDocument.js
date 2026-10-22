import { closeOnDemoToggle, isDemo } from "./demoMode";

// Training mode: a demo document is shown inside the page. No new tab opens
// and nothing is saved to the device. The dialog also closes when training
// mode starts or stops, so it never outlives the mode it belongs to.
export async function showDemoDocument(blob, name) {
  let text = "";
  try {
    text = typeof blob.text === "function"
      ? await blob.text()
      : await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsText(blob);
      });
  } catch {
    text = "";
  }
  // Training ended while the text was being read: show nothing.
  if (!isDemo()) return () => {};
  const overlay = document.createElement("div");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "معاينة المستند");
  Object.assign(overlay.style, {
    position: "fixed", inset: "0", zIndex: "10000", display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(13, 48, 64, .72)", direction: "rtl", padding: "16px",
  });
  const card = document.createElement("div");
  Object.assign(card.style, {
    background: "#fff", color: "#1b2327", borderRadius: "12px", padding: "20px", maxWidth: "480px", width: "100%",
    boxShadow: "0 8px 24px rgba(0,0,0,.3)", fontFamily: "inherit",
  });
  const heading = document.createElement("h2");
  heading.textContent = name;
  Object.assign(heading.style, { margin: "0 0 12px", fontSize: "18px", color: "#164d63", overflowWrap: "anywhere" });
  const body = document.createElement("p");
  body.textContent = text || "مستند تجريبي.";
  Object.assign(body.style, { margin: "0 0 16px", whiteSpace: "pre-line", lineHeight: "1.7" });
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "إغلاق";
  closeBtn.setAttribute("data-tour", "demo-document-close");
  Object.assign(closeBtn.style, {
    border: "0", borderRadius: "8px", padding: "8px 16px", cursor: "pointer", fontWeight: "700",
    background: "#164d63", color: "#fff", fontFamily: "inherit", fontSize: "15px",
  });

  let cancelToggle = () => {};
  const onKey = (e) => {
    if (e.key === "Escape") close();
  };
  function close() {
    cancelToggle();
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  card.append(heading, body, closeBtn);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  document.addEventListener("keydown", onKey);
  cancelToggle = closeOnDemoToggle(close);
  closeBtn.focus();
  return close;
}
