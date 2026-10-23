const { SportModelDef } = require("../Sport/Sport.model");
const { SportTeamModelDef } = require("../Sport/SportTeam.model");
const { SportPlayerModelDef } = require("../Sport/SportPlayer.model");
const { SportTrainingModelDef } = require("../Sport/SportTraining.model");
const { StudentModelDef } = require("../Student/Student.model");
const { UserModelDef } = require("../User/User.model");
const drive = require("../../services/googleDrive.service");
const { ageOn, buildCards, nextTraining } = require("../../utils/sportCards");
const { logWithSource } = require("../../middleware/logger");

const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";
const rows = (r) => (r?.success && Array.isArray(r.result) ? r.result : []);
const sid = (v) => String(v);

// Dependencies are injectable so the handlers can be tested without a database.
function createSportPortalController(deps = {}) {
  const {
    sports = SportModelDef,
    teams = SportTeamModelDef,
    players = SportPlayerModelDef,
    trainings = SportTrainingModelDef,
    users = UserModelDef,
    students = StudentModelDef,
    files = drive,
    log = logWithSource,
    now = () => new Date(),
  } = deps;

  const coachName = async (userId) => {
    const u = rows(await users.get({ _id: sid(userId) }, "active"))[0];
    if (!u) return null;
    return [u.firstname, u.lastname].filter(Boolean).join(" ") || null;
  };

  const me = async (req, res) => {
    try {
      const student = req.sportStudent;
      const studentId = sid(student._id);
      const at = now();

      const myPlayers = rows(await players.get({ studentId }));
      const myTeams = rows(await teams.get({ "members.studentId": studentId }));
      const sportIds = new Set([...myPlayers.map((p) => sid(p.sportId)), ...myTeams.map((t) => sid(t.sportId))]);
      const mySports = rows(await sports.get({})).filter((s) => sportIds.has(sid(s._id)));
      const myTrainings = [];
      for (const t of myTeams) myTrainings.push(...rows(await trainings.get({ teamId: sid(t._id) })));

      const input = { players: myPlayers, sports: mySports, teams: myTeams, trainings: myTrainings, studentId, now: at };
      const sportById = new Map(mySports.map((s) => [sid(s._id), s]));

      // Teammates: first and last name only, nothing else from their records.
            const teamsOut = [];
      for (const t of myTeams) {
        const sport = sportById.get(sid(t.sportId));
        const coachNames = [];
        for (const id of t.coachIds || []) {
          const name = await coachName(id);
          if (name) coachNames.push(name);
        }
        const members = [];
        for (const m of t.members || []) {
          if (sid(m.studentId) === studentId) {
            members.push({ firstname: student.firstname || "", lastname: student.lastname || "" });
          } else {
            const mate = rows(await students.get({ _id: sid(m.studentId) }))[0];
            if (mate) members.push({ firstname: mate.firstname || "", lastname: mate.lastname || "" });
          }
        }
        teamsOut.push({
          name: t.name,
          sport: { name: sport?.name || "", icon: sport?.icon || "" },
          coachNames,
          members,
        });
      }

      return res.json({
        ok: true,
        student: {
          firstname: student.firstname || "",
          lastname: student.lastname || "",
          age: ageOn(student.birth_date, at),
          hasPhoto: Boolean(student.photo),
        },
        cards: buildCards(input),
        nextTraining: nextTraining(input),
        teams: teamsOut,
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
