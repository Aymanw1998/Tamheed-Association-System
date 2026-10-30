// Turns a student's photo into a player photo: the person cut out of the
// background (transparent), framed head and shoulders in a 4:5 picture, with a
// light colour lift. Runs on the server's CPU with a small portrait model
// (MODNet, see scripts/fetchPortraitModel.js); no photo leaves the server.
const fs = require("fs");
const path = require("path");
const { Worker } = require("worker_threads");
const sharp = require("sharp");
const { MODEL_PATH } = require("../scripts/fetchPortraitModel");

const OUT_W = 600;
const OUT_H = 750;
const WORK_MAX = 1024; // longest side the photo is worked on at
const MODEL_SHORT = 512; // the model's shortest side; both sides a multiple of 32
const MODEL_LONG = 1024; // and its longest side at most
const MAX_RATIO = 3; // a photo longer than 3:1 is no portrait
const MAX_INPUT_PIXELS = 40e6; // larger photos are refused before decoding
const WORKER_MS = 2 * 60 * 1000;

class PhotoError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

// Model input size for a w x h picture: shortest side 512 (longest at most
// 1024), both sides rounded to a multiple of 32.
const modelSize = (w, h) => {
  const scale = Math.min(MODEL_SHORT / Math.min(w, h), MODEL_LONG / Math.max(w, h));
  const r32 = (v) => Math.max(32, Math.round((v * scale) / 32) * 32);
  return { width: r32(w), height: r32(h) };
};

// Loaded for each photo and released after it: photos are rare, and the 2GB
// server should not hold the model in between.
const loadSession = async () => {
  if (!fs.existsSync(MODEL_PATH)) throw new PhotoError("NO_MODEL", `portrait model missing at ${MODEL_PATH}`);
  const ort = require("onnxruntime-node");
  return ort.InferenceSession.create(MODEL_PATH, { intraOpNumThreads: 1, interOpNumThreads: 1 });
};

// The real matte: RGB pixels in, one 0..255 alpha byte per pixel out, at the
// same size.
const modnetMatte = async ({ data, width, height }) => {
  const ort = require("onnxruntime-node");
  const s = await loadSession();
  const size = modelSize(width, height);
  const rgb = await sharp(data, { raw: { width, height, channels: 3 } })
    .resize(size.width, size.height, { fit: "fill" })
    .raw()
    .toBuffer();
  const plane = size.width * size.height;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i += 1) {
    for (let c = 0; c < 3; c += 1) input[c * plane + i] = rgb[i * 3 + c] / 127.5 - 1;
  }
  let out;
  try {
    out = await s.run({ input: new ort.Tensor("float32", input, [1, 3, size.height, size.width]) });
  } finally {
    await s.release?.();
  }
  const matte = out.output.data;
  const bytes = Buffer.alloc(plane);
  for (let i = 0; i < plane; i += 1) bytes[i] = Math.round(Math.min(1, Math.max(0, matte[i])) * 255);
  return sharp(bytes, { raw: { width: size.width, height: size.height, channels: 1 } })
    .resize(width, height, { fit: "fill" })
    .extractChannel(0) // sharp would otherwise hand back three channels
    .raw()
    .toBuffer();
};

// Keeps only the largest figure: someone else caught at the edge of the photo
// is dropped. The soft edge (up to EDGE pixels) around the kept figure stays.
const EDGE = 4;
const keepMainPerson = (alpha, width, height) => {
  const label = new Int32Array(width * height);
  const stack = new Int32Array(width * height);
  let best = 0;
  let bestSize = 0;
  let next = 0;
  for (let start = 0; start < label.length; start += 1) {
    if (label[start] || alpha[start] < 128) continue;
    next += 1;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    label[start] = next;
    while (top) {
      const i = stack[--top];
      size += 1;
      const x = i % width;
      const around = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width];
      for (const j of around) {
        if (j < 0 || j >= label.length || label[j] || alpha[j] < 128) continue;
        label[j] = next;
        stack[top++] = j;
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = next;
    }
  }
  if (next <= 1) return alpha;

  // Grow the kept figure by EDGE pixels (rows, then columns) so its soft edge
  // is not clipped.
  const keep = new Uint8Array(width * height);
  for (let i = 0; i < keep.length; i += 1) keep[i] = label[i] === best ? 1 : 0;
  const rowsGrown = new Uint8Array(keep.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!keep[y * width + x]) continue;
      for (let k = Math.max(0, x - EDGE); k <= Math.min(width - 1, x + EDGE); k += 1) rowsGrown[y * width + k] = 1;
    }
  }
  const grown = new Uint8Array(keep.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!rowsGrown[y * width + x]) continue;
      for (let k = Math.max(0, y - EDGE); k <= Math.min(height - 1, y + EDGE); k += 1) grown[k * width + x] = 1;
    }
  }
  const out = Buffer.from(alpha);
  for (let i = 0; i < out.length; i += 1) if (!grown[i]) out[i] = 0;
  return out;
};

// Someone beside the player who touches him lower down (an arm against his
// shoulder) is one figure to keepMainPerson. Row by row, only the stretch
// under the player's head is kept, so the neighbour goes; where both merge
// (a cape, a team photo's front row) the row stays whole.
const keepRowsUnder = (alpha, width, height, headX) => {
  const out = Buffer.from(alpha);
  const cx = Math.round(headX);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    // The opaque stretch at or nearest to the head's column.
    let from = -1;
    let to = -1;
    let gap = Infinity;
    for (let x = 0; x < width; ) {
      if (alpha[row + x] < 128) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < width && alpha[row + x] >= 128) x += 1;
      const d = cx < start ? start - cx : cx >= x ? cx - x + 1 : 0;
      if (d < gap) {
        gap = d;
        from = start;
        to = x - 1;
      }
    }
    if (from < 0) continue;
    const lo = Math.max(0, from - EDGE);
    const hi = Math.min(width - 1, to + EDGE);
    for (let x = 0; x < width; x += 1) if (x < lo || x > hi) out[row + x] = 0;
  }
  return out;
};

// Where the person is: the box of pixels at least half opaque, and the middle
// of the top part (the head) to centre the frame on.
const personBox = (alpha, width, height) => {
  let top = -1;
  let bottom = -1;
  let left = width;
  let right = -1;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] < 128) continue;
      count += 1;
      if (top < 0) top = y;
      bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (top < 0) return null;
  const headEnd = top + Math.max(1, Math.round((bottom - top) * 0.25));
  let sum = 0;
  let n = 0;
  for (let y = top; y <= headEnd; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] >= 128) {
        sum += x;
        n += 1;
      }
    }
  }
  return { top, bottom, left, right, headX: sum / n, cover: count / (width * height) };
};

// The 4:5 frame (in work pixels; it may run past the picture, which is then
// left transparent): a little room above the head, the person filling most of
// the width.
const frameFor = (box, imageWidth) => {
  const personW = box.right - box.left + 1;
  const personH = box.bottom - box.top + 1;
  // The person filling most of the width; for a slim full-length figure, at
  // least head and upper body (about 45% of its height), not just the head.
  let h = Math.max(((personW * 1.15) * OUT_H) / OUT_W, personH * 0.45);
  let w = (h * OUT_W) / OUT_H;
  // A close photo whose shoulders run off the sides: stay inside the picture
  // there, so the body is not cut by an empty strip.
  if (w > imageWidth) {
    w = imageWidth;
    h = (w * OUT_H) / OUT_W;
  }
  const top = Math.round(box.top - h * 0.06);
  const left = Math.round(Math.min(Math.max(box.headX - w / 2, 0), imageWidth - w));
  return { left, top, width: Math.round(w), height: Math.round(h) };
};

// Crops `frame` out of an RGBA picture, filling whatever lies outside it with
// transparency.
const cropPadded = (rgba, width, height, frame) => {
  const out = Buffer.alloc(frame.width * frame.height * 4);
  for (let y = 0; y < frame.height; y += 1) {
    const sy = frame.top + y;
    if (sy < 0 || sy >= height) continue;
    const x0 = Math.max(0, -frame.left);
    const x1 = Math.min(frame.width, width - frame.left);
    if (x1 <= x0) continue;
    rgba.copy(out, (y * frame.width + x0) * 4, (sy * width + frame.left + x0) * 4, (sy * width + frame.left + x1) * 4);
  }
  return out;
};

// The photo at work size, the person cut out (RGBA) and where the person is.
// Throws BAD_IMAGE for what is no picture or no portrait, NO_PERSON when
// nobody is found (or the "person" is the whole picture).
const cutOut = async (photo, matte) => {
  let img;
  try {
    img = await sharp(photo, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(WORK_MAX, WORK_MAX, { fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch (err) {
    throw new PhotoError("BAD_IMAGE", err.message);
  }
  const { width, height } = img.info;
  if (Math.max(width, height) / Math.min(width, height) > MAX_RATIO) {
    throw Object.assign(new PhotoError("BAD_IMAGE", "not a portrait"), { shape: true });
  }
  const whole = keepMainPerson(await matte({ data: img.data, width, height }), width, height);
  const first = personBox(whole, width, height);
  if (!first || first.cover < 0.03 || first.cover > 0.97) throw new PhotoError("NO_PERSON");
  const alpha = keepRowsUnder(whole, width, height, first.headX);
  const box = personBox(alpha, width, height);

  const rgba = await sharp(img.data, { raw: { width, height, channels: 3 } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .raw()
    .toBuffer();
  return { rgba, width, height, box, alpha };
};

/**
 * @param {Buffer} photo  the student's photo (JPEG, PNG, WebP...)
 * @param {object} [opts]
 * @param {Function} [opts.matte]  ({data,width,height}) => alpha bytes; the model by default
 * @returns {Promise<Buffer>} a 600x750 WebP with transparency
 */
const makePlayerPhoto = async (photo, { matte = modnetMatte } = {}) => {
  const { rgba, width, height, box } = await cutOut(photo, matte);
  const frame = frameFor(box, width);
  const cropped = cropPadded(rgba, width, height, frame);
  return sharp(cropped, { raw: { width: frame.width, height: frame.height, channels: 4 } })
    .resize(OUT_W, OUT_H, { fit: "fill", kernel: "lanczos3" })
    .modulate({ brightness: 1.03, saturation: 1.08 })
    .linear(1.06, -6)
    .sharpen({ sigma: 0.6 })
    .webp({ quality: 88, alphaQuality: 90, effort: 4 })
    .toBuffer();
};

// Passport size, 35 x 45 mm (about 300 dpi).
const PASS_W = 420;
const PASS_H = 540;
const WHITE = { r: 255, g: 255, b: 255 };
const ABOVE_HEAD = 0.1; // of the frame's height, above the crown

// The head: its widest row and the row where it ends (the neck narrowing, or
// the shoulders or raised arms widening), from the opaque stretch under the
// head's column, row by row. Null when no end shows in the upper 60%. The
// column is the crown's middle (the top few rows), so arms raised to one side
// never pull it off the head.
const headOf = (alpha, width, height, box) => {
  const crownEnd = Math.min(height - 1, box.top + Math.max(3, Math.round((box.bottom - box.top) * 0.03)));
  let sum = 0;
  let n = 0;
  for (let y = box.top; y <= crownEnd; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] >= 128) {
        sum += x;
        n += 1;
      }
    }
  }
  if (!n) return null;
  const cx = Math.min(width - 1, Math.max(0, Math.round(sum / n)));
  const limit = Math.min(height - 1, box.top + Math.round((box.bottom - box.top) * 0.6));
  let most = 0;
  for (let y = box.top; y <= limit; y += 1) {
    const row = y * width;
    if (alpha[row + cx] < 128) continue;
    let l = cx;
    while (l > 0 && alpha[row + l - 1] >= 128) l -= 1;
    let r = cx;
    while (r < width - 1 && alpha[row + r + 1] >= 128) r += 1;
    const w = r - l + 1;
    if (most > 0 && y - box.top > most * 0.8 && (w < most * 0.85 || w > most * 1.4)) return { width: most, bottom: y, x: cx };
    most = Math.max(most, w);
  }
  return null;
};

// The passport frame (7:9, in work pixels): head and shoulders, centred on
// the head. With the head found, the head (crown to neck) ends halfway down,
// below a little room; otherwise the shoulders fill the width. The white
// background hides any padding, except where the body runs off the picture: there the frame stays
// inside it, so the body never ends in a straight edge with white beyond.
const passportFrame = (box, width, height, head = null) => {
  const personW = box.right - box.left + 1;
  const personH = box.bottom - box.top + 1;
  const cutBelow = box.bottom >= height - 2;
  const cutSides = box.left <= 1 && box.right >= width - 2;
  let h;
  if (head) {
    h = (head.bottom - box.top) / (0.5 - ABOVE_HEAD);
  } else {
    h = Math.max((personW * PASS_H) / PASS_W, personH * 0.22);
    // A whole figure (much taller than wide): still head and upper body.
    if (!cutBelow && personH > personW * 2.5) h = Math.min(h, personH * 0.5);
  }
  if (cutSides) h = Math.min(h, (width * PASS_H) / PASS_W);
  if (cutBelow) h = Math.min(h, (height - box.top) / (1 - ABOVE_HEAD));
  const w = (h * PASS_W) / PASS_H;
  let left = (head ? head.x : box.headX) - w / 2;
  if (box.left <= 1) left = Math.max(left, 0);
  if (box.right >= width - 2) left = Math.min(left, width - w);
  return { left: Math.round(left), top: Math.round(box.top - h * ABOVE_HEAD), width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
};

// Nobody found (or a picture too wide or tall for the model): the photo as
// it is, cropped to passport size (most interesting part kept).
const plainPassport = (photo) =>
  sharp(photo, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize(PASS_W, PASS_H, { fit: "cover", position: sharp.strategy.attention })
    .flatten({ background: WHITE })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

/**
 * A passport photo of a student or a user: the person on a white background,
 * head and shoulders, 420x540 (35:45). With nobody found, the photo itself
 * cropped to that size.
 * @param {Buffer} photo
 * @param {object} [opts]
 * @param {Function} [opts.matte]  as for makePlayerPhoto
 * @returns {Promise<Buffer>} a JPEG
 */
const makePassportPhoto = async (photo, { matte = modnetMatte } = {}) => {
  let cut;
  try {
    cut = await cutOut(photo, matte);
  } catch (err) {
    if (err?.code !== "NO_PERSON" && !err?.shape) throw err;
    return plainPassport(photo);
  }
  const { rgba, width, height, box, alpha } = cut;
  const frame = passportFrame(box, width, height, headOf(alpha, width, height, box));
  const cropped = cropPadded(rgba, width, height, frame);
  return sharp(cropped, { raw: { width: frame.width, height: frame.height, channels: 4 } })
    .resize(PASS_W, PASS_H, { fit: "fill", kernel: "lanczos3" })
    .flatten({ background: WHITE })
    .sharpen({ sigma: 0.5 })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
};

// makePlayerPhoto (or makePassportPhoto, kind "passport") in a worker thread:
// the model's inference is synchronous native work that would otherwise stall
// every request for about a second. The worker (and the model in it) is gone
// when the photo is done. One worker at a time for the whole process (player
// and passport photos alike): the model needs most of the 2GB server.
let modelQueue = Promise.resolve();
const makeInWorker = (photo, options = {}) => {
  const run = modelQueue.then(() => runWorker(photo, options));
  modelQueue = run.catch(() => {});
  return run;
};

// Settles only once the worker has ended, so the next one starts after it.
const runWorker = (photo, { timeoutMs = WORKER_MS, kind = "player" } = {}) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "playerPhotoWorker.js"), { workerData: { photo, kind } });
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate().catch(() => {}).finally(() => fn(value));
    };
    const timer = setTimeout(() => finish(reject, new Error("player photo worker timed out")), timeoutMs);
    worker.once("message", (msg) =>
      msg.ok ? finish(resolve, Buffer.from(msg.image)) : finish(reject, new PhotoError(msg.code || "WORKER", msg.message)));
    worker.once("error", (err) => finish(reject, err));
    worker.once("exit", (code) => finish(reject, new Error(`player photo worker exited (${code})`)));
  });

module.exports = { makePlayerPhoto, makePassportPhoto, passportFrame, headOf, PASS_W, PASS_H, makeInWorker, modnetMatte, keepMainPerson, keepRowsUnder, modelSize, personBox, frameFor, PhotoError, OUT_W, OUT_H };
