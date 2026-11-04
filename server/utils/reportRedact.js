// What may leave in a problem report (owner, 2026-11-04): a long number keeps
// only its last four digits, a token never survives.
const MASK = "••••";
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;

const maskLongNumbers = (value) =>
  String(value ?? "").replace(/\d{5,}/g, (digits) => `${MASK}${digits.slice(-4)}`);

// A plain, short, masked text for any field of a report.
function cleanText(value, max = 500) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(JWT, "[مخفي]").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  return maskLongNumbers(text).trim().slice(0, max);
}

// The type a picture really is, from its first bytes; null for anything else.
function imageTypeOf(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 3) return null;
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 12 && buffer.toString("latin1", 0, 4) === "RIFF" && buffer.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

module.exports = { maskLongNumbers, cleanText, imageTypeOf };
