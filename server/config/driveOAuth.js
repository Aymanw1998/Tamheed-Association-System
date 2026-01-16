const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const TOKENS_PATH = path.join(process.cwd(), "config", "google_tokens.json");

function getOAuthClient() {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
}

function saveTokens(tokens) {
    const dir = path.dirname(TOKENS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), "utf8");
}

function loadTokens() {
    if (!fs.existsSync(TOKENS_PATH)) return null;
    return JSON.parse(fs.readFileSync(TOKENS_PATH, "utf8"));
}

function getDriveClient() {
    const oauth = getOAuthClient();
    const tokens = loadTokens();
    if (!tokens) throw new Error("No tokens found. Open /auth/google once.");
    oauth.setCredentials(tokens);

    // אם גוגל שולח טוקן חדש - נשמור אוטומטית
    oauth.on("tokens", (t) => saveTokens({ ...tokens, ...t }));

  return google.drive({ version: "v3", auth: oauth });
}

module.exports = { getOAuthClient, saveTokens, loadTokens, getDriveClient };
