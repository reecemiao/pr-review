# Changelog

All notable changes to the PR Review extension are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once a `1.0.0` ships.

## [Unreleased]

### Changed

- Agent loop now preserves the model's prose alongside its tool calls in the assistant turn (previously dropped). Mid-loop reasoning stays in history so subsequent iterations don't repeat work or lose track of intent.
- Tool calls emitted in the same model response now run in parallel via `Promise.all` instead of sequentially. The result order returned to the model still matches the order the model emitted the calls; per-call logging and cancellation behavior unchanged.

### Added

- System prompts now include a "How to use tools efficiently" block explaining that one model response — even one with many parallel tool calls — counts as a single iteration. Nudges the model to batch independent reads instead of serializing them across iterations.
- Unit tests for the agent loop (`src/test/unit/agent/loop.test.ts`) covering termination on `submitFindings`, assistant-prose preservation, parallel tool execution, result-order preservation, `maxIterations` enforcement, graceful exit on bare text, and unknown-tool error recovery.

### Internal

- README development section refreshed for the bundled build: new `bundle` / `bundle:prod` / `watch:bundle` / `verify` scripts documented, project layout includes `dist/`, `esbuild.mjs`, and the test directory tree, and a new subsection describes how the agent loop spends its iteration budget.

## [0.1.2] - 2026-05-24

### Changed

- Extension now ships as a single bundled `dist/extension.js` (esbuild, ~132 KB) instead of 280 unbundled files. Cuts VSIX size and first-activation cost. `main` moved from `./out/extension.js` to `./dist/extension.js`; `out/` still produced by `tsc` for integration tests and is excluded from the VSIX.

### Internal

- Bumped CI `actions/checkout`, `actions/setup-node`, and `actions/upload-artifact` from `@v4` to `@v5` ahead of the Node 20 runtime deprecation (2026-06-02).
- Added `npm run bundle` / `bundle:prod` / `watch:bundle` scripts and a `watch` compound task that runs `tsc -watch` and esbuild in watch concurrently for F5 debugging.

## [0.1.1] - 2026-05-24

### Added

- Extension icon (`media/icon.png`) and richer marketplace metadata: `keywords` for discoverability, `categories` now `AI` / `SCM Providers` / `Linters` instead of bare `Other`.
- "PR Review" Output Channel. Iteration counts, tool names, durations, and errors log unconditionally. Set `prReview.debugLog: true` to also log full prompts, tool inputs, and tool results.

### Security

- Reject git refs starting with `-` before passing them to `git show` / `git ls-tree` / `git grep`. Prevents an adversarial model tool call from being interpreted as a git option (`--upload-pack=…`, `-c …`, etc.).

### Fixed

- Worktrees created in `pr-worktree` / `branch-worktree` modes are now swept on extension `deactivate()`, and the temp root is pruned of entries older than 24h on activation. Previously, a host crash or reload between worktree creation and panel disposal would leak directories in `os.tmpdir()`.
- The diff is now wrapped in a backtick fence longer than any run of backticks it contains. Diffs that touch markdown files with their own ` ``` ` fences no longer prematurely close the surrounding code block in the model prompt.
- Inline GitHub review comments are filtered against the diff before submission: findings whose `file:line` isn't part of any hunk are now rendered into the review body instead of triggering a 422 from `pulls.createReview`. The comment's `side` is inferred from the hunk (added/context → RIGHT, deleted → LEFT) so deletion-line comments no longer get rejected either.

### Changed

- Linter tool (`runLinter`) now scopes its invocation to changed files matching the linter's languages (e.g. `eslint src/foo.ts src/bar.tsx` instead of `eslint .`). 10–100× faster on large repos. Falls back to whole-repo when no changed file applies.
- `readFile` and `gitShow` tool calls share a per-review cache, so the agent doesn't re-fetch the same file across iterations.
- Severity badges in the review webview now inherit theme-aware colors from VS Code (`inputValidation-*`, `statusBarItem-*`, `badge-*` palettes) instead of hardcoded hex. Improves contrast in light and high-contrast themes; the hex fallbacks preserve the previous look when a theme omits the variable.

### Internal

- Removed redundant `activationEvents`; command-triggered activation is implicit since `engines.vscode >= 1.74`.

## [0.1.0] - 2026-05-23

### Added

- Agentic review pipeline driven by `vscode.lm.sendRequest` with a tool-calling loop. The model terminates the loop by calling `submitFindings` with structured findings.
- Five entry points:
    - `PR Review: Review current branch` — palette; diffs against `prReview.baseBranch`.
    - `PR Review: Review another branch…` — palette; QuickPick of local + remote-tracking branches → QuickPick of review strategy.
    - `Review PR (without checkout)` — right-click on a PR in the GitHub Pull Requests tree. Tools route reads through `git show` / `git ls-tree` / `git grep` at the PR's ref; working tree untouched.
    - `Checkout & Review PR` — right-click; refuses on dirty working tree.
    - `Review PR in worktree` — right-click; detached worktree under `os.tmpdir()`, removed on panel disposal.
- Bundled review templates for Python and TypeScript, plus a language-agnostic fallback. Picked by changed-file extensions.
- `prReview.extraInstructions` setting — append workspace-local `.md` instructions per language.
- Webview panel with per-finding checkboxes, severity badges, file-link navigation, decision dropdown (auto-derived from severities but overridable), Submit and Copy-as-markdown actions.
- GitHub review submission via Octokit, including GitHub Enterprise support (`prReview.githubEnterprise.baseUrl`, `github-enterprise` auth provider).
- `prReview.thinkingEffort` setting (`minimal` / `low` / `medium` / `high`) passed via `modelOptions.reasoning_effort` for reasoning-capable models.
- Configurable tool scope: `read-only` (default), `read-only-with-linters` (allowlisted ruff/mypy/bandit/eslint), `shell-with-confirm` (modal Approve/Deny per command).

### Internal

- ESLint + Prettier + GitHub Actions CI (typecheck → lint → format:check → unit tests).
- Vitest unit tests under `src/test/unit/` with a `vscode` stub for tests that don't need the real extension host.
- `@vscode/test-electron` integration tests under `src/test/integration/`.
