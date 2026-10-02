const express = require("express");
const multer = require("multer");
const controller = require("./Vehicle.controller");
const { requireAuth } = require("../../middleware/authMiddleware");
const { rateLimit } = require("../../middleware/rateLimit");
const { MAX_DOCUMENT_BYTES } = require("../../utils/vehicleFiles");

const router = express.Router();
const { requirePermission: can } = controller;

// Each lookup makes an outbound request, so keep it modest.
const lookupRateLimit = rateLimit({ windowMs: 60 * 1000, max: 20, scope: "vehicle-lookup" });
const uploadRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, scope: "vehicle-upload" });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } });
const uploadOne = (req, res, next) =>
  upload.single("file")(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ ok: false, message: "الملف كبير جدًا. الحد الأقصى 10MB" });
    }
    return res.status(400).json({ ok: false, message: "تعذر قراءة الملف" });
  });

// Every route needs a signed-in user; each one then checks its own vehicle
// permission against the database (see Vehicle.controller requirePermission).
router.use(requireAuth);

// Any signed-in user: what they may do, and the alerts they are entitled to.
router.get("/me/permissions", controller.attachActor, controller.getMyPermissions);
router.get("/alerts", controller.attachActor, controller.getAlerts);

router.get("/responsibles", can("edit"), controller.listResponsibles);
router.get("/official-lookup/:plate", can("edit"), lookupRateLimit, controller.officialLookup);

router.get("/", can("view"), controller.getAll);
router.post("/", can("edit"), controller.create);
router.get("/:id", can("view"), controller.getById);
router.put("/:id", can("edit"), controller.update);
router.get("/:id/audit", can("view"), controller.getAudit);

router.delete("/:id", controller.requireAdmin, controller.remove);
router.post("/:id/archive", can("archive"), controller.archive);
router.post("/:id/restore", can("archive"), controller.restore);

router.post("/:id/licenses", can("compliance"), controller.addLicense);
router.put("/:id/licenses/:recordId", can("compliance"), controller.updateLicense);
router.post("/:id/licenses/:recordId/void", can("compliance"), controller.voidLicense);

router.post("/:id/tests", can("compliance"), controller.addTest);
router.put("/:id/tests/:recordId", can("compliance"), controller.updateTest);
router.post("/:id/tests/:recordId/void", can("compliance"), controller.voidTest);
router.put("/:id/next-test", can("compliance"), controller.setNextTestDate);

router.post("/:id/policies", can("compliance"), controller.addPolicy);
router.put("/:id/policies/:recordId", can("compliance"), controller.updatePolicy);
router.post("/:id/policies/:recordId/cancel", can("compliance"), controller.cancelPolicy);

router.post("/:id/documents", can("documents"), uploadRateLimit, uploadOne, controller.uploadDocument);
router.put("/:id/documents/:docId", can("documents"), controller.updateDocument);
router.delete("/:id/documents/:docId", can("documents"), controller.removeDocument);
router.get("/:id/documents/:docId/download", can("documents"), controller.downloadDocument);

module.exports = router;
