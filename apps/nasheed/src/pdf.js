import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import NasheedLines from "./ui/NasheedLines.jsx";

// The list's PDF (owner, 2026-11-27), built in the browser: A4, right to
// left. The heading first (printed, not stored), then each nasheed with its
// number, title and lines, laid out like the read page. Arabic is drawn by
// html2canvas (as ExportPDF.jsx does in the main system), so the shaping is
// the browser's own.
//
// A4 at 96 dpi; the page is drawn at this CSS size.
export const PAGE = { width: 794, height: 1123, margin: 48 };
const A4_MM = { width: 210, height: 297 };
// What spills past A4 by less than the bottom margin is that margin's white
// space, not a further page.
const MARGIN_MM = (PAGE.margin / PAGE.width) * A4_MM.width;

// Which blocks go on which page: a block that fits on the current page goes
// there; one that fits on an empty page but not here starts a new page; one
// taller than a page gets a page of its own (drawn across as many PDF pages
// as it needs). Every block is placed exactly once, in order.
// With groups (the nasheed each block belongs to, -1 for the list's heading),
// every nasheed starts on a new page (owner, 2026-11-28); the heading stays on
// the page of the first nasheed when they fit together.
export function layoutPages(heights, pageHeight, groups) {
  const pages = [];
  let current = [];
  let used = 0;
  heights.forEach((h, i) => {
    const prev = groups?.[current[current.length - 1]];
    if (groups && current.length && groups[i] !== prev && prev !== -1) {
      pages.push(current);
      current = [];
      used = 0;
    }
    if (h > pageHeight) {
      if (current.length) pages.push(current);
      pages.push([i]);
      current = [];
      used = 0;
      return;
    }
    if (current.length && used + h > pageHeight) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(i);
    used += h;
  });
  if (current.length) pages.push(current);
  return pages;
}

// A nasheed longer than a page (owner, 2026-11-28): its lines are cut into
// page-sized groups, the title in the first. Drawn whole it would be one
// picture several pages tall, which the iPhone's canvas limit draws blank.
// Returns the row indexes of each group, in order, each row once; a group's
// height (the head for the first) stays within the page, except a single row
// taller than a page, which keeps a group of its own.
export function splitRows(rowHeights, headHeight, pageHeight) {
  const groups = [];
  let current = [];
  let used = headHeight;
  rowHeights.forEach((h, i) => {
    if (current.length && used + h > pageHeight) {
      groups.push(current);
      current = [];
      used = 0;
    }
    current.push(i);
    used += h;
  });
  if (current.length) groups.push(current);
  return groups;
}

// The drawn height, unrounded: offsetHeight rounds each line (30.4 → 30), and
// over a page of lines that added a blank page (seen 2026-11-28). The test
// environment draws nothing, so it falls back to offsetHeight there.
function heightOf(el) {
  return el.getBoundingClientRect().height || el.offsetHeight;
}

// A row's height with its own margins (a break has some).
function rowHeight(row) {
  const style = window.getComputedStyle(row);
  const margin = (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
  return heightOf(row) + (String(style.marginTop).endsWith("px") ? margin : 0);
}

// Replaces a block taller than a page, in place, by its page-sized pieces.
function splitBlock(block, pageHeight) {
  const rows = [...block.querySelectorAll(".nl-row")];
  const title = block.querySelector("h2");
  const padding = parseFloat(block.style.paddingBottom) || 0;
  const head = (title ? heightOf(title) + (parseFloat(title.style.marginBottom) || 0) : 0);
  const groups = splitRows(rows.map(rowHeight), head, pageHeight - padding);
  if (groups.length < 2) return;
  groups.forEach((group) => {
    const piece = block.cloneNode(true);
    if (group !== groups[0]) piece.querySelector("h2")?.remove();
    const keep = new Set(group);
    [...piece.querySelectorAll(".nl-row")].forEach((row, i) => { if (!keep.has(i)) row.remove(); });
    block.parentNode.insertBefore(piece, block);
  });
  block.remove();
}

const HEADING = { textAlign: "center", fontSize: "26px", fontWeight: 800, margin: "0 0 18px", color: "#0b2a3a" };
const TITLE = { display: "flex", justifyContent: "center", gap: "0.4em", fontSize: "21px", fontWeight: 700, margin: "0 0 10px", color: "#1d4a63" };
const BLOCK = { padding: "0 0 26px" };

function Blocks({ heading, nasheeds }) {
  return (
    <>
      {heading && <div data-block="-1" style={BLOCK}><h1 style={HEADING}>{heading}</h1></div>}
      {nasheeds.map((n, i) => (
        <div data-block={i} key={i} style={BLOCK}>
          {/* Two boxes, so the number sits on the right of the title: html2canvas
              does not place a number inside Arabic text the way the browser does. */}
          <h2 style={TITLE}><span>{`${i + 1}.`}</span><span>{n.title}</span></h2>
          <NasheedLines lines={n.lines} size={16} />
        </div>
      ))}
    </>
  );
}

const pageStyle = (el) => {
  Object.assign(el.style, {
    width: `${PAGE.width}px`,
    boxSizing: "border-box",
    padding: `${PAGE.margin}px`,
    background: "#ffffff",
    color: "#111111",
    fontFamily: "'IBM Plex Sans Arabic', 'IBM Plex Sans', Arial, sans-serif",
  });
  el.setAttribute("dir", "rtl");
  return el;
};

// One drawn page into the PDF; a drawing taller than A4 continues on the next
// pages (the same image moved up one page height each time).
function addCanvas(doc, canvas, first) {
  const heightMm = (canvas.height / canvas.width) * A4_MM.width;
  // JPEG: a page of words is a few hundred KB instead of several MB as PNG,
  // small enough to send on WhatsApp.
  const image = canvas.toDataURL("image/jpeg", 0.9);
  let offset = 0;
  let isFirst = first;
  do {
    if (!isFirst) doc.addPage();
    doc.addImage(image, "JPEG", 0, -offset, A4_MM.width, heightMm);
    isFirst = false;
    offset += A4_MM.height;
  } while (offset < heightMm - MARGIN_MM);
}

export async function buildNasheedPdf({ heading = "", nasheeds = [] }) {
  // Loaded only when a PDF is made: most visitors only read.
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const root = pageStyle(document.createElement("div"));
  root.setAttribute("data-pdf-root", "");
  Object.assign(root.style, { position: "fixed", top: "0", left: "-10000px", zIndex: "-1" });
  document.body.appendChild(root);
  const react = createRoot(root);
  try {
    flushSync(() => react.render(<Blocks heading={String(heading || "").trim()} nasheeds={nasheeds} />));
    if (document.fonts?.ready) await document.fonts.ready;
    const pageHeight = PAGE.height - 2 * PAGE.margin;
    // Copies, cut here, so the nodes React drew are left as React drew them.
    const work = pageStyle(document.createElement("div"));
    root.querySelectorAll("[data-block]").forEach((b) => work.appendChild(b.cloneNode(true)));
    root.appendChild(work);
    [...work.children].forEach((b) => { if (heightOf(b) > pageHeight) splitBlock(b, pageHeight); });
    const blocks = [...work.children];
    const pages = layoutPages(blocks.map(heightOf), pageHeight, blocks.map((b) => Number(b.dataset.block)));

    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    for (let p = 0; p < pages.length; p += 1) {
      const page = pageStyle(document.createElement("div"));
      pages[p].forEach((i) => page.appendChild(blocks[i].cloneNode(true)));
      root.appendChild(page);
      const canvas = await html2canvas(page, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      root.removeChild(page);
      addCanvas(doc, canvas, p === 0);
    }
    return doc.output("blob");
  } finally {
    react.unmount();
    root.remove();
  }
}

// A name a phone and a computer both accept.
export function pdfFileName(heading, date = new Date()) {
  const clean = String(heading || "").replace(/\s*[\\/:*?"<>|]+\s*/g, " - ").replace(/\s+/g, " ").trim().slice(0, 80);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `أناشيد - ${clean || `${dd}-${mm}-${date.getFullYear()}`}.pdf`;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// The phone's share sheet (WhatsApp and the rest) when it can share files,
// otherwise a download. "cancelled" when the user closed the share sheet.
export async function sharePdf(blob, filename) {
  const file = new File([blob], filename, { type: "application/pdf" });
  if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
    }
  }
  download(blob, filename);
  return "downloaded";
}

// Opens the PDF in a new tab to print; a blocked tab downloads it instead.
export function printPdf(blob, filename) {
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank");
  if (!opened) { URL.revokeObjectURL(url); download(blob, filename); return "downloaded"; }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return "opened";
}
