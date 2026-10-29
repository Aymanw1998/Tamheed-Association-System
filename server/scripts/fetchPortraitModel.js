// Downloads the portrait model that cuts players out of their photo
// (MODNet, Apache-2.0, ~26MB) into server/models/. Pinned to one revision and
// checked by SHA-256; does nothing when the right file is already there.
// Run by deploy/update.sh:  node server/scripts/fetchPortraitModel.js
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

const MODEL_URL =
  "https://huggingface.co/Xenova/modnet/resolve/fa2fa546052fba4c08921230a26cc69a333fca12/onnx/model.onnx";
const MODEL_SHA256 = "07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9";
const MODEL_PATH = path.join(__dirname, "..", "models", "modnet.onnx");

const sha256Of = async (file) => {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest("hex");
};

const fetchModel = async ({ url = MODEL_URL, sha256 = MODEL_SHA256, dest = MODEL_PATH } = {}) => {
  if (fs.existsSync(dest) && (await sha256Of(dest)) === sha256) return { downloaded: false };
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`model download failed: HTTP ${res.status}`);
  // Written beside the target and renamed only once the checksum matches, so
  // the server never loads half a file.
  const tmp = `${dest}.part`;
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
  const got = await sha256Of(tmp);
  if (got !== sha256) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`model checksum mismatch: ${got}`);
  }
  fs.renameSync(tmp, dest);
  return { downloaded: true };
};

if (require.main === module) {
  fetchModel()
    .then(({ downloaded }) => console.log(downloaded ? `Portrait model saved to ${MODEL_PATH}` : "Portrait model already in place"))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = { fetchModel, MODEL_PATH };
