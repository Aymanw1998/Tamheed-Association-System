# Codex review request: the nasheed site (2026-11-27)

Implementer: Claude Code. Reviewer requested: Codex (owner triggers). Read-only review.

Spec: `docs/superpowers/specs/2026-11-27-nasheeds-site-design.md`. Plan: `docs/superpowers/plans/2026-11-27-nasheed-site.md`.

## Scope

1. **Library service:** `server/services/nasheeds.js`, `server/Entities/Nasheed/Nasheed.model.js`. Title plus ordered lines (`verse` with `sadr`/`ajuz`, `center`, `break`), versioned edits (`nextStamp`, 409 `STALE`), an audit row per change, delete to the recycle bin and restore with the same `_id`.
2. **Sign-in and session:**
   - `server/middleware/requireNasheed.js` and `server/Entities/Nasheed/Nasheed.auth.js`.
   - Uses the Tamheed ID number and password, with no email code. Requires `nasheeds.manage`.
   - Has its own cookie and secret, and only on `NASHEED_HOST`.
   - The system account is refused as `BAD_LOGIN`, and a pending password change is refused.
3. **API:** `server/Entities/Nasheed/Nasheed.route.js` and its wiring in `server/server.js`.
   - **Guest reads:** `/public` and `/public/:id` send only `_id`, `title`, `lines` and `updatedAt`, limited to 600 a minute per IP.
   - **Writes:** each needs the session plus `requirePermission("nasheeds.manage")`.
   - **Undo:** `POST /restore/:trashId` accepts only nasheed entries.
   - **Headers:** `no-store` and `X-Robots-Tag: noindex`.
4. **Permission and trash:**
   - `nasheeds.manage` is in `shared/permissions.json` and is grant-only (`GRANT_ONLY_MODULES`).
   - The trash has a new kind, `nasheed`, wired in `Trash.model`, `Trash.controller`, `Trash.route`, `recycleBin` and the System `TrashPage` and `routeAccess`.
5. **The app, `apps/nasheed`:**
   - **Pages:** shell, sign-in, library with search, read page, edit form with one row per line, and build a list.
   - **PDF:** built with `html2canvas` + `jsPDF`, loaded on demand, pages drawn as JPEG.
   - **Sending:** share sheet, otherwise download.
6. **Deploy:** `deploy/update.sh`, `deploy/nginx-tamheed.conf`, `deploy/DEPLOY.md`, `server/config/.env.example`, root `package.json` and `scripts/syncShared.js`.

## Questions for the reviewer

- **Public read:** is it safe to leave open, and does anything private leak (the names of who created or edited, entries in the trash)?
- **Session:** does the session end at once on a suspension, a lock, a revoked key or a password change (`tokenIsStale`)?
- **Restore race:** restoring the same entry twice, from the System trash and from the 8-second undo at the same time.
- **Stored text:** `xss-clean` and `mongoSanitize` act on the lines before they are stored. Is Arabic with tashkeel kept as typed?
- **Large PDFs:** a nasheed longer than a page is split by lines across pages (fixed 2026-11-28, `splitRows` in `apps/nasheed/src/pdf.js`); check that no line is lost or repeated and that no page is drawn taller than A4. Every nasheed starts on a new page (owner, 2026-11-28), the heading on the first page.

## Verification so far

- **Tests:**
  - server 1,892 pass;
  - System 1,418 pass, and the build compiled;
  - nasheed 43 pass, and the build compiled.
- **Real browser:** checked against a stub API, with no database:
  - on a phone: the read page and the edit form;
  - the PDF: a heading, numbered titles, verses side by side, tashkeel and `***`, about 95 KB.
- **Not checked:** a real MongoDB, a real host or DNS, the iPhone share sheet.
