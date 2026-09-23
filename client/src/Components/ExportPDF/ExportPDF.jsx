import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import LOGO from "../../images/logo.png";
import { showPdfPreview } from "./pdfPreview.js";

/* =======================
   Helpers
======================= */

const esc = (str) =>
  String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const safeFile = (s) =>
  String(s ?? "file")
    .replace(/[\\/:*?"<>|]/g, "-")
    .trim();

const calcAge = (birthDate) => {
  if (!birthDate) return "";
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return "";
  return new Date().getFullYear() - d.getFullYear();
};

const displayPhoneLocal = (val) => {
  if (!val) return '';
  let v = String(val);
  if (v.startsWith('+972')) v = '0' + v.slice(4);
  return v.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3'); // 05x-xxx-xxxx
};

const initialsOf = (firstname, lastname) => {
  const a = String(firstname ?? "").trim().charAt(0);
  const b = String(lastname ?? "").trim().charAt(0);
  return (a + b).toUpperCase() || "?";
};

/* =======================
   Page template (same look/size/footer as the report template)
======================= */

const PAGE_CSS = `
  .pdf-page{
    width: 210mm;
    height: 297mm;
    position: relative;
    background:#ffffff;
    overflow:hidden;
  }
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

  .title-block{ text-align:center; margin: 3mm 0 4mm; }
  .title-block h1{ font-size: 30px; font-weight:800; margin:0; color:#0d3040; }

  .meta-strip{ display:flex; flex-wrap: wrap; justify-content:center; gap: 3mm; margin: 0 0 6mm; }
  .meta-chip{
    background:#eaf5f9; border:1px solid #cfe6f0; color:#164d63; border-radius: 999px;
    padding: 1.6mm 4mm; font-size: 20px; font-weight:600;
  }

  .continued-head{ display:flex; align-items:center; justify-content:space-between; margin: 0 0 5mm; }
  .continued-title{ font-size: 20px; font-weight:800; color:#0d3040; }

  .profile-row{
    display:flex; align-items:center; gap: 6mm; margin: 0 0 7mm; padding: 5mm;
    background:#f5f7f9; border:1px solid #e3e8ec; border-radius: 4mm;
  }
  .photo-frame{
    flex:none; width: 26mm; height: 26mm; border-radius: 4mm;
    border: 1.2mm solid #fe9900; overflow:hidden; background:#fff;
  }
  .photo-frame img{ width:100%; height:100%; object-fit:cover; display:block; }
  .avatar-fallback{
    width:100%; height:100%; display:flex; align-items:center; justify-content:center;
    background:#cfe6f0; color:#164d63; font-size:30px; font-weight:800;
  }
  .quick-facts{ flex:1; }
  .qf-name{ font-size:30px; font-weight:800; color:#0d3040; margin-bottom: 2.5mm; }
  .qf-badge{
    display:inline-block; background:#fff; border:1px solid #d1d5db; color:#1b2327;
    border-radius: 999px; padding: 1.4mm 3.6mm; font-size: 20px; margin: 0 0 1.5mm 2mm;
  }

  .section{ margin: 0 0 6mm; }
  .section-title{
    display:inline-block; background:#164d63; color:#fff; font-size: 20px; font-weight:700;
    padding: 1.8mm 5mm; border-radius: 2mm 2mm 0 0;
  }
  .section-grid{
    display:grid; grid-template-columns: 1fr 1fr; gap: 2.5mm 4mm;
    border: 1px solid #e3e8ec; border-radius: 0 2mm 2mm 2mm; padding: 4mm; background:#fff;
  }
  .field{ border: 1px solid #e3e8ec; border-radius: 2mm; padding: 2.2mm 3.5mm; background:#fafbfc; }
  .field-full{ grid-column: 1 / -1; }
  .field-label{ font-size: 20px; color:#566268; font-weight:700; margin-bottom: .8mm; }
  .field-value{
    font-size: 20px; color:#1b2327;
    overflow-wrap:anywhere; word-break: break-word; white-space: pre-wrap;
  }

  .doc-footer{ position:absolute; left:10mm; right:10mm; bottom:8mm; }
  .footer-line{ height:1px; background:#000; margin-bottom: 3mm; }
  .footer-row{ display:flex; justify-content: space-between; font-size: 15px; color:#000; }
  .footer-note{ text-align:center; font-size: 15px; color:#000; margin-top: 2mm; }
`;

const letterheadHtml = (docBadge) => `
  <div class="letterhead">
    <div class="brand">
      <div class="brand-logo-wrap"><img src="${LOGO}" alt="شعار الجمعية"/></div>
      <div>
        <div class="brand-name">جمعية تمهيد - الرملة</div>
      </div>
    </div>
    <div class="doc-badge">${esc(docBadge)}</div>
  </div>
  <div class="accent-bar"></div>
`;

const footerHtml = (pageNum, totalPages, generatedAt) => `
  <div class="doc-footer">
    <div class="footer-line"></div>
    <div class="footer-row">
      <span>جمعية تمهيد - الرملة</span>
      <span>${pageNum}/${totalPages}</span>
      <span>${esc(generatedAt)}</span>
    </div>
    <div class="footer-note">هذه الوثيقة صادرة عبر نظام إدارة جمعية تمهيد وتعتبر وثيقة داخلية سرية</div>
  </div>
`;

const sectionHtml = (sec) => `
  <div class="section">
    <div class="section-title">${esc(sec.title)}</div>
    <div class="section-grid">
      ${sec.rows
        .map(
          (r) => `
        <div class="field${r.full ? " field-full" : ""}">
          <div class="field-label">${esc(r.key)}</div>
          <div class="field-value">${esc(r.value)}</div>
        </div>
      `
        )
        .join("")}
    </div>
  </div>
`;

// First page: title, meta chips, photo/quick-facts, then as many sections as fit.
const firstPageBodyHtml = ({ title, dateLabel, docRef, photo, fullName, quickBadges, sectionsHtml }) => `
  <div class="title-block"><h1>${esc(title || "")}</h1></div>
  <div class="meta-strip">
    <span class="meta-chip">تاريخ الإصدار: ${esc(dateLabel)}</span>
    ${docRef ? `<span class="meta-chip">رقم المرجع: ${esc(docRef)}</span>` : ""}
  </div>
  <div class="profile-row">
    <div class="photo-frame">
      ${
        photo
          ? `<img src="${photo}" alt="صورة"/>`
          : `<div class="avatar-fallback">${esc(initialsOf(...String(fullName || "").split(" ")))}</div>`
      }
    </div>
    <div class="quick-facts">
      <div class="qf-name">${esc(fullName || "-")}</div>
      ${quickBadges.filter(Boolean).map((b) => `<span class="qf-badge">${esc(b)}</span>`).join("")}
    </div>
  </div>
  ${sectionsHtml}
`;

// Continuation pages: slim recap header + the next batch of sections.
const continuedPageBodyHtml = ({ title, sectionsHtml }) => `
  <div class="continued-head">
  </div>
  ${sectionsHtml}
`;

// Renders a throwaway page (no sections) to measure how much vertical space
// is available for sections before colliding with the footer, and the exact
// rendered content width to measure section heights against.
const measurePageBudget = (bodyHtmlBuilder, params) => {
  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.left = "-10000px";
  probe.style.top = "0";
  probe.innerHTML = `
    <style>${PAGE_CSS}</style>
    <div class="pdf-page">
      ${letterheadHtml(params.docBadge)}
      <div class="wrap">${bodyHtmlBuilder({ ...params, sectionsHtml: "" })}<div id="chrome-end"></div></div>
      ${footerHtml(1, 1, "00/00/0000 - 00:00:00")}
    </div>
  `;
  document.body.appendChild(probe);

  const wrap = probe.querySelector(".wrap");
  const chromeEnd = probe.querySelector("#chrome-end");
  const footer = probe.querySelector(".doc-footer");

  const width = wrap.getBoundingClientRect().width;
  const chromeBottom = chromeEnd.getBoundingClientRect().top;
  const footerTop = footer.getBoundingClientRect().top;
  const availableHeight = footerTop - chromeBottom - 8; // small safety buffer

  document.body.removeChild(probe);
  return { availableHeight: Math.max(availableHeight, 40), width };
};

// Greedily finds how many sections (from startIdx) fit within maxHeight,
// using a standalone measuring box of the given width.
const fitSectionCount = (measureEl, sections, startIdx, maxHeight) => {
  let count = 0;
  for (let n = startIdx + 1; n <= sections.length; n++) {
    measureEl.innerHTML = sections.slice(startIdx, n).map(sectionHtml).join("");
    if (measureEl.scrollHeight <= maxHeight) count = n - startIdx;
    else break;
  }
  return count === 0 ? 1 : count;
};

/* =======================
   Base PDF Template (letterhead)
======================= */

export const exportCardPdf = async ({
  title,
  docBadge = "وثيقة رسمية",
  date,
  docRef,
  photo = null,
  fullName = "",
  quickBadges = [], // [string]
  sections = [], // [{ title, rows: [{ key, value, full? }] }]
  fileNameBase,
}) => {
  const safeDate = date ? new Date(date) : new Date();
  const fileName = `${safeFile(fileNameBase)}.pdf`;
  const now = new Date();
  const dateLabel = safeDate.toLocaleDateString("en-GB");
  const generatedAt = `${now.toLocaleDateString("en-GB")} - ${now.toLocaleTimeString("en-GB")}`;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  document.body.appendChild(container);

  try {
    const firstBudget = measurePageBudget(firstPageBodyHtml, {
      docBadge,
      title,
      dateLabel,
      docRef,
      photo,
      fullName,
      quickBadges,
    });
    const continuedBudget = measurePageBudget(continuedPageBodyHtml, { docBadge, title });

    const measureEl = document.createElement("div");
    measureEl.style.width = `${firstBudget.width}px`;
    container.appendChild(measureEl);
    const styleTag = document.createElement("style");
    styleTag.textContent = PAGE_CSS;
    container.appendChild(styleTag);

    const pageChunks = []; // [{ isFirst, sections: [...] }]
    let idx = 0;
    if (sections.length === 0) {
      pageChunks.push({ isFirst: true, sections: [] });
    } else {
      let isFirst = true;
      while (idx < sections.length) {
        const budget = isFirst ? firstBudget : continuedBudget;
        measureEl.style.width = `${budget.width}px`;
        const count = fitSectionCount(measureEl, sections, idx, budget.availableHeight);
        pageChunks.push({ isFirst, sections: sections.slice(idx, idx + count) });
        idx += count;
        isFirst = false;
      }
    }

    const totalPages = pageChunks.length;
    const pagesHtml = pageChunks
      .map((chunk, i) => {
        const sectionsHtml = chunk.sections.map(sectionHtml).join("");
        const body = chunk.isFirst
          ? firstPageBodyHtml({ title, dateLabel, docRef, photo, fullName, quickBadges, sectionsHtml })
          : continuedPageBodyHtml({ title, sectionsHtml });
        return `
          <div class="pdf-page">
            ${letterheadHtml(docBadge)}
            <div class="wrap">${body}</div>
            ${footerHtml(i + 1, totalPages, generatedAt)}
          </div>
        `;
      })
      .join("");

    container.innerHTML = `<style>${PAGE_CSS}</style><div id="pdfRoot">${pagesHtml}</div>`;
    const pdfRoot = container.querySelector("#pdfRoot");

    // Capture each .pdf-page as its own canvas and add it as its own PDF
    // page (same approach as the report template) so the page count always
    // matches the number of page blocks exactly, with no blank pages.
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageEls = pdfRoot.querySelectorAll(".pdf-page");
    const images = [];
    for (let i = 0; i < pageEls.length; i++) {
      const canvas = await html2canvas(pageEls[i], {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.98);
      images.push(imgData);
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, 0, 210, 297);
    }
    showPdfPreview({ pdf, images, fileName, title });
  } finally {
    document.body.removeChild(container);
  }
};

/* =======================
   USER PDF
======================= */

export const exportUserPdf = async (u) => {
  const fullName = `${u?.firstname || ""} ${u?.lastname || ""}`.trim();
  const roles = (u?.roles ?? []).join(", ");

  const sections = [
    {
      title: "البيانات الشخصية",
      rows: [
        { key: "رقم الهوية", value: u?.tz || "-" },
        { key: "الجنس", value: u?.gender || "-" },
        { key: "العمر", value: calcAge(u?.birth_date) || "-" },
      ],
    },
    {
      title: "البيانات الوظيفية",
      rows: [
        { key: "الدور", value: roles || "-" },
        { key: "الحالة", value: u?.room || "-" },
      ],
    },
    {
      title: "بيانات التواصل",
      rows: [
        { key: "الهاتف", value: displayPhoneLocal(u?.phone) || "-" },
        { key: "البريد الإلكتروني", value: u?.email || "-", full: true },
        { key: "المدينة", value: u?.city || "-" },
        { key: "الشارع", value: u?.street || "-" },
      ],
    },
  ];

  return exportCardPdf({
    title: `ملف المستخدم - ${fullName}`.trim(),
    docBadge: "ملف مستخدم",
    date: new Date(),
    docRef: u?.tz || "-",
    photo: u?.photo ?? null,
    fullName,
    quickBadges: [roles, u?.room].filter(Boolean),
    sections,
    fileNameBase: `ملف المستخدم - ${fullName} - ${u?.tz || "noid"}`,
  });
};

/* =======================
   STUDENT PDF
======================= */

export const exportStudentPdf = async (s, teacherName = "") => {
  const fullName = `${s?.firstname || ""} ${s?.lastname || ""}`.trim();

  const sections = [
    {
      title: "البيانات الشخصية",
      rows: [
        { key: "رقم الهوية", value: s?.tz || "-" },
        { key: "الجنس", value: s?.gender || "-" },
        { key: "العمر", value: calcAge(s?.birth_date) || "-" },
      ],
    },
    {
      title: "البيانات الدراسية",
      rows: [
        { key: "الصف", value: s?.layer || "-" },
        { key: "المدرسة", value: s?.school || "-" },
        ...(teacherName ? [{ key: "المرشد المسؤول", value: teacherName }] : []),
      ],
    },
    {
      title: "بيانات التواصل",
      rows: [
        { key: "الهاتف", value: displayPhoneLocal(s?.phone) || "-" },
        { key: "البريد الإلكتروني", value: s?.email || "-", full: true },
        { key: "المدينة", value: s?.city || "-" },
        { key: "الشارع", value: s?.street || "-" },
      ],
    },
    {
      title: "بيانات الأب",
      rows: [
        { key: "اسم الأب", value: s?.father_name || "-" },
        { key: "هاتف الأب", value: displayPhoneLocal(s?.father_phone) || "-" },
        { key: "عمل الأب", value: s?.father_work || "-" },
      ],
    },
    {
      title: "بيانات الأم",
      rows: [
        { key: "اسم الأم", value: s?.mother_name || "-" },
        { key: "هاتف الأم", value: displayPhoneLocal(s?.mother_phone) || "-" },
        { key: "عمل الأم", value: s?.mother_work || "-" },
      ],
    },
    {
      title: "معلومات إضافية",
      rows: [
        { key: "الحالة الصحية", value: s?.health_status || "-", full: true },
        { key: "ملاحظات", value: s?.notes || "-", full: true },
      ],
    },
  ];

  return exportCardPdf({
    title: `ملف الطالب - ${fullName}`.trim(),
    docBadge: "ملف طالب",
    date: new Date(),
    docRef: s?.tz || "-",
    photo: s?.photo ?? null,
    fullName,
    quickBadges: [s?.layer, s?.school].filter(Boolean),
    sections,
    fileNameBase: `ملف الطالب - ${fullName} - ${s?.tz || "noid"}`,
  });
};
