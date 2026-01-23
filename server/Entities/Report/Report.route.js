const express = require('express');
const { getAll, getById, post, put, remove} = require("./Report.controller.js");
const { requireAuth } = require("../../middleware/authMiddleware.js");
const router = express.Router();

router.get("/", requireAuth, getAll);
router.get("/:id", requireAuth, getById);
router.post("/", requireAuth, post);
router.put("/:id", requireAuth, put);
router.delete("/:id", requireAuth, remove);

module.exports = router;
