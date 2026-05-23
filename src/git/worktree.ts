import * as os from 'os';
import * as path from 'path';

import { git } from './exec';

export interface Worktree {
    path: string;
    cleanup(): Promise<void>;
}

/**
 * Create a detached worktree pointing at `ref` under the OS temp dir.
 * Caller must invoke `cleanup()` to remove it (idempotent; safe to call multiple times).
 */
export async function addWorktree(cwd: string, ref: string, label: string): Promise<Worktree> {
    const wtPath = path.join(
        os.tmpdir(),
        'pr-review-worktrees',
        `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    );
    await git(['worktree', 'add', '--detach', wtPath, ref], { cwd });
    let removed = false;
    return {
        path: wtPath,
        async cleanup() {
            if (removed) {
                return;
            }
            removed = true;
            try {
                await git(['worktree', 'remove', '--force', wtPath], { cwd });
            } catch {
                // Best-effort. If git can't remove (e.g. user deleted the path), prune it.
                try {
                    await git(['worktree', 'prune'], { cwd });
                } catch {
                    // give up silently
                }
            }
        },
    };
}
