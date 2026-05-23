import { git } from './exec';

/**
 * Fetch a PR's head ref from `remote` into a local ref `refs/prreview/<num>`.
 * Returns the local ref name. Works against github.com and GitHub Enterprise.
 */
export async function fetchPrHead(cwd: string, remote: string, prNumber: number): Promise<string> {
    const localRef = `refs/prreview/${prNumber}`;
    await git(['fetch', '--no-tags', remote, `+refs/pull/${prNumber}/head:${localRef}`], { cwd });
    return localRef;
}

export async function resolveRefToSha(cwd: string, ref: string): Promise<string> {
    const out = await git(['rev-parse', '--verify', ref], { cwd });
    return out.trim();
}

export async function workingTreeIsClean(cwd: string): Promise<boolean> {
    const out = await git(['status', '--porcelain'], { cwd });
    return out.trim() === '';
}

/**
 * Checkout an existing local ref. Used by `pr-checkout` mode after fetchPrHead.
 * Throws if the working tree is dirty — caller should pre-check with workingTreeIsClean.
 */
export async function checkoutRef(cwd: string, ref: string): Promise<void> {
    await git(['checkout', ref], { cwd });
}

/**
 * Force-create (or move) a local tracking branch from a remote-tracking ref and check it out.
 * Used by `branch-checkout` when the input is a remote name like `origin/foo` — avoids the
 * detached-HEAD behavior of `git checkout origin/foo` on older git versions.
 */
export async function checkoutTrackingBranch(
    cwd: string,
    localName: string,
    remoteRef: string,
): Promise<void> {
    await git(['checkout', '-B', localName, remoteRef], { cwd });
}

/**
 * Best-effort delete of a local ref (e.g. `refs/prreview/<num>`). Idempotent — swallows
 * the "ref does not exist" failure so cleanup paths can call this unconditionally.
 */
export async function deleteRef(cwd: string, ref: string): Promise<void> {
    try {
        await git(['update-ref', '-d', ref], { cwd });
    } catch {
        // best-effort
    }
}
