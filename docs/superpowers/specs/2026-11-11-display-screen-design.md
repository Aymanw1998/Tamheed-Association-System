# Display screen: the weekly program on a wall TV

Date: 2026-11-11. Status: approved by the owner 2026-11-12. Plan:
`docs/superpowers/plans/2026-11-12-display-screen.md`.
Mockups (local only, not committed): `.superpowers/brainstorm/display-screen-layouts-v2.html`.

## Why

The owner wants a TV on the wall that always shows the association's weekly
lesson program (برنامج الأسبوع), with no computer attached and no way for
passers-by to move it to anything else. Today the program exists only inside
the System, behind sign-in, with menus and edit controls, and the session
expires, so it cannot be left open on a TV.

Success: a manager sets up a screen once from the System, types its link into
a kiosk app on a TV stick or a signage display, and from then on the TV shows
the current program by itself. Changing a lesson in the System shows on the
TV within a minute or two. Changing what the TV shows (its layout) is done
from the System, never by touching the TV.

## The owner's decisions

- Content: the weekly lesson program. Each lesson shows its **name, time,
  room and guide name (المرشد)**. The owner added the guide name.
- Three ready layouts (from the mockups):
  - **A. Whole week** (`week`): a column per day, today highlighted, the
    lesson running now highlighted.
  - **B. Today large** (`today`): today's lessons as large rows (finished
    ones dimmed, the running one marked «الآن», the next one marked
    «التالي»), with a short summary of the coming days on the side.
  - **C. Day by day** (`rotate`): one day at a time in large cards, moving
    to the next day by itself.
- **A manager picks one layout per screen** ("for now", so a mode that
  cycles between layouts may come later; see Non-goals).
- No physical computer: the screen runs on a TV with an Android TV stick
  and a kiosk app, or on a signage display that opens a URL. The page must
  work there unattended.

## Goals

1. **Screens are records in the System.** A screen has a name (for example
   «المدخل الرئيسي»), a layout (`week` | `today` | `rotate`), and a secret
   link. Several screens may exist, each with its own layout.
2. **Managing screens** (System): list screens; create one (name + layout);
   change its name or layout; copy its link; issue a new link (the old one
   stops working at once); delete the screen (its link stops working).
3. **The display page** opens from the screen's link, with no sign-in, and
   shows only the weekly program in the screen's current layout, full
   screen, with no menus, buttons, tour, notices, chat or AI button.
4. **It keeps itself current:** the clock and the «الآن» / «التالي» marks
   move by themselves; lessons and layout are fetched again every minute.
5. **It survives a bad network:** if a fetch fails, the last program stays
   on screen; after several minutes without a successful fetch a small,
   unobtrusive «آخر تحديث HH:MM» note appears. It never shows a blank page
   or a sign-in page because of a network error. This must hold also when
   the TV reloads the page or reboots while the server is unreachable
   (kiosk apps do both), so the page keeps the last feed on the TV
   (`localStorage`) and the page shell may be served by the service worker.
   *Writer's call:* the stored copy holds only what is already shown on the
   wall (lesson names, times, rooms, guide names), so keeping it on the TV
   exposes nothing new. It is wiped when the server answers "closed link",
   and it is not shown if it is older than 7 days. The HTTP feed response
   itself is still `no-store`.
6. **A link that was revoked** (new link issued or screen deleted) shows a
   plain Arabic message: the screen's link is no longer valid, ask the
   association for a new one. It does not show the program.

## What the display shows, and only that

The feed the display page receives contains, per lesson: name, day
(1..7), start and end minute, room label, and the guide's display name.
It contains nothing else: no ids of students or users, no counts of
students, no phones or emails, no helper (مساعد), no participants.

- **Guide name** = the lesson's `teacher` user, shown as first + last name.
  A lesson without a teacher, or whose teacher is no longer an active user,
  shows no guide line (not «…», not an id).
- **Sport (football) lessons** are included, as in the existing weekly page
  (`getSportSchedule`): name, time, room 9 (التدريب الخارجي). They have no
  guide, so no guide line is shown (the System shows «النظام» there; that
  word means nothing on a wall).
- **Room labels** use the same names as `apps/system/src/utils/rooms.js`
  (rooms 6–9 named, others «غرفة N», no room → nothing shown).
- **Which lessons:** every lesson in the program, regardless of who is
  looking. The screen is not a user and has no personal scope. This is the
  same set a manager with `lessons.viewAll` sees.
- **Time:** "today" and "now" are computed in Asia/Jerusalem. The page
  takes the current time from the server with each fetch and keeps its own
  offset, so a TV with a wrong clock still marks the right lesson.

## Security and permissions

- **New permission section** in `shared/permissions.json`, per
  `AGENTS.md`: `displays` with `manage` (label «شاشات العرض» /
  «إدارة شاشات العرض»). It is required for every management endpoint and
  for the management page and its entry point. Grantable and revocable in
  IT like every other permission, with isolated grant/revoke tests.
  Default: not granted to any role except what the owner grants in IT.
- **The link is a capability, the way the parent consent link is**
  (`InviteToken.controller.js`, `createConsentLink`): a random 32-byte
  base64url secret; only its SHA-256 digest is stored; the secret travels
  in the URL fragment (`/display#<secret>`) and the page sends it in a POST
  body, so it never appears in a server path, query string or access log.
  Unlike the consent link, it does **not** expire and is **not** one-use;
  it lives until a new link is issued or the screen is deleted.
- The link can only read the feed above. It grants no session, no cookie,
  no access to any other endpoint.
- The public feed endpoint is rate-limited per address (the existing
  `middleware/rateLimit.js`), answers `Cache-Control: no-store`, and answers
  the same "closed link" response for a malformed, unknown or revoked
  secret.
- Creating a screen, issuing a new link and deleting a screen are recorded
  in the audit log (`utils/audit.js`), without the secret.
- The secret is shown to the manager when it is created or re-issued
  (as the full link, with a copy button). Whether it can be shown again
  later is the builder's call; the simplest safe answer is "no, issue a new
  one", as with the consent link.

## The three layouts, in detail

Common to all: dark background, large Arabic text readable from a few
metres, right-to-left, a top bar with «تمهيد · برنامج الأسبوع» (or
«برنامج اليوم» for B), today's date and a large clock. 16:9 landscape.
Lessons are listed in time order, not drawn on an hour grid.

- **A. Whole week:** columns Sunday → Thursday always; Friday and Saturday
  only if they have lessons. Today's column outlined; the running lesson
  in the highlight colour with «الآن». Each lesson: name, time range ·
  room, guide.
- **B. Today large:** today's lessons as rows (time | name · guide | room).
  Finished lessons dimmed, the running one highlighted «الآن», the next one
  outlined «التالي». Side column: the next days that have lessons, each a
  one-line summary (name + start time). A day with no lessons today shows
  «لا برامج اليوم» and the side column.
- **C. Day by day:** one day at a time, its lessons as large cards
  (time, name, guide, room). Only days with lessons take part. Starts on
  today; each day stays about 15 seconds; a thin progress bar and a row of
  day names show where it is.

**Overlapping lessons** (*writer's call*): lessons in different rooms may
run at the same time. Every lesson running now is marked «الآن», and every
lesson with the earliest start time still to come today is marked
«التالي».

If a day has more lessons than fit, the layout must still show all of
them (smaller text, or a second column, or slow paging in C); the builder
picks, but nothing may be cut off silently.

## Non-goals

- Cycling automatically between the three layouts on one screen (the
  owner said "for now" one per screen; may come later).
- Announcements, photos, birthday greetings, attendance, or anything other
  than the program.
- Editing anything from the screen; touch interaction.
- Student names, helpers, participants, phone numbers.
- A per-screen filter (only one room, only one guide). Every screen shows
  the whole program.
- Changes to the existing «برنامج الأسبوع» page.

## Anti-goals (failure even if it "works")

- The link opens, or leaks, anything beyond the program in the feed above.
- The screen goes blank, shows an error, or shows a sign-in page after a
  short network drop or a server restart.
- Changing a screen's layout requires someone to touch the TV.
- The display page pulls in the signed-in app shell (auth refresh, live
  channel, notices, tours), which could redirect it to /login.

## Setting up the TV (owner-facing, goes into the docs in Hebrew)

A short Hebrew section, in `deploy/DEPLOY.md` or a new `docs/` page:
recommended setup is a TV + Android TV / Google TV stick + a kiosk browser
app (for example Fully Kiosk Browser) pointed at the screen's link, set to
start on boot, keep the screen on, reload on failure, and need a PIN to
exit. Alternative: a commercial signage display with a built-in URL
launcher. Not recommended: the TV's own built-in browser. The builder
checks that the page actually runs on Android TV's WebView-based kiosk
browsers (no features newer than that WebView supports).

## Left to the builder

- Where the management page sits in the System (a tab in the lessons hub
  beside «برنامج الأسبوع» is the writer's suggestion) and its exact form.
- Collection and endpoint names, the feed's exact JSON shape.
- How the display route avoids the signed-in shell (it sits beside
  `/parent-consent` among the public routes in `Routes.jsx`).
- Exact colours, sizes and the overflow handling above.
- The refresh interval (about 60 s) and the stale-note threshold (about
  5 min).
- How the service worker serves the display page shell offline (the feed
  response itself is never cached by HTTP or the service worker; the
  page's own stored copy is described in Goal 5).

## Builder check

A fresh reviewer read this document on 2026-11-11 and asked two questions.
Both were settled by the writer and are marked *writer's call* above:
keeping the last program on the TV across reboots (Goal 5), and marking
overlapping lessons (layouts section).

## Verification and review

- Server tests: permission grant/revoke on every management endpoint; feed
  answers for a valid link, and the closed-link answer for malformed,
  unknown, re-issued and deleted links; the feed contains no student data,
  no helper, no ids beyond what is listed; inactive teacher → no guide;
  sport lessons included without guide; rate limit applies.
- Client tests: each layout's "now / next / today" logic in Asia/Jerusalem,
  including a TV clock that is off; stale note; revoked-link message.
- `npm run verify`; a look in the browser at all three layouts at 1920×1080.
- Independent Codex review per `AGENTS.md`, recorded in
  `docs/AI_REVIEW_LOG.md`.
