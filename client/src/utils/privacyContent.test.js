import { PRIVACY_CONTACT, PRIVACY_CONTENT, PRIVACY_UPDATED } from "./privacyContent";

test("the privacy policy has a title and non-empty sections", () => {
  expect(PRIVACY_CONTENT.title).toBeTruthy();
  expect(PRIVACY_CONTENT.sections.length).toBeGreaterThan(0);
  for (const section of PRIVACY_CONTENT.sections) {
    expect(section.heading).toBeTruthy();
    expect(section.items.length).toBeGreaterThan(0);
  }
});

test("the policy states the Drive scope, the contact address and the update date", () => {
  expect(PRIVACY_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const text = JSON.stringify(PRIVACY_CONTENT);
  expect(text).toContain("drive.file");
  expect(text).toContain("Google Drive");
  expect(text).toContain("{contact}");
  expect(PRIVACY_CONTACT).toMatch(/@/);
});
