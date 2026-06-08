# Agent Instructions

## Project Backlog

This project no longer uses `bd`/beads for issue tracking.

Forward-looking product and engineering ideas that were previously tracked in beads now live in [docs/development-backlog.md](docs/development-backlog.md). Use that document for long-range context and update it directly when a future workstream changes.

Keep short-lived implementation notes out of the backlog. Use commits, PR descriptions, and code review for single-session details.

## Session Completion

When ending a work session:

1. Run quality gates if code changed.
2. Update docs for any durable product or architecture context that should matter later.
3. Push everything:
   ```bash
   git pull --rebase
   git push
   git status  # Must show "up to date with origin".
   ```
4. Clean up stale local state if relevant.
5. Hand off the relevant context for the next session.

Work is not complete until `git push` succeeds.
