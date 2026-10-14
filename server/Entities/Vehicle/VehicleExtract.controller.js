const { inspectDocument } = require("../../utils/vehicleFiles.js");
const { logWithSource } = require("../../middleware/logger.js");

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const MAX_EXTRACT_BYTES = 5 * 1024 * 1024;
const MAX_EXTRACT_PAGES = 5;
const TOO_LARGE = "المستند كبير جدًا للقراءة التلقائية (حتى 5 صفحات و5MB)، يرجى إدخال البيانات يدويًا";
const MESSAGES = {
  not_configured: "قراءة المستندات غير مفعّلة على الخادم",
  refused: "تعذّر قراءة هذا المستند، يرجى إدخال البيانات يدويًا",
  unreadable: "لم نتمكن من قراءة المستند بوضوح، يرجى إدخال البيانات يدويًا",
  rate_limited: "الخدمة مشغولة الآن، حاول بعد قليل",
  failed: "تعذّرت قراءة المستند، يرجى المحاولة مرة أخرى أو الإدخال يدويًا",
};

function createExtractController({ extract, findVehicle }) {
  async function extractDocument(req, res) {
    try {
      if (!req.file?.buffer) return res.status(400).json({ ok: false, message: "يرجى اختيار ملف" });
      const checked = inspectDocument(req.file.buffer);
      if (!checked.ok) return res.status(400).json({ ok: false, message: checked.message });

      if (req.file.buffer.length > MAX_EXTRACT_BYTES) return res.status(400).json({ ok: false, message: TOO_LARGE });
      if (checked.mime === "application/pdf") {
        const pages = (req.file.buffer.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) || []).length;
        if (pages > MAX_EXTRACT_PAGES) return res.status(400).json({ ok: false, message: TOO_LARGE });
      }

      const vehicleId = String(req.body?.vehicleId || "");
      const vehicle = OBJECT_ID.test(vehicleId) ? await findVehicle(vehicleId) : null;
      const expected = ["license", "policy"].includes(req.body?.expected) ? req.body.expected : "any";

      const result = await extract({ buffer: req.file.buffer, mime: checked.mime, expected, expectedPlate: vehicle?.plate || "" });
      if (!result.available) {
        const status = result.reason === "not_configured" ? 503 : result.reason === "rate_limited" ? 429 : 422;
        return res.status(status).json({ ok: false, available: false, reason: result.reason, message: MESSAGES[result.reason] || MESSAGES.failed });
      }
      return res.status(200).json({ ok: true, ...result });
    } catch (err) {
      logWithSource("Vehicle.extractDocument", err);
      return res.status(500).json({ ok: false, message: MESSAGES.failed });
    }
  }
  return { extractDocument };
}

function defaultController() {
  const { extractVehicleDocument } = require("../../services/vehicleDocExtract.service.js");
  const { VehicleModelDef } = require("./Vehicle.model.js");
  return createExtractController({
    extract: extractVehicleDocument,
    async findVehicle(id) {
      const found = await VehicleModelDef.get({ _id: id });
      return found?.result?.[0] || null;
    },
  });
}

module.exports = { createExtractController, defaultController };
