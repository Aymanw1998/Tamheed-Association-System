# Independent Codex review request: rooms board, light look, picture picker (2026-11-12)

Actual Claude Code is the sole implementer. You are the independent Codex
reviewer. Review only the commit that adds this work: its message starts with
"Add a rooms board to the wall display". Run `git log --oneline -5` to find it,
and review it with `git show <commit>`. Do not edit files, run seed, migration,
admin or data-clearing commands, touch `.env`, or start another reviewer. The
repository is public. This request contains no credentials or real records.

The display screens themselves (the commit "Add wall display screens…") and
the approve-user fix (the commit "Fix the approve-user window…") have their own
pending requests:
- `2026-11-12-display-screen-codex-request.md`
- the approve-user entry in `docs/AI_REVIEW_LOG.md`

Those two are now committed, so review each one by its commit.

## Owner request

The owner asked for a professional wall board for 7 days a week and 6–7 rooms
a day. Spec: `docs/superpowers/specs/2026-11-12-display-room-board-design.md`.

## What was built

**A fourth layout, `rooms`** («اليوم حسب الغرف»):
- It is accepted by `server/services/displayScreens.js`. Creating a screen
  without a layout is still refused.
- The logic is in `apps/system/src/Components/Display/roomBoard.js`:
  - `boardDay`: today while one of today's lessons has not ended, otherwise the
    next day with lessons. If today is the only such day, it is the same weekday
    next week.
  - `roomColumns`: rooms in number order, then rooms stored as text, then
    «بدون غرفة».
  - `hourRange`: from the first start, rounded down to the half hour, to the
    last end.
  - `viewWindow`: a day of 5 hours or less shows whole. A longer day today
    shows 4 hours, 1 h back and 3 h ahead. A coming day shows whole.
  - `lanes`: overlapping lessons in the same room sit side by side.
- `RoomsLayout.jsx` draws it:
  - The day is a track that slides up with a CSS transform.
  - The «آخر تحديث» note is fixed to the screen and sits outside the track.
- `DisplayPage.jsx` sets the header:
  - «برنامج الغد» or «برنامج يوم X», with that day's date, when the board
    shows a coming day.

**Light look for all layouts** (`Display.module.css`):
- Light green «الآن», blue «التالي», dimmed past, a red now-line.
- The motion is fade, rise and pop on entry, a soft glow on «الآن», and the
  smooth slide.
- Global reduce-motion still applies.

**Picture-card picker** (`LayoutCards.jsx`, `DisplayScreensPage.jsx`):
- A new screen starts with no layout, and "إضافة شاشة" stays off until one is
  picked.
- An existing screen's row shows its layout and a «تغيير طريقة العرض» button.
  The cards open in the row, and a pick saves at once.

## Please check

1. Is `boardDay` correct across midnight, with a TV clock that is off, and in
   a week where only today has lessons?
2. Does the transform on the track break anything fixed to the screen? Does it
   run on Chromium 85 WebView? The spec's floor is Android TV kiosk browsers.
3. Can the `lanes` grouping overlap or hide a lesson? Look at a chain of
   overlaps.
4. Does the picker allow submitting without a layout? Does a failed save leave
   the cards in a wrong state?
5. Is any text unreadable or cut off with no sign?
