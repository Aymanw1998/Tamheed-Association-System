# Display screen: a rooms board, a light look, and a picture picker

Date: 2026-11-12. Status: the owner asked to build it (2026-11-12); built the same day.
Builds on `docs/superpowers/specs/2026-11-11-display-screen-design.md`
(the wall display, three layouts), which stays in force except where this
document says otherwise.
Mockups (local only, not committed): `.superpowers/brainstorm/display-pro-a-v3-static.html`
(the rooms board, light) and `.superpowers/brainstorm/display-layout-picker.html`
(the picker).

## Why

The association runs lessons 7 days a week in 6–7 rooms a day. On the
existing layouts a busy day becomes a long list where the text shrinks and
the room is a small word at the end of a line. People in the hall want to
see at a glance what runs in which room right now and what comes next. The
owner wants the wall to look professional, like a schedule board, not like
a page of the System.

Success: a person walking past the TV sees, without reading lists, which
rooms are busy now, what starts next and where, and the board is never
empty in the evening.

## The owner's decisions

1. **A fourth layout, «اليوم حسب الغرف»** (`rooms`), added beside the
   three existing ones. It does not replace any of them.
2. **Rooms are columns** across the top; **hours run down the right side**;
   each lesson is a block placed at its room and its hours. The board moves
   down with the clock.
3. **Light look:** white background. The lesson running now is light green
   with «الآن»; the next lesson is blue with «التالي»; lessons that ended
   are dimmed; a red line marks the current time across all columns.
4. **The hours shown** start at the first lesson of the day, rounded down to
   the half hour, and end at the end of the last lesson.
5. **The three existing layouts move to the same light look** (white,
   green «الآن», blue «التالي», dimmed past). This replaces "dark
   background" in the earlier document. Their structure does not change.
6. **The layout is always chosen.** A new screen has no layout until the
   manager picks one; "Create" stays off until then. The current code
   preselects «كل الأسبوع»; that goes.
7. **The choice is made with picture cards:** each layout is a card with a
   small drawing of how it looks, its name, and one line in Arabic saying
   what it is for. The same cards are used to change the layout of an
   existing screen. Names and lines (from the picker mockup):
   - «كل الأسبوع»: «كل أيام الأسبوع جنبًا إلى جنب. مناسب لعرض الأسبوع كله بنظرة واحدة.»
   - «اليوم بالتفصيل»: «برامج اليوم بخط كبير حسب الساعة، وعلى الجانب ملخص الأيام القادمة.»
   - «يومًا بعد يوم»: «يوم واحد في كل مرة ببطاقات كبيرة، ينتقل لليوم التالي كل 15 ثانية.»
   - «اليوم حسب الغرف»: «الغرف أعمدة في الأعلى والساعات على الجانب، واللوح ينزل مع الساعة.»
8. **Changing the layout is done in the System**, on the screen's row, and
   the TV follows by itself within about a minute, with the same link. (This
   already works today; it must keep working for `rooms`.)
9. **After the last lesson of the day ends, the board shows tomorrow.** Its
   header says it is tomorrow's program, with the day name and date. On a
   board for a coming day there is no red line and no «الآن»; that day's
   first lessons are blue «التالي». (*Writer's call*, asked and not
   answered: this applies to the rooms board only. The three existing
   layouts keep their structure, as decision 5 says.)
10. **A lesson saved without a room gets its own column, «بدون غرفة».**

## The rooms board in detail

**Which day it shows** (*writer's call*, extends decision 9): the board day
is today while today still has a lesson that has not ended; otherwise it is
the next day that has lessons (tomorrow if tomorrow has any, else the day
after, and so on through the week). So nothing changes at midnight: the
board already shows that day. The program repeats every week, so if today
is the only day with lessons and they have ended, the board shows the same
weekday next week, with that date. Only if the program has no lessons at
all does the board show «لا برامج».

**Header:** «تمهيد · برنامج اليوم» with today's day name and date when the
board day is today; «تمهيد · برنامج الغد» with tomorrow's day name and
date when it is tomorrow; «تمهيد · برنامج يوم <day name>» with that date
when it is further ahead. The large clock always shows the current time.

**Columns** (*writer's call*): only rooms that have a lesson on the board
day get a column, in room order: غرفة 1–5, المصلى (6), مقر قديم (7), الساحة
(8), التدريب الخارجي (9), then any room the System stores as text, then
«بدون غرفة» last. Column titles use the same names as
`apps/system/src/utils/rooms.js`. Sport (football) lessons are room 9, as
in the existing feed. A lesson block shows the lesson name, its time range
and the guide's name (no room line: the column says it).

**Two lessons in one room at the same time** (*writer's call*): the column
splits for that stretch and the blocks stand side by side, narrower. Nothing
is hidden behind another block.

**Hours shown** (*writer's call*, refines decision 2): if the board day's
span (decision 4) is about 5 hours or less, the whole span fits on the
screen and nothing moves. If it is longer, the screen shows a 4-hour window:
1 hour before now and 3 hours after, moving smoothly down as time passes.
The window never goes above the first hour or below the last. A board for
a coming day has no clock to follow, so it shows that day's whole span on
one screen, however long, with smaller blocks (*writer's call*, after the
builder check).

**States on today's board:** ended → dimmed; running → light green «الآن»;
earliest start still to come → blue «التالي» (every lesson that starts then,
in any room, as in the earlier document); later → plain. The red now-line
crosses all columns at the current minute.

**Crowding:** a short lesson still shows its name; if the block is too small
for the time and guide lines, they drop before the name does. Nothing may be
cut off silently (same rule as the earlier document).

## Non-goals

- A per-room screen (only one room's lessons) or a filter of any kind.
- A dark look as an option, or a per-screen colour choice.
- Cycling between layouts on one screen.
- Changes to the System's own «برنامج الأسبوع» page.
- Changing the screen's link when its layout changes.

## Anti-goals (failure even if it "works")

- The rooms board shows an empty board, or only dimmed lessons, all evening.
- The board jumps or flickers as it moves with the clock.
- A lesson is hidden behind another one, or cut off with no sign.
- A manager creates a screen without knowing which layout it got.
- Existing screens stop working or change layout after the update. Screens
  saved as `week`, `today` or `rotate` keep their layout.

## Server

- `rooms` joins the accepted layouts (`server/services/displayScreens.js`
  and the model comment). Creating a screen without a layout is already
  refused (`cleanLayout`); a test pins that.
- The feed does not change: it already carries day, start and end minute,
  the raw room value (or none) and the guide name for every lesson.

## Builder check

A fresh reviewer read this document on 2026-11-12 and asked three
questions. The writer settled two, marked above: a coming day's board fits
its whole span, and a week whose only lessons are today's shows the same
weekday next week. The third, whether "show tomorrow" also covers the
existing layouts, went to the owner. The owner asked to build without
answering it, so the writer settled it as the rooms board only
(decision 9).

## Left to the builder

- Exact colours, sizes, spacing and the drawings on the cards (the mockups
  are the reference, not pixel rules). Text must stay readable from a few
  metres on a 1920×1080 TV, with enough contrast on white.
- How the board moves (scrolling a container or moving it with a
  transform). If it moves with a transform, the «آخر تحديث» note and
  anything else fixed to the screen must not sit inside the moved part
  (a transform on a parent pins `position: fixed` children to that parent;
  this broke the approve-user window on 2026-11-12).
- Whether the cards for an existing screen open in a window or unfold in
  the row, and whether a pick there saves at once or needs a save button.
- The exact cut-off for "about 5 hours" and how the side-by-side split looks.
- The page must keep running on Android TV WebView kiosk browsers, as the
  earlier document requires (no features newer than that WebView supports).

## Verification and review

- Server: `rooms` accepted on create and update; a missing or unknown
  layout refused.
- Client logic tests (Asia/Jerusalem, TV clock off): board-day choice
  (today running, after the last lesson, empty tomorrow, empty week,
  across midnight); column set and order including «بدون غرفة» and a text
  room; hour range and the 4-hour window at its edges; states on today's
  board vs. a coming day's; two lessons in one room at once.
- Picker tests: no layout picked on a new screen and "Create" off; picking a
  card enables it and sends that layout; changing an existing screen's
  layout with the cards sends the update.
- The three existing layouts still pass their tests after the light restyle.
- `npm run verify`; a look in the browser at all four layouts at 1920×1080
  on synthetic data, and at the picker at phone and computer width.
- Independent Codex review per `AGENTS.md`, recorded in
  `docs/AI_REVIEW_LOG.md`.
