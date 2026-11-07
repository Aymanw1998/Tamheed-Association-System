const sanitize = require("sanitize-html");
const { formatDateTime } = require("../../shared/dateFormat");
let logo = "";
try { logo = `data:image/png;base64,${require("node:fs").readFileSync(require("node:path").join(__dirname, "../../apps/system/src/images/logo.png")).toString("base64")}`; } catch {}
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function reportPdfHtml(report = {}) {
  const info = String(report.info || "");
  if (Buffer.byteLength(info, "utf8") > 2 * 1024 * 1024) throw new Error("PDF_LIMIT");
  const html = sanitize(info, {
    allowedTags: ["p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "h1", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "table", "thead", "tbody", "tr", "td", "th", "hr", "pre", "code"],
    allowedAttributes: { "*": ["dir"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] },
    allowedSchemes: [], disallowedTagsMode: "discard",
  });
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"><style>
    @page{size:A4;margin:22mm 16mm 22mm}*{box-sizing:border-box}body{font-family:Arial,"DejaVu Sans",sans-serif;color:#183b4a;font-size:12pt;line-height:1.7;overflow-wrap:anywhere}
    header{border-bottom:3px solid #1e657b;padding-bottom:12px;margin-bottom:18px}h1{font-size:20pt}h2{font-size:16pt}h3{font-size:14pt}h1,h2,h3,h4{break-after:avoid;page-break-after:avoid}p{orphans:3;widows:3}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{border:1px solid #c9d4d9;padding:6px}thead{display:table-header-group}tr,img{break-inside:avoid}pre{white-space:pre-wrap}blockquote{border-inline-start:3px solid #ddd;padding-inline-start:12px}li{break-inside:avoid}.meta{font-size:10pt;color:#526674}.chips{font-size:10pt;color:#406479}.brandLogo{width:64px;height:64px;object-fit:contain;float:left}
    </style></head><body><header>${logo ? `<img class="brandLogo" src="${logo}" alt="شعار الجمعية">` : ""}<strong>جمعية تمهيد - الرملة</strong><h1>${escape(report.stitle || "تقرير")}</h1><div class="meta"><bdi dir="ltr">${escape(formatDateTime(report.date))}</bdi>${report.authorName ? ` — أُعِدّ بواسطة: ${escape(report.authorName)}` : ""}</div><div class="chips">${(Array.isArray(report.title) ? report.title : []).map(escape).join(" · ")}</div></header><main>${html}</main></body></html>`;
}
module.exports = { reportPdfHtml };
