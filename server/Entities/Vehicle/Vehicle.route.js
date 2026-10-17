const express = require("express");
const multer = require("multer");
const controller = require("./Vehicle.controller");
const { requireAuth } = require("../../middleware/authMiddleware");
const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware");
const { rateLimit } = require("../../middleware/rateLimit");
const { MAX_DOCUMENT_BYTES } = require("../../utils/vehicleFiles");

const router = express.Router();
const { requireVehiclePermission } = controller;

// Each lookup makes an outbound request, so keep it modest.
const lookupRateLimit = rateLimit({ windowMs: 60 * 1000, max: 20, scope: "vehicle-lookup" });
const uploadRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, scope: "vehicle-upload" });
// Each extraction is a paid Claude call; keep it modest.
const extractRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, scope: "vehicle-extract", keyFn: (req) => req.actor?.id });
const { extractDocument } = require("./VehicleExtract.controller").defaultController();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } });
const uploadOne = (req, res, next) =>
  upload.single("file")(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ ok: false, message: "الملف كبير جدًا. الحد الأقصى 10MB" });
    }
    return res.status(400).json({ ok: false, message: "تعذر قراءة الملف" });
  });

// Every route needs a signed-in, active user (loadActor re-reads permissions
// from the database); each one then checks its own vehicle permission.
router.use(requireAuth, loadActor);

// Any signed-in user: what they may do, and the alerts they are entitled to
// (the controller filters alerts to their assigned vehicles without vehicles.view).
router.get("/me/permissions", controller.getMyPermissions);
router.get("/alerts", controller.getAlerts);

router.get("/responsibles", requireVehiclePermission("edit"), controller.listResponsibles);
router.get("/official-lookup/:plate", requireVehiclePermission("edit"), lookupRateLimit, controller.officialLookup);
router.get("/extract/status", requireVehiclePermission("compliance"), (req, res) =>
  res.json({ ok: true, available: Boolean(process.env.ANTHROPIC_API_KEY) })
);
router.post("/extract", requireVehiclePermission("compliance"), extractRateLimit, uploadOne, extractDocument);

router.get("/", requireVehiclePermission("view"), controller.getAll);
router.post("/", requireVehiclePermission("edit"), controller.create);
router.get("/:id", requireVehiclePermission("view"), controller.getById);
router.put("/:id", requireVehiclePermission("edit"), controller.update);
router.get("/:id/audit", requireVehiclePermission("view"), controller.getAudit);

// Permanent deletion needs vehicles.delete (not a delegable vehicle permission).
router.delete("/:id", requirePermission(controller.DELETE_KEY), controller.remove);
router.post("/:id/archive", requireVehiclePermission("archive"), controller.archive);
router.post("/:id/restore", requireVehiclePermission("archive"), controller.restore);

router.post("/:id/licenses", requireVehiclePermission("compliance"), controller.addLicense);
router.put("/:id/licenses/:recordId", requireVehiclePermission("compliance"), controller.updateLicense);
router.post("/:id/licenses/:recordId/void", requireVehiclePermission("compliance"), controller.voidLicense);

router.post("/:id/tests", requireVehiclePermission("compliance"), controller.addTest);
router.put("/:id/tests/:recordId", requireVehiclePermission("compliance"), controller.updateTest);
router.post("/:id/tests/:recordId/void", requireVehiclePermission("compliance"), controller.voidTest);
router.put("/:id/next-test", requireVehiclePermission("compliance"), controller.setNextTestDate);

router.post("/:id/policies", requireVehiclePermission("compliance"), controller.addPolicy);
router.put("/:id/policies/:recordId", requireVehiclePermission("compliance"), controller.updatePolicy);
router.post("/:id/policies/:recordId/cancel", requireVehiclePermission("compliance"), controller.cancelPolicy);

router.post("/:id/documents", requireVehiclePermission("documents"), uploadRateLimit, uploadOne, controller.uploadDocument);
router.put("/:id/documents/:docId", requireVehiclePermission("documents"), controller.updateDocument);
router.delete("/:id/documents/:docId", requireVehiclePermission("documents"), controller.removeDocument);
router.get("/:id/documents/:docId/download", requireVehiclePermission("documents"), controller.downloadDocument);

module.exports = router;
