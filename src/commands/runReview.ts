import * as path from 'path';

import * as vscode from 'vscode';

import { resolveTarget, type ResolvedTarget, type ResolveInput } from './modes';
import { resolvePrNumber } from './prNode';
import { runAgent } from '../agent/loop';
import { getToolsForScope } from '../agent/tools';
import {
    getMaxAgentIterations,
    getModelSelector,
    getThinkingEffort,
    getToolScope,
} from '../config/settings';
import { listBranches } from '../git/branch';
import { getDiffBetween } from '../git/diff';
import { buildDiffIndex, type DiffIndex } from '../git/diffIndex';
import { partitionFindings, submitReview } from '../github/submitReview';
import { log, logError } from '../logging';
import { loadTemplate } from '../templates';
import {
    type Finding,
    type ReviewDecision,
    type ReviewMode,
    type ReviewResult,
    severityToDecision,
} from '../types';
import { pickFence } from '../util/markdownFence';
import { ReviewPanel } from '../webview/panel';

export function registerRunReview(context: vscode.ExtensionContext): vscode.Disposable[] {
    return [
        registerSimple(context, 'prReview.run', () => ({ mode: 'current-branch' })),
        registerPrCommand(context, 'prReview.reviewPrNoCheckout', 'pr-no-checkout'),
        registerPrCommand(context, 'prReview.reviewPrCheckout', 'pr-checkout'),
        registerPrCommand(context, 'prReview.reviewPrWorktree', 'pr-worktree'),
        vscode.commands.registerCommand('prReview.reviewBranch', () =>
            runReviewBranchFlow(context),
        ),
    ];
}

function registerSimple(
    context: vscode.ExtensionContext,
    commandId: string,
    makeInput: () => ResolveInput,
): vscode.Disposable {
    return vscode.commands.registerCommand(commandId, async () => {
        try {
            await runReview(context, makeInput());
        } catch (err) {
            showErr(err);
        }
    });
}

function registerPrCommand(
    context: vscode.ExtensionContext,
    commandId: string,
    mode: 'pr-no-checkout' | 'pr-checkout' | 'pr-worktree',
): vscode.Disposable {
    return vscode.commands.registerCommand(commandId, async (node?: unknown) => {
        try {
            const prNumber = await resolvePrNumber(node);
            if (prNumber === null) {
                return;
            }
            await runReview(context, { mode, prNumber });
        } catch (err) {
            showErr(err);
        }
    });
}

async function runReviewBranchFlow(context: vscode.ExtensionContext): Promise<void> {
    try {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            throw new Error('Open a workspace folder first.');
        }
        const branch = await pickBranch(folder.uri.fsPath);
        if (!branch) {
            return;
        }
        const mode = await pickBranchMode();
        if (!mode) {
            return;
        }
        await runReview(context, { mode, branch });
    } catch (err) {
        showErr(err);
    }
}

async function pickBranch(cwd: string): Promise<string | undefined> {
    const branches = await listBranches(cwd).catch(() => []);
    if (branches.length === 0) {
        // Fallback: free-form input box.
        const v = await vscode.window.showInputBox({
            prompt: 'Branch name to review',
            placeHolder: 'e.g. feature/foo or origin/feature/foo',
        });
        return v?.trim() || undefined;
    }
    // Sort: local first (non-current), then remote, then current at top.
    const items: vscode.QuickPickItem[] = branches
        .sort((a, b) => {
            if (a.current !== b.current) {
                return a.current ? -1 : 1;
            }
            if (a.remote !== b.remote) {
                return a.remote ? 1 : -1;
            }
            return a.name.localeCompare(b.name);
        })
        .map((b) => ({
            label: b.name,
            description: b.current ? 'current' : b.remote ? 'remote' : 'local',
        }));
    const picked = await vscode.window.showQuickPick(items, {
        title: 'Review another branch',
        placeHolder: 'Pick a branch to review (filter by typing)',
        matchOnDescription: true,
    });
    return picked?.label;
}

async function pickBranchMode(): Promise<
    'branch-no-checkout' | 'branch-checkout' | 'branch-worktree' | undefined
> {
    const items: (vscode.QuickPickItem & { value: ReviewMode })[] = [
        {
            label: 'Review without checkout',
            description: 'Tools read at the branch ref via git (workspace stays as-is)',
            value: 'branch-no-checkout',
        },
        {
            label: 'Checkout & review',
            description: 'git checkout the branch, then review on disk',
            value: 'branch-checkout',
        },
        {
            label: 'Review in worktree',
            description: 'Create a detached worktree, review there, clean up on close',
            value: 'branch-worktree',
        },
    ];
    const picked = await vscode.window.showQuickPick(items, {
        title: 'How should the branch be reviewed?',
        placeHolder: 'Pick a review strategy',
    });
    return picked?.value as
        | 'branch-no-checkout'
        | 'branch-checkout'
        | 'branch-worktree'
        | undefined;
}

function showErr(err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    logError('command error', err);
    vscode.window.showErrorMessage(`PR Review: ${msg}`);
}

async function runReview(context: vscode.ExtensionContext, input: ResolveInput): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        throw new Error('Open a workspace folder first.');
    }

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'PR Review', cancellable: true },
        async (progress, token) => {
            progress.report({ message: 'Resolving target…' });
            const target = await resolveTarget(input, folder, (m) =>
                progress.report({ message: m }),
            );

            // Once we may have side-effects (e.g. worktree created), guarantee cleanup on error.
            try {
                await runReviewCore(context, input.mode, target, progress, token);
            } catch (err) {
                await target.cleanup();
                throw err;
            }
        },
    );
}

async function runReviewCore(
    context: vscode.ExtensionContext,
    mode: ReviewMode,
    target: ResolvedTarget,
    progress: vscode.Progress<{ message?: string }>,
    token: vscode.CancellationToken,
): Promise<void> {
    log(
        `review: start mode=${mode} pr=${target.prNumber ?? '-'} base=${target.baseRef} head=${target.headRef}`,
    );

    progress.report({ message: `Diffing ${target.headRef} against ${target.baseRef}…` });
    const diffResult = await getDiffBetween(target.cwd, target.baseRef, target.headRef);
    log(`review: diff ${diffResult.diff.length}b across ${diffResult.changedFiles.length} files`);

    // Build the per-file/line/side index once. Used at submission time to
    // partition findings into commentable-inline vs body-only.
    const diffIndex: DiffIndex = buildDiffIndex(diffResult.diff);

    progress.report({ message: 'Loading review template…' });
    const template = await loadTemplate(
        context.extensionUri,
        target.workspaceUri,
        diffResult.changedFiles,
    );
    log(`review: template languages=[${template.languages.join(',') || 'generic'}]`);

    progress.report({ message: 'Selecting language model…' });
    const sel = getModelSelector();
    const models = await vscode.lm.selectChatModels({ vendor: sel.vendor, family: sel.family });
    if (models.length === 0) {
        throw new Error(
            `No language model matched vendor="${sel.vendor}" family="${sel.family}". Adjust prReview.model.*`,
        );
    }
    const model = models[0];

    progress.report({ message: 'Running review agent…' });
    const tools = getToolsForScope(getToolScope());
    const userPrompt = buildUserPrompt(
        diffResult.diff,
        diffResult.changedFiles,
        template.languages,
        mode,
    );

    const agentResult = await runAgent({
        systemPrompt: template.systemPrompt,
        userPrompt,
        model,
        tools,
        ctx: {
            // target.cwd is the git root (or worktree root) — all tool path
            // resolution and git invocations route through it. See
            // ResolvedTarget.cwd in commands/modes.ts.
            cwd: target.cwd,
            ref: target.refForTools,
            changedFiles: diffResult.changedFiles,
            cache: new Map<string, string>(),
        },
        maxIterations: getMaxAgentIterations(),
        thinkingEffort: getThinkingEffort(),
        token,
        onProgress: (m) => progress.report({ message: m }),
    });

    const proposedDecision: ReviewDecision = severityToDecision(agentResult.findings);

    const result: ReviewResult = {
        findings: agentResult.findings,
        proposedDecision,
        summary: agentResult.summary,
        prNumber: target.prNumber,
        repo: target.repo ? { owner: target.repo.owner, name: target.repo.name } : null,
        baseBranch: target.baseRef,
        headBranch: target.headBranch,
    };

    const panel = ReviewPanel.create(context.extensionUri, result, {
        // `file` from a finding is git-root-relative; resolve from cwd
        // (= git root) so the editor opens the correct path in monorepos
        // where the workspace folder is a subdirectory of the repo.
        onOpenFile: (file, line) => openFileAt(target.cwd, file, line),
        onCopyMarkdown: (findings, decision, summary) =>
            copyAsMarkdown(findings, decision, summary),
        onSubmit: async (payload) => {
            if (!target.repo || target.prNumber === null || target.headSha === null) {
                return { ok: false, error: 'No open PR for this branch.' };
            }
            try {
                const selected = agentResult.findings.filter((f) =>
                    payload.selectedIds.includes(f.id),
                );
                // Partition: only findings on lines in the diff hunks become
                // inline GitHub comments. The rest are mentioned in the body
                // so reviewers still see them.
                const { inline, outOfHunk } = partitionFindings(selected, diffIndex);
                if (outOfHunk.length > 0) {
                    log(
                        `submit: ${outOfHunk.length}/${selected.length} findings fall outside the diff hunks; sent in body only`,
                    );
                }
                const body = renderReviewBody(agentResult.summary, selected, undefined, outOfHunk);
                const r = await submitReview({
                    owner: target.repo.owner,
                    repo: target.repo.name,
                    prNumber: target.prNumber,
                    headSha: target.headSha,
                    decision: payload.finalDecision,
                    body,
                    findings: inline,
                    diffIndex,
                });
                return { ok: true, url: r.htmlUrl };
            } catch (err) {
                return { ok: false, error: err instanceof Error ? err.message : String(err) };
            }
        },
    });

    // Run cleanup (e.g. worktree removal) when the panel goes away.
    panel.onDispose(() => {
        void target.cleanup();
    });
}

function buildUserPrompt(
    diff: string,
    changedFiles: string[],
    languages: string[],
    mode: ReviewMode,
): string {
    const noCheckoutNote =
        mode === 'pr-no-checkout' || mode === 'branch-no-checkout'
            ? '\nNote: the workspace is NOT checked out to the target branch. All file reads via tools are routed through git at the target ref, so they reflect the branch state.\n'
            : '';
    const fence = pickFence(diff);
    return [
        `Languages detected: ${languages.join(', ') || 'unknown'}`,
        `Changed files:\n${changedFiles.map((f) => `- ${f}`).join('\n')}`,
        noCheckoutNote,
        'Diff:',
        `${fence}diff`,
        diff,
        fence,
        '',
        'Review the diff. Use the available tools to read surrounding context as needed.',
        'When done, call submitFindings with your structured review.',
    ].join('\n');
}

async function openFileAt(gitRoot: string, file: string, line: number): Promise<void> {
    const uri = vscode.Uri.file(path.join(gitRoot, file));
    const doc = await vscode.workspace.openTextDocument(uri);
    const pos = new vscode.Position(Math.max(0, line - 1), 0);
    await vscode.window.showTextDocument(doc, {
        selection: new vscode.Range(pos, pos),
        viewColumn: vscode.ViewColumn.One,
    });
}

async function copyAsMarkdown(
    findings: Finding[],
    decision: ReviewDecision,
    summary: string,
): Promise<void> {
    const md = renderReviewBody(summary, findings, decision);
    await vscode.env.clipboard.writeText(md);
    vscode.window.showInformationMessage('Review copied to clipboard.');
}

export function renderReviewBody(
    summary: string,
    findings: Finding[],
    decision?: ReviewDecision,
    outOfHunk?: Finding[],
): string {
    const counts: Record<string, number> = {};
    for (const f of findings) {
        counts[f.severity] = (counts[f.severity] ?? 0) + 1;
    }
    const countLine =
        Object.entries(counts)
            .map(([s, n]) => `${s}: ${n}`)
            .join(' · ') || 'no findings';
    const header = decision ? `**Decision:** ${decision}\n\n` : '';
    const body = findings
        .map((f) => {
            let fixBlock = '';
            if (f.suggestedFix) {
                // Escalate the fence so a fix containing ``` doesn't close
                // the surrounding block prematurely.
                const fence = pickFence(f.suggestedFix);
                fixBlock = `\n\n${fence}\n${f.suggestedFix}\n${fence}`;
            }
            return `### [${f.severity}] ${f.title} — \`${f.file}:${f.line}\`\n\n${f.body}${fixBlock}`;
        })
        .join('\n\n');
    // GitHub rejects inline comments outside the diff hunks, so any such
    // findings are surfaced as plain prose at the bottom of the review body.
    const outOfHunkSection =
        outOfHunk && outOfHunk.length > 0
            ? `\n\n---\n\n#### Additional findings outside the diff hunks\n\nGitHub doesn't allow inline comments on lines that aren't in the diff. These are recorded here instead:\n\n${outOfHunk
                  .map(
                      (f) =>
                          `- **[${f.severity}] ${f.title}** — \`${f.file}:${f.line}\` — ${f.body}`,
                  )
                  .join('\n')}`
            : '';
    return `${header}${summary}\n\n_${countLine}_\n\n${body}${outOfHunkSection}`.trim();
}
