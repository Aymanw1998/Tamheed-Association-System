// פיענוח JWT ללא חבילות + חישוב exp/זמן שנותר

function base64UrlDecode(input) {
  input = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = input.length % 4;
  if (pad) input += '='.repeat(4 - pad);
  return atob(input);
}

// פענוח payload של JWT (בלי ספריות)
function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64)
      .split('')
      .map(c => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`)
      .join('');
    return JSON.parse(decodeURIComponent(json));
  } catch {
    return null;
  }
}

// exp בשניות → מילישניות
export function getAccessExpiryMs(token) {
  const payload = decodeJwtPayload(token);
  return payload?.exp ? payload.exp * 1000 : 0;
}

// true אם הטוקן עדיין תקף (ברירת מחדל עם skew של דקה)
export function isTokenValid(token, skewMs = 60_000) {
  const expMs = getAccessExpiryMs(token);
  if (!expMs) return false;
  return Date.now() + skewMs < expMs;
}

// כמה זמן נשאר עד פקיעה (מילישניות). 0 אם לא תקף/חסר.
export function msUntilExpiry(token) {
  const expMs = getAccessExpiryMs(token);
  return Math.max(0, expMs - Date.now());
}



/** כמה ms נשארו לפני פקיעה (יכול להיות שלילי) */
export function getRemainingMs(token) {
  const expMs = getAccessExpiryMs(token);
  return expMs - Date.now();
}
