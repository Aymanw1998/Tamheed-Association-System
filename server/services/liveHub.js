// In-memory fan-out of instant events to the open streams of THIS process.
//   staff subscribers get `change` and `lock` (broadcastStaff)
//   sport subscribers get `me` for chosen students (toStudents)
// Events carry only ids, never data. A subscriber whose send() throws is
// dropped, so one dead stream never blocks the others.
function createLiveHub() {
  const subscribers = new Set();

  function subscribe(kind, id, send) {
    const subscriber = { kind, id: String(id), send };
    subscribers.add(subscriber);
    return () => { subscribers.delete(subscriber); };
  }

  function deliver(subscriber, type, payload) {
    try {
      subscriber.send(type, payload);
    } catch {
      subscribers.delete(subscriber);
    }
  }

  function broadcastStaff(type, payload) {
    for (const subscriber of [...subscribers]) {
      if (subscriber.kind === "staff") deliver(subscriber, type, payload);
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

const notifyChange = (entity, id) => liveHub.broadcastStaff("change", { entity, id });

module.exports = { createLiveHub, liveHub, notifyChange };
