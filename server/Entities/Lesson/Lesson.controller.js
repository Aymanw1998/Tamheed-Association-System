//server
const { logWithSource } = require("../../middleware/logger");
const Lesson = require("./Lesson.model")
const mongoose = require("mongoose");

function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(value);

    if (typeof value === 'string') {
        const s = value.trim();

        // dd-mm-yyyy או dd/mm/yyyy
        let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
        if (m) {
        const [, dd, mm, yyyy] = m.map(Number);
        return new Date(Date.UTC(yyyy, mm - 1, dd)); // UTC כדי להימנע מהפתעות שעון קיץ
        }

        // yyyy-mm-dd (ISO קצר)
        m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) {
        const [, yyyy, mm, dd] = m.map(Number);
        return new Date(Date.UTC(yyyy, mm - 1, dd));
        }

        const ts = Date.parse(s);
        if (!Number.isNaN(ts)) return new Date(ts);
    }
    return null; // לא תקין
}

const toInt = (value, defaultValue = 0) => Number.isFinite(Number(value)) ? Number(value) : defaultValue;
const clamp = (num, min, max) => Math.min(min, Math.min(num, max));
function overlap(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
}

const buildLessonData = (body) => {
    const day   = toInt(body?.date?.day,   1);
    const startMin = toInt(body?.date?.startMin,  9*60)
    const endMin   = toInt(body?.date?.endMin,    10*60)
    return {
        name: body.name,
        date: { day, startMin, endMin },
        teacher: body.teacher || null,
        helper: body.helper || null,
        room: body.room || "-1",
        list_students: Array.isArray(body.list_students) ? body.list_students : [],
    };    
};


const getAll = async(req, res) => {
    try {
        // תמיכה פילטרים אופציונליים: ?day=1,....,7&teacher=
        const lessons = await Lesson.find().lean();
        return res.status(200).json({ ok: true, lessons });
    } catch (err) {
        logWithSource("err", err);
        return res.status(500).json({ ok: false, message: err.message });
    }
}

const getOne = async (req, res) => {
    try {
        const { id } = req.params;
        const {day, teacher} = req.query;
        if (!mongoose.Types.ObjectId.isValid(id))
        return res.status(400).json({ ok: false, message: 'invalid id' });
        const lesson = await Lesson.findById(id)
        if (!lesson) return res.status(404).json({ ok: false, message: 'לא נמצא' });

        lesson.num_in_list = (lesson.list_students || []).length;
        return res.status(200).json({ ok: true, lesson });
    } catch (err) {
        logWithSource("err", err);
        return res.status(500).json({ ok: false, message: err.message });
    }
}

const getLessonsByQuery = async (req, res) => {
    try{
        console.log("in func api getLessonsByQuery", req.query);
        const{search, day, teacher, helper,} = req.query;
        const filter = {};
        if(day !== undefined) filter["date.day"] = Number(day);
        if(teacher) filter["teacher"] = teacher;
        if(helper)  filter["helper"]  = helper;
        console.log(filter);
        const [items, total] = await Promise.all([
            Lesson.find(filter)
                .populate("teacher", "_id tz firstname lastname roles")
                .populate("helper", "_id tz firstname lastname roles")
        ])
        return res.status(201).json({
            ok: true,
            lessons: items,
            pagination: {
                total,
            },
        });

    }
    catch(err) {
        return res.status(500).json({
            ok: false, message: "يوجد خطأ في جلب البيانات المطلوبة"
        })
    }
}
const postOne = async(req, res) => {
    try {
        console.log("body".yellow, req.body);
        const model = buildLessonData(req.body);
        console.log("model".green, model);
        if (!model?.name || !model?.teacher) {
            return res.status(400).json({ ok: false, message: 'missing required fields' });
        }

        // חיפוש חפיפה באותו יום/חודש/שנה ולאותו מאמן
        const sameDay = await Lesson.find({
        'date.day':   model.date.day,
        teacher:      model.teacher,
        }).lean();

        const conflict = sameDay.some(l => overlap(model.date.startMin, model.date.endMin, l.date.startMin, l.date.endMin));
        if (conflict) {
            return res.status(409).json({ ok:false, message:'יש חפיפה בשעות האלה' });
        }
        const doc = await Lesson.create({ ...model });
        doc.num_in_list = (doc.list_students || []).length;
        return res.status(201).json({ ok:true, lesson: doc });
    } catch (err) {
        logWithSource("err", err);
        return res.status(500).json({ ok: false, message: err.message });
    }
}

const putOne = async(req, res) => {
    try {
        const { id } = req.params;
        const current = await Lesson.findById(id);
        if (!current) return res.status(404).json({ ok:false, message:'לא נמצא' });

        const next = buildLessonData({ ...current.toObject(), ...req.body });
        
        const changedSlot =
            next.date.day      !== current.date.day      ||
            next.date.startMin !== current.date.startMin ||
            next.date.endMin   !== current.date.endMin   ||
            next.teacher       !== current.teacher ||
            next.helper       !== current.helper;

        if (changedSlot) {
            const sameDay = await Lesson.find({
                _id: { $ne: current._id },
                'date.day':   next.date.day,
                teacher:      next.teacher,
            }).lean();

            const conflict = sameDay.some(l =>
                overlap(next.date.startMin, next.date.endMin, l.date.startMin, l.date.endMin)
            );
            if (conflict) {
                return res.status(409).json({ ok:false, message:'יש חפיפה בשעות האלה' });
            }
        }

        console.log("current", current);
        console.log("next", next);
        current.name           = next.name;
        current.date.day       = next.date.day;
        current.date.startMin  = next.date.startMin;
        current.date.endMin    = next.date.endMin;
        current.teacher        = next.teacher;
        current.helper         = next.helper;
        current.list_students  = next.list_students;
        current.room           = next.room;
        current.updatedAt      = new Date();

        await current.save();
        return res.status(200).json({ ok:true, lesson: current });
    } catch (err) {
        return res.status(500).json({ ok:false, message: err.message });
    }
};
const deleteOne= async(req, res) => {
    try {
        console.log("params", req.params)
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id))
            return res.status(400).json({ ok: false, message: 'invalid id' });

        const deleted = await Lesson.findOneAndDelete({ _id: id });
        console.log("deleted", deleted);
        if (!deleted) return res.status(404).json({ ok: false, message: 'לא נמצא' });

        return res.status(200).json({ ok: true, removed: true });
    } catch (err) {
        logWithSource("err", err);
        return res.status(500).json({ ok: false, message: err.message });
    }
}

const addToList = async(req, res) => {
    try {
        console.log(req.params,req.body);
        const { id } = req.params;
        const {list_students} = req.body;
        if (!list_students.length) return res.status(400).json({ ok: false, message: 'list_students is empty' });

        const lesson = await Lesson.findById(id);
        if (!lesson) return res.status(404).json({ ok: false, message: 'לא נמצא' });

        // מסננים כפולים/קיימים
        const set = new Set((lesson.list_students || []).map(String));
        const toAdd = list_students.filter(t => !set.has(String(t)));

        // // קיבולת
        // if (lesson.list_students.length + toAdd.length > lesson.max_trainees) {
        // return res.status(400).json({ ok: false, code: 'OVER_CAPACITY', message: 'אין מקום פנוי' });
        // }
        

        lesson.list_students.push(...toAdd);
        lesson.list_students = lesson.list_students.filter((t) => t !== null && t !== undefined); // ייחוד
        lesson.updated = new Date();
        await lesson.save();

        lesson.num_in_list = lesson.list_students.length;
        return res.status(200).json({ ok: true, lesson });
    } catch (err) {
        logWithSource("err", err);
        return res.status(500).json({ ok: false, message: err.message });
    }
}

const removeFromList = async(req, res) => {
    try {
        const { id } = req.params;
        const trainees = Array.isArray(req.body?.list_students) ? req.body.list_students : [];
        if (!trainees.length) return res.status(400).json({ ok: false, message: 'list_students is empty' });

        const lesson = await Lesson.findById(id);
        if (!lesson) return res.status(404).json({ ok: false, message: 'לא נמצא' });

        const removeSet = new Set(trainees.map(String));
        lesson.list_students = (lesson.list_students || []).filter(t => !removeSet.has(String(t)));
        lesson.updated = new Date();
        await lesson.save();

        return res.status(200).json({ ok: true, lesson });
    } catch (err) {
        logWithSource("err", err);
        return res.status(500).json({ ok: false, message: err.message });
    }
}

// העתקת שיעורים מחודש אחד לאחר
function isInt(n){ return Number.isInteger(Number(n)); }

// שדות זהים נחשבים "כפילות" בחודש היעד
// אפשר לשנות את הקריטריון אם תרצה (למשל גם name)
function sameSlot(a, b){
    return (
        Number(a?.date?.day) === Number(b?.date?.day) &&
        Number(a?.date?.startMin ?? a?.date?.hh*60) === Number(b?.date?.startMin ?? b?.date?.hh*60) &&
        String(a?.teacher||'') === String(b?.teacher||'')
    );
    }

const copyMonth = async (req, res) => {
  try {
    // פרמטרים אופציונליים בבקשה (אפשר גם בגוף וגם ב-query)
    const q = { ...req.query, ...(req.body||{}) };

    // ברירת־מחדל: מהחודש הנוכחי אל החודש הבא
    const now = new Date();
    const fromMonth = isInt(q.fromMonth) ? Number(q.fromMonth) : (now.getMonth()+1);
    const fromYear  = isInt(q.fromYear)  ? Number(q.fromYear)  : now.getFullYear();

    const d = new Date(fromYear, fromMonth-1, 1);
    d.setMonth(d.getMonth()+1);
    const toMonth = isInt(q.toMonth) ? Number(q.toMonth) : (d.getMonth()+1);
    const toYear  = isInt(q.toYear)  ? Number(q.toYear)  : d.getFullYear();

    // אופציות:
    const overwrite = q.overwrite === 'true' || q.overwrite === true; // למחוק כפילויות ביעד וליצור מחדש
    const keepTrainees = q.keepTrainees === 'true' || q.keepTrainees === true; // לשכפל גם משתתפים
    const teacherOnly  = q.teacherOnly ? String(q.teacherOnly) : null; // להעתיק רק שיעורים של מאמן מסוים (אופציונלי)

    // שלוף את כל שיעורי חודש המקור
    const filterFrom = {
      'date.month': fromMonth,
      'date.year':  fromYear,
    };
    if (teacherOnly) filterFrom.teacher = new mongoose.Types.ObjectId(teacherOnly);

    const sourceLessons = await Lesson.find(filterFrom).lean();

    if (!sourceLessons.length) {
      return res.status(200).json({ ok:true, copied:0, skipped:0, message:'אין שיעורים בחודש המקור' });
    }

    // שלוף את כל שיעורי חודש היעד כדי לזהות כפילויות
    const filterTo = {
      'date.month': toMonth,
      'date.year':  toYear,
    };
    const targetLessons = await Lesson.find(filterTo).lean();

    // נבנה פעולות bulk
    const ops = [];
    let copied = 0, skipped = 0, removed = 0;

    // אם overwrite – נמחק ביעד פריטים שנחשבים "זהים" למשבצות שיגיעו מהמקור
    if (overwrite && targetLessons.length) {
      const idsToDelete = [];
      for (const src of sourceLessons) {
        const match = targetLessons.find(t => sameSlot(src, t));
        if (match) idsToDelete.push(match._id);
      }
      if (idsToDelete.length) {
        ops.push({
          deleteMany: { filter: { _id: { $in: idsToDelete } } }
        });
        removed += idsToDelete.length;
      }
    }

    // צור רשומות חדשות (דלג על כאלה שכבר קיימות כשלא-overwrite)
    for (const src of sourceLessons) {
      const already = targetLessons.find(t => sameSlot(src, t));
      if (already && !overwrite) { skipped++; continue; }

      const startMin = (src?.date?.startMin ?? (src?.date?.hh*60)) ?? 8*60;
      const endMin   = (src?.date?.endMin   ?? (startMin + 45));
      const doc = {
        name: src.name,
        date: {
          day:   src.date.day,
          startMin,
          endMin,
        },
        teacher: src.teacher,
        helper: src.helper,
        room: src.room,
        list_students: keepTrainees ? (src.list_students || []) : [], // אפשר לאפס
        createdAt: new Date(),
        updatedAt: null,
      };
      ops.push({ insertOne: { document: doc } });
      copied++;
    }

    if (!ops.length) {
      return res.status(200).json({ ok:true, copied:0, skipped, removed, message:'אין מה לעדכן' });
    }

    const result = await Lesson.bulkWrite(ops, { ordered:false });
    return res.status(200).json({ ok:true, copied, skipped, removed, result });
  } catch (err) {
    return res.status(500).json({ ok:false, message:err.message });
  }
};

const deletePerMonth = async(req, res) => {
    try {
        const { month, year } = req.params;
        console.log("deletePerMonth", month, year);
        if (!isInt(month) || !isInt(year)) {
            return res.status(400).json({ ok:false, message:'invalid month/year' });
        }
        const result = await Lesson.deleteMany({ 'date.month': month, 'date.year': year });
        return res.status(200).json({ ok:true, deletedCount: result.deletedCount });
    } catch (err) {
        return res.status(500).json({ ok:false, message: err.message });
    }
};

module.exports = {getAll, getOne, postOne, putOne, deleteOne, addToList, removeFromList, copyMonth, deletePerMonth, getLessonsByQuery}