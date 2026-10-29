const crypto = require("crypto");
const { ensureFootball } = require("../Sport/Sport.controller");
const { SportPlayerModelDef } = require("../Sport/SportPlayer.model");
const { SportLessonModelDef } = require("../Sport/SportLesson.model");
const { SportAttendanceModelDef } = require("../Sport/SportAttendance.model");
const { UserModelDef } = require("../User/User.model");
const drive = require("../../services/googleDrive.service");
const { ageOn, buildCard, nextLesson, israelToday } = require("../../utils/sportCards");
const { SportNoticeModelDef } = require("../Sport/SportNotice.model");
const { logWithSource } = require("../../middleware/logger");
const { photoVersion } = require("../../utils/photoVersion");
const { playerPhotoJob, cutoutReady } = require("../../services/playerPhotoJob");

const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";
const HISTORY_LIMIT = 60;
const rows = (r) => (r?.success && Array.isArray(r.result) ? r.result : []);
const sid = (v) => String(v);
// An opaque name for this student on this device (no id, no tz): the app
// tells sign-ins apart with it, to keep one student's notices and "seen"
// marks away from the next on a shared phone.
const deviceKey = (studentId) => crypto.createHash("sha1").update(`sport-student:${studentId}`).digest("hex").slice(0, 12);
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
    users = UserModelDef,
    notices = SportNoticeModelDef,
    files = drive,
    playerPhotos = playerPhotoJob,
    log = logWithSource,
    now = () => new Date(),
  } = deps;

  const me = async (req, res) => {
    try {
      const student = req.sportStudent;
      const studentId = sid(student._id);
      const at = now();

      const sport = await ensureSport();
      // Only this student's own rows are read; nothing of anyone else is loaded
      // into the answer. The three reads go together (one round trip).
      // The mentor (main_teacher) is read by id: only the name goes out.
      const mentorId = String(student.main_teacher || "");
      const [playerRows, lessonRows, recordRows, mentorRows] = await Promise.all([
        players.get({ studentId, sportId: sid(sport._id) }),
        lessons.get({ "players.studentId": studentId }),
        attendance.get({ studentId }),
        /^[a-f0-9]{24}$/i.test(mentorId) ? users.get({ _id: mentorId }) : null,
      ]);
      const mentor = rows(mentorRows)[0];
      const player = rows(playerRows)[0];
      if (!player) return res.status(401).json({ ok: false, code: "SPORT_AUTH" });

      const myLessons = rows(lessonRows)
        .filter((l) => (l.players || []).some((p) => sid(p.studentId) === studentId));
      const records = rows(recordRows);
      const byId = new Map(myLessons.map((l) => [sid(l._id), l]));

      const history = records
        .filter((r) => byId.has(sid(r.sportLessonId)))
        .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))
        .slice(0, HISTORY_LIMIT)
        .map((r) => ({ date: r.date, lessonName: byId.get(sid(r.sportLessonId)).name, status: r.status }));

      const card = buildCard({ player, sport, lessons: myLessons, records });
      const { statDefs, values, attendance: summary, jerseyNumber, position } = card;
      // The cut-out player photo once it is made; until then the photo itself.
      const version = photoVersion(student.photo);
      const cutout = cutoutReady(player, student.photo);
      if (version && !cutout && player.photoCutoutFailed !== version) playerPhotos.schedule(studentId);
      const ordered = [...myLessons].sort((x, y) => x.date.day - y.date.day || x.date.startMin - y.date.startMin);

      return res.json({
        ok: true,
        student: {
          key: deviceKey(studentId),
          firstname: student.firstname || "",
          gender: student.gender || "",
          lastname: student.lastname || "",
          age: ageOn(student.birth_date, at),
          birthDate: birthDay(student.birth_date),
          hasPhoto: Boolean(student.photo),
          photoVersion: version && (cutout ? `${version}c` : version),
          photoCutout: cutout,
          mentor: mentor ? [mentor.firstname, mentor.lastname].filter(Boolean).join(" ") : "",
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
      const cut = await playerPhotos.read(req.sportStudent._id, req.sportStudent.photo).catch((e) => {
        log("SportPortal.photo", e);
        return null;
      });
      if (cut) {
        res.set("Content-Type", cut.contentType);
        res.set("Cache-Control", "private, max-age=3600");
        res.set("X-Content-Type-Options", "nosniff");
        return res.send(cut.image);
      }
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

  // The student's own ID number, for their card. Apart from /me, which the
  // sport site keeps offline: this answer is never stored on the phone.
  const idNumber = (req, res) => {
    res.set("Cache-Control", "no-store");
    return res.json({ ok: true, tz: String(req.sportStudent.tz || "") });
  };

  // The notices meant for this student: to every player, or to a lesson they
  // are in; not past their end date. Newest first.
  const NOTICE_LIMIT = 50;
  const myNotices = async (req, res) => {
    try {
      const studentId = sid(req.sportStudent._id);
      const sport = await ensureSport();
      const sportId = sid(sport._id);
      const [playerRows, lessonRows, noticeRows] = await Promise.all([
        players.get({ studentId, sportId }),
        lessons.get({ "players.studentId": studentId }),
        notices.get({ sportId }),
      ]);
      if (!rows(playerRows)[0]) return res.status(401).json({ ok: false, code: "SPORT_AUTH" });
      const mine = new Map(
        rows(lessonRows)
          .filter((l) => sid(l.sportId) === sportId && (l.players || []).some((p) => sid(p.studentId) === studentId))
          .map((l) => [sid(l._id), l.name]),
      );
      const today = israelToday(now());
      const list = rows(noticeRows)
        .filter((n) => (!n.lessonId || mine.has(sid(n.lessonId))) && (!n.expiresOn || n.expiresOn >= today))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, NOTICE_LIMIT)
        .map((n) => ({
          id: sid(n._id), title: n.title, body: n.body || "", createdAt: n.createdAt,
          lessonName: n.lessonId ? mine.get(sid(n.lessonId)) : null,
        }));
      res.set("Cache-Control", "no-store");
      return res.json({ ok: true, notices: list });
    } catch (err) {
      log("SportPortal.notices", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  return { me, photo, idNumber, notices: myNotices };
}

module.exports = { ...createSportPortalController(), createSportPortalController };
