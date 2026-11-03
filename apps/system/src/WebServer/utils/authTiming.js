// ملاحظة عربية

function base64UrlDecode(input) {
  input = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = input.length % 4;
  if (pad) input += '='.repeat(4 - pad);
  return atob(input);
}

// ملاحظة عربية
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

// ملاحظة عربية
export function getAccessExpiryMs(token) {
  const payload = decodeJwtPayload(token);
  return payload?.exp ? payload.exp * 1000 : 0;
}

// ملاحظة عربية
export function isTokenValid(token, skewMs = 60_000) {
  const expMs = getAccessExpiryMs(token);
  if (!expMs) return false;
  return Date.now() + skewMs < expMs;
}

// ملاحظة عربية
export function msUntilExpiry(token) {
  const expMs = getAccessExpiryMs(token);
  return Math.max(0, expMs - Date.now());
}



/* ملاحظة عربية */
export function getRemainingMs(token) {
  const expMs = getAccessExpiryMs(token);
  return expMs - Date.now();
}
