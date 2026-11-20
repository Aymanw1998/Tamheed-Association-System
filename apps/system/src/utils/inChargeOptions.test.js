import { inChargeGroups, inChargeError, EDUCATIONAL_NEEDS_GUIDE } from "./inChargeOptions";

const USERS = [
  { _id: "a1", firstname: "مدير", lastname: "أول", role: "ادارة", tz: "123451111" },
  { _id: "g1", firstname: "أحمد", lastname: "مرشد", roles: ["مرشد"], tz: "123452222" },
  { _id: "h1", firstname: "سامي", lastname: "مساعد", roles: ["مساعد"], tz: "123453333" },
  { _id: "h2", firstname: "أحمد", lastname: "مساعد", roles: ["مساعد"], tz: "123454444" },
];
const ids = (groups) => groups.map((g) => [g.label, g.users.map((u) => u._id)]);

test("a regular program lists managers, guides and assistants", () => {
  expect(ids(inChargeGroups(USERS, { kind: "regular" }))).toEqual([
    ["الإدارة", ["a1"]], ["المرشدون", ["g1"]], ["المساعدون", ["h1", "h2"]],
  ]);
});

test("a درس تربوي hides the assistants", () => {
  expect(ids(inChargeGroups(USERS, { kind: "educational" }))).toEqual([["الإدارة", ["a1"]], ["المرشدون", ["g1"]]]);
});

test("typing narrows by name or the last 4 tz digits; the chosen person stays", () => {
  expect(ids(inChargeGroups(USERS, { search: "أحمد" }))).toEqual([["المرشدون", ["g1"]], ["المساعدون", ["h2"]]]);
  expect(ids(inChargeGroups(USERS, { search: "3333" }))).toEqual([["المساعدون", ["h1"]]]);
  expect(ids(inChargeGroups(USERS, { search: "3333", chosen: "a1" }))).toEqual([["الإدارة", ["a1"]], ["المساعدون", ["h1"]]]);
});

test("the program's «المساعد» is not offered as «المسؤول»", () => {
  expect(ids(inChargeGroups(USERS, { exclude: "h1" }))[2]).toEqual(["المساعدون", ["h2"]]);
});

test("an assistant in charge of a درس تربوي gives the message", () => {
  expect(inChargeError(USERS, { kind: "educational", teacher: "h1" })).toBe(EDUCATIONAL_NEEDS_GUIDE);
  expect(inChargeError(USERS, { kind: "educational", teacher: "g1" })).toBeNull();
  expect(inChargeError(USERS, { kind: "regular", teacher: "h1" })).toBeNull();
});

// Testing review, 2026-11-20: the chosen person always keeps an option.
test("a chosen assistant stays listed on a درس تربوي, with the message", () => {
  expect(ids(inChargeGroups(USERS, { kind: "educational", chosen: "h1" }))).toEqual([["الإدارة", ["a1"]], ["المرشدون", ["g1"]], ["المساعدون", ["h1"]]]);
  expect(inChargeError(USERS, { kind: "educational", teacher: "h1" })).toBe(EDUCATIONAL_NEEDS_GUIDE);
});

test("a chosen person no longer on the staff list keeps an option of his own", () => {
  const { UNLISTED_LABEL } = require("./inChargeOptions");
  const groups = inChargeGroups(USERS, { chosen: "gone" });
  expect(groups[groups.length - 1].label).toBe(UNLISTED_LABEL);
  expect(groups[groups.length - 1].users.map((u) => u._id)).toEqual(["gone"]);
  expect(inChargeGroups(USERS, {}).some((g) => g.label === UNLISTED_LABEL)).toBe(false);
});
