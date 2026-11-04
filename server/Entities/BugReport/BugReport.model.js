const api = require("../api");

// Problem reports. The picture is its own row, so lists never load it, and is
// deleted with the report. Report: type ("fault"|"suggestion"|"problem"),
// source ("auto"|"manual"), reporterName, reporterRole, section, page, action,
// errorKind ("server"|"network"|"crash"|""), errorStatus, errorCode,
// errorMessage, errorSource, requestId, text, hasImage, device, createdAt.
const dbName = process.env.DB_NAME || "tamheed_db";

const modelOf = (collection) => ({
  async get(filter = {}) {
    return await api.read({ dbName, collection, filter });
  },
  async create(data) {
    return await api.create({ dbName, collection, data });
  },
  // How many rows were deleted.
  async remove(filter) {
    return (await api.delete({ dbName, collection, filter }))?.result?.deletedCount || 0;
  },
});

module.exports = {
  BugReportModel: modelOf("BugReports"),
  BugReportImageModel: modelOf("BugReportImages"),
};
