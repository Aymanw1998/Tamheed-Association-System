// Runs one makePlayerPhoto (or makePassportPhoto) off the main thread (see
// makeInWorker in playerPhoto.service.js) and posts back the picture or the
// error code.
const { parentPort, workerData } = require("worker_threads");
const { makePlayerPhoto, makePassportPhoto } = require("./playerPhoto.service");

const make = workerData.kind === "passport" ? makePassportPhoto : makePlayerPhoto;

make(Buffer.from(workerData.photo)).then(
  (image) => parentPort.postMessage({ ok: true, image }),
  (err) => parentPort.postMessage({ ok: false, code: err?.code || null, message: String(err?.message || err) }),
);
