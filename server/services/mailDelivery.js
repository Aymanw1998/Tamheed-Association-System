// One reusable SMTP pool per configuration. Never log recipient, body or code.
function createMailDelivery({ createTransport, config, now = () => Date.now(), onMetric = () => {}, delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  let transport, fingerprint;
  const get = () => {
    const options = config();
    const next = JSON.stringify(options);
    if (!transport || next !== fingerprint) {
      transport?.close?.();
      transport = createTransport({ pool: true, maxConnections: 2, maxMessages: 100,
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000, maxRequeues: 0, ...options });
      fingerprint = next;
    }
    return transport;
  };
  const sendMail = async (message) => {
    const started = now();
    for (let attempt = 0; ; attempt += 1) {
      try {
        const result = await get().sendMail(message);
        onMetric({ status: "accepted", elapsedMs: now() - started, attempts: attempt + 1 });
        return result;
      } catch (error) {
        // Never retry an ambiguous post-DATA failure (it may already be sent).
        const beforeData = ["CONN", "CONNECT", "EHLO", "HELO", "STARTTLS"].includes(String(error.command || "").toUpperCase());
        if (attempt === 0 && beforeData && ["ECONNECTION", "ETIMEDOUT", "ESOCKET"].includes(error.code)) { await delay(250); continue; }
        onMetric({ status: "failed", elapsedMs: now() - started, attempts: attempt + 1 });
        throw error;
      }
    }
  };
  return { sendMail, close() { transport?.close?.(); transport = null; fingerprint = null; } };
}
module.exports = { createMailDelivery };
