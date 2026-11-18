import React, { useState } from "react";
import Button from "../UI/Button";
import { toast } from "../../ALERT/SystemToasts";

// After signing (owner, 2026-11-16): «تنزيل نسخة PDF» of what the parent
// signed. The PDF code loads only on the click.
export default function ConsentCopyButton({ copy }) {
  const [busy, setBusy] = useState(false);
  if (!copy?.signature) return null;
  const download = async () => {
    setBusy(true);
    try {
      const { exportConsentPdf } = await import("../ExportPDF/ExportPDF.jsx");
      await exportConsentPdf(copy);
    } catch {
      toast.warn("تعذّر إنشاء ملف PDF. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };
  return <Button variant="secondary" loading={busy} onClick={download}>تنزيل نسخة PDF</Button>;
}
