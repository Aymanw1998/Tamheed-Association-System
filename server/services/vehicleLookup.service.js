// Optional import of official vehicle data by plate from data.gov.il (Ministry
// of Transport "private and commercial vehicles" dataset, CKAN datastore API).
//
// Rules this file keeps:
// - Manual entry never depends on it: any failure returns { available: false }
//   instead of throwing.
// - The result is a PROPOSAL to review (source + fetch time), never saved here.
// - Only descriptive fields are proposed (make, model, year, colour, chassis).
//   The dataset's date fields (tokef_dt, mivchan_acharon_dt) have no published
//   definition, so they are passed through as source information only and are
//   never mapped to the licence or test dates.
// - The dataset covers private vehicles and light commercial ones; trailers are
//   not assumed to be in it, so "not found" is an ordinary answer.
const axios = require("axios");

const SOURCE = {
  name: "data.gov.il",
  dataset: "private-and-commercial-vehicles",
  resourceId: "053cea08-09bc-40ec-8f7a-156f0677aff3",
  endpoint: "https://data.gov.il/api/3/action/datastore_search",
};
const TIMEOUT_MS = 8000;

// Source field names as returned by the datastore (checked against the live
// API response). Everything outside `proposed` is shown, not applied.
const INFORMATIONAL_FIELDS = [
  "sug_degem",
  "kvutzat_zihum",
  "ramat_gimur",
  "sug_delek_nm",
  "baalut",
  "mivchan_acharon_dt",
  "tokef_dt",
  "moed_aliya_lakvish",
];

const clean = (value) => (value === undefined || value === null ? "" : String(value).trim());

// The dataset stores the plate as a number, so only digit plates can be looked up.
function plateToNumber(plateKey) {
  const text = clean(plateKey);
  if (!/^\d{5,8}$/.test(text)) return null;
  return Number(text);
}

function buildProposal(record, { plateKey, fetchedAt }) {
  const make = clean(record.tozeret_nm);
  const model = clean(record.kinuy_mishari) || clean(record.degem_nm);
  const year = Number(record.shnat_yitzur);
  return {
    source: { name: SOURCE.name, dataset: SOURCE.dataset, resourceId: SOURCE.resourceId },
    fetchedAt,
    plateKey,
    status: "pending_review",
    proposed: {
      make,
      model,
      year: Number.isInteger(year) && year > 0 ? year : "",
      color: clean(record.tzeva_rechev),
      chassisNumber: clean(record.misgeret).toUpperCase(),
    },
    informational: Object.fromEntries(
      INFORMATIONAL_FIELDS.map((field) => [field, clean(record[field])]).filter(([, value]) => value !== "")
    ),
  };
}

async function lookupByPlate(plateKey, { http = axios, now = () => new Date() } = {}) {
  const number = plateToNumber(plateKey);
  if (number === null) {
    return { available: true, found: false, reason: "not_applicable", message: "البحث متاح للوحات الرقمية فقط (5 إلى 8 أرقام)." };
  }
  try {
    const response = await http.get(SOURCE.endpoint, {
      params: { resource_id: SOURCE.resourceId, filters: JSON.stringify({ mispar_rechev: number }), limit: 2 },
      timeout: TIMEOUT_MS,
    });
    const body = response.data;
    if (!body || body.success !== true || !Array.isArray(body.result?.records)) {
      return { available: false, reason: "bad_response", message: "رد غير متوقع من data.gov.il. أدخل البيانات يدويًا." };
    }
    const records = body.result.records;
    if (records.length === 0) {
      return {
        available: true,
        found: false,
        reason: "not_found",
        message: "لا توجد مركبة بهذا الرقم في قاعدة البيانات الرسمية (المقطورات غالبًا غير مشمولة). أدخل البيانات يدويًا.",
      };
    }
    if (records.length > 1) {
      return { available: true, found: false, reason: "ambiguous", message: "وُجد أكثر من سجل بهذا الرقم، ولا يمكن اقتراح بيانات بأمان." };
    }
    return { available: true, found: true, proposal: buildProposal(records[0], { plateKey, fetchedAt: now().toISOString() }) };
  } catch (err) {
    return { available: false, reason: "unreachable", message: "تعذر الوصول إلى data.gov.il الآن. أدخل البيانات يدويًا." };
  }
}

module.exports = { lookupByPlate, buildProposal, plateToNumber, SOURCE };
