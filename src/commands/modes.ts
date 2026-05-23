import * as vscode from 'vscode';

import { getBaseBranch } from '../config/settings';
import { getCurrentBranch, getOriginRepoSlug, type RepoSlug } from '../git/branch';
import { checkoutRef, fetchPrHead, resolveRefToSha, workingTreeIsClean } from '../git/fetch';
import { addWorktree, type Worktree } from '../git/worktree';
import { findOpenPr, getPrDetails } from '../github/findPr';
import { type ReviewMode } from '../types';

/**
 * Everything mode-specific that the shared review pipeline needs.
 *
 *  - `cwd` is where git subprocess commands run.
 *  - `workspaceUri` is what tools use to read paths (FS-mode tools).
 *  - `refForTools` is set in `pr-no-checkout` / `branch-no-checkout`: tools read
 *    at this ref via git plumbing instead of the working tree, so the model
 *    sees the target state even though the workspace is on a different branch.
 *  - `baseRef` and `headRef` drive the diff.
 *  - `cleanup` is called when the review panel is disposed (worktree teardown).
 */
export interface ResolvedTarget {
    cwd: string;
    workspaceUri: vscode.Uri;
    repo: RepoSlug | null;
    prNumber: number | null;
    headBranch: string;
    headSha: string | null;
    baseRef: string;
    headRef: string;
    refForTools: string | undefined;
    cleanup: () => Promise<void>;
}

/**
 * Discriminated input to `resolveTarget` — the mode also implies which extra
 * argument is required (PR number vs. branch name).
 */
export type ResolveInput =
    | { mode: 'current-branch' }
    | { mode: 'pr-no-checkout' | 'pr-checkout' | 'pr-worktree'; prNumber: number }
    | { mode: 'branch-no-checkout' | 'branch-checkout' | 'branch-worktree'; branch: string };

const noop = async (): Promise<void> => {};

export async function resolveTarget(
    input: ResolveInput,
    folder: vscode.WorkspaceFolder,
    progress: (msg: string) => void,
): Promise<ResolvedTarget> {
    const cwd = folder.uri.fsPath;
    const repo = await getOriginRepoSlug(cwd);

    switch (input.mode) {
        case 'current-branch':
            return resolveCurrentBranch(cwd, folder, repo);
        case 'pr-no-checkout':
        case 'pr-checkout':
        case 'pr-worktree':
            return resolvePrMode(input.mode, cwd, folder, repo, input.prNumber, progress);
        case 'branch-no-checkout':
        case 'branch-checkout':
        case 'branch-worktree':
            return resolveBranchMode(input.mode, cwd, folder, repo, input.branch, progress);
    }
}

// --- current-branch ----------------------------------------------------------

async function resolveCurrentBranch(
    cwd: string,
    folder: vscode.WorkspaceFolder,
    repo: RepoSlug | null,
): Promise<ResolvedTarget> {
    const headBranch = await getCurrentBranch(cwd);
    const baseRef = getBaseBranch();
    const pr =
        repo && headBranch
            ? await findOpenPr(repo.owner, repo.name, headBranch).catch(() => null)
            : null;
    return {
        cwd,
        workspaceUri: folder.uri,
        repo,
        prNumber: pr?.number ?? null,
        headBranch,
        headSha: pr?.headSha ?? null,
        baseRef,
        headRef: 'HEAD',
        refForTools: undefined,
        cleanup: noop,
    };
}

// --- pr-* (right-click) ------------------------------------------------------

async function resolvePrMode(
    mode: 'pr-no-checkout' | 'pr-checkout' | 'pr-worktree',
    cwd: string,
    folder: vscode.WorkspaceFolder,
    repo: RepoSlug | null,
    prNumber: number,
    progress: (msg: string) => void,
): Promise<ResolvedTarget> {
    if (!repo) {
        throw new Error('Could not determine GitHub remote (origin).');
    }
    progress(`Fetching PR #${prNumber}…`);
    const details = await getPrDetails(repo.owner, repo.name, prNumber);
    const localRef = await fetchPrHead(cwd, 'origin', prNumber);
    const headSha = await resolveRefToSha(cwd, localRef);
    // PR modes always diff against the PR's actual base branch (not the user's setting).
    const baseRef = `origin/${details.baseBranch}`;

    if (mode === 'pr-no-checkout') {
        return {
            cwd,
            workspaceUri: folder.uri,
            repo,
            prNumber,
            headBranch: details.headBranch,
            headSha,
            baseRef,
            headRef: headSha,
            refForTools: headSha,
            cleanup: noop,
        };
    }
    if (mode === 'pr-checkout') {
        await assertCleanTree(cwd, 'Checkout & Review');
        progress(`Checking out PR #${prNumber}…`);
        await checkoutRef(cwd, localRef);
        return {
            cwd,
            workspaceUri: folder.uri,
            repo,
            prNumber,
            headBranch: details.headBranch,
            headSha,
            baseRef,
            headRef: 'HEAD',
            refForTools: undefined,
            cleanup: noop,
        };
    }
    // pr-worktree
    progress(`Creating worktree for PR #${prNumber}…`);
    const wt: Worktree = await addWorktree(cwd, headSha, `pr-${prNumber}`);
    return {
        cwd: wt.path,
        workspaceUri: vscode.Uri.file(wt.path),
        repo,
        prNumber,
        headBranch: details.headBranch,
        headSha,
        baseRef,
        headRef: 'HEAD',
        refForTools: undefined,
        cleanup: () => wt.cleanup(),
    };
}

// --- branch-* (palette) ------------------------------------------------------

async function resolveBranchMode(
    mode: 'branch-no-checkout' | 'branch-checkout' | 'branch-worktree',
    cwd: string,
    folder: vscode.WorkspaceFolder,
    repo: RepoSlug | null,
    branch: string,
    progress: (msg: string) => void,
): Promise<ResolvedTarget> {
    // Branch modes always diff against the configured base branch (the setting),
    // matching the palette `current-branch` flow.
    const baseRef = getBaseBranch();
    let headSha: string;
    try {
        headSha = await resolveRefToSha(cwd, branch);
    } catch {
        throw new Error(
            `Branch "${branch}" not found locally. Fetch it first or use a remote-tracking name like origin/${branch}.`,
        );
    }

    // If an open PR matches this branch on the origin, surface it so Submit works.
    const localBranchName = branch.startsWith('origin/') ? branch.slice('origin/'.length) : branch;
    const pr = repo
        ? await findOpenPr(repo.owner, repo.name, localBranchName).catch(() => null)
        : null;
    const prNumber = pr?.number ?? null;

    if (mode === 'branch-no-checkout') {
        return {
            cwd,
            workspaceUri: folder.uri,
            repo,
            prNumber,
            headBranch: branch,
            headSha,
            baseRef,
            headRef: headSha,
            refForTools: headSha,
            cleanup: noop,
        };
    }
    if (mode === 'branch-checkout') {
        await assertCleanTree(cwd, 'Checkout & Review');
        progress(`Checking out ${branch}…`);
        await checkoutRef(cwd, branch);
        return {
            cwd,
            workspaceUri: folder.uri,
            repo,
            prNumber,
            headBranch: branch,
            headSha,
            baseRef,
            headRef: 'HEAD',
            refForTools: undefined,
            cleanup: noop,
        };
    }
    // branch-worktree
    progress(`Creating worktree for ${branch}…`);
    const label = `branch-${branch.replace(/[^A-Za-z0-9._-]/g, '_')}`;
    const wt: Worktree = await addWorktree(cwd, headSha, label);
    return {
        cwd: wt.path,
        workspaceUri: vscode.Uri.file(wt.path),
        repo,
        prNumber,
        headBranch: branch,
        headSha,
        baseRef,
        headRef: 'HEAD',
        refForTools: undefined,
        cleanup: () => wt.cleanup(),
    };
}

async function assertCleanTree(cwd: string, action: string): Promise<void> {
    if (!(await workingTreeIsClean(cwd))) {
        throw new Error(
            `Working tree has uncommitted changes. Commit or stash before using ${action}.`,
        );
    }
}
