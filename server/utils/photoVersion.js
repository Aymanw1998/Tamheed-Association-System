const crypto = require("crypto");

// Changes whenever the photo link changes, so the app asks for the new photo
// instead of showing the old one from the browser cache. Reveals nothing of the link.
const photoVersion = (link) => (link ? crypto.createHash("sha1").update(String(link)).digest("hex").slice(0, 10) : null);

module.exports = { photoVersion };
