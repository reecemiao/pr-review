import * as vscode from 'vscode';

import { runAgent } from '../agent/loop';
import { getToolsForScope } from '../agent/tools';
import {
    getBaseBranch,
    getMaxAgentIterations,
    getModelSelector,
    getToolScope,
} from '../config/settings';
import { getCurrentBranch, getOriginRepoSlug } from '../git/branch';
import { getDiffAgainstBase } from '../git/diff';
import { findOpenPr } from '../github/findPr';
import { submitReview } from '../github/submitReview';
import { loadTemplate } from '../templates';
import { type Finding, type ReviewDecision, type ReviewResult, severityToDecision } from '../types';
import { ReviewPanel } from '../webview/panel';

export function registerRunReview(context: vscode.ExtensionContext): vscode.Disposable[] {
    const run = vscode.commands.registerCommand('prReview.run', async () => {
        try {
            await runReview(context);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`PR Review: ${msg}`);
        }
    });

    const runFromPr = vscode.commands.registerCommand(
        'prReview.runFromPrList',
        async (node: unknown) => {
            // TODO: inspect `node` from GitHub PR extension tree to checkout target branch first.
            // For now, defer to the main command.
            void node;
            await vscode.commands.executeCommand('prReview.run');
        },
    );

    return [run, runFromPr];
}

async function runReview(context: vscode.ExtensionContext): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        throw new Error('Open a workspace folder first.');
    }
    const cwd = folder.uri.fsPath;
    const baseBranch = getBaseBranch();

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'PR Review', cancellable: true },
        async (progress, token) => {
            progress.report({ message: 'Resolving branch…' });
            const headBranch = await getCurrentBranch(cwd);
            const repo = await getOriginRepoSlug(cwd);

            progress.report({ message: `Diffing ${headBranch} against ${baseBranch}…` });
            const diffResult = await getDiffAgainstBase(cwd, baseBranch);

            progress.report({ message: 'Loading review template…' });
            const template = await loadTemplate(
                context.extensionUri,
                folder.uri,
                diffResult.changedFiles,
            );

            progress.report({ message: 'Selecting language model…' });
            const sel = getModelSelector();
            const models = await vscode.lm.selectChatModels({
                vendor: sel.vendor,
                family: sel.family,
            });
            if (models.length === 0) {
                throw new Error(
                    `No language model matched vendor="${sel.vendor}" family="${sel.family}". Adjust prReview.model.*`,
                );
            }
            const model = models[0];

            progress.report({ message: 'Looking up PR…' });
            const pr = repo
                ? await findOpenPr(repo.owner, repo.name, headBranch).catch(() => null)
                : null;

            progress.report({ message: 'Running review agent…' });
            const tools = getToolsForScope(getToolScope());
            const userPrompt = buildUserPrompt(
                diffResult.diff,
                diffResult.changedFiles,
                template.languages,
            );

            const agentResult = await runAgent({
                systemPrompt: template.systemPrompt,
                userPrompt,
                model,
                tools,
                ctx: { workspace: folder.uri, cwd },
                maxIterations: getMaxAgentIterations(),
                token,
                onProgress: (m) => progress.report({ message: m }),
            });

            const proposedDecision: ReviewDecision = severityToDecision(agentResult.findings);

            const result: ReviewResult = {
                findings: agentResult.findings,
                proposedDecision,
                summary: agentResult.summary,
                prNumber: pr?.number ?? null,
                repo: repo ? { owner: repo.owner, name: repo.name } : null,
                baseBranch,
                headBranch,
            };

            ReviewPanel.create(context.extensionUri, result, {
                onOpenFile: (file, line) => openFileAt(folder.uri, file, line),
                onCopyMarkdown: (findings, decision, summary) =>
                    copyAsMarkdown(findings, decision, summary),
                onSubmit: async (payload) => {
                    if (!repo || !pr) {
                        return { ok: false, error: 'No open PR for this branch.' };
                    }
                    try {
                        const selected = agentResult.findings.filter((f) =>
                            payload.selectedIds.includes(f.id),
                        );
                        const body = renderReviewBody(agentResult.summary, selected);
                        const r = await submitReview({
                            owner: repo.owner,
                            repo: repo.name,
                            prNumber: pr.number,
                            headSha: pr.headSha,
                            decision: payload.finalDecision,
                            body,
                            findings: selected,
                        });
                        return { ok: true, url: r.htmlUrl };
                    } catch (err) {
                        return {
                            ok: false,
                            error: err instanceof Error ? err.message : String(err),
                        };
                    }
                },
            });
        },
    );
}

function buildUserPrompt(diff: string, changedFiles: string[], languages: string[]): string {
    return [
        `Languages detected: ${languages.join(', ') || 'unknown'}`,
        `Changed files:\n${changedFiles.map((f) => `- ${f}`).join('\n')}`,
        '',
        'Diff:',
        '```diff',
        diff,
        '```',
        '',
        'Review the diff. Use the available tools to read surrounding context as needed.',
        'When done, call submitFindings with your structured review.',
    ].join('\n');
}

async function openFileAt(workspace: vscode.Uri, file: string, line: number): Promise<void> {
    const uri = vscode.Uri.joinPath(workspace, file);
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

function renderReviewBody(summary: string, findings: Finding[], decision?: ReviewDecision): string {
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
        .map(
            (f) =>
                `### [${f.severity}] ${f.title} — \`${f.file}:${f.line}\`\n\n${f.body}${
                    f.suggestedFix ? `\n\n\`\`\`\n${f.suggestedFix}\n\`\`\`` : ''
                }`,
        )
        .join('\n\n');
    return `${header}${summary}\n\n_${countLine}_\n\n${body}`.trim();
}
