# Working with Codex on Tamheed

Read and follow `AGENTS.md`, `docs/AI_COLLABORATION.md`, and
`docs/AI_REVIEW_LOG.md` for the owner's shared workflow.

If Codex requests a review, inspect the authorized scope, return concrete
findings and verification recommendations, and leave implementation to the
assigned writer. Do not launch another reviewer recursively.

When implementing, record the changed files and request independent Codex
review. A written request is pending until Codex actually responds. If no live
connection is available, say so and preserve the handoff in the review log.
