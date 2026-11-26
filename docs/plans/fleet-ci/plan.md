---
plan: fleet-ci
repo: HNTBO/brutebookmarks
target_branch: main
branch_prefix: codex/fleet-ci-
baseline: 7c9cd6eff1da7a205fb630ce10ad2e6063254100
created: 2026-11-26
---

# Test BruteBookmarks before merge and verify it on Fleet

## Goal

Give maintainers a reliable answer to three questions before merging. Does the app build with its backend types? Do the browser interactions still work? Can both extensions ship for both browsers? Today the public [CI workflow](../../../.github/workflows/ci.yml) installs dependencies. At the baseline the suite contains 103 unit tests and 49 Chromium tests. GitHub reports zero registered repository runners and an unprotected main branch. Vercel owns deployment.

## Fred's decisions

Fred requested a Fleet-backed CI plan on November 26, 2026. Merging accepts the routing and rollout below. The plan PR itself changes documentation only.

1. Proposed for approval: keep the repository public and all three pre-merge checks on standard GitHub-hosted Linux. Use two dedicated private Linux runner slots, on separate eligible Fleet hosts, for post-merge verification. External contributors can run the hosted checks. Only maintainer-reviewed, merged changes may reach Fleet.
2. Approve a dedicated private CI control repository and the Fleet registry work needed to operate it. Keep host identities, routing, reports and operator instructions private. Standard public GitHub-hosted Linux checks are free; Fleet uses local compute. Use local retention for private browser reports and avoid paid private hosted runners. Each host rollout follows the private operator runbook.
3. Require the three public checks after proving them. A failed Fleet run after merge calls for a repair or revert; Vercel may already have deployed it. Use squash merges so each accepted PR adds one main revision. Record the previous merge settings for rollback. Resolve the existing preview credential error separately before enabling contributor builds that could receive production credentials.

4. Approve the targeted favicon fixes below, including preserving supported uploads across native export and import. Fleet commissioning proceeds independently.

## Stages

Stage file lists are relative to the repository named in each brief. The two private stages open their own PRs in their respective repositories. Maintenance credentials and machine records stay outside this public project.

### `portable-checks`: Run the complete checks from a clean checkout

- Wave: 1
- Depends on: none
- Files: `.gitignore`, `convex/_generated/**`, `playwright.config.ts`, `tests/**`, `scripts/ci/**`, `package.json`

**Brief.** Regenerate with the locked Convex CLI in the authorized development environment, then track the five Convex-generated JS and declaration files the app imports. Keep them in sync in future backend changes. Add portable entry points for the three jobs. App checks run the frontend and backend type checks, Vitest and the production Vite build. Browser checks use the Vite dev server because the existing Clerk and Convex test doubles are development-only. Give CI its own server, HTML report and traces on failure. In every browser context intercept external requests, serve local fixtures for expected navigations, icons, fonts and auth scripts, and fail on unexpected external requests. Prove the full suite passes with outbound browser traffic disabled. Extensions use their separate lockfiles and build Quick Save and New Tab for Chrome and Firefox. Supply only the public build inputs required by the WXT manifest checks, from the tracked production environment file in each extension directory. Build without sign-in, signing keys, deploy credentials or local environment overrides. Retain production manifest validation.

**Verification.** Use a fresh clone and a pinned Node 22 LTS patch at or above 22.13. At the root run `npm ci`, `npm run typecheck`, `npx --no-install tsc --noEmit -p convex/tsconfig.json`, `npm test`, and `npm run build`. On a clean Linux image install Chromium and its OS libraries, then run `npm run test:e2e`. In each extension directory run `npm ci`, `npm run build` and `npm run build:firefox`. Inspect all four manifests and verify the Chromium cookie and Clerk host permissions. Publish counts and any genuine baseline failures; repair the cause before requiring the check.


### `favicon-regressions`: Prove how a bookmark icon survives import, reload and refresh

- Wave: 2
- Depends on: portable-checks
- Files: `tests/unit/favicon*.test.ts`, `tests/unit/bookmark-parsers.test.ts`, `tests/favicon*.spec.ts`, `src/utils/bookmark-parsers.ts`, `src/components/categories.ts`, `src/components/modals/settings-modal.ts`, `src/components/icon-picker.ts`, `convex/favicons.ts`

**Brief.** Use a small synthetic PNG and mocked HTTP. Cover importing a Netscape HTML bookmark with an embedded icon and reloading, displaying a genuine 16×16 icon, and refreshing a bookmark with a user-selected upload. In a resolver test, make Icon Horse report a placeholder and the next provider return an icon. Pair each regression with its smallest behavior fix. Apply the supported image formats and storage size limits to imports; preserve the prior fallback for unsupported imports. Exercise the actual parser, cards, Settings action and resolver paths. Round-trip a supported upload through native JSON export, import and reload. Exercise data URIs over 2,048 characters up to the 50,000-character backend icon limit, reject oversize icons and retain the separate bookmark URL limit. Update the native parser tests.

**Verification.** Run the targeted Vitest and Playwright tests. Show each case failing on the baseline, then passing with the fix and outbound favicon traffic intercepted. Assert the decoded image identity and persisted bookmark after reload. Re-run the complete suites.

### `merge-checks`: Give every pull request three meaningful results

- Wave: 2
- Depends on: portable-checks
- Files: `.github/workflows/ci.yml`

**Brief.** Give the three jobs stable names: `App and backend`, `Browser tests`, and `Extensions`. Run all three on every pull request to main, including forks and documentation changes. Use GitHub-hosted standard Linux with read-only repository permissions, locked dependency installs and pinned actions. Cancel superseded PR runs. Keep reports and failure traces for seven days with synthetic data. Set job timeouts and fail the extensions job if any of the four builds fails. Run the same three hosted jobs on pushes to main as well, providing an exact landed-commit check and immediate recovery evidence.

**Verification.** On a disposable PR introduce a failing assertion, capture the failing check and trace, then restore the test in a new commit and see all three turn green on that revision. Check that a fork contribution receives the same three hosted checks and cannot nominate a private runner. After a green trial, bind the three required checks to the GitHub Actions app, require up-to-date PRs and squash-only merges, and verify a failing revision cannot merge. Before acceptance a trusted maintainer reviews changes to workflows, package scripts, dependency locks, test configuration, CI drivers and protections. Exercise a duplicate-name workflow and verify it cannot satisfy private admission. The private controller also records the maintainer who accepted each new SHA; public check success alone is insufficient to admit code to Fleet. Record the previous rule and rollback before enabling it.

### `fleet-capacity`: Commission a private Linux runner pool

- Wave: 1
- Depends on: none
- Files: Private Fleet inventory, capacity manifests, operator runbook and commissioning evidence

**Brief.** This is a private Fleet PR. Establish the dedicated, private CI control repository with trusted write access first. Register it in Fleet using the private Linux runner inventory, maintenance controls and removal procedure. Start with one slot on each of two eligible hosts; operators select them after checking current capacity. Provision Chromium system libraries before accepting jobs. The job account runs without sudo, host mounts, Docker access, personal credentials or deploy keys. Run test jobs in disposable isolated guests, destroyed after success, failure or cancellation. Keep runner registration and control credentials outside the build user's reach. Deny host, LAN and private network access. Restrict egress to approved GitHub, registry and browser-download endpoints. Give each job its own home, workspace and writable caches. Activate only after both slots demonstrate these boundaries. Record installations and actual service state privately, one host at a time.

**Verification.** Validate the new inventory entries against the private registry schema and exercise the provisioning driver for both target slots. Record the commands and results privately. Prove a pinned read-only smoke job can launch Chromium and each slot can pause, drain, resume and pick up work independently. Check network isolation and credential access as the build user. Leave harmless marker files and a test process, cancel the job, and prove that the next guest starts clean. Repeat after success and failure. Verify the public repository still lists zero runners. A failed readiness probe leaves the runner pending.

### `fleet-verification`: Test each accepted main revision on Fleet

- Wave: 3
- Depends on: fleet-capacity, merge-checks
- Files: `.github/workflows/verify-main.yml`, `scripts/verify-main/**`, `README.md`

**Brief.** This PR lives in the private control repository. Implement a private control task outside the runner distributions. On its privately configured schedule and on operator request it reads the fixed public main branch, validates each revision, and dispatches the private verification workflow from the protected default branch. Keep its narrowly scoped dispatch credential in the private control context. Start from a documented cutover SHA. Persist the last processed first-parent SHA in private controller state; serialize reconciliation, enumerate missed revisions oldest first, and make interrupted runs safely repeatable. Before executing a revision, independently confirm it belongs to protected main and came from a merged, trusted-maintainer-accepted PR with the three successful checks on the exact pre-merge integration revision. Check the tree of the landed revision against that tested tree so squash and merge commit IDs can differ safely. Hold a mismatch for a hosted recheck of the exact landed revision. Hold ambiguous, bypassed or divergent history for operator review. The private controller owns the allowlist, checkpoints and reporting. A job executing public source gets an anonymous public checkout at the validated SHA, a fresh working directory and no controller write token, private checkout, deployment credentials or runner-management capability. Keep control jobs and writable state isolated from test jobs. Keep verified results keyed by SHA and failures visible in the private workflow summary, with bounded, private local trace retention. A failed SHA remains visible across retries. Resolve check provenance from canonical workflow path, event, run attempt and tested SHA. Keep the expected jobs and verification commands in reviewed private control code. Invoke the compilers, test runners and build tools directly, assert test discovery and expected outputs, and reject missing, skipped or duplicate jobs.

**Verification.** Use two successive reviewed PR merges and record the immutable SHA and outcomes for each. Alert the private operator on failure or hold. An independent heartbeat monitor alerts after two missed polls. Record the SHA, owner and recovery action. Repair or revert the cause, acknowledge the held SHA and resume from the last recorded outcome, preserving each failure. Exercise a paused pool, dead poller, failed test, alert delivery and operator catch-up. Verify a fork head or arbitrary revision is refused, overlap causes no skipped revisions, and a main history divergence stops the cursor. Check private job records and keep all public PR checks functional during an outage. Disable the private workflow and drain its runner scope to roll back.

## Final check

Open one ordinary PR and one fork PR, observe three named checks and confirm a failing revision cannot merge. Merge the green ordinary PR, then match the private Fleet result to the landed SHA. Confirm desktop and extension workflows pass with a clean checkout, failure evidence is retrievable privately, and Vercel still owns production deployment. Record the first green public run and private verification in their respective repositories. Fred accepts this plan by merging it. Runtime provisioning and protection changes come during implementation.
