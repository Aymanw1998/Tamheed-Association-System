import { ROOM_OPTIONS, isNamedPlace, roomLabel } from "./rooms";

test.each([
  ["1", false],
  ["5", false],
  ["6", true],
  ["9", true],
  [8, true],
  ["0", false],
  [null, false],
])("room %p is a named place: %p", (room, want) => {
  expect(isNamedPlace(room)).toBe(want);
});

test.each([
  ["1", "غرفة 1"],
  ["5", "غرفة 5"],
  ["6", "المصلى"],
  ["7", "مقر قديم"],
  ["8", "الساحة"],
  ["9", "التدريب الخارجي"],
  [3, "غرفة 3"],
  [6, "المصلى"],
  ["0", "بدون غرفة"],
  ["", "بدون غرفة"],
  [null, "بدون غرفة"],
  [undefined, "بدون غرفة"],
])("room %p is shown as %p", (room, want) => {
  expect(roomLabel(room)).toBe(want);
});

test("the lesson form offers rooms 1 to 9 with their names", () => {
  expect(ROOM_OPTIONS).toEqual([
    { value: "1", label: "غرفة 1" },
    { value: "2", label: "غرفة 2" },
    { value: "3", label: "غرفة 3" },
    { value: "4", label: "غرفة 4" },
    { value: "5", label: "غرفة 5" },
    { value: "6", label: "المصلى" },
    { value: "7", label: "مقر قديم" },
    { value: "8", label: "الساحة" },
    { value: "9", label: "التدريب الخارجي" },
  ]);
});
