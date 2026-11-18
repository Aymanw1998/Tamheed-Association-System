import { weeklyProgramRows, rosterRows } from "./printLists";

test("the week's program prints Sunday to Saturday, then by start time", () => {
  const rows = weeklyProgramRows([
    { name: "ب", room: 2, teacher: "t2", date: { day: 2, startMin: 900, endMin: 960 } },
    { name: "أ", room: 1, teacher: "t1", date: { day: 1, startMin: 960, endMin: 1020 } },
    { name: "ج", room: 1, teacher: "t1", date: { day: 1, startMin: 840, endMin: 900 } },
    { name: "بلا يوم", date: {} },
  ], { teacherName: (l) => ({ t1: "مرشد 1", t2: "مرشد 2" })[l.teacher], roomName: (r) => `غرفة ${r}` });
  expect(rows).toEqual([
    ["الأحد", "14:00–15:00", "ج", "غرفة 1", "مرشد 1"],
    ["الأحد", "16:00–17:00", "أ", "غرفة 1", "مرشد 1"],
    ["الاثنين", "15:00–16:00", "ب", "غرفة 2", "مرشد 2"],
  ]);
});

test("a program's list has its students only, numbered by name, without phones or ids", () => {
  const rows = rosterRows({ list_students: ["s2", "s1"] }, [
    { _id: "s1", firstname: "يوسف", lastname: "ع", layer: "سابع", school: "م", father_phone: "050", tz: "1" },
    { _id: "s2", firstname: "أحمد", lastname: "ب", layer: "ثامن", school: "ن" },
    { _id: "s3", firstname: "خارج", lastname: "البرنامج" },
  ]);
  expect(rows).toEqual([["1", "أحمد ب", "ثامن", "ن"], ["2", "يوسف ع", "سابع", "م"]]);
  expect(JSON.stringify(rows)).not.toContain("050");
});
