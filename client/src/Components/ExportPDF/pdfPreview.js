// Shows a generated PDF in a full-screen preview before the user decides to
// download or print it. The preview renders the captured page images instead
// of embedding the PDF in an iframe, because mobile browsers (iOS Safari,
// Android Chrome) either can't display inline PDFs or show only page 1.

const PREVIEW_CSS = `
  .pdfpv-overlay{
    position: fixed; inset: 0; z-index: 10000;
    background: rgba(13, 48, 64, .72);
    display: flex; flex-direction: column;
    direction: rtl; font-family: Arial, sans-serif;
  }
  .pdfpv-bar{
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 10px 16px; background: #164d63; color: #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,.25);
  }
  .pdfpv-title{
    flex: 1 1 200px; min-width: 0; font-size: 16px; font-weight: 700;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .pdfpv-btn{
    border: 0; border-radius: 8px; padding: 8px 16px; cursor: pointer;
    font-size: 15px; font-weight: 700; font-family: inherit;
  }
  .pdfpv-btn:focus-visible{ outline: 3px solid #fe9900; outline-offset: 2px; }
  .pdfpv-download{ background: #fe9900; color: #1b2327; }
  .pdfpv-print{ background: #fff; color: #164d63; }
  .pdfpv-close{ background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.5); }
  .pdfpv-scroll{ flex: 1; overflow: auto; padding: 16px; }
  .pdfpv-page{
    display: block; width: 100%; max-width: 794px; height: auto;
    margin: 0 auto 16px; background: #fff; box-shadow: 0 4px 16px rgba(0,0,0,.35);
  }
`;

const PRINT_HTML = (images) => `<!doctype html>
<html><head><meta charset="utf-8"><title>print</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0; padding: 0; }
  img { display: block; width: 210mm; height: 297mm; page-break-after: always; break-after: page; }
  img:last-child { page-break-after: auto; break-after: auto; }
</style></head>
<body>${images.map((src) => `<img src="${src}" alt="">`).join("")}</body></html>`;

const printImages = (images) => {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(frame);

  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(PRINT_HTML(images));
  doc.close();

  const imgs = Array.from(doc.images);
  Promise.all(
    imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })))
  ).then(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    // Remove after the print dialog has had a chance to read the document.
    setTimeout(() => frame.remove(), 60000);
  });
};

/**
 * @param {object} opts
 * @param {import("jspdf").jsPDF} opts.pdf   finished PDF document
 * @param {string[]} opts.images             data URLs of each rendered page
 * @param {string} opts.fileName             file name used for download
 * @param {string} [opts.title]              label shown in the toolbar
 */
export const showPdfPreview = ({ pdf, images, fileName, title }) => {
  const overlay = document.createElement("div");
  overlay.className = "pdfpv-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "معاينة الملف");

  const style = document.createElement("style");
  style.textContent = PREVIEW_CSS;
  overlay.appendChild(style);

  const bar = document.createElement("div");
  bar.className = "pdfpv-bar";

  const label = document.createElement("div");
  label.className = "pdfpv-title";
  label.textContent = title || fileName;

  const makeBtn = (text, cls, onClick) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `pdfpv-btn ${cls}`;
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  };

  const prevOverflow = document.body.style.overflow;
  const close = () => {
    document.removeEventListener("keydown", onKey);
    document.body.style.overflow = prevOverflow;
    overlay.remove();
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
  };

  const downloadBtn = makeBtn("تحميل PDF", "pdfpv-download", () => pdf.save(fileName));
  const printBtn = makeBtn("طباعة", "pdfpv-print", () => printImages(images));
  const closeBtn = makeBtn("إغلاق", "pdfpv-close", close);
  bar.append(label, downloadBtn, printBtn, closeBtn);

  const scroll = document.createElement("div");
  scroll.className = "pdfpv-scroll";
  scroll.addEventListener("click", (e) => {
    if (e.target === scroll) close();
  });
  images.forEach((src, i) => {
    const img = document.createElement("img");
    img.className = "pdfpv-page";
    img.src = src;
    img.alt = `صفحة ${i + 1} من ${images.length}`;
    scroll.appendChild(img);
  });

  overlay.append(bar, scroll);
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", onKey);
  downloadBtn.focus();

  return close;
};
