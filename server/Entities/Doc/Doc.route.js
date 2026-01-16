const express = require("express"); 
const { downloadEmptyDocx, downloadDocById } = require("./Doc.controller");
const { requireAuth } = require("../../middleware/authMiddleware");
const router = express.Router();

router.get("/test",downloadEmptyDocx);
router.get("/:id/file",downloadDocById); 

module.exports = router;