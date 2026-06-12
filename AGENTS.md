# Agent Instructions

## Issue Tracking

This project no longer uses **bd** / Beads for issue tracking.

- Do not run `bd` commands.
- Do not create or update beads.
- Do not refresh `.beads/issues.jsonl`.
- Treat any `.beads` files or historical bead ids as archived context only.

Use normal Git history, pull requests, code review notes, and `docs/development-backlog.md` for durable project context.

## Landing the Plane (Session Completion)

When ending a work session, complete the relevant steps below.

1. Note any important remaining work in the handoff or in `docs/development-backlog.md` if it is durable project context.
2. Run quality gates if code changed.
3. Push when the user requested a commit/push or when the current workflow calls for landing changes:
   ```bash
   git pull --rebase
   git push
   git status
   ```
4. Clean up any stale local state you created.
5. Hand off the relevant context for the next session.

## Critical Rules

- Do not use `bd`; the project has been un-beaded.
- Do not turn durable backlog notes into a microtask log. Use commits and code review for short-horizon execution detail.
- Never overwrite or revert unrelated user changes in the dirty worktree.
