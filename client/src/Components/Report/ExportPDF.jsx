import html2pdf from "html2pdf.js";

export const exportReportPdf = async (report, user) => {
  const escapeHtml = (str) =>
    String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const safeDate = report?.date ? new Date(report.date) : new Date();
  const fileName = `report-${(report?.stitle ?? "new")
    .toString()
    .replace(/[\\/:*?"<>|]/g, "-")}-${safeDate.getDate()}-${safeDate.getMonth() + 1}-${safeDate.getFullYear()}.pdf`;

  // ✅ HTML فقط للتقرير (بدون أزرار)
  const reportHtml = `
  <div id="pdfRoot">
    <style>
      @page { size: A4; margin: 12mm; }

      body, #pdfRoot{
        font-family: Arial, sans-serif;
        color:#111;
        direction: rtl;
      }

      .wrap{ padding: 2mm; }

      h1{
        text-align:center;
        margin: 0 0 14px;
        font-size: 40px; /* أنسب للـ PDF */
      }

      .meta{
        display:flex;
        justify-content: space-between;
        font-size: 12px;
      }

      .chips{ margin: 12px 0; font-size: 10px; }

      .chip{
        display:inline-block;
        padding:6px 10px;
        border:1px solid #ddd;
        border-radius:999px;
        margin:4px 6px 0 0;
        font-size: 16px;
        background:#f7f7f7;
      }

      .label{
        font-weight:700;
        margin: 12px 0 6px;
        font-size: 20px;
        display:block;
      }

      .info{
        white-space: pre-wrap;
        line-height: 1.8;
        font-size: 18px;
        margin: 12px;
      }

      /* ✅ حل الكلمات الطويلة */
      .info, body, #pdfRoot{
        overflow-wrap:anywhere;
        word-break:break-word;
      }
    </style>

    <div class="wrap">
      
      <div class="meta">
        <div>${escapeHtml(safeDate.toLocaleDateString("en-GB"))}</div>
        <div>
          ${escapeHtml(`${user?.firstname ?? ""} ${user?.lastname ?? ""}`.trim())}
          ${user?.tz ? `(${escapeHtml(user.tz)})` : ""}
        </div>
      </div>
        <br/>
        <h1>${escapeHtml(report?.stitle || "")}</h1>
        <br/>
      <span class="label">عناوين:</span>
      <div class="chips">
        ${(report?.title ?? [])
          .map((t) => `<span class="chip">${escapeHtml(t)}</span>`)
          .join("")}
      </div>
    <br/>
      <span class="label">صلب الموضوع:</span>
      <div class="info">${escapeHtml(report?.info ?? "")}</div>
    </div>
  </div>
  `;

  // ✅ حاوية مؤقتة (مخفية) للتحويل
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = "794px"; // تقريباً عرض A4 بالبكسل على 96dpi
  container.innerHTML = reportHtml;
  document.body.appendChild(container);

  const element = container.querySelector("#pdfRoot");

  // ✅ خيارات PDF
  const opt = {
    margin: [20, 20, 20, 20], // mm تقريبًا (html2pdf يستخدم inches داخليًا، بس هذا جيد)
    filename: fileName,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: {
      scale: 2,          // يرفع الجودة
      useCORS: true,     // لو عندك صور خارجية
      backgroundColor: "#ffffff",
    },
    jsPDF: {
      unit: "mm",
      format: "a4",
      orientation: "portrait",
    },
    pagebreak: { mode: ["css", "legacy"] },
  };

  try {
    await html2pdf().set(opt).from(element).save();
  } finally {
    // ✅ تنظيف
    document.body.removeChild(container);
  }
};
