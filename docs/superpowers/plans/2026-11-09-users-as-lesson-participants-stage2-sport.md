# Users as sport players (stage 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A staff user can be a football player: added by whoever adds players
today, with an empty card (no stats), attendance like any player, and his own
sign-in to the Sport app.

**Architecture:** A user player is stored exactly like a student player, with
the user's `_id` in the existing `studentId` fields (player, lesson roster,
attendance, login code, push) and `kind: "user"` on the `SportPlayers` row.
One adapter, `server/utils/sportPeople.js`, reads and writes "a person"
(a student, else an active everyday user) for the sport controller and the
Sport portal, so every existing flow keeps its shape.

**Tech Stack:** Node/Express, generic Mongo models (`Entities/api.js`),
node:test; React (CRA) for System. The Sport app needs no change: it already
draws only the stats the server sends.

**Spec:** `docs/superpowers/specs/2026-11-09-users-as-lesson-participants-design.md` (stage 2)

## Global Constraints

- Any user may be a player; there is no teacher/helper rule in sport (owner).
- Adding stays with `sports.coach` / `sports.manage`; no new permission.
- No statistics are shown or recorded for a user player (owner): his card
  carries no `statDefs`/`values`, and `bumpStat` refuses him.
- He signs in to the Sport app like a student (email code by ID number, the
  printed card, passkeys).
- Only active, non-hidden users (`isHiddenUser`) count; a user that leaves
  disappears from the lists, his rows stay as history.
- The user model's placeholder email `test@test.com` is never mailed.
- No real names or ID numbers in tests or docs (public repo).

## Review Focus

1. An ID number shared by a student record and a user record (the duplicates
   this feature replaces): sign-in must pick the one that is a player, and
   refuse when both are.
2. Sport secrets written on a user record (`sportCardHash`,
   `sportPasskeys`) must never leave through the user API.
3. A user player's stat bump from an old tab is refused, not stored.
4. A hidden/IT-only or removed user never appears in the picker, the
   players list or a roster.
5. Existing student players, rosters and attendance are untouched.

---

### Task 1: `sportPeople` adapter
**Files:** Create `server/utils/sportPeople.js`; Test `server/test/sport-people.test.js`
- Produces `createSportPeople({ students, users }) -> { get(filter), updateExisting(filter, data), findPerson(id), peopleMap() }`
  and `isUserPlayer(player)`, `NO_STATS` (409 body, code `NO_STATS_FOR_STAFF`).
- `get`: students matching, then active non-hidden users matching, each user
  tagged `kind: "user"`, its placeholder email blanked; `{ success, result }`.
- `updateExisting`: the student first; when no student matched, the user.
- Tests: user tagged and placeholder email blanked; hidden user dropped;
  student wins `updateExisting`; user written when no student matches;
  `findPerson` rejects non-ObjectId ids.

### Task 2: sport controller and card
**Files:** `server/Entities/Sport/{SportPlayer.model,Sport.controller,Sport.route}.js`,
`server/utils/sportCards.js`; Test `server/test/sport-user-players.test.js`, `route-guards.test.js`
- `SportPlayer.kind` (default `"student"`); created as `"user"` for a user.
- `listPlayers`, lesson rosters, attendance sheet: people instead of students,
  each row with `kind`; user rows have empty `values` and no mentor/layer/school.
- `savePlayer`, `addLessonPlayer`, `playerPhoto`: `findPerson`.
- `bumpStat` on a user player: 409 `NO_STATS_FOR_STAFF`.
- `buildCard` for a user player: `statDefs: []`, `values: {}`.
- New `GET /api/sports/users/search` (`sports.coach`, `sports.manage`):
  active non-hidden users `{ _id, firstname, lastname, tz, age, kind, isPlayer }`.

### Task 3: Sport app sign-in
**Files:** `server/Entities/SportPortal/{SportPortal.auth,SportPortal.passkey}.js`; Test `server/test/sport-portal-users.test.js`
- Default `students` dependency becomes the people adapter.
- One ID number with several people: keep those with a football player row;
  exactly one -> him, otherwise refuse as today.
- User sanitizer drops `sportCardHash`, `sportPasskeys`.

### Task 4: System sport pages
**Files:** `apps/system/src/WebServer/services/sport/functionsSport.jsx`,
`Components/Sport/{StudentPicker,PlayersTab,LessonRosterDialog,AttendanceTab}.jsx`, tests
- `searchUsers({ q })`. The picker gets two tabs, «الطلاب» / «الموظفون».
- A «موظف» badge on user rows; stat cells show «—» with no buttons; the card
  modal gets no stats for a user.
