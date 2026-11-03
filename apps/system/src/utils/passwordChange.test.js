import { newPasswordError, resetPasswordError, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, isForcedChange } from "./passwordChange";
import { accessStrings } from "../i18n/accessStrings";

test("the new password mirrors the server rule: 8+ characters, different, confirmed", () => {
  expect(MIN_PASSWORD_LENGTH).toBe(8);
  const base = { currentPassword: "old-pass-1", newPassword: "brand-new-9", confirmPassword: "brand-new-9" };
  expect(newPasswordError(base)).toBe(null);
  expect(newPasswordError({ ...base, currentPassword: "" })).toBe("BAD_INPUT");
  expect(newPasswordError({ ...base, newPassword: "short", confirmPassword: "short" })).toBe("PASSWORD_TOO_SHORT");
  expect(newPasswordError({ ...base, newPassword: "old-pass-1", confirmPassword: "old-pass-1" })).toBe("PASSWORD_SAME");
  expect(newPasswordError({ ...base, confirmPassword: "other-pass-9" })).toBe("MISMATCH");
});

test("only a login answer flagged mustChangePassword with a token is a forced change", () => {
  expect(isForcedChange({ ok: true, mustChangePassword: true, accessToken: "t" })).toBe(true);
  expect(isForcedChange({ ok: true, accessToken: "t" })).toBe(false);
  expect(isForcedChange({ ok: true, mustChangePassword: true })).toBe(false);
  expect(isForcedChange(null)).toBe(false);
});

test("the forced change screen has its strings", () => {
  const keys = Object.keys(accessStrings.ar.passwordChange).sort();
  expect(keys.length).toBeGreaterThan(5);
});

test("the own-password form has its strings", () => {
  expect(accessStrings.ar.passwordChange.current).toBeTruthy();
  expect(accessStrings.ar.passwordChange.ownTitle).toBeTruthy();
});

test("the reset-by-email form checks 8 to 128 characters and the confirmation before sending", () => {
  expect(MAX_PASSWORD_LENGTH).toBe(128);
  const ok = { newPassword: "brand-new-9", confirmPassword: "brand-new-9" };
  expect(resetPasswordError(ok)).toBe(null);
  expect(resetPasswordError({ ...ok, newPassword: "" })).toBe("BAD_INPUT");
  expect(resetPasswordError({ newPassword: "short", confirmPassword: "short" })).toBe("PASSWORD_TOO_SHORT");
  const long = "x".repeat(129);
  expect(resetPasswordError({ newPassword: long, confirmPassword: long })).toBe("PASSWORD_TOO_LONG");
  expect(resetPasswordError({ newPassword: "x".repeat(128), confirmPassword: "x".repeat(128) })).toBe(null);
  expect(resetPasswordError({ ...ok, confirmPassword: "other-pass-9" })).toBe("MISMATCH");
  // The forced change applies the same upper limit.
  expect(newPasswordError({ currentPassword: "old-pass-1", newPassword: long, confirmPassword: long })).toBe("PASSWORD_TOO_LONG");
});

test("the reset form's 8-128 hint exists", () => {
  expect(accessStrings.ar.passwordChange.resetHint).toMatch(/8/);
  expect(accessStrings.ar.passwordChange.resetHint).toMatch(/128/);
  expect(accessStrings.ar.passwordChange.errors.PASSWORD_TOO_LONG).toMatch(/128/);
});
