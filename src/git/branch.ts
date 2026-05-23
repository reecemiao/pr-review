import { git } from './exec';

export async function getCurrentBranch(cwd: string): Promise<string> {
    const out = await git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
    return out.trim();
}

export async function getMergeBase(cwd: string, base: string, head = 'HEAD'): Promise<string> {
    const out = await git(['merge-base', base, head], { cwd });
    return out.trim();
}

export async function getRemoteUrl(cwd: string, remote: string): Promise<string | null> {
    try {
        const out = await git(['remote', 'get-url', remote], { cwd });
        return out.trim();
    } catch {
        return null;
    }
}

export interface RepoSlug {
    owner: string;
    name: string;
    host: string;
}

export function parseRepoSlug(remoteUrl: string): RepoSlug | null {
    // Handles:
    //   git@github.com:owner/repo.git
    //   https://github.com/owner/repo.git
    //   https://github.example.com/owner/repo
    const ssh = remoteUrl.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
    if (ssh) {
        return { host: ssh[1], owner: ssh[2], name: ssh[3] };
    }
    const https = remoteUrl.match(/^https?:\/\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?\/?$/);
    if (https) {
        return { host: https[1], owner: https[2], name: https[3] };
    }
    return null;
}

export async function getOriginRepoSlug(cwd: string): Promise<RepoSlug | null> {
    const url = await getRemoteUrl(cwd, 'origin');
    if (!url) {
        return null;
    }
    return parseRepoSlug(url);
}

export interface BranchEntry {
    name: string;
    /** True for refs/remotes/*. */
    remote: boolean;
    /** True for the currently checked-out branch. */
    current: boolean;
}

/**
 * Enumerate local + remote-tracking branches via `for-each-ref`.
 * Skips symbolic refs like `origin/HEAD -> origin/main` (they have an empty objectname display in our format).
 */
export async function listBranches(cwd: string): Promise<BranchEntry[]> {
    const current = await getCurrentBranch(cwd).catch(() => '');
    const out = await git(
        [
            'for-each-ref',
            '--format=%(refname:short)\t%(refname)\t%(symref)',
            'refs/heads',
            'refs/remotes',
        ],
        { cwd },
    );
    const entries: BranchEntry[] = [];
    for (const line of out.split(/\r?\n/)) {
        if (!line) {
            continue;
        }
        const [shortName, fullRef, symref] = line.split('\t');
        if (symref) {
            // Skip e.g. `origin/HEAD -> origin/main` symbolic refs.
            continue;
        }
        const remote = fullRef.startsWith('refs/remotes/');
        entries.push({ name: shortName, remote, current: !remote && shortName === current });
    }
    return entries;
}
