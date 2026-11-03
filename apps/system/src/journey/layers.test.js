// The guide must stay above the document overlays it opens (demo documents and
// the PDF preview), and the confirm dialog stays under the guide.
const fs = require("fs");
const path = require("path");

const read = (file) => fs.readFileSync(path.join(__dirname, file), "utf8");
const zIndexes = (text) => [...text.matchAll(/z-?index["']?\s*:\s*["']?(\d+)/gi)].map((m) => Number(m[1]));

test("the ring, the chapter bar and the guide sit above every document overlay", () => {
  const overlays = [
    ...zIndexes(read("demoDocument.js")),
    ...zIndexes(read("../Components/ExportPDF/pdfPreview.js")),
  ];
  expect(overlays.length).toBeGreaterThan(0);
  const top = Math.max(...overlays);
  const guide = [...zIndexes(read("Journey.module.css")), ...zIndexes(read("Guide.module.css"))];
  expect(guide.length).toBeGreaterThanOrEqual(3);
  guide.forEach((z) => expect(z).toBeGreaterThan(top));
});

test("the confirm dialog stays under the guide", () => {
  const confirm = Math.max(...zIndexes(read("../Components/Provides/ConfirmContext.css")));
  const guide = Math.min(...zIndexes(read("Guide.module.css")));
  expect(confirm).toBeLessThan(guide);
});
