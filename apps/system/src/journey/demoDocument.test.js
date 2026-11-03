import { showDemoDocument } from "./demoDocument";
import { startDemo, stopDemo } from "./demoMode";

const dialog = () => document.querySelector('[aria-label="معاينة المستند"]');

afterEach(() => {
  stopDemo();
  document.body.innerHTML = "";
});

test("shows the demo document's text in the page and closes with the button", async () => {
  startDemo();
  await showDemoDocument(new Blob(["نص تجريبي"]), "رخصة.pdf");
  expect(dialog().textContent).toContain("نص تجريبي");
  expect(dialog().textContent).toContain("رخصة.pdf");
  dialog().querySelector("button").click();
  expect(dialog()).toBeNull();
});

test("closes when training mode stops", async () => {
  startDemo();
  await showDemoDocument(new Blob(["x"]), "a");
  expect(dialog()).not.toBeNull();
  stopDemo();
  expect(dialog()).toBeNull();
});
