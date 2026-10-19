// Failed-login lockout rules. Pure functions: the caller persists the result.
const LOCK_THRESHOLD = 5;
const SYSTEM_ALERT_EVERY = 5;
const LOCKED_MESSAGE =
  "تم حظر الحساب بسبب محاولات دخول فاشلة متكررة. يرجى التوجه إلى قسم تكنولوجيا المعلومات في الجمعية.";

// The system account is never locked: a lock would leave nobody able to unlock others.
function isLocked(user, { isSystem } = {}) {
  if (isSystem) return false;
  return Boolean(user && user.lockedAt);
}

// Decide the outcome from a failure count that was already incremented
// atomically in the database.
function afterFailureCount(count, { isSystem, lockedAt: existingLockedAt = null, now = new Date() } = {}) {
  const failedLoginCount = Number(count) || 0;
  let lockedAt = existingLockedAt || null;
  if (isSystem) {
    lockedAt = null;
  } else if (!lockedAt && failedLoginCount >= LOCK_THRESHOLD) {
    lockedAt = now;
  }
  const alertSystem = Boolean(isSystem) && failedLoginCount > 0 && failedLoginCount % SYSTEM_ALERT_EVERY === 0;
  return { failedLoginCount, lockedAt, alertSystem };
}

function afterFailure(user, { isSystem, now = new Date() } = {}) {
  const failedLoginCount = (Number(user?.failedLoginCount) || 0) + 1;
  let lockedAt = user?.lockedAt || null;
  if (isSystem) {
    lockedAt = null;
  } else if (!lockedAt && failedLoginCount >= LOCK_THRESHOLD) {
    lockedAt = now;
  }
  const alertSystem = Boolean(isSystem) && failedLoginCount > 0 && failedLoginCount % SYSTEM_ALERT_EVERY === 0;
  return { failedLoginCount, lockedAt, alertSystem };
}

function afterSuccess() {
  return { failedLoginCount: 0, lockedAt: null };
}

module.exports = {
  LOCK_THRESHOLD,
  SYSTEM_ALERT_EVERY,
  LOCKED_MESSAGE,
  isLocked,
  afterFailure,
  afterFailureCount,
  afterSuccess,
};
