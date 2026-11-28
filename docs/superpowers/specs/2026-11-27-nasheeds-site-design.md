# Nasheeds site — design (owner, 2026-11-27)

## Intent

The association has a nasheed team with many nasheeds. Two problems keep
coming back: nobody remembers where the words of each nasheed are, and the
order for a performance or rehearsal keeps being lost. The order changes
every time.

The fix is a small separate site, beside System, IT and Sport: one place
that holds every nasheed (title and lines), and a screen that builds an
ordered list for one occasion and turns it into a PDF to print or send.

## Goals

- One library of nasheeds: title and lines (verses, centered lines, breaks), add, edit, search, read.
- A read page per nasheed, made for reading on a phone.
- Build an ordered list from the library and get a PDF of it, to download,
  print or share (WhatsApp on the iPhone through the share sheet).
- Its own address and its own screens (owner: "a separate system").

## Non-goals

- Saving the ordered lists. A list is built, exported and forgotten
  (owner: "no need to save, just build and send or print").
- Audio, video, links or any field beyond title and lines.
- A projector or full-screen mode. The read page is for a phone.
- Guest accounts, guest codes or secret links (owner chose open reading).
- Live updates between screens, offline work, or a separate user system.

## Anti-goals

- A second password or account system to look after. Sign-in uses the
  existing Tamheed staff accounts.
- A nasheed lost by a wrong tap.

## Who signs in (owner: approach A)

Staff sign in with their existing Tamheed account: ID number and password.
Only someone who holds the new permission `nasheeds.manage` gets in. Today
that is one person. A manager can grant it to more people later from the
existing permissions screen.

## Guests read without signing in (owner, 2026-11-27)

A guest (anyone, no account) opens the site and reads: the library list,
the search and the read page. Nothing else. Adding, editing, deleting and
"Build a list" with its PDF need the sign-in and `nasheeds.manage`.
Owner's pick among a secret read-only link, a guest code, and fully open
(chosen: fully open; nasheed words are not sensitive).

The public read API (`GET /api/nasheed/public/...`) sends only `_id`,
`title`, `lines` and `updatedAt`. It sends no names of who wrote or
edited, never anything in the trash, and is rate-limited like the other
public routes. Builder's call (owner was unsure): search engines are asked
not to list the site (`<meta name="robots" content="noindex">` and
`X-Robots-Tag: noindex` on its host). Anyone with the address still reads
it, and this is one line to undo. The read pages show a «دخول» button for staff.

## Approaches considered

1. **Separate site on its own host, signed in with Tamheed staff accounts.**
   Owner's pick. A separate site, as he asked, built on accounts, lockout,
   audit, trash and backups that already work. Its user must be a Tamheed
   staff member.
2. **Separate site with one account of its own.** This fits someone outside
   the staff, but it means a second sign-in system: password reset, lockout
   and security. And it has to be rebuilt the day a second person joins.
3. **A screen inside System.** Quickest, but the owner asked for a separate
   system.

## How it is built (decided)

- **Hosting.** It runs the same way as the IT site. A new app
  `apps/nasheed` (CRA, Arabic, RTL, the shared tokens) is served by the same
  server on its own host name `NASHEED_HOST`, through `hostStatic` in
  `server/server.js`. Without `NASHEED_HOST` set, there is no nasheeds site.
  Its API lives under `/api/nasheed`, answers only on that host, and
  answers 404 anywhere else (as `requireItHost` does).
- **Permission.** Add `nasheeds.manage` to `shared/permissions.json`. It is
  in no role's defaults and is granted per user. A suspended, waiting or
  locked account cannot sign in, as on the other sites.
- **Library.** A `Nasheed` model in the main database, with `title`
  (required), `lines` (required, see "The words are lines" below),
  `createdBy`/`updatedBy` and timestamps. Every create, edit and delete
  writes an audit row.
- **Delete** moves the nasheed to the existing «سلة المحذوفات» (Trash),
  with "تراجع" as elsewhere. Purging stays with the existing trash rules.
- **Screens** (Arabic):
  1. The library list: titles A–Z, with a search over title and words.
  2. The read page: the title and the lines, laid out like the PDF, in a
     size readable on a phone, with buttons to edit and delete.
  3. A create or edit form: the title, then the lines as rows of fields
     (see below).
  4. "Build a list": pick nasheeds from the library (with search), reorder
     them (move up and down; drag is welcome but not required on the
     phone), type an optional heading, then get the PDF. Leaving the screen
     drops the list.
- **PDF**, built in the browser. Arabic text is drawn through `html2canvas` +
  `jsPDF`, the way `ExportPDF.jsx` already does it. At the top is the
  heading if one was typed; it is printed, not stored. Then each nasheed in
  order: its number, its title and its lines. A4, right to left.

## The words are lines (owner, 2026-11-27)

Most nasheeds are written as verses, each with a صدر and an عجز side by
side, plus some centered lines (a chorus such as «الله الله .. الله الله»)
and `***` between stanzas. The words often carry tashkeel. The owner chose
a form with fields over typing everything into one box with a separator.

- **Shape.** `lines` is an ordered array. Each line is one of:
  - `{ kind: "verse", sadr, ajuz }`, two halves on one row;
  - `{ kind: "center", text }`, one centered line;
  - `{ kind: "break" }`, the `***` between stanzas.
- **Form.** One row per line:
  - a verse row has two fields, the صدر on the right and the عجز on the
    left;
  - a centered row has one field;
  - a break row shows `***`.
  Buttons add «بيت», «سطر في الوسط» and «فاصل» at the end. Each row can be
  moved up or down, or removed. Tashkeel is kept exactly as typed.
- **Display.** One verse is one row, on the phone too (owner): صدر on the
  right, عجز on the left, both halves the same width, and a half that does
  not fit wraps inside its own half. Centered lines are centered, and a
  break shows `***`. The read page and the PDF use this same layout.
- **Search** covers the title and every text in the lines, ignoring
  tashkeel and spelling variants.
- **Limits.**
  - At most 300 lines.
  - Each text is at most 200 characters.
  - A verse needs both halves.
  - At least one line with text.
  - Empty rows are dropped on save.
- **Sending.** On a phone with file sharing, the share sheet opens
  (`navigator.share` with the PDF file). Elsewhere the PDF is downloaded,
  and a print button opens it for printing.

## Builder's calls (noted so the owner can check them)

- **Sign-in details.** The site has its own session cookie and its own
  secret (`NASHEED_SESSION_SECRET`), host-only, like `it_session`. The
  password step reuses the staff lockout (`utils/loginLockout`), and a
  staff member who must change their password is sent to System first. No
  email code is asked: the data is nasheed words, and IT-level protection
  is not needed. The system account (`isSystemTz`) cannot sign in here.
- **Edits.** An edit is saved only if the nasheed was not changed in the
  meantime (versioned like the rest of the project, `nextStamp` /
  `updatedAt`); otherwise the user is told to reload.
- **PDF page breaks.** A nasheed short enough to fit on a page is not split
  across two pages. A longer one continues onto the next page.
- The read page and the list use the shared design tokens. The site is
  installable as a PWA, like IT.

## Deployment

- DNS and certbot for the new host name.
- An nginx server block like the IT one.
- `NASHEED_HOST` and `NASHEED_SESSION_SECRET` in `server/config/.env`, and
  both in `.env.example`.
- The build added to `npm run build` / `deploy/update.sh`.
- A section in `deploy/DEPLOY.md` and `docs/FEATURE_PERMISSIONS.md`.

The nasheeds live in the main database, so the nightly backup, the Drive
copy and the weekly restore check already cover them.

## Tests

- **Server:**
  - host-only routes;
  - the public read sends only title and lines, never a trashed nasheed,
    and every write is refused without a session;
  - sign-in refusals (no permission, locked, suspended, system account,
    password must change);
  - CRUD with audit;
  - delete to trash and restore;
  - stale edit refused.
- **App:**
  - search;
  - read page;
  - form validation;
  - building and reordering a list;
  - the PDF called with the right order and heading;
  - share falls back to download.

## Open for the owner

- Name (owner, 2026-11-27): `nasheed` — the folder `apps/nasheed` and the
  host `nasheed.<domain>`.
- The manager of the nasheeds has a Tamheed staff account with a working
  email (owner, 2026-11-27: yes).
- Design approved by the owner on 2026-11-27, with guest reading added after.
