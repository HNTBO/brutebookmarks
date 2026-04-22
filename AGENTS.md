# Agent Instructions

## Issue Tracking

This project uses **bd** (beads) for issue tracking.
Run `bd prime` for workflow context, or `bd onboard` for the minimal setup snippet.

Use `bd` as the strategic tracker, not as the default place for every task.

Create or update a bead when the work is:
- multi-session
- dependency-bearing or blocking other work
- architectural, product-level, or cross-cutting
- important context that should still matter in a week or two

Do **not** create a bead for:
- single-session implementation steps
- obvious next edits in the file you are already changing
- tiny bug fixes, refactors, copy edits, or one-off tests with no dependency value

Rule of thumb: if the task would not be useful to preserve after the next couple of commits, keep it out of `bd`.

## Quick Reference

```bash
bd ready                                    # Find unblocked work
bd show <id>                                # View issue details
bd update <id> --status in_progress         # Claim work
bd close <id>                               # Complete work
bd export -o .beads/issues.jsonl            # Refresh the tracked issue snapshot
```

Preferred usage:

```bash
bd ready                                    # Find strategic, unblocked work
bd show <id>                                # Read full context before multi-session work
bd create --title="..." --type=feature      # New strategic workstream
bd create --title="..." --type=task         # Only if it spans sessions or carries dependencies
```

## Landing the Plane (Session Completion)

When ending a work session, you MUST complete all steps below. Work is NOT complete until `git push` succeeds.

1. File issues for remaining work.
   Only file issues for remaining work that meets the strategic criteria above.
2. Run quality gates if code changed.
3. Update issue status in `bd` for the strategic issue(s) touched this session.
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
- Do not let `bd` become a microtask log. Use commits and code review for short-horizon execution detail.
