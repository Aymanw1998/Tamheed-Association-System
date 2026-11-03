// The forced password change after login (system account, password older than
// 30 days). Mirrors server/utils/systemPassword.js newPasswordProblem; the
// server still decides.
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

// Null when the length is acceptable, else an error code.
function lengthError(newPassword) {
  const length = String(newPassword).length;
  if (length < MIN_PASSWORD_LENGTH) return "PASSWORD_TOO_SHORT";
  if (length > MAX_PASSWORD_LENGTH) return "PASSWORD_TOO_LONG";
  return null;
}

// Null when the form may be sent, else an error code (keys of passwordChange.errors).
export function newPasswordError({ currentPassword, newPassword, confirmPassword } = {}) {
  if (!currentPassword || !newPassword) return "BAD_INPUT";
  const tooShortOrLong = lengthError(newPassword);
  if (tooShortOrLong) return tooShortOrLong;
  if (newPassword === currentPassword) return "PASSWORD_SAME";
  if (newPassword !== confirmPassword) return "MISMATCH";
  return null;
}

// The reset-by-email form (no current password): same length rule.
export function resetPasswordError({ newPassword, confirmPassword } = {}) {
  if (!newPassword) return "BAD_INPUT";
  const tooShortOrLong = lengthError(newPassword);
  if (tooShortOrLong) return tooShortOrLong;
  if (newPassword !== confirmPassword) return "MISMATCH";
  return null;
}

// The login answer for an expired system password: a token that only
// change-password accepts.
export const isForcedChange = (data) =>
  Boolean(data && data.mustChangePassword === true && data.accessToken);
