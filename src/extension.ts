import * as vscode from 'vscode';

import { registerRunReview } from './commands/runReview';
import { cleanupAllWorktrees, pruneStaleWorktrees } from './git/worktree';
import { initLogging, log, logError } from './logging';

const STALE_WORKTREE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

export function activate(context: vscode.ExtensionContext): void {
    initLogging(context);
    log('extension: activated');

    context.subscriptions.push(...registerRunReview(context));

    // Best-effort: clean up worktrees abandoned by previous sessions (host
    // crash, reload-without-graceful-deactivate, etc.). Runs in the background
    // so it never blocks command registration.
    // TODO(multi-repo): picks folder[0]. Fine when all roots share a repo (git
    // worktree prune is repo-wide), but if a user opens two unrelated repos as
    // multi-root, the second repo's stale worktree pointers won't be pruned.
    const pruneCwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    void pruneStaleWorktrees(STALE_WORKTREE_MAX_AGE_MS, pruneCwd).catch((err) => {
        logError('startup worktree prune failed', err);
    });
}

export async function deactivate(): Promise<void> {
    log('extension: deactivating, cleaning up worktrees');
    await cleanupAllWorktrees();
}
