# PR Review

Agentic GitHub pull request review inside VS Code, powered by GitHub Copilot's language models via the [Language Model API](https://code.visualstudio.com/api/extension-guides/language-model). The extension runs a tool-using review agent against your diff, shows results in a webview with per-comment checkboxes, and (optionally) submits the selected comments back to GitHub as a real PR review.

Works against github.com and GitHub Enterprise.

## Features

### Five entry points

| Command                             | Where                                                                                                                                         | What it does                                                                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PR Review: Review current branch`  | Command palette                                                                                                                               | Diffs the current branch against `prReview.baseBranch` and reviews it.                                                                                            |
| `PR Review: Review another branch…` | Command palette                                                                                                                               | Pick any local or remote-tracking branch, then pick a review strategy (see below). Diffs against `prReview.baseBranch`.                                           |
| `Review PR (without checkout)`      | Right-click on a PR in the [GitHub Pull Requests](https://marketplace.visualstudio.com/items?itemName=GitHub.vscode-pull-request-github) tree | Fetches the PR's head, runs the agent with file-reading tools routed through `git show`/`git ls-tree`/`git grep` at the PR's ref. Your working tree is untouched. |
| `Checkout & Review PR`              | Right-click on a PR                                                                                                                           | `git checkout` the PR head (refuses if the working tree is dirty), then review on disk.                                                                           |
| `Review PR in worktree`             | Right-click on a PR                                                                                                                           | `git worktree add --detach` to a temp dir, run the agent there, and clean up when the review panel closes.                                                        |

### Diff base

- **Palette commands** (current branch / another branch) diff against the configured `prReview.baseBranch` (default `origin/master`).
- **PR right-click commands** diff against the PR's actual base branch as reported by the GitHub API.

### Review workflow

1. The agent receives a language-specific review template (see [Templates](#templates)) as its system prompt, plus the diff and changed-file list.
2. It explores the codebase using a limited tool set — `readFile`, `listDir`, `grep`, `gitShow` — and optionally linters / shell commands if you raise `prReview.toolScope`.
3. When finished, it calls a `submitFindings` tool with structured findings (`severity`, `title`, `body`, `file`, `line`, optional `suggestedFix`). That call terminates the agent loop.
4. The findings open in a webview. Each is checkboxed; you pick which to send. The proposed decision (`APPROVE` / `COMMENT` / `REQUEST_CHANGES`) is derived from severity but you can override it in a dropdown before submitting.
5. **Submit** posts a GitHub PR review via the REST API. **Copy as markdown** drops the same content on the clipboard for use elsewhere — useful when there's no open PR yet.

If the current branch has no open PR (or you're using one of the "review without an associated PR" paths), Submit is disabled with a hint; the rest of the panel works for local self-review.

## Requirements

- **VS Code** with [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat) installed and signed in (provides the `copilot` vendor for `vscode.lm.selectChatModels`).
- **git** on `PATH` — the extension shells out for diff, fetch, worktree, and ref-aware reads.
- **GitHub auth** — uses VS Code's built-in `github` (or `github-enterprise`) authentication provider. You'll be prompted on first submit; the extension requests the `repo` scope.
- **Optional**: The [GitHub Pull Requests](https://marketplace.visualstudio.com/items?itemName=GitHub.vscode-pull-request-github) extension if you want the three right-click commands. Without it, you can still use the two palette commands.

## Settings

All settings live under the `prReview.*` prefix.

| Setting                             | Type   | Default         | Description                                                                                                                                                                                  |
| ----------------------------------- | ------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prReview.baseBranch`               | string | `origin/master` | Base branch for the two palette commands. Right-click commands ignore this and use the PR's own base.                                                                                        |
| `prReview.model.vendor`             | string | `copilot`       | Passed to `vscode.lm.selectChatModels({ vendor })`.                                                                                                                                          |
| `prReview.model.family`             | string | `gpt-5-mini`    | Model family. Anything Copilot exposes — `gpt-4o`, `gpt-5-mini`, `claude-sonnet-4`, etc.                                                                                                     |
| `prReview.toolScope`                | enum   | `read-only`     | `read-only` / `read-only-with-linters` / `shell-with-confirm`. See below.                                                                                                                    |
| `prReview.extraInstructions`        | object | `{}`            | Map of language → workspace-relative path to extra `.md` instructions appended to the bundled template. Example: `{ "python": "./.review/team-python.md" }`.                                 |
| `prReview.githubEnterprise.baseUrl` | string | `""`            | GitHub Enterprise API base URL, e.g. `https://github.example.com/api/v3`. Empty for github.com.                                                                                              |
| `prReview.maxAgentIterations`       | number | `20`            | Safety cap on agent LM iterations per review. One iteration = one model request (with any number of tool calls).                                                                             |
| `prReview.thinkingEffort`           | enum   | `medium`        | `minimal` / `low` / `medium` / `high`. Passed via `modelOptions.reasoning_effort`. Applies to reasoning models (gpt-5-mini, o-series); ignored elsewhere.                                    |
| `prReview.debugLog`                 | bool   | `false`         | Verbose logging in the PR Review Output Channel: full prompts, tool inputs, and tool results. Off by default; the channel still records iteration counts, tool calls, durations, and errors. |

### Tool scopes

- **`read-only`** _(default)_: `readFile`, `listDir`, `grep`, `gitShow`. No side effects. In `*-no-checkout` modes these reads are routed through git so the agent sees the target branch's state even though your workspace is on a different branch.
- **`read-only-with-linters`**: above plus `runLinter` with a fixed allowlist (`ruff`, `mypy`, `bandit`, `eslint`). Each invocation runs the linter against the workspace; the agent can choose to run any of them.
- **`shell-with-confirm`**: above plus `runShell`. Each shell call prompts you with a modal Approve/Deny dialog before running.

## Templates

Bundled in `templates/`:

- `python-reviewer.md` — PEP 8, type hints, Pythonic patterns, security (SQL/command injection, eval/exec, weak crypto), framework checks (Django / FastAPI / Flask). Triggered by `.py` and `.pyi` (stub) files.
- `typescript-reviewer.md` — type safety, async correctness, XSS / prototype pollution, idioms. Triggered by `.ts` / `.tsx` / `.js` / `.jsx` / `.mjs` / `.cjs`.
- `generic-reviewer.md` — language-agnostic fallback.

The template loader picks one (or more) based on extensions of the changed files. If `prReview.extraInstructions[lang]` is set, the contents of that file are appended after the bundled template. Both layers are prepended to the agent's system prompt.

To customize: either edit the bundled `.md` (rebuild required) or add an `extraInstructions` entry pointing at a file in your repo.

## How review-without-checkout works

In `pr-no-checkout` and `branch-no-checkout` modes, the workspace stays on whatever branch you have open. The agent's file-reading tools detect the active `ref` in their `ToolContext` and route through git plumbing:

- `readFile` → `git show <ref>:<path>`
- `listDir` → `git ls-tree <ref> <path>`
- `grep` → `git grep <pattern> <ref>`

This is the safe way to review a PR from the right-click menu without disturbing your working tree, and the model still sees the PR's actual file contents — not yours.

## Known limitations

- The GitHub PR extension's tree-node shape isn't public API. PR-number extraction probes `pullRequestModel.number`, `pullRequest.number`, `item.number`, `prNumber`, `number`. If none match, an `InputBox` asks you for the PR number — the right-click flow still works, just with one extra dialog.
- In worktree mode, "open file at line" opens the file from the temp worktree directory rather than the workspace folder — line numbers align with the review, but the editor opens outside the workspace tree so workspace-scoped features (project-wide find, file explorer focus) won't include it.
- `branch-checkout` on a remote ref like `origin/foo` may detach HEAD (depending on your git version); the review itself still works. Use a local branch name to avoid this.
- The `grep` tool searches tracked files via `git grep` (the workspace must be a git repo). Untracked files are not searched; use `readFile` for those.
- Agent loops are bounded by `prReview.maxAgentIterations`. If you see "Agent did not terminate within N iterations," raise it or check the Copilot logs.

## Development

```bash
npm install
npm run watch        # tsc -watch + esbuild --watch run in parallel
# F5 in VS Code to launch the Extension Development Host (loads ./dist/extension.js)
```

The shipped extension is a single bundled file (`dist/extension.js`, esbuild, ~132 KB) — the VSIX contains ~11 files instead of the unbundled ~280. `tsc` still emits `out/` for integration tests; `dist/` is what `main` in `package.json` points at and what VS Code actually loads.

Scripts:

| Script                            | Purpose                                                                  |
| --------------------------------- | ------------------------------------------------------------------------ |
| `npm run bundle`                  | esbuild → `dist/extension.js` (sourcemap, not minified).                 |
| `npm run bundle:prod`             | esbuild production build (minified, no sourcemap). Used by VSIX package. |
| `npm run watch:bundle`            | esbuild watch mode.                                                      |
| `npm run compile`                 | tsc → `out/` (for integration tests; not shipped).                       |
| `npm run watch`                   | Compound: `tsc -watch` + `esbuild --watch` in parallel.                  |
| `npm run typecheck`               | `tsc --noEmit`.                                                          |
| `npm run lint` / `lint:fix`       | ESLint.                                                                  |
| `npm run format` / `format:check` | Prettier.                                                                |
| `npm run test:unit`               | Vitest unit tests (`src/test/unit/`).                                    |
| `npm run test:coverage`           | Vitest with coverage.                                                    |
| `npm run test:integration`        | VS Code extension tests via `@vscode/test-electron`.                     |
| `npm run verify`                  | All of: typecheck + lint + format:check + unit tests + compile + bundle. |

Project layout:

```
src/
  extension.ts            # activate() registers commands
  types.ts                # Finding, ReviewDecision, ReviewMode, etc.
  config/settings.ts      # typed wrappers over workspace config
  git/                    # exec, branch, diff, fetch, worktree, refRead
  templates/index.ts      # language detection + template loader
  agent/
    loop.ts               # vscode.lm sendRequest loop (parallel tool execution)
    tools/                # readFile, listDir, grep, gitShow, linters, shell, submitFindings
  github/                 # auth, client (Octokit dynamic import), findPr, submitReview
  commands/
    runReview.ts          # registers all 5 commands; shared review pipeline
    modes.ts              # resolveTarget(): mode → cwd, workspace, refs, cleanup
    prNode.ts             # PR-number extraction from tree node + fallback prompt
  webview/
    panel.ts              # ReviewPanel; postMessage bridge
    types.ts              # ToWebview / FromWebview message types
  test/
    unit/                 # vitest; `vscode` is aliased to the stub in `_stubs/`
    integration/          # @vscode/test-electron suite
    _stubs/vscode.ts      # minimal vscode API stub for unit tests
templates/                # bundled .md system prompts (ships outside src/)
media/                    # webview UI assets (HTML, CSS, JS) — also ships outside src/
esbuild.mjs               # bundler entry; reads --production / --watch flags
```

### How the agent loop spends its iterations

The agent runs at most `prReview.maxAgentIterations` model round-trips per review (one `sendRequest` = one iteration, regardless of how many tool calls are in the response). To get the most out of that budget:

- Tool calls emitted in the same response run **in parallel** via `Promise.all`. Result order is preserved by `callId` so the model sees them in the order it asked for, regardless of finish order.
- The model's prose between tool calls is preserved in the assistant turn — mid-loop reasoning stays in history so the next iteration doesn't lose context.
- The system prompt explicitly asks the model to batch independent reads in a single response rather than serialize them across iterations.
- `readFile` and `gitShow` results are cached per-review, so re-requesting the same path is a no-op.

## License

See [LICENSE](./LICENSE).
