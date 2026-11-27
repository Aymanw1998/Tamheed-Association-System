// A student becomes staff (owner, 2026-11-13/14/19; spec
// docs/superpowers/specs/2026-11-19-student-to-staff-design.md, section C).
//
// Phases, stored on the student as staffConversion.phase:
//   preparing -> prepared -> account -> rosters -> done
// Every call (first or «إكمال التحويل») takes the conversion claim on the
// student, then continues from the stored phase. Each step is idempotent, so a
// call that stops anywhere can be resumed and never makes a second account:
// the new user's _id is chosen once, in "prepared", and the user is created
// with it.
//
// Roster writers refuse a student with any staffConversion (utils/rosterGuard),
// and take back an add that raced the "preparing" barrier.
const { settleStudentRow } = require("../utils/conversionAttendance");

const STAFF_ROLES = new Set(["مساعد", "مرشد"]);
const ELIGIBLE_STATUS = "عادي";
const CLAIM_MS = 2 * 60 * 1000;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const answer = (status, body) => ({ status, body });
const BUSY = answer(409, { ok: false, code: "CONVERSION_BUSY", message: "التحويل جارٍ الآن، حاول بعد قليل" });
const DONE = answer(409, { ok: false, code: "ALREADY_STAFF", message: "هذا الطالب صار من الطاقم" });
const NOT_FOUND = answer(404, { ok: false, message: "غير موجود" });
const NOT_ELIGIBLE = answer(409, { ok: false, code: "NOT_ELIGIBLE", message: "يمكن تحويل طالب مقبول فقط (ليس في الانتظار وليس في الأرشيف)" });
const BAD_ROLE = answer(400, { ok: false, code: "UNKNOWN_ROLE", message: "اختر مساعدًا أو مرشدًا" });
const FORBIDDEN = answer(403, { code: "FORBIDDEN", message: "لا توجد صلاحية" });
const AUDIT_FAILED = answer(503, { ok: false, code: "AUDIT_FAILED", message: "تعذر تسجيل العملية، لم يتغير شيء. حاول مرة أخرى" });
const INCOMPLETE = answer(503, { ok: false, code: "CONVERSION_INCOMPLETE", message: "التحويل لم يكتمل. اضغط «إكمال التحويل» للمتابعة" });
const NEEDS_PASSWORD = answer(400, { ok: false, code: "MISSING_FIELDS", message: "كلمة المرور الأولى ورقم الهاتف مطلوبان" });
// Staff with the student's ID number already exists (owner, 2026-11-26): the
// student is linked to that account instead of a new one, only while it is
// active, not linked to another student, and its role is one the actor may give.
const STAFF_NOT_ACTIVE = answer(409, { ok: false, code: "STAFF_NOT_ACTIVE", message: "يوجد في الطاقم حساب بنفس رقم الهوية لكنه غير فعّال (ينتظر الموافقة أو موقوف). فعّله أولًا ثم حاول مرة أخرى" });
const LINKED_ELSEWHERE = answer(409, { ok: false, code: "LINKED_ELSEWHERE", message: "حساب الطاقم بنفس رقم الهوية مرتبط بطالب آخر" });
const LINK_FORBIDDEN = answer(403, { ok: false, code: "FORBIDDEN", message: "لا يمكنك ربط الطالب بحساب طاقم بهذا الدور" });

// The Israel date of `now` plus `days`, as yyyymmdd.
const ISRAEL = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" });
function israelDateKey(now, days = 0) {
  const [y, m, d] = ISRAEL.format(now).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

const sid = (v) => String(v ?? "");
const holds = (list, id) => (Array.isArray(list) ? list : []).some((x) => sid(x) === sid(id));

function createStaffConversion(deps) {
  const {
    students, lessons, users, attendance, recordRequired, createUser, copyPhoto,
    newId, now = () => new Date(), sameVersion, nextStamp, log = () => {},
    // findStaff(tz) -> { user, room } | null: the staff account with this ID
    // number in any room. linkUser({ student, conv, req }) -> {} | { status, body, clear }.
    findStaff = async () => null, linkUser,
  } = deps;

  // The staff account with the student's ID number, if there is one, and
  // whether he can be linked to it. A resume of an ordinary conversion finds
  // his own new account: not counted.
  async function existingFor(student, mayGiveRole) {
    const conv = student.staffConversion || null;
    if (conv && !conv.linkUserId) return null;
    const tz = sid(student.tz).trim();
    const found = tz ? await findStaff(tz) : null;
    if (!found?.user) return null;
    const user = found.user;
    const role = sid(user.role).trim();
    return {
      userId: sid(user._id),
      name: `${user.firstname || ""} ${user.lastname || ""}`.trim() || sid(user.tz),
      role,
      active: found.room === "active",
      linkedElsewhere: Boolean(user.fromStudentId) && sid(user.fromStudentId) !== sid(student._id),
      mayLink: Boolean(role) && Boolean(mayGiveRole(role)),
    };
  }

  async function readStudent(id) {
    if (!OBJECT_ID.test(sid(id))) return null;
    const found = await students.get({ _id: sid(id) });
    if (!found || found.success === false) throw new Error("student lookup failed");
    return (found.result || [])[0] || null;
  }

  // One conditional write takes the claim: free, or expired.
  async function takeClaim(id, requestId) {
    const at = now();
    const taken = await students.updateExisting(
      { _id: sid(id), $or: [{ conversionClaim: null }, { "conversionClaim.until": { $lt: at } }] },
      { conversionClaim: { by: requestId, until: new Date(at.getTime() + CLAIM_MS) } },
    );
    return Boolean(taken?.result);
  }
  // Writes on the student only while this call holds the claim (and renews it).
  // Every write moves updatedAt strictly forward (nextStamp, conditional on the
  // version read), so an edit or a delete that read the student before the
  // conversion fails its version check, even within the same millisecond
  // (Codex build reviews 1 and 2).
  async function writeHeld(id, requestId, patch) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const current = await readStudent(id);
      if (!current || sid(current.conversionClaim?.by) !== sid(requestId)) throw new Error("conversion claim lost");
      const written = await students.updateExisting(
        sameVersion({ _id: sid(id), "conversionClaim.by": requestId }, current),
        { ...patch, updatedAt: nextStamp(current), conversionClaim: { by: requestId, until: new Date(now().getTime() + CLAIM_MS) } },
      );
      if (written?.result) return written.result;
    }
    throw new Error("student kept changing");
  }
  const releaseClaim = (id, requestId) => students.updateExisting(
    { _id: sid(id), "conversionClaim.by": requestId }, { conversionClaim: null },
  ).catch((error) => log("staffConversion.release", error));

  const programsHolding = async (studentId) => {
    const all = await lessons.get({});
    if (!all || all.success === false) throw new Error("lesson lookup failed");
    return (all.result || []).filter((l) => holds(l.list_students, studentId)).map((l) => sid(l._id));
  };

  // Student rows on or after the cutover in the planned programs: never saved
  // by a person -> deleted; saved -> re-keyed to the staff row (unless one
  // exists for that date, then the student row goes).
  // Each write is conditional on the row as it was read (its updatedAt), and
  // never creates a row: a person saving the row meanwhile makes the write
  // miss, and the row is read again and settled as saved (Codex build review).
  async function settleFutureRows(student, conv) {
    for (let round = 0; round < 4; round += 1) {
      const found = await attendance.get({ student: sid(student._id) });
      if (!found || found.success === false) throw new Error("attendance lookup failed");
      // Every program, not only the planned ones: a save that raced his
      // leaving a program must not keep a student row from the cutover
      // (Codex build review 5). settleStudentRow keeps a person's mark.
      const due = (found.result || []).filter((row) => Number(row.dateKey) >= Number(conv.cutoverDateKey));
      if (!due.length) return;
      let missed = false;
      for (const row of due) {
        if (!(await settleStudentRow(attendance, row, conv))) missed = true;
      }
      if (!missed) return;
    }
    throw new Error("attendance kept changing");
  }

  // Moves one program: the student off list_students, the user onto
  // list_users (unless he is its teacher or helper). Versioned, retried.
  async function moveProgram(lessonId, studentId, userId) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const found = await lessons.get({ _id: sid(lessonId) });
      if (!found || found.success === false) throw new Error("lesson lookup failed");
      const lesson = (found.result || [])[0];
      if (!lesson) return; // deleted: nothing to move
      const staff = [lesson.teacher, lesson.helper].some((v) => sid(v) === sid(userId));
      const hasStudent = holds(lesson.list_students, studentId);
      const hasUser = holds(lesson.list_users, userId);
      if (!hasStudent && (hasUser || staff)) return; // already moved
      const patch = {
        list_students: (lesson.list_students || []).filter((x) => sid(x) !== sid(studentId)),
        list_users: staff || hasUser ? (lesson.list_users || []) : [...(lesson.list_users || []), sid(userId)],
        updatedAt: nextStamp(lesson),
      };
      const written = await lessons.updateExisting(sameVersion({ _id: sid(lessonId) }, lesson), patch);
      if (written?.result) return;
    }
    throw new Error("program kept changing");
  }

  /**
   * actor: req.actor. studentId: the student's _id. body: { role, password,
   * phone, email }. requestId: unique per call. mayAccess(student, conv):
   * the student scope check (resume also accepts the planned programs).
   * mayGiveRole(role): canGiveFirstRole for users.create.
   */
  async function run({ actor, studentId, body = {}, requestId, mayAccess, mayGiveRole, req }) {
    const first = await readStudent(studentId);
    if (!first || !(await mayAccess(first, first.staffConversion || null))) return NOT_FOUND;
    if (first.staffConversion?.phase === "done") return DONE;
    if (!(await takeClaim(studentId, requestId))) return BUSY;
    try {
      let student = await readStudent(studentId);
      let conv = student.staffConversion || null;
      if (conv?.phase === "done") return DONE;

      if (!conv) {
        const existing = await existingFor(student, mayGiveRole);
        let role;
        if (existing) {
          // Linked to that account: its role and details stay as they are.
          if (!existing.active) return STAFF_NOT_ACTIVE;
          if (existing.linkedElsewhere) return LINKED_ELSEWHERE;
          if (!existing.mayLink) return LINK_FORBIDDEN;
          role = existing.role;
          if (student.archivedAt || student.status !== ELIGIBLE_STATUS) return NOT_ELIGIBLE;
        } else {
          role = String(body.role || "").trim();
          if (!STAFF_ROLES.has(role)) return BAD_ROLE;
          if (!mayGiveRole(role)) return FORBIDDEN;
          if (student.archivedAt || student.status !== ELIGIBLE_STATUS) return NOT_ELIGIBLE;
          if (!String(body.password || "").trim() || !String(body.phone || student.phone || "").trim()) return NEEDS_PASSWORD;
        }
        const recorded = await recordRequired(req, {
          module: "students", action: "make_staff", targetType: "student", targetId: sid(student._id),
          targetLabel: `${student.firstname || ""} ${student.lastname || ""}`.trim(),
          after: existing ? { role, linkedUserId: existing.userId } : { role },
        });
        if (!recorded) return AUDIT_FAILED;
        // The barrier: from here on no roster takes him (utils/rosterGuard).
        student = await writeHeld(studentId, requestId, {
          staffConversion: {
            phase: "preparing", role, startedAt: now(), startedBy: sid(actor?.id),
            ...(existing ? { linkUserId: existing.userId } : {}),
          },
        });
        conv = student.staffConversion;
      }
      const linking = Boolean(conv.linkUserId);

      // While the account is still to be made, a resume is checked like a first
      // call: the stored role must still be one the actor may give, and the
      // first password and a phone are needed (Codex build review).
      if (conv.phase === "preparing" || conv.phase === "prepared") {
        if (!mayGiveRole(conv.role)) return linking ? LINK_FORBIDDEN : FORBIDDEN;
        if (!linking && (!String(body.password || "").trim() || !String(body.phone || student.phone || "").trim())) return NEEDS_PASSWORD;
      }

      if (conv.phase === "preparing") {
        const plannedLessons = await programsHolding(studentId);
        conv = { ...conv, phase: "prepared", userId: linking ? sid(conv.linkUserId) : newId(), cutoverDateKey: israelDateKey(now(), 1), plannedLessons, movedLessons: [] };
        student = await writeHeld(studentId, requestId, { staffConversion: conv });
      }

      if (conv.phase === "prepared") {
        // The account first: a refused one (tz of other staff) leaves nothing
        // changed, attendance included (Codex build review).
        // Linking checks the account again (still active, same ID number, not
        // linked to another student) and marks it as his.
        const made = linking
          ? await linkUser({ student, conv, req })
          : await createUser({ student, conv, body, actor, req });
        if (made.status) {
          // Refused (tz of other staff, or the account to link changed):
          // nothing else was changed, the conversion is cleared.
          if (made.clear) await writeHeld(studentId, requestId, { staffConversion: null });
          return answer(made.status, made.body);
        }
        await settleFutureRows(student, conv);
        conv = { ...conv, phase: "account" };
        student = await writeHeld(studentId, requestId, { staffConversion: conv });
      }

      if (conv.phase === "account") {
        for (let round = 0; ; round += 1) {
          if (round > 3) throw new Error("programs keep taking him back");
          for (const lessonId of conv.plannedLessons) {
            if (holds(conv.movedLessons, lessonId)) continue;
            await writeHeld(studentId, requestId, {}); // renew before the lesson write
            await moveProgram(lessonId, studentId, conv.userId);
            conv = { ...conv, movedLessons: [...(conv.movedLessons || []), sid(lessonId)] };
            await writeHeld(studentId, requestId, { "staffConversion.movedLessons": conv.movedLessons });
          }
          // One more look: a program that still holds him joins the plan.
          const still = await programsHolding(studentId);
          if (!still.length) break;
          conv = { ...conv, plannedLessons: [...new Set([...conv.plannedLessons, ...still])], movedLessons: (conv.movedLessons || []).filter((id) => !still.includes(sid(id))) };
          await writeHeld(studentId, requestId, { staffConversion: conv });
        }
        // Rows from the cutover in every planned program, late ones included,
        // are settled before the phase moves on. A resume runs this again
        // (idempotent), so a call that stopped after a late program joined the
        // plan cannot skip it (Codex build review 2).
        await settleFutureRows(student, conv);
        conv = { ...conv, phase: "rosters" };
        student = await writeHeld(studentId, requestId, { staffConversion: conv });
      }

      if (conv.phase === "rosters") {
        conv = { ...conv, phase: "done", doneAt: now() };
        student = await writeHeld(studentId, requestId, {
          staffConversion: conv, archivedAt: now(), archivedBy: sid(actor?.id), archiveReason: "أصبح من الطاقم",
        });
      }

      // A linked account keeps its own photo; it gets the student's only when it has none.
      const photoCopied = await copyPhoto({ student, userId: conv.userId, keepExisting: linking }).then(() => true, (error) => {
        log("staffConversion.photo", error);
        return false;
      });
      return answer(200, { ok: true, userId: sid(conv.userId), photoCopied, linked: linking });
    } catch (error) {
      log("staffConversion.run", error);
      return INCOMPLETE;
    } finally {
      await releaseClaim(studentId, requestId);
    }
  }

  /** GET: what the window shows before anything is sent (owner, 2026-11-26). */
  async function preview({ studentId, mayAccess, mayGiveRole }) {
    const student = await readStudent(studentId);
    if (!student || !(await mayAccess(student, student.staffConversion || null))) return NOT_FOUND;
    const existing = await existingFor(student, mayGiveRole);
    if (!existing) return answer(200, { ok: true, existing: null });
    const { userId, ...shown } = existing;
    return answer(200, { ok: true, existing: shown });
  }

  return { run, preview, israelDateKey };
}

module.exports = { createStaffConversion, israelDateKey, STAFF_ROLES };
