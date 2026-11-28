// For search: no tashkeel or tatweel, one alif, ي for ى, ه for ة, lower case.
// A copy of normalizeArabic in server/services/nasheeds.js; keep them the same.
export function normalizeArabic(value) {
  return String(value ?? "")
    .replace(/[ً-ٰٟۖ-ۭـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();
}

// Every text of a nasheed, for search.
export const nasheedText = (nasheed) => [
  nasheed?.title,
  ...(nasheed?.lines || []).flatMap((line) => [line.text, line.sadr, line.ajuz]),
].filter(Boolean).join(" ");

// Words match in any order; spaces in between are loose.
export function matches(nasheed, query) {
  const words = normalizeArabic(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = normalizeArabic(nasheedText(nasheed));
  return words.every((word) => text.includes(word));
}

export const byTitle = (a, b) => String(a.title).localeCompare(String(b.title), "ar");
