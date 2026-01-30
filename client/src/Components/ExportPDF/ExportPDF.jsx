import html2pdf from "html2pdf.js";

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

/* =======================
   Base PDF Template
======================= */
const displayPhoneLocal = (val) => {
  if (!val) return '';
  let v = String(val);
  if (v.startsWith('+972')) v = '0' + v.slice(4);
  return v.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3'); // 05x-xxx-xxxx
};

export const exportCardPdf = async ({
  title,
  date,
  ownerLine,
  info = [], // [{ key, value }]
  fileNameBase,
}) => {
  const safeDate = date ? new Date(date) : new Date();
  const fileName = `${safeFile(fileNameBase)}.pdf`;

  const html = `
  <div id="pdfRoot">
    <style>
      @page { size: A4; margin: 12mm; }

      #pdfRoot{
        width: 210mm;
        font-family: Arial, sans-serif;
        color:#111;
        direction: rtl;
      }

      .wrap{ padding: 2mm; }

      h1{
        text-align:center;
        margin: 12mm 0 8mm;
        font-size: 38px;
        font-weight: 800;
      }

      .meta{
        display:flex;
        flex-direction: row-reverse;
        justify-content: space-between;
        font-size: 12px;
        opacity: .85;
        margin-top: 2mm;
      }

      /* ===== TABLE ===== */

      .info{
        margin-top: 10mm;
        display: flex;
        justify-content: center;
        font-size: 14px;
      }

      .info table{
        width: 80%;
        border-collapse: collapse;
      }

      .info th,
      .info td{
        border: 1px solid #d1d5db;
        padding: 8px 12px;
        text-align: right;
        vertical-align: top;
      }

      .info th{
        width: 30%;
        background: #f3f4f6;
        font-weight: 700;
        white-space: nowrap;
      }

      .info td{
        width: 70%;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
    </style>

    <div class="wrap">
      <div class="meta">
        <div>${esc(safeDate.toLocaleDateString("en-GB"))}</div>
        <div>أُخرِج عن طريق: ${esc(ownerLine || "-")}</div>
      </div>

      <h1>${esc(title || "")}</h1>

      <div class="info">
        <table>
          <tbody>
            ${
              Array.isArray(info)
                ? info
                    .map(
                      (r) => `
                      <tr>
                        <th>${esc(r.key)}</th>
                        <td>${esc(r.value)}</td>
                      </tr>
                    `
                    )
                    .join("")
                : ""
            }
          </tbody>
        </table>
      </div>
    </div>
  </div>
  `;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.innerHTML = html;
  document.body.appendChild(container);

  const element = container.querySelector("#pdfRoot");

  const opt = {
    filename: fileName,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
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
    document.body.removeChild(container);
  }
};

/* =======================
   USER PDF
======================= */

export const exportUserPdf = async (u) => {
  const info = [
    { key: "رقم الهوية", value: u?.tz || "-" },
    { key: "الاسم", value: `${u?.firstname || ""} ${u?.lastname || ""}`.trim() },
    { key: "الدور", value: (u?.roles ?? []).join(", ") || "-" },
    { key: "الحالة", value: u?.room || "-" },
    { key: "الجنس", value: u?.gender || "-" },
    { key: "العمر", value: calcAge(u?.birth_date) || "-" },
    { key: "الهاتف", value: displayPhoneLocal(u?.phone) || "-" },
    { key: "البريد الإلكتروني", value: u?.email || "-" },
    { key: "المدينة", value: u?.city || "-" },
    { key: "الشارع", value: u?.street || "-" },
  ];

  return exportCardPdf({
    title: `ملف المستخدم - ${u?.firstname || ""} ${u?.lastname || ""}`.trim(),
    date: new Date(),
    ownerLine: `${u?.firstname ?? ""} ${u?.lastname ?? ""}`.trim(),
    info,
    fileNameBase: `ملف المستخدم - ${u?.firstname || ""} ${u?.lastname || ""} - ${u?.tz || "noid"}`,
  });
};

/* =======================
   STUDENT PDF
======================= */

export const exportStudentPdf = async (s, teacherName = "") => {
  const info = [
    { key: "رقم الهوية", value: s?.tz || "-" },
    { key: "اسم الطالب", value: `${s?.firstname || ""} ${s?.lastname || ""}`.trim() },
    { key: "الجنس", value: s?.gender || "-" },
    { key: "العمر", value: calcAge(s?.birth_date) || "-" },
    { key: "الصف", value: s?.layer || "-" },
    { key: "المدرسة", value: s?.school || "-" },
    { key: "الهاتف", value: displayPhoneLocal(s?.phone)|| "-" },
    { key: "البريد الإلكتروني", value: s?.email || "-" },
    { key: "المدينة", value: s?.city || "-" },
    { key: "الشارع", value: s?.street || "-" },

    { key: "اسم الأب", value: s?.father_name || "-" },
    { key: "هاتف الأب", value: displayPhoneLocal(s?.father_phone) || "-" },
    { key: "عمل الأب", value: s?.father_work || "-" },

    { key: "اسم الأم", value: s?.mother_name || "-" },
    { key: "هاتف الأم", value: displayPhoneLocal(s?.mother_phone) || "-" },
    { key: "عمل الأم", value: s?.mother_work || "-" },

    { key: "الحالة الصحية", value: s?.health_status || "-" },
    { key: "ملاحظات", value: s?.notes || "-" },

    teacherName ? { key: "المرشد المسؤول", value: teacherName } : null,
  ].filter(Boolean);

  return exportCardPdf({
    title: `ملف الطالب - ${s?.firstname || ""} ${s?.lastname || ""}`.trim(),
    date: new Date(),
    ownerLine: `${s?.firstname ?? ""} ${s?.lastname ?? ""}`.trim(),
    info,
    fileNameBase: `ملف الطالب - ${s?.firstname || ""} ${s?.lastname || ""} - ${s?.tz || "noid"}`,
  });
};
