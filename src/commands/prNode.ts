import * as vscode from 'vscode';

/**
 * Best-effort extraction of a PR number from the tree-view node passed by the
 * GitHub Pull Requests extension to a context-menu command.
 *
 * The node shape is not public API — these property paths are derived from
 * the extension's source. If none match we return null and the caller can
 * prompt the user.
 */
export function extractPrNumber(node: unknown): number | null {
    if (!node || typeof node !== 'object') {
        return null;
    }
    const n = node as Record<string, unknown>;
    const candidates: unknown[] = [
        (n.pullRequestModel as { number?: unknown } | undefined)?.number,
        (n.pullRequest as { number?: unknown } | undefined)?.number,
        (n.item as { number?: unknown } | undefined)?.number,
        n.prNumber,
        n.number,
    ];
    for (const c of candidates) {
        if (typeof c === 'number' && Number.isFinite(c)) {
            return c;
        }
    }
    return null;
}

export async function resolvePrNumber(node: unknown): Promise<number | null> {
    const fromNode = extractPrNumber(node);
    if (fromNode !== null) {
        return fromNode;
    }
    const v = await vscode.window.showInputBox({
        prompt: 'Pull request number',
        validateInput: (s) => (/^\d+$/.test(s.trim()) ? null : 'enter a positive integer'),
    });
    return v ? parseInt(v.trim(), 10) : null;
}
