const assert = require("node:assert/strict");
const test = require("node:test");

const { MAX_DOCUMENT_BYTES, buildDocumentName, inspectDocument } = require("../utils/vehicleFiles");

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(8)]);
const pdf = Buffer.from("%PDF-1.7\nbody");

test("accepts PDF and common images by their bytes", () => {
  assert.deepEqual(inspectDocument(pdf), { ok: true, mime: "application/pdf", ext: ".pdf" });
  assert.deepEqual(inspectDocument(png), { ok: true, mime: "image/png", ext: ".png" });
  assert.deepEqual(inspectDocument(jpg), { ok: true, mime: "image/jpeg", ext: ".jpg" });
  assert.deepEqual(inspectDocument(webp), { ok: true, mime: "image/webp", ext: ".webp" });
});

test("rejects executables, scripts, HTML, SVG and archives", () => {
  const samples = [
    Buffer.from("MZ\x90\x00 executable"),
    Buffer.from("#!/bin/sh\nrm -rf /"),
    Buffer.from("<html><script>alert(1)</script></html>"),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'),
    Buffer.from("PK\x03\x04 zip"),
    Buffer.from("GIF89a....."),
  ];
  for (const sample of samples) assert.equal(inspectDocument(sample).ok, false);
});

test("rejects empty input, non-buffers and files over the limit", () => {
  assert.equal(inspectDocument(Buffer.alloc(0)).ok, false);
  assert.equal(inspectDocument("%PDF-1.4").ok, false);
  assert.equal(inspectDocument(undefined).ok, false);
  const big = Buffer.concat([Buffer.from("%PDF-1.4"), Buffer.alloc(MAX_DOCUMENT_BYTES)]);
  assert.equal(inspectDocument(big).ok, false);
});

test("buildDocumentName never uses the uploaded name or unsafe characters", () => {
  const name = buildDocumentName({
    plateKey: "12-345/67",
    kind: "li cense/../x",
    ext: ".pdf",
    now: new Date("2026-10-02T09:08:07Z"),
  });
  assert.equal(name, "1234567_licensex_20261002090807.pdf");
  assert.equal(buildDocumentName({ ext: ".png", now: new Date("2026-10-02T09:08:07Z") }), "vehicle_other_20261002090807.png");
});
