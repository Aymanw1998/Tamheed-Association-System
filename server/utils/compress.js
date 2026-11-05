const compression = require("compression");

// Long-lived streams must stay uncompressed, or their events wait in a buffer
// (the same paths nginx leaves unbuffered).
const STREAM_PATH = /^\/api\/(live\/|ai\/chat|sport-portal\/live)/;

const shouldCompress = (req, res) => {
  if (STREAM_PATH.test(req.path || "")) return false;
  // Content-Range counts the file's own bytes, so a compressed part would not fit it.
  if (req.headers?.range) return false;
  return compression.filter(req, res);
};

const compress = () => compression({ filter: shouldCompress });

module.exports = { compress, shouldCompress };
