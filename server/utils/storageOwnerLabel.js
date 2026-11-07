const { isSystemTz, SYSTEM_ACTOR_NAME } = require("./permissions");
function storageOwnerLabel({ ownerId = "", knownName = "", suppliedName = "", relativePath = "" }) {
  if (!ownerId || ownerId === "system" || isSystemTz(ownerId) || /^tamheed_db\/root\/(users|students)$/i.test(relativePath)) return SYSTEM_ACTOR_NAME;
  if (knownName) return knownName;
  if (suppliedName && suppliedName !== ownerId && !/^[a-f\d]{24}$/i.test(suppliedName)) return suppliedName;
  return "غير معروف";
}
module.exports = { storageOwnerLabel };
