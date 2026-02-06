const Attendance = require("./Attendance.model");
const Lesson = require("../Lesson/Lesson.model");
const { default: mongoose } = require("mongoose");

const calcDateKey = (y, m, d) => (y * 10000) + (m * 100) + d;

function teacherName(t) {
  if (!t) return "";
  if (t.name) return t.name;
  return `${t.firstname || ""} ${t.lastname || ""}`.trim();
}

async function getSheet(req, res) {
  console.log("getSheet", req.query);
  try {
    const { lessonId, year, month, day } = req.query;
    const y = Number(year), m = Number(month), d = Number(day);

    if (!lessonId || !y || !m || !d) {
      return res.status(400).json({ ok: false, message: "lessonId, year, month, day required" });
    }

    const dateKey = calcDateKey(y, m, d);

    const lesson = await Lesson.findById(lessonId)
      .populate("teacher", "firstname lastname name")
      .populate("list_students", "firstname lastname name tz")
      .select("name date room teacher list_students")
      .lean();

    if (!lesson) return res.status(404).json({ ok: false, message: "Lesson not found" });

    const students = lesson.list_students || [];

    const existing = await Attendance.find({ lesson: lessonId, dateKey })
      .select("student status notes")
      .lean();

    const map = new Map(existing.map(a => [String(a.student), a]));

    // items מלאים להצגה
    const items = students.map(st => {
      const row = map.get(String(st._id));
      const studentName = st.name || `${st.firstname || ""} ${st.lastname || ""}`.trim();
      return {
        studentId: String(st._id),
        studentName,
        tz: st.tz,
        status: row?.status ?? "حاضر",
        notes: row?.notes ?? "",
      };
    });

    // ensure rows קיימים (אם חסר)
    const missingDocs = students
      .filter(st => !map.has(String(st._id)))
      .map(st => ({
        lesson: lessonId,
        student: st._id,
        year: y,
        month: m,
        day: d,
        dateKey,
        status: "حاضر",
        notes: "",
      }));

    if (missingDocs.length) {
      await Attendance.insertMany(missingDocs, { ordered: false }).catch(() => {});
    }

    return res.status(200).json({
      ok: true,
      schema: {
        lessonId: String(lessonId),
        lessonName: lesson.name,
        room: lesson.room,
        teacherName: teacherName(lesson.teacher),
        startMin: lesson.date?.startMin,
        endMin: lesson.date?.endMin,
        year: y, month: m, day: d,
        dateKey,
        items,
      },
    });
  } catch (err) {
    console.error("getSheet error:", err);
    return res.status(500).json({ ok: false, message: "server error" });
  }
}

async function bulkSave(req, res) {
  try {
    const { lessonId, year, month, day, items } = req.body;
    const y = Number(year), m = Number(month), d = Number(day);

    if (!lessonId || !y || !m || !d || !Array.isArray(items)) {
      return res.status(400).json({ ok: false, message: "lessonId, year, month, day, items required" });
    }

    const dateKey = calcDateKey(y, m, d);

    const ops = items.map(it => ({
      updateOne: {
        filter: { lesson: lessonId, student: it.studentId, dateKey },
        update: {
          $set: {
            year: y, month: m, day: d, dateKey,
            status: it.status ?? "حاضر",
            notes: it.notes ?? "",
          },
        },
        upsert: true,
      },
    }));

    const r = await Attendance.bulkWrite(ops, { ordered: false });

    return res.status(200).json({ ok: true, schema: { result: r } });
  } catch (err) {
    console.error("bulkSave error:", err);
    return res.status(500).json({ ok: false, message: "server error" });
  }
}

async function getLessonDates(req, res) {
  try {
    const { lessonId } = req.query;
    console.log("getLessonDates", req.query);
    if (!lessonId) return res.status(400).json({ ok: false, message: "lessonId required" });
    const lessonObjId = new mongoose.Types.ObjectId(lessonId);
    // מביא רק dateKey-ים ייחודיים
    const rows = await Attendance.aggregate([
      { $match: { lesson: lessonObjId } },
      { $group: { _id: "$dateKey" } },
      { $sort: { _id: -1 } },
      { $limit: 500 },
    ]);
    console.log(rows);
    // המרה ל-YYYY-MM-DD להצגה
    const dates = rows.map(r => {
      const dk = Number(r._id);
      const y = Math.floor(dk / 10000);
      const m = Math.floor((dk % 10000) / 100);
      const d = dk % 100;
      const mm = String(m).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      return { dateKey: dk, year: y, month: m, day: d, ymd: `${dd}/${mm}/${y}` };
    });
  console.log(dates);
    return res.status(200).json({ ok: true, schema: dates });
  } catch (err) {
    console.error("getLessonDates error:", err);
    return res.status(500).json({ ok: false, message: "server error" });
  }
}

module.exports = { getSheet, bulkSave, getLessonDates };
