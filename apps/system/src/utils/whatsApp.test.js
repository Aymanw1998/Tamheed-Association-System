import { whatsAppUrl, openWhatsApp, REGISTRATION_TEXT } from "./whatsApp";

test("the WhatsApp link carries the message and the link, with no phone number", () => {
  const url = whatsAppUrl(REGISTRATION_TEXT, "https://example.test/register-student/abc");
  expect(url.startsWith("https://wa.me/?text=")).toBe(true);
  expect(decodeURIComponent(url.split("text=")[1])).toBe(`${REGISTRATION_TEXT}\nhttps://example.test/register-student/abc`);
});

test("opening it uses a new tab without access back to the page", () => {
  const open = jest.spyOn(window, "open").mockImplementation(() => null);
  openWhatsApp("hi", "https://example.test/x");
  expect(open).toHaveBeenCalledWith(whatsAppUrl("hi", "https://example.test/x"), "_blank", "noopener,noreferrer");
  open.mockRestore();
});
