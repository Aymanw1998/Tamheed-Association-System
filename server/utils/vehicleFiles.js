// Upload checks for vehicle documents. The type is decided from the file's own
// bytes, not from the name or the Content-Type the browser sent.

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const SIGNATURES = [
  { mime: "application/pdf", ext: ".pdf", test: (b) => b.length > 4 && b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { mime: "image/jpeg", ext: ".jpg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/png",
    ext: ".png",
    test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: "image/webp",
    ext: ".webp",
    test: (b) => b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  },
];

// Returns { ok: true, mime, ext } or { ok: false, message }.
function inspectDocument(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, message: "الملف فارغ" };
  }
  if (buffer.length > MAX_DOCUMENT_BYTES) {
    return { ok: false, message: "الملف كبير جدًا. الحد الأقصى 10MB" };
  }
  const match = SIGNATURES.find((signature) => signature.test(buffer));
  if (!match) return { ok: false, message: "نوع الملف غير مسموح. المسموح: PDF أو صورة JPG/PNG/WEBP" };
  return { ok: true, mime: match.mime, ext: match.ext };
}

// A stored name that is safe in a header and on Drive; never trusts the upload.
function buildDocumentName({ plateKey = "", kind = "other", ext = "", now = new Date() }) {
  const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const cleanKind = String(kind).replace(/[^a-z_]/gi, "") || "other";
  const cleanPlate = String(plateKey).replace(/[^A-Z0-9]/gi, "") || "vehicle";
  return `${cleanPlate}_${cleanKind}_${stamp}${ext}`;
}

module.exports = { MAX_DOCUMENT_BYTES, inspectDocument, buildDocumentName };
