# Codex request: fixes for the full-project review (2026-11-18)

Base: `5837a88`. Review: `docs/reviews/2026-11-18-codex-full-project-review.md`. Owner: fix all 14; #11 keep the drawn signature only (say so in the accessibility statement); #6 keep offline saves on the device and send later, the server's version check refuses an overwrite.

1. **P1 staff id.** `User.controller.js` `changeRoom` keeps `_id` across rooms. Test in `user-audit.test.js` (suspend and reactivate keep `g1`). Users moved before this fix already have a new `_id`; their old links are not repaired.
2. **P2 failed sign-out.** New `pendingSignOut.js` in System (`utils/`), IT and Sport: a sign-out with no answer (or 5xx) is remembered; no automatic session restore (System `refreshSession`, IT `loadMe`, Sport `load`) until a logout reaches the server; a new sign-in clears it; System retries on `online`. `clearStorageKeepingTextSize` keeps the flag. Tests in each app.
3. **P2 monthly email.** `monthlySummaryJob.mayReceiveSummary`: visible manager, not locked (`isLocked` like `loadActor`), and `lessons.viewAll` + `students.viewAll` + `attendance.view` effective now. Test added.
4. **P2 attendance export.** New key `attendance.exportExcel` (catalog, label, synced copies; assistant default keeps it). Route needs `attendance.view` and `attendance.exportExcel`; controller needs `audit.recordRequired` (503 `AUDIT_FAILED`). `LessonView` button gated. Tests in `lesson-users-attendance.test.js`.
5. **P2 network failure = signed out.** `WebServer/utils/authNetwork.js`: `isConnectionFailure` (no response, 408, 429, 5xx; never `SIGN_OUT_PENDING`) and `mayStayOffline` (signed in here, no pending sign-out, before the auto sign-out time). `RequireAuth` keeps the app open on a connection failure and checks again on `online`; `getMeChecked` tells refusal from no connection; `accessScheduler` retries every 30 s or on `online` instead of wiping storage. Tests: `authNetwork`, `RequireAuth`, `accessScheduler`.
6. **P2 offline attendance after the lease lapses.** `lapsedForConnection(lock)` (readonly with reason `expired`): `AttendancePage` stays editable and every save goes to the queue (with `baseVersion`, so an overwrite is refused 409 and shown). Released by a manager or for idleness stays read-only. Test in `useItemLock.test.js`.
7. **P2 queue retries.** `QueueStatus`: any passing stop (0, 408, 423, 429, 5xx) retries with the existing backoff; 401 waits for sign-in; a newly queued save is sent after 2 s; «إرسال الآن» on the pending card. Tests in `QueueStatus.retry.test.js`.
8. **P2 database name.** `utils/dbName.js`: the six older models use `DB_NAME`; the server refuses to start when `DB_NAME` is not `tamheed_db` and the staff are only in `tamheed_db`. Test `db-name.test.js`. `deploy/DEPLOY.md` updated.
9. **P2 deploy/backup overlap.** Shared `deploy/.maintenance.lock` (read-only fd 8, `flock -w`; update waits 30 min, backup 60 min, `MAINT_WAIT_SEC`); pm2 calls close fd 8/9 so a daemon never keeps it. `.gitignore` updated. Tests in `deploy-update.test.js`, `mongo-backup.test.js`.
10. **P2 IT dialogs.** `apps/it/src/styles.css`: `.page-enter` and list rows animate with `backwards` fill. Test `styles.motion.test.js`.
11. **P2 keyboard signing.** Owner: the signature stays a drawing; the accessibility statement now says it needs touch or a mouse and points to the coordinator.
12. **P2 filter focus.** New `useDialogFocus` (System `utils/`, IT `ui/`): focus in on open, Tab kept inside, focus back to «فلتر» on close. Test `FilterDialog.focus.test.js`. Background is not made `inert` (Tab containment + `aria-modal`).
13. **P3 Sport errors.** `shapeResult` keeps 404 `NO_EMAIL` / `NOT_IN_SPORT` with the server's text. Test in `api.test.js`.
14. **P3 startup.** Root `sport` script runs `npm start`; `scripts/setup.js` installs Sport and IT.

Not checked on a real phone, in a real browser offline, with a screen reader, or on the server (lock, database guard).

Please check: the pending sign-out flows in all three apps (especially that a new sign-in never sends a stale logout), the offline paths in `RequireAuth`/`accessScheduler`, queue retry loops, the lock fd handling in both scripts, and the database guard.
