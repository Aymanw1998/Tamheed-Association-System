// Israeli ID number check: 5 to 9 digits, padded to 9, with the usual
// weighted checksum. Shared by the student form and the roster lookup.
export function isValidIsraeliId(id) {
  const text = String(id ?? "");
  if (!/^\d{5,9}$/.test(text)) return false;
  const padded = text.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(padded[i]) * (i % 2 === 0 ? 1 : 2);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}
