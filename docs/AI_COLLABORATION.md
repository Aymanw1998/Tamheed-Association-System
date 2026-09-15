# Codex and Claude Code workflow

## Each substantial change

1. Read the owner's request, current working changes, and review log. Record a
   bounded objective, file ownership, and verification plan.
2. The implementer prepares the change and runs focused checks. The reviewer
   reads the authorized source or prepared review request without editing the
   implementer's files.
3. Exchange findings with file/line evidence and a concrete failure scenario.
   The implementer addresses findings or explains a disagreement; send changed
   logic back for review when needed.
4. Run the relevant regression tests and build. Record actual results and any
   remaining limitations. Report local completion separately from peer-review
   completion and production verification.

## Communication

Use the installed Claude Code CLI for actual Claude responses. Prefer an
explicit review request containing only the necessary source excerpts or diff.
Use a dedicated review invocation; do not interrupt or resume the owner's
unrelated Claude sessions. A request to review is not a review result.

Respect the current source-sharing authorization. The current request is in
`docs/claude-review-request.md`; its approval state is in `AI_REVIEW_LOG.md`.
Existing approvals persist for their stated scope. Never circumvent a denied
tool call by changing the transport, agent, or payload representation.

Keep one writer per file and avoid recursive reviewer calls. During a review,
return feedback to the requesting implementer. On a later independent task,
either agent may implement and request review from the other. If direct contact
is unavailable, record the handoff as pending and tell the owner.

## Verification

- `npm test`: isolated server and client regression tests.
- `npm run verify`: regression tests followed by the client production build.
- CI also checks server JavaScript syntax.

These checks do not establish that production services, storage, email, or the
database work end to end. Use a separately authorized test environment for those
checks. This workflow runs during active tasks; it is not a background monitor.
