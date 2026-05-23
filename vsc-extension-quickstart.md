# Developer quickstart

This is the contributor-facing quickstart. End-user docs live in [README.md](./README.md).

## What's in the folder

- **`package.json`** — extension manifest. Declares 5 commands (`prReview.run`, `prReview.reviewBranch`, plus three `prReview.reviewPr*`), the `view/item/context` menu contribution targeting the GitHub PR extension's tree view, and the `prReview.*` configuration schema.
- **`src/extension.ts`** — entry point. Calls `registerRunReview(context)` and pushes the resulting disposables onto `context.subscriptions`. No other side effects.
- **`src/commands/runReview.ts`** — registers all 5 commands and contains `runReviewCore`, the shared review pipeline that every command funnels into.
- **`src/commands/modes.ts`** — `resolveTarget(input, folder, progress)` translates a `ReviewMode` + extra arg (PR number or branch) into a `ResolvedTarget` (`cwd`, `workspaceUri`, `refForTools`, `cleanup`, etc). This is where checkout / worktree / no-checkout side effects happen.
- **`src/agent/loop.ts`** — the `vscode.lm.sendRequest` agentic loop. Terminates when the model calls the `submitFindings` tool (or runs out of iterations).
- **`src/agent/tools/`** — one file per tool. `submitFindings` is the loop terminator; `readFile`/`listDir`/`grep` are ref-aware (read via git when `ctx.ref` is set).
- **`src/git/`** — thin wrappers around `git` subprocess calls.
- **`src/github/`** — Octokit (dynamic ESM import since the extension is CJS), auth, PR lookup, review submission.
- **`src/webview/panel.ts`** — `ReviewPanel` factory + message bridge.
- **`templates/`** — bundled `.md` review templates. **Ships outside `src/`** because `.vscodeignore` excludes `src/**`.
- **`media/`** — webview assets (`main.js`, `main.css`). Same reason as `templates/`.

## Get up and running

1. `npm install`
2. `npm run watch` — TypeScript watch mode in a terminal.
3. Press `F5` to launch the Extension Development Host. (The `.vscode/launch.json` config is wired for this.)
4. In the dev host, open a git repo and run **PR Review: Review current branch** from the command palette.
5. Set breakpoints anywhere under `src/`. Stop and restart via the debug toolbar after edits, or `Ctrl+R` in the dev host to reload.

## Useful scripts

| Command                           | Use                                                                 |
| --------------------------------- | ------------------------------------------------------------------- |
| `npm run compile`                 | One-shot build to `out/`.                                           |
| `npm run typecheck`               | `tsc --noEmit`; runs the same type checks without writing files.    |
| `npm run lint` / `lint:fix`       | ESLint over `src/`.                                                 |
| `npm run format` / `format:check` | Prettier over the whole repo.                                       |
| `npm run test:unit`               | Vitest, fast — runs anything under `src/test/unit/`.                |
| `npm run test:coverage`           | Vitest with v8 coverage.                                            |
| `npm run test:integration`        | Spawns a real VS Code instance via `@vscode/test-electron`. Slower. |

CI (see `.github/workflows/ci.yml`) runs typecheck → lint → format:check → unit tests on every push.

## Testing strategy

Unit tests in `src/test/unit/**/*.test.ts` use Vitest with a `vscode` stub (`src/test/_stubs/vscode.ts`) so they can run outside the extension host. Anything that touches `vscode.lm` or the Octokit network layer should be injected/mocked at the call site — see `submitFindings.test.ts` for the pattern.

Integration tests live in `src/test/integration/` and run inside a real VS Code instance via `@vscode/test-electron`. Keep these to the bare minimum (activation smoke test, command registration) — they're slow and flaky compared to unit tests.

When adding a new agent tool: write a unit test against `tool.invoke(...)` with a fake `ToolContext`. The agent loop itself can be tested by passing a stub `LanguageModelChat` whose `sendRequest` yields a predetermined stream of `LanguageModelTextPart` / `LanguageModelToolCallPart`.

## Code conventions

- **Prettier and ESLint must both be clean** before merge. Run `npm run format && npm run lint:fix` before opening a PR. `npm run format:check` runs in CI.
- **Imports** follow ESLint's `import/order` rule: external first, then sibling, then parent. Run `npm run lint:fix` to auto-sort.
- **No new top-level dependencies** without thought — every package adds to extension load time. Existing footprint: `@octokit/rest` only.
- **Tool output is clamped** to 64 KB (`MAX_TOOL_OUTPUT_BYTES` in `src/agent/tools/types.ts`). New tools should pass results through `clampOutput()`.

## Adding a new tool

1. Create `src/agent/tools/<name>.ts`. Export an `AgentTool` with `spec` (LM-facing JSON schema) and `invoke(input, ctx, token) => Promise<string>`.
2. Add it to the appropriate scope in `src/agent/tools/index.ts` (`getToolsForScope`).
3. Write a unit test that calls `invoke` with a fabricated `ToolContext`.
4. If the tool has side effects (writes, network, shell), gate it behind `shell-with-confirm` scope and route through `vscode.window.showWarningMessage({ modal: true }, ...)`.

## Adding a new review mode

1. Extend `ReviewMode` in `src/types.ts` and the `ResolveInput` discriminated union in `src/commands/modes.ts`.
2. Add a `case` to the `switch` in `resolveTarget` and a private resolver function.
3. Register a command in `src/commands/runReview.ts`. Wire it into the palette / menus via `package.json`'s `contributes.menus`.
4. If the mode has side effects (worktree, checkout), return a real `cleanup` function from the resolver. It's invoked on review-panel disposal **and** on pipeline errors after the resolver returns.

## Customizing review templates

Bundled `.md` files in `templates/` are loaded via `loadTemplate(extensionUri, workspaceUri, changedFiles)` in `src/templates/index.ts`. The file's full content becomes the agent's system prompt, with a stock "call `submitFindings` to finish" instruction appended.

Users can append their own instructions per language via the `prReview.extraInstructions` setting — those are read from the workspace and concatenated after the bundled template.

## VS Code Language Model API

See `node_modules/@types/vscode/index.d.ts`. Search for `LanguageModelChat`, `LanguageModelChatRequestOptions`, `LanguageModelToolCallPart`, `LanguageModelToolResultPart`.

The agent loop's pattern (in `src/agent/loop.ts`) is canonical: build messages, send a request with `options.tools`, iterate the stream collecting `LanguageModelToolCallPart`s, append an Assistant message containing the tool calls + a User message containing the tool results, then send the next request. Loop until the model emits no tool calls (or hits `maxAgentIterations`).

## Publishing

```bash
npm run vscode:prepublish   # invokes compile
npx vsce package            # produces a .vsix
npx vsce publish            # requires a marketplace PAT
```

The `.vscodeignore` already excludes `src/`, `out/*.map`, test files, and config. `templates/` and `media/` ship because they live outside `src/` and have no matching exclude.
