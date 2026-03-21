# Agent Instructions

## Issue Tracking

This project uses **bd** (beads) for issue tracking.
Run `bd prime` for workflow context, or `bd onboard` for the minimal setup snippet.

## Quick Reference

```bash
bd ready                                    # Find unblocked work
bd show <id>                                # View issue details
bd update <id> --status in_progress         # Claim work
bd close <id>                               # Complete work
bd export -o .beads/issues.jsonl            # Refresh the tracked issue snapshot
```

## Landing the Plane (Session Completion)

When ending a work session, you MUST complete all steps below. Work is NOT complete until `git push` succeeds.

1. File issues for remaining work.
2. Run quality gates if code changed.
3. Update issue status in `bd`.
4. Refresh the tracked beads export:
   ```bash
   bd export -o .beads/issues.jsonl
   ```
5. Push everything:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
6. Clean up any stale local state.
7. Hand off the relevant context for the next session.

## Critical Rules

- Work is NOT complete until `git push` succeeds.
- NEVER stop before pushing.
- NEVER say "ready to push when you are".
- If push fails, resolve it and retry until it succeeds.
