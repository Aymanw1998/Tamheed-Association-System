import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import LOGO from "../../images/logo.png";
import { getAll } from "../../WebServer/services/user/functionsUser";
const escapeHtml = (str) =>
  String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const PAGE_CSS = `
  .pdf-page{
    width: 210mm;
    height: 297mm;
    position: relative;
    background:#ffffff;
    overflow:hidden;
    page-break-after: always;
  }
  .pdf-page:last-child{ page-break-after: auto; }

  .pdf-page, .pdf-page *{ box-sizing: border-box; }
  .pdf-page{ font-family: Arial, sans-serif; color:#1b2327; direction: rtl; }

  .letterhead{
    display:flex;
    align-items:center;
    justify-content: space-between;
    background: linear-gradient(135deg, #164d63, #1e6580);
    padding: 6mm 10mm;
  }
.brand{ display:flex; align-items:center; gap: 4mm; }
  .brand-logo-wrap{ width: 16mm; height: 16mm; background:#fff; border-radius: 3mm; padding: 1mm; flex: none; }
  .brand-logo-wrap img{ width:100%; height:100%; object-fit:contain; display:block; }
  .brand-name{ color:#fff; font-size: 25px; font-weight:800; }
  .brand-sub{ color:#cfe6f0; font-size: 20px; margin-top: 1mm; letter-spacing:.3px; }
  .doc-badge{
    color:#fff; border:1px solid rgba(255,255,255,.5); border-radius: 999px;
    padding: 2mm 5mm; font-size: 20px; font-weight:700; white-space:nowrap;
  }
  .accent-bar{ height: 2.2mm; background: linear-gradient(90deg, #fe9900, #d97f00); }

  .wrap{ padding: 6mm 10mm 26mm; }

  h1{ text-align:center; margin: 3mm 0 4mm; font-size: 30px; font-weight: 800; color:#0d3040; }

  .continued-head{ display:flex; align-items:center; justify-content:space-between; margin: 0 0 5mm; }
  .continued-title{ font-size: 20px; font-weight:800; color:#0d3040; }
  .continued-date{ font-size: 14px; color:#566268; }

  .section{ margin-bottom: 6mm; }
  .section-title{
    display:inline-block; background:#164d63; color:#fff; font-size: 25px; font-weight:700;
    padding: 1.8mm 5mm; border-radius: 2mm 2mm 0 0;
  }
  .chips{ border: 1px solid #e3e8ec; border-radius: 0 2mm 2mm 2mm; padding: 4mm; background:#fff; }
  .chip{
    display:inline-block; padding:1.6mm 4mm; border:1px solid #d1d5db; border-radius:999px;
    margin:0 0 1.5mm 2mm; font-size: 20px; background:#f7f7f7;
    overflow-wrap:anywhere; word-break:break-word;
  }
  .info{
    white-space: pre-wrap; line-height: 1.8; font-size: 20px;
    border: 1px solid #000000; border-radius: 0 2mm 2mm 2mm; padding: 4mm; background:#fafbfc;
    overflow-wrap:anywhere; word-break:break-word;
  }

  .doc-footer{ position:absolute; left:10mm; right:10mm; bottom:8mm; }
  .footer-line{ height:1px; background:#000; margin-bottom: 3mm; }
  .footer-row{ display:flex; justify-content: space-between; font-size: 15px; color:#000; }
  .footer-note{ text-align:center; font-size: 15px; color:#000; margin-top: 2mm; }
`;

const letterheadHtml = () => `
  <div class="letterhead">
    <div class="brand">
      <div class="brand-logo-wrap"><img src="${LOGO}" alt="شعار الجمعية"/></div>
      <div>
        <div class="brand-name">جمعية تمهيد - الرملة</div>
      </div>
    </div>
    <div class="doc-badge">تقرير</div>
  </div>
  <div class="accent-bar"></div>
`;

const footerHtml = (pageNum, totalPages, dateLabel, authorLabel) => `
  <div class="doc-footer">
    <div class="footer-line"></div>
    <div class="footer-row">
      <span>جمعية تمهيد - الرملة</span>
      <span>${authorLabel}</span>
      <span>${pageNum}/${totalPages}</span>
      <span>تاريخ الإنشاء: ${escapeHtml(dateLabel)}</span>
    </div>
    <div class="footer-note">هذه الوثيقة صادرة عبر نظام إدارة جمعية تمهيد وتعتبر وثيقة داخلية سرية</div>
  </div>
`;

// First page: full title/chips header, then as much body text as fits.
// Creation date/author now live in the footer (footerHtml) on every page
// instead of a header chip here.
const firstPageBodyHtml = ({ stitle, chips, users, infoChunk }) => `
  <h1>${escapeHtml(stitle || "")}</h1>
  ${chips && chips.length > 0 ? `
    <div class="section">
      <div class="section-title">عناوين ثانوية</div>
      <div class="chips">${chips}</div>
    </div>
  ` : ""}
  ${users && users.length > 0 ? `
    <div class="section">
      <div class="section-title">الحاضرون</div>
      <div class="chips">${users}</div>
    </div>
  ` : ""}
  <div class="section">
    <div class="section-title">صلب الموضوع</div>
    <div class="info">${escapeHtml(infoChunk)}</div>
  </div>
`;

// Continuation pages: slim recap header + the next chunk of body text.
const continuedPageBodyHtml = ({ stitle, dateLabel, infoChunk }) => `
  <div class="section">
    <div class="info">${escapeHtml(infoChunk)}</div>
  </div>
`;

const tokenize = (text) => String(text ?? "").split(/(\s+)/).filter((t) => t.length > 0);

// Renders a throwaway page (empty info box) to measure how much vertical
// space is actually available for body text before it would collide with
// the footer, and the exact rendered width of the info box.
const measurePageBudget = (bodyHtmlBuilder, params) => {
  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.left = "-10000px";
  probe.style.top = "0";
  probe.innerHTML = `
    <style>${PAGE_CSS}</style>
    <div class="pdf-page">
      ${letterheadHtml()}
      <div class="wrap">${bodyHtmlBuilder({ ...params, infoChunk: "" })}</div>
      ${footerHtml(1, 1, params.dateLabel || "00/00/0000 00:00", params.authorLabel || "")}
    </div>
  `;
  document.body.appendChild(probe);

  const page = probe.querySelector(".pdf-page");
  const info = probe.querySelector(".info");
  const footer = probe.querySelector(".doc-footer");

  const infoTop = info.getBoundingClientRect().top;
  const footerTop = footer.getBoundingClientRect().top;
  const width = info.getBoundingClientRect().width;
  const availableHeight = footerTop - infoTop - 8; // small safety buffer
  void page;

  document.body.removeChild(probe);
  return { availableHeight: Math.max(availableHeight, 40), width };
};

// Binary-searches how many tokens (from startIdx) fit within maxHeight,
// using a standalone `.info`-styled measuring box of the given width.
const fitTokenCount = (measureEl, tokens, startIdx, maxHeight) => {
  const remaining = tokens.length - startIdx;
  let lo = 0;
  let hi = remaining;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    measureEl.textContent = tokens.slice(startIdx, startIdx + mid).join("");
    const h = measureEl.scrollHeight;
    if (h <= maxHeight) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 && remaining > 0 ? 1 : lo;
};

export const exportReportPdf = async (report, user) => {
  let users = [];
  try {
    const res = await getAll();
    users = res?.ok ? res.users : [];
  } catch (error) {
    console.error("Error fetching users:", error);
  }

  const safeDate = report?.date ? new Date(report.date) : new Date();
  const fileName = `report-${(report?.stitle ?? "new")
    .toString()
    .replace(/[\\/:*?"<>|]/g, "-")}-${safeDate.getDate()}-${safeDate.getMonth() + 1}-${safeDate.getFullYear()}.pdf`;

  const authorName = `${user?.firstname ?? ""} ${user?.lastname ?? ""}`.trim();
  const dateLabel = `${safeDate.toLocaleDateString("en-GB")} ${safeDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  const authorLabel = `أُعِدّ بواسطة: ${escapeHtml(authorName || "-")}${user?.tz ? ` ${escapeHtml(user.tz)}` : ""}`;
  const chipsHtml = (report?.title ?? []).length
    ? (report?.title ?? []).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("")
    : ``;
  const attendanceIds = report?.attendance ?? [];
  const usersHtml = attendanceIds.length > 0 && users.length > 0
    ? attendanceIds
        .map((_id) => {
          const attendee = users.find((u) => u._id === _id);
          if (!attendee) return "";
          const name = `${attendee.firstname ?? ""} ${attendee.lastname ?? ""}`.trim();
          return `<span class="chip">${escapeHtml(name)}</span>`;
        })
        .filter(Boolean)
        .join("")
    : "";

  // ✅ حاوية مؤقتة (مخفية) لكل عمليات القياس والتحويل
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "0";
  document.body.appendChild(container);

  try {
    const tokens = tokenize(report?.info ?? "");

    const firstBudget = measurePageBudget(firstPageBodyHtml, {
      stitle: report?.stitle,
      dateLabel,
      authorLabel,
      chips: chipsHtml,
      users: usersHtml,
    });
    const continuedBudget = measurePageBudget(continuedPageBodyHtml, {
      stitle: report?.stitle,
      dateLabel,
      authorLabel,
    });

    const measureEl = document.createElement("div");
    measureEl.className = "info";
    measureEl.style.width = `${firstBudget.width}px`;
    container.appendChild(measureEl);
    const styleTag = document.createElement("style");
    styleTag.textContent = PAGE_CSS;
    container.appendChild(styleTag);

    const pageChunks = []; // [{ isFirst, infoChunk }]
    let idx = 0;
    if (tokens.length === 0) {
      pageChunks.push({ isFirst: true, infoChunk: "" });
    } else {
      let isFirst = true;
      while (idx < tokens.length) {
        const budget = isFirst ? firstBudget : continuedBudget;
        measureEl.style.width = `${budget.width}px`;
        const count = fitTokenCount(measureEl, tokens, idx, budget.availableHeight);
        const chunk = tokens.slice(idx, idx + count).join("");
        pageChunks.push({ isFirst, infoChunk: chunk });
        idx += count;
        isFirst = false;
      }
    }

    const totalPages = pageChunks.length;
    const pagesHtml = pageChunks
      .map((chunk, i) => {
        const body = chunk.isFirst
          ? firstPageBodyHtml({ stitle: report?.stitle, dateLabel, authorLabel, chips: chipsHtml, users: usersHtml, infoChunk: chunk.infoChunk })
          : continuedPageBodyHtml({ stitle: report?.stitle, dateLabel, infoChunk: chunk.infoChunk });
        return `
          <div class="pdf-page">
            ${letterheadHtml()}
            <div class="wrap">${body}</div>
            ${footerHtml(i + 1, totalPages, dateLabel, authorLabel)}
          </div>
        `;
      })
      .join("");

    container.innerHTML = `<style>${PAGE_CSS}</style><div id="pdfRoot">${pagesHtml}</div>`;
    const pdfRoot = container.querySelector("#pdfRoot");

    // Capture each .pdf-page as its own canvas and add it as its own PDF
    // page, instead of letting html2pdf stitch one tall canvas and slice it
    // by height. That slicing rounds pxFullHeight/pxPageHeight up (Math.ceil),
    // and since our pages already end exactly on a page boundary, sub-pixel
    // rendering differences push the total just past a multiple and add a
    // stray near-blank final page. Capturing page-by-page sidesteps that.
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageEls = pdfRoot.querySelectorAll(".pdf-page");
    for (let i = 0; i < pageEls.length; i++) {
      const canvas = await html2canvas(pageEls[i], {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.98);
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, 0, 210, 297);
    }
    pdf.save(fileName);
  } finally {
    document.body.removeChild(container);
  }
};
