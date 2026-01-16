const express = require("express");
const { getOAuthClient, saveTokens } = require("../../config/driveOAuth");

const router = express.Router();

// 1) כניסה לגוגל (רק פעם אחת)
router.get("/", (req, res) => {
    console.log("hi google");
    const oauth = getOAuthClient();

    const url = oauth.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: ["https://www.googleapis.com/auth/drive"],
    });
    console.log(url);
    res.redirect(url);
});

// 2) callback שמקבל code ושומר tokens
router.get("/callback", async (req, res) => {
    try {
        const oauth = getOAuthClient();
        const { code } = req.query;

        const { tokens } = await oauth.getToken(code);
        saveTokens(tokens);

        res.send("✅ Connected! Tokens saved. You can close this tab.");
    } catch (e) {
        res.status(500).send(e.message);
    }
});

module.exports = router;
