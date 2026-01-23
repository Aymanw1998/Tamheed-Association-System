export const exportReportPdf = (report, user) => {
    const escapeHtml = (str) =>
        String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    const html = `<!doctype html>
    <html dir="rtl" lang="ar">
    <head>
    <meta charset="utf-8"/>
    <title>${escapeHtml(report?.stitle || "Report")}</title>
    <style>
        @page { size: A4; margin: 12mm; }

        body{
        font-family: Arial, sans-serif;
        color:#111;
        direction: rtl;
        margin:10;
        }

        .wrap{ padding: 2mm; }

        h1{
        text-align:center;
        margin: 0 0 14px;
        font-size: 50px;
        }

        .meta{
        font-size: 20px;
        margin: 0 0 14px;
        line-height: 1.8;
        }

        .box{
        border:2px solid #080b0fff;
        border-radius:20px;
        padding:14px;
        }

        .chips{
        margin: 20px 0 20px;
        }

        .chip{
        display:inline-block;
        padding:6px 12px;
        border:1px solid #ddd;
        border-radius:999px;
        margin:4px 6px 0 0;
        font-size: 20px;
        background:#f7f7f7;
        }

        .label{
        font-weight:700;
        margin-bottom:8px;
        font-size: 30px;
        display:block;
        }

        .info{
        white-space: pre-wrap;
        margin-right: 30px;
        line-height: 1.8;
        font-size: 20px;
        }

        /* ✅ حل الكلمات الطويلة */
        .info, .box, body{
        overflow-wrap:anywhere;
        word-break:break-word;
        }
    </style>
    </head>
    <body>
    <div class="wrap">
        <h1>${escapeHtml(report?.stitle || "")}</h1>

        <div class="meta">
        <div><b>تاريخ:</b> ${escapeHtml(new Date(report?.date).toLocaleDateString("en-GB"))}</div>
        <div><b>صاحب التقرير:</b> ${escapeHtml(`${user?.firstname ?? ""} ${user?.lastname ?? ""}`.trim())} ${user?.tz ? `(${escapeHtml(user.tz)})` : ""}</div>
        </div>

        <div class="">
        <span class="label">عناوين:</span>
        <div class="chips">
            ${(report?.title ?? []).map(t => `<span class="chip">${escapeHtml(t)}</span>`).join("")}
        </div>

        <span class="label">صلب الموضوع:</span>
        <div class="info">${escapeHtml(report?.info ?? "")}</div>
        </div>
    </div>

    <script>
        window.onload = () => {
        document.title = ${JSON.stringify(`report-${report?._id ?? "new"}`)};
        window.print();
        setTimeout(() => window.close(), 300);
        };
    </script>
    </body>
    </html>`;

    const w = window.open("", "_blank", "width=900,height=1200");
    w.document.open();
    w.document.write(html);
  w.document.close();
};
