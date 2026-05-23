# Changelog

All notable changes to the PR Review extension are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once a `1.0.0` ships.

## [Unreleased]

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
