const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const express = require("express");
const jwt = require("jsonwebtoken");
const { Readable } = require("node:stream");
const SECRET = "synthetic-storage-test-secret";
async function fixture({ mime = "application/pdf", nativeLink = "https://docs.google.com/document/d/synthetic/edit" } = {}) {
  const calls = [];
  const info = { name: "ملف تجريبي.pdf", mimeType: mime, webViewLink: nativeLink };
  const drive = {
    async uploadPrivateFile(options) { calls.push(["private-upload", options.folderPath]); return { id: "file-id", viewUrl: "https://drive.google.test/file-id" }; },
    async uploadFile() { throw new Error("public upload must not be used for Storages"); },
    extractFileId: () => "file-id",
    getFileInfo: async () => info,
    downloadStream: async () => { calls.push(["download"]); return Readable.from([Buffer.from("synthetic bytes")]); },
    exportStream: async () => { calls.push(["export"]); return Readable.from([Buffer.from("synthetic export")]); },
    translateDriveError: (err) => err,
  };
  const dependencies = {
    express, fs: { mkdirSync() {}, createReadStream: () => Readable.from([Buffer.from("synthetic upload")]), promises: { unlink: async () => {} } },
    jsonwebtoken: jwt, os: require("node:os"), path,
    multer: Object.assign(() => ({ single: () => (req, res, next) => { req.file = { path: "synthetic", originalname: "file.pdf", mimetype: "application/pdf", size: 10 }; next(); } }), { memoryStorage: () => ({}) }),
    "./Storage.model": { StorageModelDef: { get: async ({ relativePath }) => ({ success: true, result: relativePath === "tamheed_db/root/file.pdf" ? [{ type: "file", url: "https://drive.google.test/file-id" }] : [] }) } },
    "../../services/googleDrive.service": drive,
    "../../utils/textEncoding": { repairMisencodedText: (value) => value },
    "stream/promises": require("node:stream/promises"),
  };
  const module = { exports: {} }, filename = path.join(__dirname, "../Entities/Storage/CentralStorageBackend.route.js");
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), { module, Buffer, process: { env: { STORAGE_SIGNED_URL_SECRET: SECRET } }, require(name) {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name];
  } }, { filename });
  const app = express(); app.use(express.json()); app.use("/storage", module.exports);
  const server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/storage`;
  const signed = (download = false) => `${base}/file/file.pdf?token=${jwt.sign({ path: "tamheed_db/root/file.pdf", download }, SECRET, { expiresIn: "2m" })}`;
  return { base, signed, calls, close: () => server.close(), info };
}
test("new association uploads use private Drive storage while retaining the logical API path", async () => {
  const f = await fixture();
  try {
    const result = await fetch(`${f.base}/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dbName: "tamheed_db", collection: "root", folder: "docs" }) });
    assert.equal(result.status, 201);
    assert.deepEqual(f.calls, [["private-upload", "tamheed_db/root/docs"]]);
    assert.ok((await result.json()).url);
  } finally { f.close(); }
});
test("ordinary private files stream only with a valid short-lived capability; full PDF bytes stay available", async () => {
  const f = await fixture();
  try {
    assert.equal((await fetch(`${f.base}/file/file.pdf`)).status, 400);
    assert.equal((await fetch(`${f.base}/file/file.pdf?token=forged`)).status, 401);
    const expired = jwt.sign({ path: "tamheed_db/root/file.pdf", exp: 1 }, SECRET);
    assert.equal((await fetch(`${f.base}/file/file.pdf?token=${expired}`)).status, 401);
    assert.deepEqual(f.calls, []);
    const result = await fetch(f.signed());
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("Content-Type"), "application/pdf");
    assert.equal(result.headers.get("Cache-Control"), "private, no-store");
    assert.ok(result.headers.get("Content-Disposition").startsWith("inline;"));
    assert.equal(await result.text(), "synthetic bytes");
    const download = await fetch(f.signed(true));
    assert.ok(download.headers.get("Content-Disposition").startsWith("attachment;"));
  } finally { f.close(); }
});
test("active uploaded HTML/SVG files are attachments rather than executable pages on the application origin", async () => {
  for (const mime of ["text/html", "image/svg+xml"]) {
    const f = await fixture({ mime });
    try {
      const result = await fetch(f.signed());
      assert.ok(result.headers.get("Content-Disposition").startsWith("attachment;"));
      assert.equal(result.headers.get("X-Content-Type-Options"), "nosniff");
    } finally { f.close(); }
  }
});
test("native Google documents open their editor and download via authenticated PDF export", async () => {
  const f = await fixture({ mime: "application/vnd.google-apps.document" });
  try {
    const opened = await fetch(f.signed(), { redirect: "manual" });
    assert.equal(opened.status, 302);
    assert.equal(opened.headers.get("Location"), f.info.webViewLink);
    assert.deepEqual(f.calls, []);
    const downloaded = await fetch(f.signed(true));
    assert.equal(downloaded.headers.get("Content-Type"), "application/pdf");
    assert.equal(await downloaded.text(), "synthetic export");
    assert.deepEqual(f.calls, [["export"]]);
  } finally { f.close(); }
});
