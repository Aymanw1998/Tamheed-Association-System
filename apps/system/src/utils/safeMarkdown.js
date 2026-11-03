import { Marked } from "marked";
import DOMPurify from "dompurify";
import { safeLink } from "./alertDisplay";

// The assistant's answers are Markdown. safeMarkdown(text) returns sanitized
// HTML: basic formatting, lists, tables and code. Links are kept only when
// they open one of the app's screens (APP_SCREENS); any other link, /api/...
// included, becomes its plain text.
// No images, iframes, scripts, styles or event handlers. This output is the
// only HTML the chat window renders with dangerouslySetInnerHTML.

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

// Raw HTML in the model's answer (block `html` and inline `tag` tokens) is
// shown as text, never rendered; DOMPurify below is a second line of defence.
const marked = new Marked({
  gfm: true,
  breaks: true,
  async: false,
  renderer: {
    html(token) {
      const raw = typeof token === "object" && token !== null ? token.text ?? token.raw : token;
      return escapeHtml(raw);
    },
  },
});

const ALLOWED_TAGS = [
  "p", "br", "hr", "strong", "b", "em", "i", "del", "s", "u",
  "h1", "h2", "h3", "h4", "h5", "h6", "blockquote",
  "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td",
  "code", "pre", "a",
];
const ALLOWED_ATTR = ["href", "align", "start"];

let purifier = null;
const getPurifier = () => {
  if (!purifier && typeof window !== "undefined") purifier = DOMPurify(window);
  return purifier;
};

// The first path segment of every screen the assistant may link to: mirrors
// the navigate tool's SCREENS (server/services/assistant/tools/navigate.js;
// server/test/assistant-tools.test.js checks the two stay equal). Never /api.
export const APP_SCREENS = ["dashboard", "students", "lessons", "calendar", "reports", "vehicles", "files", "notices", "users", "audit", "profile"];
const SCREEN_SET = new Set(APP_SCREENS);

const isScreenPath = (path) => SCREEN_SET.has(path.split(/[/?#]/)[1] || "");

// "/<screen>..." only; also checked once percent-decoded ("/%5Cevil.com" is refused).
const inAppHref = (href) => {
  const raw = safeLink(typeof href === "string" ? href : "");
  if (!raw || !isScreenPath(raw)) return "";
  let decoded = "";
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return "";
  }
  return safeLink(decoded) && isScreenPath(decoded) ? raw : "";
};

export function safeMarkdown(text) {
  if (typeof text !== "string" || !text.trim()) return "";
  const purify = getPurifier();
  if (!purify || !purify.isSupported) return "";
  const html = marked.parse(text);
  const body = purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    RETURN_DOM: true,
  });
  body.querySelectorAll("a").forEach((link) => {
    const href = inAppHref(link.getAttribute("href"));
    if (href) {
      link.setAttribute("href", href);
    } else {
      link.replaceWith(link.ownerDocument.createTextNode(link.textContent || ""));
    }
  });
  return body.innerHTML;
}
