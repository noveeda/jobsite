<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:project-versioning-rules -->

# Automatic Git history

For every task that modifies this repository, use the `git-conventions` skill.

The user grants standing authorization to stage, commit, and push only the files Codex changed for a successfully completed task. Create one atomic checkpoint per logical task after its required validation passes. Never include pre-existing, user-owned, unrelated, incomplete, or failing changes. If ownership is ambiguous, leave those files untouched and report that no automatic checkpoint was made.

<!-- END:project-versioning-rules -->

<!-- BEGIN:compound-engineering-rules -->

# Compound engineering memory

Before database, E2E, authentication, or date/time work, read
`docs/engineering/lessons-learned.md`. When a non-trivial failure is fixed,
append only a reusable root cause, guardrail, and proof command; never record
credentials, environment values, or one-off debugging noise.

<!-- END:compound-engineering-rules -->
