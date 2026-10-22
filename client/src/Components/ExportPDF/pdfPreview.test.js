import { showPdfPreview } from "./pdfPreview";
import { startDemo, stopDemo } from "../../journey/demoMode";

const overlay = () => document.querySelector(".pdfpv-overlay");
const buttons = () => Array.from(overlay().querySelectorAll("button")).map((b) => b.textContent);
const open = () => showPdfPreview({ pdf: { save: jest.fn() }, images: ["data:image/png;base64,"], fileName: "f.pdf", title: "t" });

afterEach(() => {
  stopDemo();
  document.body.innerHTML = "";
});

test("outside training, download and print are offered", () => {
  open();
  expect(buttons()).toEqual(["تنزيل PDF", "طباعة", "إغلاق"]);
});

test("in training, the preview has no download or print", () => {
  startDemo();
  open();
  expect(buttons()).toEqual(["إغلاق"]);
});

test("the preview closes when training mode toggles", () => {
  startDemo();
  open();
  stopDemo();
  expect(overlay()).toBeNull();
  open();
  startDemo();
  expect(overlay()).toBeNull();
});
