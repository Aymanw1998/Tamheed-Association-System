const { randomUUID } = require("node:crypto");
const { VehicleModelDef, VehicleAuditDef } = require("./Vehicle.model.js");
const { UserModelDef } = require("../User/User.model.js");
const googleDrive = require("../../services/googleDrive.service.js");
const { logWithSource } = require("../../middleware/logger.js");
const rules = require("../../utils/vehicleRules.js");
const { can, isSystemTz, actorRef, actorDisplayName, SYSTEM_ACTOR_NAME } = require("../../utils/permissions.js");
const { inspectDocument, buildDocumentName } = require("../../utils/vehicleFiles.js");
const { lookupByPlate } = require("../../services/vehicleLookup.service.js");
const { audit: auditLog } = require("../../utils/audit.js");
const { checkVersion, editorStamp, sameVersion, raceLost } = require("../../middleware/lockGuard.js");
const { notifyChange } = require("../../services/liveHub.js");

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";

// ------------------------------------------------------------------ helpers

const clean = (value, max = 200) => String(value ?? "").trim().slice(0, max);
const blankToEmpty = (value) => (value === undefined || value === null ? "" : value);
const toAmount = (value) => {
  if (value === undefined || value === null || value === "") return null;
  return Number(value);
};

const send = (res, status, body) => res.status(status).json(body);
const fail = (res, status, message, extra = {}) => send(res, status, { ok: false, message, ...extra });

const personName = (user = {}) =>
  [user.firstname, user.lastname].filter(Boolean).join(" ").trim() || String(user.tz || "");
// Who acted, as stored: the system account is "system" / "النظام".
const actorName = (actor = {}) => actorDisplayName(actor);
const actorId = (actor = {}) => actorRef(actor, actor.id);

// Route guard. req.actor is loaded fresh from the database for every request
// by permissionMiddleware.loadActor; nothing works without vehicles.view.
function requireVehiclePermission(permission) {
  return (req, res, next) =>
    rules.hasVehiclePermission(req.actor, permission)
      ? next()
      : fail(res, 403, "لا توجد صلاحية", { code: "FORBIDDEN" });
}

// Permanent deletion is not one of the delegable vehicle permissions: only
// vehicles.delete (admin role default, or a grant) allows it.
const DELETE_KEY = "vehicles.delete";

async function findVehicle(id) {
  if (!OBJECT_ID.test(String(id || ""))) return null;
  const found = await VehicleModelDef.get({ _id: String(id) });
  return found?.result?.[0] || null;
}

// Central audit-log action for each of this file's own vehicle actions.
const centralAction = (action) => (action === "create" ? "create" : action === "document.add" ? "upload" : "update");

// Writes the vehicle's own change log and the central audit log. `before` is
// the vehicle as it was before the save (none on create).
async function audit(vehicle, req, action, { changes = [], reason = "", details = null, before = null } = {}) {
  const actor = req.actor;
  await auditLog.record(req, {
    module: "vehicles", action: centralAction(action), targetType: "vehicle",
    targetId: vehicle._id, targetLabel: vehicle.plate, before, after: vehicle,
  });
  try {
    await VehicleAuditDef.create({
      vehicleId: String(vehicle._id),
      plate: vehicle.plate,
      action,
      by: actorId(actor),
      byName: actorName(actor),
      at: new Date().toISOString(),
      changes,
      reason: clean(reason, 500),
      details,
    });
  } catch (err) {
    // The change itself already happened; a failed log entry must not turn a
    // successful save into an error the user would retry.
    logWithSource("Vehicle.audit", err);
  }
}

// `guarded`: written only if nobody saved since `vehicle` was read; answers
// null (nothing written) when someone did.
async function saveVehicle(vehicle, patch, actor, { guarded = false } = {}) {
  const data = { ...patch, updatedBy: actorId(actor), updatedByName: actor?.isSystem ? SYSTEM_ACTOR_NAME : String(actor?.name ?? ""), updatedAt: new Date().toISOString() };
  if (guarded) {
    const written = await VehicleModelDef.updateExisting(sameVersion({ _id: String(vehicle._id) }, vehicle), data);
    if (!written?.result) return null;
  } else {
    await VehicleModelDef.update({ _id: String(vehicle._id) }, data);
  }
  notifyChange("vehicle", String(vehicle._id));
  return { ...vehicle, ...data };
}

const requireNotArchived = (res, vehicle) => {
  if (vehicle.status === "archived") {
    fail(res, 409, "المركبة مؤرشفة. أعدها من الأرشيف قبل التعديل");
    return false;
  }
  return true;
};

const publicDocument = (doc = {}) => ({
  id: doc.id,
  kind: doc.kind,
  name: doc.name,
  title: doc.title || "",
  mimeType: doc.mimeType,
  size: doc.size,
  linkedType: doc.linkedType,
  linkedId: doc.linkedId,
  uploadedAt: doc.uploadedAt,
  uploadedByName: doc.uploadedByName,
  supersededAt: doc.supersededAt || "",
  replacesId: doc.replacesId || "",
});

function toClientVehicle(vehicle, today, userNames = new Map()) {
  const { documents, licenses, tests, policies, ...rest } = vehicle;
  const current = rules.currentLicense(licenses);
  return {
    ...rest,
    _id: String(vehicle._id),
    documents: (documents || []).map(publicDocument),
    // Status per record, computed here so the browser never re-derives it.
    licenses: (licenses || []).map((record) => ({
      ...record,
      status: record.voidedAt ? "void" : current && record.id === current.id ? "current" : "past",
    })),
    tests: (tests || []).map((record) => ({ ...record, status: record.voidedAt ? "void" : "recorded" })),
    policies: (policies || []).map((record) => ({ ...record, status: rules.policyStatus(record, today) })),
    responsibleName: userNames.get(String(vehicle.responsibleId || "")) || "",
    summary: rules.summarizeVehicle(vehicle, today),
  };
}

async function loadUserNames() {
  const found = await UserModelDef.get({}).catch(() => null);
  const names = new Map();
  for (const user of found?.result || []) {
    names.set(String(user._id), isSystemTz(user.tz) ? actorDisplayName({ isSystem: true }) : personName(user));
  }
  return names;
}

// -------------------------------------------------------------- vehicle fields

const BASIC_FIELDS = [
  "plate",
  "nickname",
  "type",
  "classification",
  "make",
  "model",
  "year",
  "color",
  "chassisNumber",
  "registeredOwner",
  "responsibleId",
  "status",
  "notes",
  "trailer.selfWeightKg",
  "trailer.grossWeightKg",
  "trailer.payloadKg",
  "trailer.brakes",
  "trailer.towingConditions",
];

function readVehicleBody(body = {}) {
  const trailer = body.trailer || {};
  const number = (value) => (value === undefined || value === null || value === "" ? "" : Number(value));
  return {
    plate: rules.normalizePlate(body.plate),
    nickname: clean(body.nickname),
    type: clean(body.type, 20),
    classification: clean(body.classification),
    make: clean(body.make),
    model: clean(body.model),
    year: number(body.year),
    color: clean(body.color, 60),
    chassisNumber: clean(body.chassisNumber, 60).toUpperCase(),
    registeredOwner: clean(body.registeredOwner),
    responsibleId: clean(body.responsibleId, 40),
    status: clean(body.status, 20) || "active",
    notes: clean(body.notes, 2000),
    trailer: {
      selfWeightKg: number(trailer.selfWeightKg),
      grossWeightKg: number(trailer.grossWeightKg),
      payloadKg: number(trailer.payloadKg),
      brakes: clean(trailer.brakes, 20) || "unknown",
      towingConditions: clean(trailer.towingConditions, 2000),
    },
  };
}

function readImportSource(value) {
  if (!value || typeof value !== "object") return null;
  const fetchedAt = clean(value.fetchedAt, 40);
  if (clean(value.name, 40) !== "data.gov.il" || Number.isNaN(Date.parse(fetchedAt))) return null;
  return { importedFrom: "data.gov.il", fetchedAt, fields: Array.isArray(value.fields) ? value.fields.map((f) => clean(f, 30)).slice(0, 10) : [] };
}

async function checkResponsible(responsibleId) {
  if (!responsibleId) return "";
  const found = await UserModelDef.get({ _id: responsibleId }).catch(() => null);
  // The system account is never a responsible.
  const user = (found?.result || []).find((u) => !isSystemTz(u.tz));
  return user ? "" : "المسؤول المختار غير موجود";
}

async function plateInUse(plate, exceptId = "") {
  const found = await VehicleModelDef.get({ plate });
  return (found?.result || []).some((vehicle) => String(vehicle._id) !== String(exceptId));
}

// ------------------------------------------------------------------- handlers

const getMyPermissions = async (req, res) => {
  const { actor } = req;
  return send(res, 200, {
    ok: true,
    // Kept as "isAdmin" for the client: it means "may delete permanently".
    isAdmin: can(actor?.permissions, DELETE_KEY),
    permissions: rules.PERMISSIONS.filter((permission) => rules.hasVehiclePermission(actor, permission)),
  });
};

const listResponsibles = async (req, res) => {
  try {
    const found = await UserModelDef.get({});
    const users = (found?.result || [])
      .filter((user) => !isSystemTz(user.tz))
      .map((user) => ({
        id: String(user._id),
        name: personName(user),
        tzSuffix: String(user.tz || "").slice(-4),
      }));
    return send(res, 200, { ok: true, users });
  } catch (err) {
    logWithSource("Vehicle.listResponsibles", err);
    return fail(res, 500, SERVER_ERROR);
  }
};

const getAll = async (req, res) => {
  try {
    const today = rules.todayInJerusalem();
    const [found, names] = await Promise.all([VehicleModelDef.get({}), loadUserNames()]);
    const vehicles = (found?.result || []).map((vehicle) => toClientVehicle(vehicle, today, names));
    return send(res, 200, { ok: true, today, vehicles });
  } catch (err) {
    logWithSource("Vehicle.getAll", err);
    return fail(res, 500, SERVER_ERROR);
  }
};

const getById = async (req, res) => {
  try {
    const vehicle = await findVehicle(req.params.id);
    if (!vehicle) return fail(res, 404, "المركبة غير موجودة");
    const names = await loadUserNames();
    return send(res, 200, { ok: true, vehicle: toClientVehicle(vehicle, rules.todayInJerusalem(), names) });
  } catch (err) {
    logWithSource("Vehicle.getById", err);
    return fail(res, 500, SERVER_ERROR);
  }
};

const create = async (req, res) => {
  try {
    const data = readVehicleBody(req.body);
    if (data.status === "archived") data.status = "active";
    const errors = rules.validateVehicle(data);
    if (Object.keys(errors).length) return fail(res, 400, "تحقق من الحقول المطلوبة", { errors });
    if (await plateInUse(data.plate)) {
      return fail(res, 409, "رقم اللوحة مسجل مسبقًا", { errors: { plate: "رقم اللوحة مسجل مسبقًا" } });
    }
    const responsibleError = await checkResponsible(data.responsibleId);
    if (responsibleError) return fail(res, 400, responsibleError, { errors: { responsibleId: responsibleError } });

    const now = new Date().toISOString();
    const created = await VehicleModelDef.create({
      ...data,
      licenses: [],
      tests: [],
      nextTestDate: "",
      policies: [],
      documents: [],
      createdBy: actorId(req.actor),
      createdAt: now,
      updatedBy: actorId(req.actor),
      updatedAt: now,
    });
    const vehicle = created.result;
    await audit(vehicle, req, "create", { details: { plate: vehicle.plate, type: vehicle.type } });
    notifyChange("vehicle", String(vehicle._id));
    const names = await loadUserNames();
    return send(res, 201, { ok: true, vehicle: toClientVehicle(vehicle, rules.todayInJerusalem(), names) });
  } catch (err) {
    logWithSource("Vehicle.create", err);
    return fail(res, 500, SERVER_ERROR);
  }
};

const update = async (req, res) => {
  try {
    const vehicle = await findVehicle(req.params.id);
    if (!vehicle) return fail(res, 404, "المركبة غير موجودة");
    if (!requireNotArchived(res, vehicle)) return;
    const stale = checkVersion(vehicle, req, (v) => toClientVehicle(v, rules.todayInJerusalem()));
    if (stale) return send(res, 409, stale);

    const data = readVehicleBody({ ...vehicle, ...req.body, trailer: { ...vehicle.trailer, ...(req.body?.trailer || {}) } });
    if (data.status === "archived") return fail(res, 400, "استخدم زر الأرشفة لأرشفة المركبة");
    const errors = rules.validateVehicle(data);
    if (Object.keys(errors).length) return fail(res, 400, "تحقق من الحقول المطلوبة", { errors });
    if (await plateInUse(data.plate, vehicle._id)) {
      return fail(res, 409, "رقم اللوحة مسجل مسبقًا", { errors: { plate: "رقم اللوحة مسجل مسبقًا" } });
    }
    if (data.responsibleId !== (vehicle.responsibleId || "")) {
      const responsibleError = await checkResponsible(data.responsibleId);
      if (responsibleError) return fail(res, 400, responsibleError, { errors: { responsibleId: responsibleError } });
    }

    const changes = rules.diffFields(vehicle, data, BASIC_FIELDS);
    if (!changes.length) {
      const names = await loadUserNames();
      return send(res, 200, { ok: true, vehicle: toClientVehicle(vehicle, rules.todayInJerusalem(), names), changed: false });
    }
    const saved = await saveVehicle(vehicle, data, req.actor, { guarded: true });
    if (!saved) {
      return send(res, 409, await raceLost(() => VehicleModelDef.get({ _id: String(vehicle._id) }), (v) => toClientVehicle(v, rules.todayInJerusalem())));
    }
    // When fields came from an official import the user approved, keep where
    // they came from and when.
    const importSource = readImportSource(req.body?.importSource);
    await audit(saved, req, "update", { before: vehicle, changes, details: importSource });
    const names = await loadUserNames();
    return send(res, 200, { ok: true, vehicle: toClientVehicle(saved, rules.todayInJerusalem(), names), changed: true });
  } catch (err) {
    logWithSource("Vehicle.update", err);
    return fail(res, 500, SERVER_ERROR);
  }
};

const archive = async (req, res) => {
  try {
    const vehicle = await findVehicle(req.params.id);
    if (!vehicle) return fail(res, 404, "المركبة غير موجودة");
    if (vehicle.status === "archived") return fail(res, 409, "المركبة مؤرشفة مسبقًا");
    const reason = clean(req.body?.reason, 500);
    const saved = await saveVehicle(
      vehicle,
      { status: "archived", previousStatus: vehicle.status, archivedAt: new Date().toISOString(), archivedBy: actorId(req.actor) },
      req.actor
    );
    await audit(saved, req, "archive", { before: vehicle, reason, changes: [{ field: "status", from: vehicle.status, to: "archived" }] });
    return send(res, 200, { ok: true, vehicle: toClientVehicle(saved, rules.todayInJerusalem(), await loadUserNames()) });
  } catch (err) {
    logWithSource("Vehicle.archive", err);
    return fail(res, 500, SERVER_ERROR);
  }
};

const restore = async (req, res) => {
  try {
    const vehicle = await findVehicle(req.params.id);
    if (!vehicle) return fail(res, 404, "المركبة غير موجودة");
    if (vehicle.status !== "archived") return fail(res, 409, "المركبة غير مؤرشفة");
    const status = vehicle.previousStatus === "out_of_service" ? "out_of_service" : "active";
    const saved = await saveVehicle(vehicle, { status, previousStatus: "", archivedAt: "", archivedBy: "" }, req.actor);
    await audit(saved, req, "restore", { before: vehicle, changes: [{ field: "status", from: "archived", to: status }] });
    return send(res, 200, { ok: true, vehicle: toClientVehicle(saved, rules.todayInJerusalem(), await loadUserNames()) });
  } catch (err) {
    logWithSource("Vehicle.restore", err);
    return fail(res, 500, SERVER_ERROR);
  }
};

// Permanent delete: the vehicle with its licences, tests, policies, document
// records, Drive files and change log. The plate must be typed back as
// confirmation. Drive goes first: if a file cannot be removed nothing else is
// deleted, so no orphaned file is left behind and the delete can be retried.
// Nothing about the vehicle is kept afterwards (owner's explicit request).
const remove = async (req, res) => {
  try {
    const vehicle = await findVehicle(req.params.id);
    if (!vehicle) return fail(res, 404, "المركبة غير موجودة");
    if (rules.normalizePlate(req.body?.confirmPlate) !== vehicle.plate) {
      return fail(res, 400, "اكتب رقم اللوحة بشكل صحيح لتأكيد الحذف", { errors: { confirmPlate: "رقم اللوحة غير مطابق" } });
    }
    const stale = checkVersion(vehicle, req, (v) => toClientVehicle(v, rules.todayInJerusalem()));
    if (stale) return send(res, 409, stale);

    const documents = vehicle.documents || [];
    let failed = 0;
    for (const doc of documents) {
      try {
        await googleDrive.deleteByIdIfExists(doc.driveFileId);
      } catch (err) {
        failed += 1;
        logWithSource("Vehicle.remove.drive", err);
      }
    }
    if (failed > 0) {
      return fail(res, 502, `تعذر حذف ${failed} من ملفات Google Drive. لم يُحذف شيء، حاول مرة أخرى`);
    }
    try {
      const { folderId } = await googleDrive.resolveFolderPath(`Vehicles/${vehicle.plate}`);
      if (folderId) await googleDrive.deleteByIdIfExists(folderId);
    } catch (err) {
      logWithSource("Vehicle.remove.folder", err); // an empty leftover folder is harmless
    }

    await VehicleAuditDef.delete({ vehicleId: String(vehicle._id) });
    await VehicleModelDef.delete({ _id: String(vehicle._id) });
    notifyChange("vehicle", String(vehicle._id));
    // Only the fact of the delete: nothing else about the vehicle is kept.
    await auditLog.record(req, {
      module: "vehicles", action: "delete", targetType: "vehicle",
      targetId: vehicle._id, targetLabel: vehicle.plate,
    });
    return send(res, 200, { ok: true, deletedId: String(vehicle._id) });
  } catch (err) {
    logWithSource("Vehicle.remove", err);
    return fail(res, 500, SERVER_ERROR);
  }
};

// ------------------------------------------- licence / test / insurance records

// Applies `patch` to `record`, and for the date fields listed in `guarded`
// requires a reason, then logs each change on the record's own history.
function applyRecordPatch(record, patch, { fields, guarded, reason, actor }) {
  const corrections = [];
  const next = { ...record };
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    const incoming = blankToEmpty(patch[field]);
    const before = blankToEmpty(record[field]);
    if (JSON.stringify(incoming) === JSON.stringify(before)) continue;
    next[field] = incoming;
    if (guarded.includes(field) && before !== "") {
      corrections.push({ at: new Date().toISOString(), by: actorId(actor), byName: actorName(actor), field, from: before, to: incoming, reason });
    }
  }
  next.corrections = [...(record.corrections || []), ...corrections];
  return { next, corrections };
}

const needsReason = (corrections, reason) => corrections.length > 0 && !reason;

const readLicenseBody = (body = {}) => ({
  validFrom: clean(body.validFrom, 10),
  validUntil: clean(body.validUntil, 10),
  feeStatus: clean(body.feeStatus, 20) || "unknown",
  feePaidDate: clean(body.feePaidDate, 10),
  feeAmount: toAmount(body.feeAmount),
  notes: clean(body.notes, 2000),
});

const readTestBody = (body = {}) => ({
  testDate: clean(body.testDate, 10),
  result: clean(body.result, 20),
  institute: clean(body.institute),
  notes: clean(body.notes, 2000),
  defects: clean(body.defects, 2000),
  retestDate: clean(body.retestDate, 10),
  nextTestDate: clean(body.nextTestDate, 10),
  exemptionReason: clean(body.exemptionReason, 500),
});

const readPolicyBody = (body = {}) => ({
  type: clean(body.type, 20),
  insurer: clean(body.insurer),
  policyNumber: clean(body.policyNumber, 60),
  startDate: clean(body.startDate, 10),
  endDate: clean(body.endDate, 10),
  cost: toAmount(body.cost),
  deductible: toAmount(body.deductible),
  agentName: clean(body.agentName),
  agentContact: clean(body.agentContact, 200),
  driverRestrictions: clean(body.driverRestrictions, 1000),
  minDriverAge: body.minDriverAge === undefined || body.minDriverAge === null || body.minDriverAge === "" ? "" : Number(body.minDriverAge),
  towingAssistance: clean(body.towingAssistance, 1000),
  notes: clean(body.notes, 2000),
});

const LICENSE_FIELDS = ["validFrom", "validUntil", "feeStatus", "feePaidDate", "feeAmount", "notes"];
const TEST_FIELDS = ["testDate", "result", "institute", "notes", "defects", "retestDate", "exemptionReason"];
const POLICY_FIELDS = [
  "type", "insurer", "policyNumber", "startDate", "endDate", "cost", "deductible", "agentName",
  "agentContact", "driverRestrictions", "minDriverAge", "towingAssistance", "notes",
];

// One handler set for the three record kinds keeps their rules identical.
const RECORD_KINDS = {
  license: {
    list: "licenses",
    read: readLicenseBody,
    validate: rules.validateLicense,
    fields: LICENSE_FIELDS,
    guarded: ["validFrom", "validUntil"],
    label: "الرخصة",
  },
  test: {
    list: "tests",
    read: readTestBody,
    validate: rules.validateTest,
    fields: TEST_FIELDS,
    guarded: ["testDate", "retestDate"],
    label: "الفحص",
  },
  policy: {
    list: "policies",
    read: readPolicyBody,
    validate: rules.validatePolicy,
    fields: POLICY_FIELDS,
    guarded: ["startDate", "endDate"],
    label: "البوليصة",
  },
};

function addRecordHandler(kind) {
  const config = RECORD_KINDS[kind];
  return async (req, res) => {
    try {
      const vehicle = await findVehicle(req.params.id);
      if (!vehicle) return fail(res, 404, "المركبة غير موجودة");
      if (!requireNotArchived(res, vehicle)) return;

      const data = config.read(req.body);
      const errors = config.validate(data);
      if (Object.keys(errors).length) return fail(res, 400, "تحقق من الحقول المطلوبة", { errors });

      const record = {
        id: randomUUID(),
        ...data,
        corrections: [],
        recordedBy: actorId(req.actor),
        recordedByName: actorName(req.actor),
        recordedAt: new Date().toISOString(),
      };
      const patch = { [config.list]: [...(vehicle[config.list] || []), record] };
      const changes = [{ field: config.list, from: "", to: `${config.label} جديدة` }];

      // A recorded test may carry the official next date; it becomes the
      // vehicle's current one. The previous value stays in the audit log.
      if (kind === "test" && data.nextTestDate && data.nextTestDate !== (vehicle.nextTestDate || "")) {
        patch.nextTestDate = data.nextTestDate;
        changes.push({ field: "nextTestDate", from: vehicle.nextTestDate || "", to: data.nextTestDate });
      }

      const saved = await saveVehicle(vehicle, patch, req.actor);
      await audit(saved, req, `${kind}.add`, { before: vehicle, changes, details: { recordId: record.id } });
      return send(res, 201, { ok: true, vehicle: toClientVehicle(saved, rules.todayInJerusalem(), await loadUserNames()) });
    } catch (err) {
      logWithSource(`Vehicle.add.${kind}`, err);
      return fail(res, 500, SERVER_ERROR);
    }
  };
}

function updateRecordHandler(kind) {
  const config = RECORD_KINDS[kind];
  return async (req, res) => {
    try {
      const vehicle = await findVehicle(req.params.id);
      if (!vehicle) return fail(res, 404, "المركبة غير موجودة");
      if (!requireNotArchived(res, vehicle)) return;
      const list = vehicle[config.list] || [];
      const index = list.findIndex((record) => record.id === req.params.recordId);
      if (index < 0) return fail(res, 404, `${config.label} غير موجودة`);
      const record = list[index];
      if (record.voidedAt) return fail(res, 409, `${config.label} ملغاة ولا يمكن تعديلها`);
      if (record.cancelledAt) return fail(res, 409, "البوليصة ملغاة ولا يمكن تعديلها");

      const reason = clean(req.body?.reason, 500);
      const merged = { ...record, ...config.read({ ...record, ...req.body }) };
      const errors = config.validate(merged);
      if (Object.keys(errors).length) return fail(res, 400, "تحقق من الحقول المطلوبة", { errors });

      const patch = config.read({ ...record, ...req.body });
      const { next, corrections } = applyRecordPatch(record, patch, {
        fields: config.fields,
        guarded: config.guarded,
        reason,
        actor: req.actor,
      });
      if (needsReason(corrections, reason)) {
        return fail(res, 400, "سبب التصحيح مطلوب عند تغيير التواريخ", { errors: { reason: "سبب التصحيح مطلوب" } });
      }
      const changes = config.fields
        .filter((field) => JSON.stringify(blankToEmpty(record[field])) !== JSON.stringify(blankToEmpty(next[field])))
        .map((field) => ({ field: `${config.list}.${field}`, from: blankToEmpty(record[field]), to: blankToEmpty(next[field]) }));
      if (!changes.length) {
        return send(res, 200, { ok: true, changed: false, vehicle: toClientVehicle(vehicle, rules.todayInJerusalem(), await loadUserNames()) });
      }
      const nextList = list.map((item, i) => (i === index ? next : item));
      const saved = await saveVehicle(vehicle, { [config.list]: nextList }, req.actor);
      await audit(saved, req, `${kind}.update`, { before: vehicle, changes, reason, details: { recordId: record.id } });
      return send(res, 200, { ok: true, changed: true, vehicle: toClientVehicle(saved, rules.todayInJerusalem(), await loadUserNames()) });
    } catch (err) {
      logWithSource(`Vehicle.update.${kind}`, err);
      return fail(res, 500, SERVER_ERROR);
    }
  };
}

// Voiding (licence/test) and cancelling (policy) keep the record in history.
function retireRecordHandler(kind) {
  const config = RECORD_KINDS[kind];
  const stampField = kind === "policy" ? "cancelledAt" : "voidedAt";
  return async (req, res) => {
    try {
      const vehicle = await findVehicle(req.params.id);
      if (!vehicle) return fail(res, 404, "المركبة غير موجودة");
      if (!requireNotArchived(res, vehicle)) return;
      const reason = clean(req.body?.reason, 500);
      if (!reason) return fail(res, 400, "السبب مطلوب", { errors: { reason: "السبب مطلوب" } });
      const list = vehicle[config.list] || [];
      const index = list.findIndex((record) => record.id === req.params.recordId);
      if (index < 0) return fail(res, 404, `${config.label} غير موجودة`);
      if (list[index][stampField]) return fail(res, 409, "تم إلغاؤها مسبقًا");
      const stamp = rules.todayInJerusalem();
      const next = { ...list[index], [stampField]: stamp, [`${stampField.replace("At", "")}Reason`]: reason, [`${stampField.replace("At", "")}By`]: actorId(req.actor) };
      const nextList = list.map((item, i) => (i === index ? next : item));

      const patch = { [config.list]: nextList };
      const changes = [{ field: `${config.list}.${stampField}`, from: "", to: stamp }];
      // Voiding the test that set the official next date does not erase that
      // date; it stays until someone records or corrects it, with a reason.
      const saved = await saveVehicle(vehicle, patch, req.actor);
      await audit(saved, req, `${kind}.retire`, { before: vehicle, changes, reason, details: { recordId: next.id } });
      return send(res, 200, { ok: true, vehicle: toClientVehicle(saved, rules.todayInJerusalem(), await loadUserNames()) });
    } catch (err) {
      logWithSource(`Vehicle.retire.${kind}`, err);
      return fail(res, 500, SERVER_ERROR);
    }
  };
}

// Correcting the official next test date: the old value is kept in the log.
const setNextTestDate = async (req, res) => {
  try {
    const vehicle = await findVehicle(req.params.id);
    if (!vehicle) return fail(res, 404, "المركبة غير موجودة");
    if (!requireNotArchived(res, vehicle)) return;
    const nextTestDate = clean(req.body?.nextTestDate, 10);
    const reason = clean(req.body?.reason, 500);
    if (nextTestDate && !rules.isValidDateOnly(nextTestDate)) {
      return fail(res, 400, "التاريخ غير صالح", { errors: { nextTestDate: "التاريخ غير صالح" } });
    }
    const before = vehicle.nextTestDate || "";
    if (before === nextTestDate) {
      return send(res, 200, { ok: true, changed: false, vehicle: toClientVehicle(vehicle, rules.todayInJerusalem(), await loadUserNames()) });
    }
    if (before && !reason) return fail(res, 400, "سبب التصحيح مطلوب", { errors: { reason: "سبب التصحيح مطلوب" } });
    const saved = await saveVehicle(vehicle, { nextTestDate }, req.actor);
    await audit(saved, req, "nextTest.set", { before: vehicle, changes: [{ field: "nextTestDate", from: before, to: nextTestDate }], reason });
    return send(res, 200, { ok: true, changed: true, vehicle: toClientVehicle(saved, rules.todayInJerusalem(), await loadUserNames()) });
  } catch (err) {
    logWithSource("Vehicle.setNextTestDate", err);
    return fail(res, 500, SERVER_ERROR);
  }
};

// ------------------------------------------------------------------- documents

const LINK_TYPES = { vehicle: null, license: "licenses", test: "tests", policy: "policies" };

const uploadDocument = async (req, res) => {
  try {
    const vehicle = await findVehicle(req.params.id);
    if (!vehicle) return fail(res, 404, "المركبة غير موجودة");
    if (!requireNotArchived(res, vehicle)) return;
    if (!req.file) return fail(res, 400, "الملف مطلوب");

    const kind = clean(req.body?.kind, 20) || "other";
    if (!rules.DOCUMENT_KINDS.includes(kind)) return fail(res, 400, "نوع المستند غير صالح");
    const linkedType = clean(req.body?.linkedType, 20) || "vehicle";
    if (!Object.prototype.hasOwnProperty.call(LINK_TYPES, linkedType)) return fail(res, 400, "ربط المستند غير صالح");
    const linkedId = clean(req.body?.linkedId, 60);
    // linkedId may be empty: the file then belongs to the whole section.
    if (LINK_TYPES[linkedType] && linkedId) {
      const exists = (vehicle[LINK_TYPES[linkedType]] || []).some((record) => record.id === linkedId);
      if (!exists) return fail(res, 400, "السجل المرتبط بالمستند غير موجود");
    }

    const replacesId = clean(req.body?.replacesId, 60);
    const documents = vehicle.documents || [];
    if (replacesId && !documents.some((doc) => doc.id === replacesId && !doc.supersededAt)) {
      return fail(res, 400, "المستند المراد استبداله غير موجود");
    }

    const inspected = inspectDocument(req.file.buffer);
    if (!inspected.ok) return fail(res, 400, inspected.message);

    const name = buildDocumentName({ plateKey: vehicle.plate, kind, ext: inspected.ext });
    let uploaded;
    try {
      uploaded = await googleDrive.uploadPrivateFile({
        buffer: req.file.buffer,
        name,
        mimeType: inspected.mime,
        folderPath: `Vehicles/${vehicle.plate}`,
      });
    } catch (err) {
      const friendly = googleDrive.translateDriveError ? googleDrive.translateDriveError(err) : err;
      logWithSource("Vehicle.uploadDocument.drive", err);
      return fail(res, 502, friendly.message || "تعذر رفع الملف إلى Google Drive");
    }

    const now = new Date().toISOString();
    const doc = {
      id: randomUUID(),
      kind,
      name,
      // Optional display name chosen by the user; the Drive name stays generated.
      title: clean(req.body?.title, 100),
      mimeType: inspected.mime,
      size: req.file.buffer.length,
      driveFileId: uploaded.id,
      linkedType,
      linkedId: LINK_TYPES[linkedType] ? linkedId : "",
      replacesId,
      uploadedBy: actorId(req.actor),
      uploadedByName: actorName(req.actor),
      uploadedAt: now,
      supersededAt: "",
    };
    // The replaced document stays downloadable and is only marked superseded.
    const nextDocuments = documents
      .map((item) => (item.id === replacesId ? { ...item, supersededAt: now, supersededBy: doc.id } : item))
      .concat(doc);
    const saved = await saveVehicle(vehicle, { documents: nextDocuments }, req.actor);
    await audit(saved, req, "document.add", {
      before: vehicle,
      changes: [{ field: "documents", from: replacesId || "", to: doc.id }],
      details: { kind, linkedType, name },
    });
    return send(res, 201, { ok: true, document: publicDocument(doc), vehicle: toClientVehicle(saved, rules.todayInJerusalem(), await loadUserNames()) });
  } catch (err) {
    logWithSource("Vehicle.uploadDocument", err);
    return fail(res, 500, SERVER_ERROR);
  }
};

const updateDocument = async (req, res) => {
  try {
    const vehicle = await findVehicle(req.params.id);
    if (!vehicle) return fail(res, 404, "المركبة غير موجودة");
    if (!requireNotArchived(res, vehicle)) return;
    const documents = vehicle.documents || [];
    const doc = documents.find((item) => item.id === req.params.docId);
    if (!doc) return fail(res, 404, "المستند غير موجود");

    const title = clean(req.body?.title, 100);
    const before = doc.title || "";
    if (title === before) {
      return send(res, 200, { ok: true, changed: false, vehicle: toClientVehicle(vehicle, rules.todayInJerusalem(), await loadUserNames()) });
    }
    const next = documents.map((item) => (item.id === doc.id ? { ...item, title } : item));
    const saved = await saveVehicle(vehicle, { documents: next }, req.actor);
    await audit(saved, req, "document.rename", {
      before: vehicle,
      changes: [{ field: "documents.title", from: before, to: title }],
      details: { documentId: doc.id, kind: doc.kind },
    });
    return send(res, 200, { ok: true, changed: true, vehicle: toClientVehicle(saved, rules.todayInJerusalem(), await loadUserNames()) });
  } catch (err) {
    logWithSource("Vehicle.updateDocument", err);
    return fail(res, 500, SERVER_ERROR);
  }
};

// Deletes one file: from Drive first (so none is left behind), then the record.
// If this file had replaced an older one, the older one becomes current again.
const removeDocument = async (req, res) => {
  try {
    const vehicle = await findVehicle(req.params.id);
    if (!vehicle) return fail(res, 404, "المركبة غير موجودة");
    if (!requireNotArchived(res, vehicle)) return;
    const documents = vehicle.documents || [];
    const doc = documents.find((item) => item.id === req.params.docId);
    if (!doc) return fail(res, 404, "المستند غير موجود");

    try {
      await googleDrive.deleteByIdIfExists(doc.driveFileId);
    } catch (err) {
      logWithSource("Vehicle.removeDocument.drive", err);
      return fail(res, 502, "تعذر حذف الملف من Google Drive. لم يُحذف شيء، حاول مرة أخرى");
    }
    const next = documents
      .filter((item) => item.id !== doc.id)
      .map((item) => (item.supersededBy === doc.id ? { ...item, supersededAt: "", supersededBy: "" } : item));
    const saved = await saveVehicle(vehicle, { documents: next }, req.actor);
    await audit(saved, req, "document.delete", {
      before: vehicle,
      changes: [{ field: "documents", from: doc.id, to: "" }],
      details: { kind: doc.kind, name: doc.name, title: doc.title || "" },
    });
    return send(res, 200, { ok: true, vehicle: toClientVehicle(saved, rules.todayInJerusalem(), await loadUserNames()) });
  } catch (err) {
    logWithSource("Vehicle.removeDocument", err);
    return fail(res, 500, SERVER_ERROR);
  }
};

const downloadDocument = async (req, res) => {
  try {
    const vehicle = await findVehicle(req.params.id);
    if (!vehicle) return fail(res, 404, "المركبة غير موجودة");
    const doc = (vehicle.documents || []).find((item) => item.id === req.params.docId);
    if (!doc) return fail(res, 404, "المستند غير موجود");

    let stream;
    try {
      stream = await googleDrive.downloadStream(doc.driveFileId);
    } catch (err) {
      logWithSource("Vehicle.downloadDocument.drive", err);
      return fail(res, 502, "تعذر جلب الملف من Google Drive");
    }
    const inline = req.query?.inline === "1";
    res.set({
      "Content-Type": doc.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, no-store",
    });
    stream.on("error", (err) => {
      logWithSource("Vehicle.downloadDocument.stream", err);
      if (!res.headersSent) fail(res, 502, "تعذر جلب الملف");
      else res.destroy(err);
    });
    return stream.pipe(res);
  } catch (err) {
    logWithSource("Vehicle.downloadDocument", err);
    return fail(res, 500, SERVER_ERROR);
  }
};

// ----------------------------------------------------------------- alerts/audit

const SEVERITY = { expired: 0, due0: 1, due7: 2, due14: 3, due30: 4, due60: 5, missing: 6 };

const getAlerts = async (req, res) => {
  try {
    const today = rules.todayInJerusalem();
    const found = await VehicleModelDef.get({});
    const all = (found?.result || []).flatMap((vehicle) => rules.buildAlerts(vehicle, today));
    const alerts = rules.hasVehiclePermission(req.actor, "view")
      ? all
      : rules.filterAlertsForUser(all, req.actor);
    alerts.sort((a, b) => SEVERITY[a.level] - SEVERITY[b.level] || (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
    return send(res, 200, { ok: true, today, alerts });
  } catch (err) {
    logWithSource("Vehicle.getAlerts", err);
    return fail(res, 500, SERVER_ERROR);
  }
};

const getAudit = async (req, res) => {
  try {
    const vehicle = await findVehicle(req.params.id);
    if (!vehicle) return fail(res, 404, "المركبة غير موجودة");
    const found = await VehicleAuditDef.get({ vehicleId: String(vehicle._id) });
    const entries = (found?.result || []).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return send(res, 200, { ok: true, entries });
  } catch (err) {
    logWithSource("Vehicle.getAudit", err);
    return fail(res, 500, SERVER_ERROR);
  }
};

// A proposal only: nothing is saved here. The user reviews it in the form and
// applies fields one by one; the source is then recorded with that edit.
const officialLookup = async (req, res) => {
  const plateKey = rules.normalizePlate(req.params.plate);
  if (rules.validatePlate(plateKey)) return fail(res, 400, rules.validatePlate(plateKey));
  return send(res, 200, { ok: true, ...(await lookupByPlate(plateKey)) });
};

module.exports = {
  requireVehiclePermission,
  DELETE_KEY,
  getMyPermissions,
  listResponsibles,
  getAll,
  getById,
  create,
  update,
  archive,
  restore,
  remove,
  addLicense: addRecordHandler("license"),
  updateLicense: updateRecordHandler("license"),
  voidLicense: retireRecordHandler("license"),
  addTest: addRecordHandler("test"),
  updateTest: updateRecordHandler("test"),
  voidTest: retireRecordHandler("test"),
  addPolicy: addRecordHandler("policy"),
  updatePolicy: updateRecordHandler("policy"),
  cancelPolicy: retireRecordHandler("policy"),
  setNextTestDate,
  uploadDocument,
  updateDocument,
  removeDocument,
  downloadDocument,
  getAlerts,
  getAudit,
  officialLookup,
};
