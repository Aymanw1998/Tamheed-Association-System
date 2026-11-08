# Independent Codex review request: motion, ease of use and unified design (2026-11-08)

Actual Claude Code is the sole implementer. You are the independent Codex
reviewer. Review only the uncommitted working-tree changes (`git diff` plus the
untracked new files) in this repository. Do not edit files, run
seed/migration/admin/data-clearing commands, touch `.env`, or start another
reviewer. The repository is public. This request contains no credentials or
real records.

## Owner request

The owner approved three packages, to be done in order (A, B, C). These are
client-only changes. No server or permission changes.

**A. Motion**
- Motion tokens and a global reduced-motion rule.
- A `Skeleton` loader in place of "…" on the routes and the student, user,
  report and vehicle lists.
- `PageTransition`: the page fades in on each navigation. It restarts a class;
  it does not remount the page.
- Staggered row entry (`rise-in`).
- `TabIndicator`: a sliding underline or pill that follows `aria-selected`,
  used on 6 tablists.
- Toasts: real durations, sticky toasts that stay, an icon, an optional
  `action` (undo), brand colors, framer `MotionConfig reducedMotion="user"`.
- Confirm dialog:
  - Brand styling and a scale-in animation; a bottom sheet on phones.
  - Escape or a backdrop click cancels.
  - The confirm button's color comes from `options.danger`, not from its text.
- `Button` gains a `success` state through `useSavedFlash`, used on the
  attendance save.
- Notices "delete for everyone":
  - With `notices.restore`, the row slides out and the toast offers undo,
    which calls restore.
  - Without `notices.restore`, the board keeps the old confirm dialog.
  - Personal hide works the same way, with unhide as the undo.
- `CountUp` on the dashboard stats. It shows the final value when there is no
  `matchMedia` or when reduced motion is set.
- IT and Sport: page and tab fades, dialog and toast restyle, button press
  effect.

**B. Ease of use**
- `BottomNav` on phones (portal, ≤768px): up to 4 permitted items plus a
  "more" button that opens the existing menu. The items come from the same
  permission checks as the header menu.
- `QuickSearch`:
  - Opens with Ctrl/⌘+K or "/" outside fields; the box is portaled to body.
  - Searches pages, students, staff and programs, with Arabic normalization.
  - Records load lazily on first open, and only for the kinds the user may
    list (`students.view`, `users.view`, the lessons route).
  - Navigation goes through Header's `onNavClick`, which keeps the leave
    check.
- `EmptyState` on the list pages.
- `useFormDraft` plus `DraftBanner` on the report, student and user forms:
  - Stored in localStorage under `draft:<user>:<form>:<id>`, with a 24h TTL.
  - Never stores the password, photo or roles.
  - Never applied silently: the user restores or discards it.
  - Cleared after a successful save. Sign-out already calls
    `localStorage.clear()`.
  - Disabled when the form is read-only and for the public parent form.
- `revealFirstError`: after a failed save, the first wrong field scrolls into
  view, gets focus, `aria-invalid` and a short shake.
- Sticky table headers placed under the sticky header (`--sticky-top`
  measured with a ResizeObserver).
- 44px touch targets on coarse pointers.

**C. Unified design**
- `shared/tokens.css`, synced by `scripts/syncShared.js` to
  `apps/{system,it}/src/generated/tokens.css` and imported first. The
  duplicated `:root` blocks in each app were replaced by aliases only.
- Dark theme: `:root[data-theme="dark"]`. `utils/theme.js` (System) and
  `theme.js` (IT) handle auto, light or dark, with `data-bs-theme` for
  Bootstrap. A `ThemeSwitch` sits in both account menus.
- About 180 hard-coded light colors were mapped to tokens by property (bg,
  text, border). Text in brand color now uses a new `--color-link` token
  (42 places).
- Plain `button:not([class])` gets the shared secondary look.
- The `.formContainer button` rules now exclude the shared Button
  (`data-ui="button"`).
- The main form actions (report, student, user) use `Button`.
- One inline-SVG `Icon` set.

## Verification done

Full suites and builds passed: System 1,172+ tests, IT, Sport, server.
The final run is recorded in the review log.

A local browser check used a production build plus a mock API with
synthetic data only, and covered:
- Desktop and phone layouts.
- The bottom bar.
- Quick search. This check found the box hidden under the nav; it was then
  portaled and fixed.
- Undo on delete.
- The tab pill.
- Light and dark themes. This check found low-contrast links, which led to
  the `--color-link` token.

## What to look for

Concrete defects with file/line evidence and a failure scenario. Pay
particular attention to:
- Permission leaks in QuickSearch, BottomNav and the undo flow.
- Privacy of the drafts (scope, TTL, clearing).
- Stale or unsafe draft restores against locked or versioned saves
  (baseVersion stays from `opened`).
- Breakage from `PageTransition`'s transform on fixed-position descendants.
- Event-listener leaks.
- Keyboard and accessibility regressions (the role of the tablist indicator
  span, the radios in the account menu).
- Dark-theme tokens used for both text and background.
- Toast timing changes, especially sticky toasts that previously
  auto-closed.
- Anything in `syncShared` or token imports that would break CI.

State explicitly if you have no findings. A request is not approval.
