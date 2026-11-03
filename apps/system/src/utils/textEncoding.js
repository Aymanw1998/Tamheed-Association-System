// A batch of legacy records (roles, names, etc.) were written to the DB with
// UTF-8 bytes that had already been misread as Latin-1 and re-saved — the
// classic "mojibake" pattern (e.g. "ادارة" became "Ø§Ø¯Ø§Ø±Ø©"). Rather than
// hardcoding every corrupted variant anyone happens to run into, detect the
// pattern generically and reverse the byte reinterpretation.
const MOJIBAKE_PATTERN = /[À-ß][-¿]/;

export function repairMisencodedText(value) {
  if (typeof value !== "string" || !MOJIBAKE_PATTERN.test(value)) return value;

  try {
    const bytes = Uint8Array.from(value, (ch) => ch.charCodeAt(0));
    const repaired = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return repaired || value;
  } catch {
    return value;
  }
}
