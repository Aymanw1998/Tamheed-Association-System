# Tamheed collaboration

The owner wants Codex and actual Claude Code to exchange findings and work
together on stability. Read `docs/AI_COLLABORATION.md` and the current
`docs/AI_REVIEW_LOG.md` before substantial work.

- Assign one implementer and an independent reviewer for each change. Never let
  two agents edit the same file at once; preserve existing user changes.
- Request actual Claude Code review when Codex implements, and Codex review when
  Claude implements. Internal Codex subagents do not count as Claude review.
- Honor existing user authorization for source sharing; do not ask again for an
  already authorized scope. If permission or availability blocks the peer,
  continue independent local work and clearly record the pending review.
- Record the request, peer response, resolution, and verification in the review
  log. Do not claim agreement unless the other agent actually responded.
- Use `npm run verify` for the current regression suites and client build.
  Add focused behavioral tests for authentication, permissions, or data changes.
- Do not run data-clearing, seed, migration, or administrator-creation commands
  as tests. Keep tests isolated from real databases and external services.
- Never include `.env`, credentials, runtime logs, or user records in review
  payloads. Follow the user's explicit instructions if the workflow changes.

These instructions govern active work. They do not start background agents or
schedule unattended changes.
