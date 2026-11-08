# Independent Codex review request: data retention and design consistency (2026-11-08)

Actual Claude Code is the sole implementer. You are the independent Codex
reviewer. Review only the uncommitted working-tree changes (`git diff`) in this
repository. Do not edit files, run seed/migration/admin/data-clearing commands,
touch `.env`, or start another reviewer. The repository is public. This request
includes no credentials, runtime logs, or real records.

## Owner request and decisions

The owner asked for a QA scan of all systems, with the data-load fixes done
first and the design fixes after them. The owner chose:

- Notices trash: permanent automatic deletion **30 days** after a notice is
  moved to the trash, plus a manual permanent-delete button.
- IT audit log: archived rows are deleted automatically **6 months** after
  archiving. Current (unarchived) rows are never deleted.

## Changes

Data:
- `server/Entities/Notice/Notice.service.js`: Mongo filters now narrow every
  read (`activeNotices`, `listNotices`, `countUnread`, `markAllRead`) instead
  of `get({})` over the whole collection. The existing in-memory filters are
  kept as a second check. Trash sets `expireAt = min(existing expireAt,
  now + 30d)` and keeps the old value in `keptExpireAt`. Restore brings it
  back. A second trash of an already-trashed notice returns 404. `purgeNotice`
  hard-deletes manual notices only, and only from the trash. `markAllRead` is
  one `updateMany` (`$addToSet` readBy, `$set readTimes.<id>`), guarded to
  plain ids.
- `Notice.model.js`: `markReadMany` and `remove`. `Notice.controller.js`:
  `purge` handler with an audit record, and `canManageTrash` includes
  `notices.purge`. `Notice.route.js`: `POST /:id/purge` requires
  `notices.purge` and `notices.view`.
- `shared/permissions.json` and the generated copies: new `notices.purge`
  leaf ("حذف نهائي"). The administration role gets it through its whole
  `notices` module. `docs/FEATURE_PERMISSIONS.md` is updated.
- `server/Entities/Audit/Audit.model.js`: TTL index on `archivedAt`
  (183 days). `archivedAt` is a Date set by `archive`; restore sets it to null.

Design / QA:
- IT `styles.css`: the active `role="tab"` button is styled as primary. Before
  this change the audit tabs had no active state.
- IT `Audit.jsx`: drops stale responses when tabs or pages change quickly; the
  confirm text states the 6-month rule.
- System `NoticesBoard.jsx`: the tabs choose the folder. The status filter only
  appears in the inbox (all/unread), which removes the duplicate control and
  fixes the inbox tab losing its highlight when "unread" was selected.
  "Delete for everyone" uses the danger style and mentions 30 days. Added a
  trash hint and a permanent-delete button gated by `notices.purge`.
- `FilesPage.module.css`: UI chrome colors mapped to the brand tokens.
  File-type badge colors are unchanged.
- Sport `styles.css`: uses the IBM Plex Sans Arabic font, which was already
  loaded.
- `confirmBus.js`: debug `console.log` removed. `ReportPdfAction.jsx`: the
  error text is shown in red.

Tests: notice trash/purge/restore/expiry and grant/revoke, one-update
read-all, route guard map, audit TTL index, board purge button with and
without `notices.purge`.

## What to look for

Concrete defects with file/line evidence and a failure scenario. Pay
particular attention to:
- Mongo semantics: `null` matching a missing field, `$ne` on arrays,
  `expireAt` type.
- TTL behavior: an existing `archivedAt` index, and interaction with the
  `{archivedAt: null}` list filter.
- Restore and purge race conditions.
- Permission bypass.
- The `readTimes.<id>` dotted-key update when `readTimes` is null or missing.

State explicitly if you have no findings. A request is not approval.
