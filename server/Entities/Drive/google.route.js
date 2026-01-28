// routes/google.routes.js
const express = require("express");
const {google}= require("googleapis");

const router = express.Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

router.get("/oauth/start", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // مهم لأول مرة عشان refresh_token
    scope: SCOPES,
  });
  res.redirect(url);
});

router.get("/oauth/callback", async (req, res, next) => {
  try {
    const code = req.query.code;
    const { tokens } = await oauth2Client.getToken(code);

    // TODO: خزّن tokens في DB حسب userId (مثلاً req.user._id)
    // tokens: { access_token, refresh_token, expiry_date, ... }

    return res.redirect(`${process.env.CLIENT_URL}/settings/integrations?google=connected`);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
