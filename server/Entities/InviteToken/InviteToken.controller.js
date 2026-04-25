const crypto = require("crypto");
const { InviteTokenModelDef } = require("./InviteToken.model");
const { StudentModelDef } = require("../Student/Student.model");
const { logWithSource } = require("../../middleware/logger");

/* ================= helpers ================= */

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);

  if (typeof value === "string") {
    const s = value.trim();

    let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m.map(Number);
      return new Date(Date.UTC(yyyy, mm - 1, dd));
    }

    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [, yyyy, mm, dd] = m.map(Number);
      return new Date(Date.UTC(yyyy, mm - 1, dd));
    }

    const ts = Date.parse(s);
    if (!Number.isNaN(ts)) return new Date(ts);
  }

  return null;
}

async function getInviteByToken(token) {
  const result = await InviteTokenModelDef.get({ token });
  if (result?.success && Array.isArray(result.result) && result.result.length > 0) {
    return result.result[0];
  }
  return null;
}

async function getStudentByTz(tz) {
  const result = await StudentModelDef.get({ tz });
  if (result?.success && Array.isArray(result.result) && result.result.length > 0) {
    return result.result[0];
  }
  return null;
}

/* ================= create link ================= */

const createLink = async (req, res) => {
  try {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await InviteTokenModelDef.create({
      token,
      expiresAt,
      used: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const origin =
      req.get("origin") ||
      process.env.CLIENT_URL ||
      "http://localhost:3000";

    const url = `${origin}/parent-register?invite=${token}`;

    return res.status(200).json({ url });
  } catch (err) {
    logWithSource("InviteToken.createLink", err);
    return res.status(500).json({
      url: null,
      message: "Error creating link",
    });
  }
};

/* ================= validate ================= */

const validateToken = async (req, res) => {
  try {
    const { token } = req.params;

    const invite = await getInviteByToken(token);
    if (!invite) {
      return res.status(400).json({
        valid: false,
        reason: "not_found",
      });
    }

    if (invite.used) {
      return res.status(400).json({
        valid: false,
        reason: "already_used",
      });
    }

    if (new Date(invite.expiresAt) < new Date()) {
      return res.status(400).json({
        valid: false,
        reason: "expired",
      });
    }

    return res.status(200).json({ valid: true });
  } catch (err) {
    logWithSource("InviteToken.validateToken", err);
    return res.status(500).json({
      valid: false,
      reason: "server_error",
    });
  }
};

/* ================= submit ================= */

const submitInvite = async (req, res) => {
  try {
    const { token } = req.params;

    const invite = await getInviteByToken(token);
    if (!invite || invite.used || new Date(invite.expiresAt) < new Date()) {
      return res.status(400).json({
        message: "Invalid or expired link",
      });
    }

    const body = req.body;

    if (!body.tz) {
      return res.status(400).json({
        message: "tz is required",
      });
    }

    const exists = await getStudentByTz(body.tz);
    if (exists) {
      return res.status(409).json({
        message: "Student already exists",
      });
    }

    await StudentModelDef.create({
      tz: body.tz,
      firstname: body.firstname,
      lastname: body.lastname,
      birth_date: toDate(body.birth_date) || null,
      gender: body.gender,
      phone: body.phone,
      email: body.email || "test@test.com",
      city: body.city || "الرمة",
      street: body.street || "الرملة القديمة",

      father_name: body.father_name,
      mother_name: body.mother_name,
      father_phone: body.father_phone,
      mother_phone: body.mother_phone,
      father_work: body.father_work,
      mother_work: body.mother_work,
      school: body.school,
      layer: body.layer,
      health_status: body.health_status || "",
      notes: body.notes || "",

      source: "اهل",
      status: "ينتظر",

      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await InviteTokenModelDef.update(
      { token },
      {
        used: true,
        updatedAt: new Date(),
      }
    );

    return res.status(200).json({
      message: "Form submitted successfully",
    });
  } catch (err) {
    logWithSource("InviteToken.submitInvite", err);
    return res.status(500).json({
      message: "Error submitting form",
    });
  }
};

module.exports = {
  createLink,
  validateToken,
  submitInvite,
};