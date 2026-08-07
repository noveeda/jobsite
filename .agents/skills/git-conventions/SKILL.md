---
name: git-conventions
description: Maintain this repository's automatic Git history through safe task checkpoints, branch naming, atomic staging, Conventional Commits, validation, pushing, and pull requests. Use for every task that modifies repository files, and whenever Codex creates or switches a branch, prepares or writes a commit, pushes changes, opens a pull request, or is asked about this project's Git conventions.
---

# Git Conventions

Keep every Git change small, reviewable, and reproducible. Preserve unrelated user work.

## Workflow

1. Inspect `git status --short --branch`, relevant diffs, the current branch, and its upstream.
2. Separate unrelated changes. Ask which files belong when ownership or scope is unclear.
3. On the default branch, create `codex/<type>-<kebab-summary>` before committing. Keep an existing non-default branch when it already matches the work.
4. Run the smallest relevant checks before staging. Run `npm run verify` before a final push unless the user explicitly limits verification or the change is documentation-only.
5. Stage only confirmed paths with `git add -- <paths>`. Never use `git add .`, `git add -A`, or `git add --all`.
6. Review `git diff --cached` and confirm it contains no secrets, generated output, or unrelated edits.
7. For a successfully completed modifying task, use the standing authorization in the repository `AGENTS.md` to commit and push only task-owned files. Treat the checkpoint as part of completing the task, not as an optional follow-up.
8. Require fresh explicit authorization for files outside the task scope, failed or incomplete work, history rewriting, force-pushing, or PR creation.

## Automatic checkpoints

- Create one atomic commit per completed logical task after required checks pass.
- Derive the Conventional Commit message from the staged diff.
- Push the current branch to its configured upstream. If it has no upstream, push with `git push -u origin <branch>` only when `origin` is the confirmed project repository.
- Do not checkpoint when there are no task-owned changes, validation fails, the task is incomplete, secrets are present, or file ownership is ambiguous.
- A push failure does not justify rewriting the commit. Keep the local commit and report the failure.
- Report the commit SHA, message, pushed branch, and validation result in the final response.

## Branches

Use lowercase kebab-case:

```text
codex/<type>-<short-purpose>
```

Choose `<type>` from `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, or `chore`.

Examples:

```text
codex/feat-job-alerts
codex/fix-deadline-timezone
codex/docs-deployment-guide
```

## Commits

Use Conventional Commits:

```text
<type>(<optional-scope>): <imperative summary>
```

- Use `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, or `revert`.
- Write the summary in concise English, lowercase, imperative style, without a trailing period.
- Keep the subject at 50 characters or fewer when practical.
- Use a short lowercase scope such as `jobs`, `auth`, `db`, `sources`, `security`, `ops`, or `beta`; omit it when no scope improves clarity.
- Make one logical change per commit. Split independent changes.
- Add a body only when the reason, migration impact, or compatibility risk is not clear from the subject.
- Mark breaking changes with `!` and explain them in the body.

Examples:

```text
feat(jobs): add deadline filters
fix(auth): preserve redirect after login
test(beta): cover deployment health gate
docs(ops): document rollback checks
```

## Validation

- Documentation-only: inspect links, paths, and formatting; no application test suite required.
- TypeScript or UI: run the directly relevant test, then `npm run lint` and `npm run typecheck`.
- Database migration: additionally run `npx supabase test db` when the local Supabase test environment is available.
- Final push: run `npm run verify`; add E2E tests when the changed user flow or release gate requires them.
- Report any skipped or failed check explicitly. Never claim an unrun check passed.

## Pull Requests

- Use a Conventional Commit-style PR title.
- Summarize why the change exists, the material changes, validation performed, and known risks or follow-ups.
- Reuse an existing matching PR and create at most one.
- Open as draft unless the user explicitly requests a ready PR.

## Safety

- Never commit `.env*`, credentials, tokens, private keys, database dumps, `.next`, or `node_modules`.
- Never rewrite shared history, force-push, amend another author's commit, or delete branches without explicit authorization.
- Never discard, rename, or absorb unrelated working-tree changes merely to obtain a clean status.
