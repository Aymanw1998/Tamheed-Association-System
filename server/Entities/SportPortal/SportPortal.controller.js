const { ensureFootball } = require("../Sport/Sport.controller");
const { SportPlayerModelDef } = require("../Sport/SportPlayer.model");
const { SportLessonModelDef } = require("../Sport/SportLesson.model");
const { SportAttendanceModelDef } = require("../Sport/SportAttendance.model");
const drive = require("../../services/googleDrive.service");
const { ageOn, buildCard, nextLesson } = require("../../utils/sportCards");
const { logWithSource } = require("../../middleware/logger");

const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";
const HISTORY_LIMIT = 60;
const rows = (r) => (r?.success && Array.isArray(r.result) ? r.result : []);
const sid = (v) => String(v);
const slot = (l) => ({ name: l.name, day: l.date.day, startMin: l.date.startMin, endMin: l.date.endMin });
// "YYYY-MM-DD" from the stored birth date, or null.
const birthDay = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
};

// Dependencies are injectable so the handlers can be tested without a database.
function createSportPortalController(deps = {}) {
  const {
    ensureSport = ensureFootball,
    players = SportPlayerModelDef,
    lessons = SportLessonModelDef,
    attendance = SportAttendanceModelDef,
    files = drive,
    log = logWithSource,
    now = () => new Date(),
  } = deps;

  const me = async (req, res) => {
    try {
      const student = req.sportStudent;
      const studentId = sid(student._id);
      const at = now();

      const player = rows(await players.get({ studentId }))[0];
      if (!player) return res.status(401).json({ ok: false, code: "SPORT_AUTH" });
      const sport = await ensureSport();

      // Only this student's own rows are read; nothing of anyone else is loaded into the answer.
      const myLessons = rows(await lessons.get({ "players.studentId": studentId }))
        .filter((l) => (l.players || []).some((p) => sid(p.studentId) === studentId));
      const records = rows(await attendance.get({ studentId }));
      const byId = new Map(myLessons.map((l) => [sid(l._id), l]));

      const history = records
        .filter((r) => byId.has(sid(r.sportLessonId)))
        .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))
        .slice(0, HISTORY_LIMIT)
        .map((r) => ({ date: r.date, lessonName: byId.get(sid(r.sportLessonId)).name, status: r.status }));

      const card = buildCard({ player, sport, lessons: myLessons, records });
      const { statDefs, values, attendance: summary, jerseyNumber, position } = card;
      const ordered = [...myLessons].sort((x, y) => x.date.day - y.date.day || x.date.startMin - y.date.startMin);

      return res.json({
        ok: true,
        student: {
          firstname: student.firstname || "",
          lastname: student.lastname || "",
          age: ageOn(student.birth_date, at),
          birthDate: birthDay(student.birth_date),
          hasPhoto: Boolean(student.photo),
        },
        card: {
          sport: { name: sport.name, icon: sport.icon },
          jerseyNumber,
          position,
          statDefs,
          values,
          attendance: summary,
        },
        lessons: ordered.map(slot),
        nextLesson: nextLesson(myLessons, at),
        history,
      });
    } catch (err) {
      log("SportPortal.me", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  const photo = async (req, res) => {
    try {
      const fileId = req.sportStudent.photo ? files.extractFileId(req.sportStudent.photo) : null;
      if (!fileId) return res.status(404).json({ ok: false });
      const stream = await files.downloadStream(fileId);
      let failed = false;
      const fail = (e) => {
        if (failed) return;
        failed = true;
        log("SportPortal.photo", e);
        if (!res.headersSent) res.removeHeader?.("Cache-Control");
        if (!res.headersSent) res.status(404).json({ ok: false });
        else res.destroy?.();
      };
      stream.on("error", fail);
      res.set("Content-Type", "image/jpeg");
      res.set("Cache-Control", "private, max-age=3600");
      res.set("X-Content-Type-Options", "nosniff");
      stream.pipe(res);
      return undefined;
    } catch (err) {
      log("SportPortal.photo", err);
      return res.status(404).json({ ok: false });
    }
  };

  return { me, photo };
}

module.exports = { ...createSportPortalController(), createSportPortalController };
