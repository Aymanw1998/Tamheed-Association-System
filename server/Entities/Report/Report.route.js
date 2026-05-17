const express = require('express');
const { getAll, getById, post, put, remove} = require("./Report.controller.js");
const { requireAuth, requireRole } = require("../../middleware/authMiddleware.js");
const router = express.Router();

router.get("/", requireAuth, getAll);
router.get("/:id", requireAuth, getById);
router.post("/", requireAuth, requireRole('ادارة', 'مرشد'), post);
router.put("/:id", requireAuth, requireRole('ادارة', 'مرشد'), put);
router.delete("/:id", requireAuth, requireRole('ادارة'), remove);

module.exports = router;
