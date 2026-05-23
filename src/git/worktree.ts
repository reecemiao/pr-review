import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { git } from './exec';

export interface Worktree {
    path: string;
    cleanup(): Promise<void>;
}

const WORKTREE_ROOT = path.join(os.tmpdir(), 'pr-review-worktrees');

/** Worktrees created in this process that haven't been cleaned up yet. */
const active = new Set<Worktree>();

/**
 * Create a detached worktree pointing at `ref` under the OS temp dir.
 * Caller must invoke `cleanup()` to remove it (idempotent; safe to call multiple times).
 * The returned worktree is tracked in a process-local registry so `cleanupAllWorktrees`
 * can sweep it on extension deactivation.
 */
export async function addWorktree(cwd: string, ref: string, label: string): Promise<Worktree> {
    const wtPath = path.join(
        WORKTREE_ROOT,
        `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    );
    await git(['worktree', 'add', '--detach', wtPath, ref], { cwd });
    let removed = false;
    const wt: Worktree = {
        path: wtPath,
        async cleanup() {
            if (removed) {
                return;
            }
            removed = true;
            active.delete(wt);
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
    active.add(wt);
    return wt;
}

/**
 * Clean up every worktree this process created. Called from `deactivate()`.
 * Failures are swallowed — VS Code gives `deactivate()` a finite budget.
 */
export async function cleanupAllWorktrees(): Promise<void> {
    const all = [...active];
    active.clear();
    await Promise.allSettled(all.map((w) => w.cleanup()));
}

/**
 * Sweep the worktree root for entries older than `maxAgeMs` and remove them.
 * Used at activation to recover space leaked by previous crashes or reloads
 * (the panel-disposal cleanup hook can't run if the host went away).
 *
 * If `pruneCwd` is provided, also runs `git worktree prune` there to clear any
 * dangling administrative pointers in that repo's .git/worktrees.
 */
export async function pruneStaleWorktrees(maxAgeMs: number, pruneCwd?: string): Promise<void> {
    let entries: string[];
    try {
        entries = await fs.readdir(WORKTREE_ROOT);
    } catch {
        return; // root doesn't exist yet — nothing to prune
    }

    const cutoff = Date.now() - maxAgeMs;
    await Promise.allSettled(
        entries.map(async (name) => {
            const p = path.join(WORKTREE_ROOT, name);
            try {
                const st = await fs.stat(p);
                if (st.mtimeMs < cutoff) {
                    await fs.rm(p, { recursive: true, force: true });
                }
            } catch {
                // best-effort; permission errors, races, etc.
            }
        }),
    );

    if (pruneCwd) {
        try {
            await git(['worktree', 'prune'], { cwd: pruneCwd });
        } catch {
            // best-effort
        }
    }
}
