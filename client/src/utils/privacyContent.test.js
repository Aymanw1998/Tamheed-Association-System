import { PRIVACY_CONTACT, PRIVACY_CONTENT, PRIVACY_UPDATED } from "./privacyContent";

test("the privacy policy exists in Arabic, Hebrew and English with matching sections", () => {
  expect(Object.keys(PRIVACY_CONTENT).sort()).toEqual(["ar", "en", "he"]);
  const counts = Object.values(PRIVACY_CONTENT).map((page) => page.sections.length);
  expect(new Set(counts).size).toBe(1);
  for (const page of Object.values(PRIVACY_CONTENT)) {
    expect(page.title).toBeTruthy();
    for (const section of page.sections) {
      expect(section.heading).toBeTruthy();
      expect(section.items.length).toBeGreaterThan(0);
    }
  }
});

test("every language states the Drive scope, the contact address and the update date", () => {
  expect(PRIVACY_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  for (const page of Object.values(PRIVACY_CONTENT)) {
    const text = JSON.stringify(page);
    expect(text).toContain("drive.file");
    expect(text).toContain("Google Drive");
    expect(text).toContain("{contact}");
  }
  expect(PRIVACY_CONTACT).toMatch(/@/);
});
