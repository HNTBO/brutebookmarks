# Repo Sync Recovery Playbook

Use this prompt and checklist when investigating another repository that may have been corrupted by two-way folder syncing, FreeFileSync, SyncThing misconfiguration, or duplicate working copies.

The goal is to distinguish:

- real source-code changes
- fake Git dirt caused by file-level sync
- local tool/runtime artifacts
- broken project metadata or local databases

This playbook was written after recovering `brutebookmarks`, where the main problems turned out to be:

- two different dev folders for the same repo
- bidirectional sync between them
- deletion of one folder after syncing
- many local files appearing modified even though their contents already matched `HEAD`
- sync-conflict junk files
- broken local tool state in `.beads`

## Important Context

I likely had two copies of the same repo and synced them both ways at the filesystem level instead of letting Git be the source of truth.

That can create:

- `sync-conflict-*` files
- weird deleted/re-added files in Git
- dirty working trees where file contents actually equal `HEAD`
- broken tool metadata, caches, lockfiles, SQLite databases, or local runtime state
- confusion about what is deployed versus what is only local

Do not assume a dirty working tree means real unpushed code.
Check whether the file contents actually differ from `HEAD`.

## What We Learned From The Previous Recovery

- The remote repo was still intact.
- The app code was already pushed and deployed.
- Many "modified" files were only Git bookkeeping/index confusion after filesystem sync.
- The obvious junk was removable.
- The most fragile part was local tool state, especially `.beads`.
- The safe baseline was always `origin/main`.

## Instructions For The Agent

Please investigate this repository conservatively.

Rules:

- Do not assume the dirty working tree represents real code changes.
- Use Git and the remote-tracking branch as the source of truth.
- Do not run destructive commands like `git reset --hard` unless you have proven they are safe and explained why.
- Do not blindly delete modified files.
- First identify which files are:
  - real content changes
  - unchanged files merely shown as modified
  - generated/runtime artifacts
  - broken local-tool state
- Prefer plain-English explanations over Git jargon.
- Explain whether each issue is:
  - worth fixing
  - safe to ignore
  - risky and needing manual review

## Triage Procedure

Please follow this order:

1. Check branch and working-tree state.

Commands:

```bash
git status --short --branch
git log --oneline --decorate -10
```

Questions to answer:

- Is the local branch ahead, behind, or aligned with `origin`?
- Are there untracked conflict files or obvious artifacts?

2. Look for obvious junk first.

Examples:

- `*.sync-conflict-*`
- `test-results/`
- temp files
- duplicate worktree folders
- editor/runtime leftovers
- local DB or daemon files

3. Check whether modified files truly differ from `HEAD`.

For suspicious files, compare working-tree content to Git `HEAD`, not just `git status`.

Examples of the kind of thing to check:

- same file hash as `HEAD`
- deleted + re-added but content unchanged
- line-ending-only churn
- staged/unstaged confusion after sync

4. Separate app code from tool metadata.

Examples:

- `src/`, `tests/`, `extension/`, `package-lock.json`
- versus `.beads`, local caches, runtime files, tool databases

5. If code files appear modified, determine whether they are already deployed.

Compare current local changes to recent commits.
Look for matching commits and confirm whether the local contents already equal `HEAD`.

6. If local tool state is broken, repair it without risking app code.

Especially for `.beads`:

- prefer recovery from tracked JSONL over trusting local runtime state
- keep tracked issue data if it is still valid
- remove only obvious runtime junk

## Questions I Want Answered

Please answer these in plain English:

1. Is the app code actually different from the pushed version, or is Git just confused?
2. Which files are obvious junk and safe to remove?
3. Which files are real work and should not be deleted?
4. Which files are tool/runtime state and not part of the app itself?
5. Is the local issue-tracker/tooling state broken?
6. What is the smallest safe cleanup that improves the repo without risking real work?

## Output Format I Want

Please keep the answer practical and accessible.

I want:

- a short summary of whether the repo is actually in danger
- a list of obvious junk/artifacts
- a list of real source changes, if any
- a list of fake dirty files that already match `HEAD`
- a recommendation:
  - keep
  - revert
  - delete
  - ignore

If you make any fixes, explain:

- what you changed
- why it was safe
- what still remains unresolved

## Strong Warnings

Please avoid these mistakes:

- Do not use filesystem sync tools to reconcile repo history.
- Do not assume "modified" means "valuable".
- Do not assume "dirty" means "undeployed".
- Do not break the app in order to clean local tooling.
- Do not discard tracked issue data unless it is clearly replaceable and backed up.

## Reusable Prompt

You can use this directly:

> I previously had two copies of this repository and mistakenly reconciled them using bidirectional filesystem sync instead of Git. In another repo, this created sync-conflict files, fake modified files that already matched `HEAD`, and broken local tool state. Please investigate this repo conservatively. Use `origin` as the trusted baseline. Tell me in plain English which files are real code changes, which are junk, which are fake Git dirt, and which are local tool/runtime artifacts. Do not use destructive commands unless you have proven they are safe. If possible, clean only the obvious artifacts first, then verify whether the remaining modified files truly differ from `HEAD`.

## Practical Lesson

For future incidents:

- Git should reconcile repo history.
- SyncThing/FreeFileSync should not be used to merge two active working copies of the same Git repo.
- If this happens again, freeze the repo, inspect it, and compare to `origin` before making more changes.
