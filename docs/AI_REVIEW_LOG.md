# Review log

## 2026-09-14: Initial stability and shared workflow

**Owner request:** Codex and Claude Code should communicate and work together
on a stable Tamheed system.

**Implementation:** Codex coordinated separate file owners. One internal agent
fixed refresh-cookie deletion; another fixed self-edit authorization; Codex
fixed ordinary permission-denial logout and added refresh request timeouts.
An internal reviewer checked the combined authorization and client changes and
reported no actionable introduced regression. This is not Claude review.

**Changes:**

- Self-edit accepts only profile fields for non-administrators and targets the
  active account. Account roles, storage authority, identity and authentication
  metadata cannot be overwritten through the self-edit payload. Administrator
  management behavior is preserved.
- Ordinary `403/FORBIDDEN` responses reject the request without clearing the
  session. Explicit `BLOCKED` responses still reset it.
- All four raw Axios refresh call sites have a 15-second timeout.
- Logout expires the same production-domain refresh cookie created at login.
- Root test/verification scripts and CI run the new regression suites.
- `AGENTS.md` and `CLAUDE.md` point to the shared collaboration procedure.

**Verification:** `npm run verify` passed: 12 server tests, 4 client tests, and
the optimized client build. All 58 server JavaScript files passed `node
--check`; `git diff --check` passed. Client build emitted pre-existing
Browserslist-data and Node deprecation warnings. No production service, real
database, or external storage/email integration was exercised. Timeout tests
check configuration and error handling without real network traffic.

**Claude connection:** Installed CLI version 2.1.258; authentication status
reported logged in. The restricted review invocation returned no response and
was stopped. The network-enabled invocation was rejected before execution by
automatic approval review because it would send internal repository code to
Claude's external service without payload-specific authorization. No Claude
review or agreement has been obtained. No bypass was attempted.

**Pending approval:** `docs/claude-review-request.md` contains the exact proposed
review payload: selected code/configuration diffs and the new regression tests.
It excludes environment files, credentials, runtime logs and real user data.
Ask the owner to authorize sending relevant Tamheed source to Claude via their
Claude account for shared reviews, starting with this prepared payload. Record
the owner's actual answer here before sending; authorization persists for its
stated scope.

**Next exchange after approval:** Send the prepared payload to actual Claude
Code in a dedicated read-only review invocation. Record its response, address
concrete findings, rerun relevant verification and send changed logic back when
needed. Cross-caller refresh coordination and API-initialization ordering remain
areas for further review; a fully stable production system is not yet certified.

**Delivery state:** Local changes only; no commit, push, deployment or unattended
monitor was started.
