// Publishes live events to signed-in users by writing LiveEvents rows; each
// user's open stream (in whichever server process) picks them up within a
// poll interval. Blank recipients are skipped and duplicates written once.
function createLiveBus({ model, now = () => new Date() } = {}) {
  const getModel = () => model || require("../Entities/Live/LiveEvent.model").LiveEventModelDef;

  async function publish(recipientTz, type, payload = {}) {
    const tz = String(recipientTz ?? "").trim();
    if (!tz) return;
    await getModel().create({ recipientTz: tz, type, payload, at: now() });
  }

  async function publishToMany(recipientTzs, type, payload = {}) {
    const unique = [...new Set((recipientTzs || []).map((tz) => String(tz ?? "").trim()).filter(Boolean))];
    for (const tz of unique) await publish(tz, type, payload);
  }

  return { publish, publishToMany };
}

const liveBus = createLiveBus();

module.exports = { ...liveBus, createLiveBus };
