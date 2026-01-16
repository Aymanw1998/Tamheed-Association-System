const express = require("express");
const { getOnlyOfficeConfig, postOnlyOfficeCallback } = require("./OnlyOffice.controller");
const { verifyOnlyOfficeJwt } = require("../../middleware/onlyOfficeJwt");
const { requireAuth } = require("../../middleware/authMiddleware");

const router = express.Router();

router.get("/:id/config",requireAuth,getOnlyOfficeConfig);
router.post("/:id/callback",verifyOnlyOfficeJwt, postOnlyOfficeCallback);

module.exports = router;
