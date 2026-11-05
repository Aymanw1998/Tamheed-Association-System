const buckets = new Map();

// req.ip honours Express "trust proxy" (1 hop). The raw first X-Forwarded-For
// value is client-supplied, so it must never key a bucket.
const getClientKey = (req, scope) => `${scope}:${req.ip || req.socket?.remoteAddress || "unknown"}`;

const waitText = (seconds) => {
  const minutes = Math.ceil(seconds / 60);
  if (minutes === 1) return "دقيقة";
  if (minutes === 2) return "دقيقتين";
  return minutes <= 10 ? `${minutes} دقائق` : `${minutes} دقيقة`;
};

const rateLimit = ({ windowMs = 60 * 1000, max = 60, scope = "global", keyFn } = {}) => {
  return (req, res, next) => {
    const now = Date.now();
    const custom = typeof keyFn === "function" ? keyFn(req) : null;
    const key = custom ? `${scope}:${custom}` : getClientKey(req, scope);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        ok: false,
        code: "RATE_LIMITED",
        message: `عدد الطلبات كبير. حاول مرة أخرى بعد ${waitText(retryAfter)}.`,
      });
    }

    return next();
  };
};

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref?.();

module.exports = { rateLimit };
