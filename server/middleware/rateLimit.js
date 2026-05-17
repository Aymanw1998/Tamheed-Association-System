const buckets = new Map();

const getClientKey = (req, scope) => {
  const forwarded = String(req.get("x-forwarded-for") || "").split(",")[0].trim();
  return `${scope}:${forwarded || req.ip || req.socket?.remoteAddress || "unknown"}`;
};

const rateLimit = ({ windowMs = 60 * 1000, max = 60, scope = "global" } = {}) => {
  return (req, res, next) => {
    const now = Date.now();
    const key = getClientKey(req, scope);
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
        message: "Too many requests. Please try again later.",
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
