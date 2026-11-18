# Codex full-project review, 2026-11-18 (HEAD 5837a88)

Actual output of `codex exec --sandbox read-only`, at the owner's request (code, server, all sites, installed app, phone and desktop web). Links made repo-relative.

Reviewed clean HEAD **5837a88** without changing files. I found **14 current issues: 1 P1, 11 P2, and 2 P3**. The main weaknesses are staff identity preservation, failed sign-out, and offline attendance reliability.

Verification: **1,698 server tests passed; 40 failed because the sandbox denied temporary-directory creation**. Shared-file synchronization checks passed. Client Jest runs were blocked by denied temporary-cache writes; builds and therefore the complete `npm run verify` could not run. Additional in-memory checks reproduced findings 1, 3, and 13. No real database, browser, or external service was used.

1. **P1 · server — Suspending/reactivating staff breaks their existing record relationships.**  
   Evidence: [User.controller.js:1615](server/Entities/User/User.controller.js:1615). `changeRoom` deletes `_id`, creates another user document, then deletes the original. Lessons and responsible-student assignments still reference the old ID. Suspending and reactivating a guide therefore removes their access to existing assignments and leaves dangling references. An in-memory controller reproduction returned two successful responses but changed `g1` to `user-1`; both lesson access and responsible-guide checks then failed.  
   **Fix:** preserve the immutable user ID across room moves, or represent status within one collection. Test the complete suspension/reactivation cycle with linked records.

2. **P2 · system / it / sport — Failed sign-out can silently restore the account.**  
   Evidence: [System logout:125](apps/system/src/WebServer/services/auth/fuctionsAuth.jsx:125), [IT signOut:83](apps/it/src/App.jsx:83), [Sport onLogout:105](apps/sport/src/App.jsx:105). All three leave the signed-in screen despite a failed logout request. The server cookie survives; System subsequently refreshes it through `PublicOnly.jsx:50`, while IT/Sport reload their cookie-backed session on reopening. On a shared phone, signing out during an outage can expose the previous account when connectivity returns.  
   **Fix:** persist pending sign-out locally, suppress automatic session restoration, and retry server revocation. Do not present failed server revocation as completed sign-out.

3. **P2 · server — Monthly email ignores account locks and revoked visibility.**  
   Evidence: [monthlySummaryJob.js:145](server/services/monthlySummaryJob.js:145). Recipients are selected solely by active-room membership, administrator role, and email. The job sends the same association-wide program statistics and named student absence list without checking locks or effective permissions. An in-memory check confirmed that an account with `lockedAt` and revoked `attendance.view` remained a recipient.  
   **Fix:** check account eligibility and effective grants at delivery time; require the permissions needed for the complete report or generate a scoped report. Add lock and grant/revoke tests.

4. **P2 · server / system — Attendance Excel export has no independently revocable operation permission.**  
   Evidence: [Attendance.route.js:32](server/Entities/Attendance/Attendance.route.js:32), [LessonView.jsx:157](apps/system/src/Components/Lesson/LessonView.jsx:157). The older export endpoint and button require only `attendance.view`. Its controller returns up to a year of scoped attendance without the audit gate used by newer exports. Consequently, IT cannot retain attendance viewing while revoking this export operation.  
   **Fix:** introduce an attendance export capability, enforce it on the route and button, and require successful export auditing. The newer export fixes in the review log do not cover this endpoint.

5. **P2 · pwa — A temporary connection failure is treated as loss of authentication.**  
   Evidence: [RequireAuth.jsx:58](apps/system/src/Components/Routes/RequireAuth.jsx:58), [accessScheduler.js:51](apps/system/src/WebServer/utils/accessScheduler.js:51). Every protected-path change calls `/auth/me`; a network failure becomes `null`, removes the access token, and redirects to login—even when the token was valid. A scheduled refresh failure additionally clears local storage and API caches. Opening or navigating the installed app offline therefore defeats its cached screens; a brief outage can also erase locally stored drafts.  
   **Fix:** distinguish transport failures from confirmed authentication rejection. Preserve drafts and provide a bounded offline state for previously authenticated users, with server authorization rechecked before writes.

6. **P2 · pwa — Offline attendance becomes unsavable after the edit lease expires.**  
   Evidence: [useItemLock.js:148](apps/system/src/locks/useItemLock.js:148), [AttendancePage.jsx:602](apps/system/src/Components/Attendance/AttendancePage.jsx:602). After approximately 120 seconds without a successful heartbeat, the sheet becomes read-only and disables Save. The offline-queue branch at `AttendancePage.jsx:284` is then unreachable through the button. A guide who loses connectivity while recording attendance cannot keep saving locally for the remainder of the lesson.  
   **Fix:** separate local draft/queue capture from possession of an online edit lease. Preserve server lock and version checks when replaying queued work.

7. **P2 · pwa — Transient queue failures can leave attendance pending indefinitely.**  
   Evidence: [QueueStatus.jsx:66](apps/system/src/pwa/QueueStatus.jsx:66), [attendanceQueue.js:148](apps/system/src/pwa/attendanceQueue.js:148). The queue retains network errors, 408, 429, and 5xx responses, but schedules retries only for 423. Enqueue events update the count without initiating synchronization; the retry button appears only for permanently failed rows. A failed save while the browser still reports “online,” or a 503 during reconnection, can remain pending until another unrelated trigger or restart.  
   **Fix:** retry transient failures with bounded backoff, trigger synchronization after enqueue/recovery, and expose a manual retry for pending rows.

8. **P2 · deploy — A supported nondefault database name produces incomplete backups.**  
   Evidence: [User.model.js:11](server/Entities/User/User.model.js:11), [mongo-backup.sh:49](deploy/mongo-backup.sh:49). Core User, Student, Lesson, Attendance, and other legacy models hardcode `tamheed_db`; newer models honor `DB_NAME`. The backup dumps only `DB_NAME` at line 112. Configuring another database splits records between databases, and a successful backup omits core records.  
   **Fix:** centralize database selection across every model and operational script. Add an isolated nondefault-database configuration test and detect existing split deployments before changing configuration.

9. **P2 · deploy — Deployment and backup can overlap despite backup’s consistency requirement.**  
   Evidence: [mongo-backup.sh:69](deploy/mongo-backup.sh:69), [update.sh:147](deploy/update.sh:147). Backup locks only other backups and stops the application while dumping. Deployment takes no corresponding lock and can reload/start the application during that dump. The documented nightly backup falls within the allowed deployment window. An overlapping update therefore permits writes during a backup that assumes the application is stopped.  
   **Fix:** use one shared maintenance lock covering deployment and backup lifecycle operations, including restart ownership.

10. **P2 · it / mobile-web — IT retains the animation rule that mispositions fixed dialogs.**  
    Evidence: [styles.css:213](apps/it/src/styles.css:213), [FilterDialog.jsx:40](apps/it/src/ui/FilterDialog.jsx:40). IT’s page wrapper retains a transform animation with fill mode `both`, while fixed dialogs remain descendants of that wrapper. This is the IT copy of the containing-block fault documented and fixed only in System. On a long IT page, a filter or confirmation can be positioned relative to the page rather than the viewport; the phone bottom-sheet layout makes the problem particularly disruptive.  
    **Fix:** apply the completed-animation cleanup/backwards-fill correction and render overlays outside the animated wrapper. **Verify on scrolled phone and desktop layouts; no browser reproduction was performed here.**

11. **P2 · mobile-web / desktop-web — Required parent signing has no keyboard-accessible completion path.**  
    Evidence: [SignaturePad.jsx:64](apps/system/src/Components/Student/SignaturePad.jsx:64), [ParentConsentPage.jsx:22](apps/system/src/Components/Student/ParentConsentPage.jsx:22). The signature canvas accepts pointer events only, is not keyboard focusable, and offers no alternative input. Submission rejects an empty signature. A keyboard-only parent can complete the surrounding form but cannot submit consent.  
    **Fix:** provide an accessible signature mechanism or an approved equivalent, preserving explicit consent and server validation. Verify the complete flow with keyboard and assistive technology.

12. **P2 · desktop-web — Filter dialogs do not manage modal focus.**  
    Evidence: [System FilterDialog.jsx:16](apps/system/src/Components/UI/FilterDialog.jsx:16); IT contains the same implementation. Opening the dialog does not move focus inside; Tab is not contained, background controls are not inert, and focus is not restored on closing. Keyboard users can tab into and operate obscured page controls while the component declares `aria-modal="true"`.  
    **Fix:** use a shared accessible dialog implementation with initial focus, containment, background inertness, and focus restoration. **Verify keyboard and screen-reader behavior in a browser.**

13. **P3 · sport — Actionable login errors are replaced with “try again.”**  
    Evidence: [api.js:10](apps/sport/src/api.js:10), [SportPortal.auth.js:126](server/Entities/SportPortal/SportPortal.auth.js:126). The server returns explicit 404 `NO_EMAIL` and `NOT_IN_SPORT` responses directing the student to a guide. The client preserves messages only for 200/400 and discards both codes and explanations. Students receive an unhelpful retry instruction for conditions retrying cannot resolve. An in-memory reproduction confirmed this transformation.  
    **Fix:** preserve/map these known response codes and test the resulting login messages.

14. **P3 · deploy — The documented root development startup cannot launch Sport.**  
    Evidence: [package.json:13](package.json:13), [setup.js:40](scripts/setup.js:40). Root startup invokes Sport’s nonexistent `dev` script; its package defines `start`. Setup also installs neither Sport nor IT dependencies despite directing the user to launch the sites afterward.  
    **Fix:** invoke Sport’s actual start script and make setup install the applications it advertises.

The per-area assessment is:

| Area | Solid in the reviewed code | Weak or unverified |
|---|---|---|
| Server | Extensive isolated tests; centralized actor checks, scope enforcement, and operation guards | Staff identity moves; email authorization; legacy export coverage |
| System | Permission-aware navigation, draft support, and explicit update handling | Network failures disrupt sessions; offline attendance is unreliable |
| IT | Dedicated session/API boundary and administrative gates | Failed logout; dialog placement and focus |
| Sport | Separate self-only portal flow and session handling | Failed logout; discarded actionable errors |
| Shared | Generated permission/style copies pass synchronization checks | Attendance export lacks a distinct capability |
| Scripts / deploy | Builds prepared separately; backup locking, retention, and offsite mechanisms exist | Startup mismatch, inconsistent database selection, deployment/backup overlap |
| Installed PWA | Manifest, standalone mode, icons, install guidance, push opt-in, and update/caching code exist | Offline reopening and sustained offline work are weak; Android/iOS/desktop installation and real push delivery remain unverified |
| Phone browser | RTL styling, responsive rules, touch signature input, and safe-area treatments exist | IT dialog defect and inaccessible signing; virtual-keyboard, zoom, and touch behavior require device verification |
| Desktop browser | Route splitting and desktop layouts are implemented | Modal keyboard behavior and signing accessibility |
| General web behavior | Cache clearing and version-update handling are implemented; previously fixed issues were excluded | Session/network recovery is the dominant remaining weakness |

For bundle context, **pre-existing local builds**, not fresh builds verified against HEAD, contained approximately **231 KiB gzip for System’s main JS**, **74 KiB for IT**, and **111 KiB for Sport**. System’s JavaScript totaled about **996 KiB gzip across chunks**. These measurements establish size only; they do not establish device startup performance or a performance regression.

The prioritized top 10 are:

1. Preserve staff IDs through suspension/reactivation — **#1**
2. Prevent session resurrection after failed logout — **#2**
3. Align database selection with backup coverage — **#8**
4. Apply locks and permissions to monthly email — **#3**
5. Make attendance export independently revocable and audited — **#4**
6. Preserve sessions and drafts through temporary outages — **#5**
7. Retry pending attendance after transient failures — **#7**
8. Allow local attendance capture after lease loss — **#6**
9. Correct IT dialog positioning — **#10**
10. Provide accessible parent signing — **#11**