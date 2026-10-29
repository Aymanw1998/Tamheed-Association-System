// Runs one makePlayerPhoto off the main thread (see makeInWorker in
// playerPhoto.service.js) and posts back the picture or the error code.
const { parentPort, workerData } = require("worker_threads");
const { makePlayerPhoto } = require("./playerPhoto.service");

makePlayerPhoto(Buffer.from(workerData.photo)).then(
  (image) => parentPort.postMessage({ ok: true, image }),
  (err) => parentPort.postMessage({ ok: false, code: err?.code || null, message: String(err?.message || err) }),
);
