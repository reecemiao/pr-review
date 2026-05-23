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
