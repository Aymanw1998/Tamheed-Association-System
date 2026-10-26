// In-memory fan-out of instant events to the open streams of THIS process.
//   staff subscribers get `change` and `lock` (broadcastStaff)
//   sport subscribers get `me` for chosen students (toStudents)
// Events carry only ids, never data. A staff event may also carry an
// `audience` (e.g. a report's owner) that the stream uses to decide who gets
// it (services/liveAudience) and never sends. A subscriber whose send()
// throws is dropped, so one dead stream never blocks the others.
function createLiveHub() {
  const subscribers = new Set();

  function subscribe(kind, id, send) {
    const subscriber = { kind, id: String(id), send };
    subscribers.add(subscriber);
    return () => { subscribers.delete(subscriber); };
  }

  function deliver(subscriber, type, payload, audience) {
    try {
      subscriber.send(type, payload, audience);
    } catch {
      subscribers.delete(subscriber);
    }
  }

  function broadcastStaff(type, payload, audience = null) {
    for (const subscriber of [...subscribers]) {
      if (subscriber.kind === "staff") deliver(subscriber, type, payload, audience);
    }
  }

  function toStudents(studentIds, type, payload = {}) {
    const wanted = new Set((studentIds || []).map(String));
    for (const subscriber of [...subscribers]) {
      if (subscriber.kind === "sport" && wanted.has(subscriber.id)) deliver(subscriber, type, payload);
    }
  }

  return { subscribe, broadcastStaff, toStudents };
}

const liveHub = createLiveHub();

const notifyChange = (entity, id, audience = null) => liveHub.broadcastStaff("change", { entity, id }, audience);

module.exports = { createLiveHub, liveHub, notifyChange };
