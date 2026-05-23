import { getGithubToken } from './auth';
import { getEnterpriseBaseUrl } from '../config/settings';

// @octokit/rest is ESM-only; load via dynamic import from our CJS extension.
// We type it loosely since the consumed surface (pulls.list, pulls.createReview) is small.
type OctokitInstance = {
    pulls: {
        list(params: object): Promise<{ data: Array<{ number: number; head: { sha: string } }> }>;
        createReview(params: object): Promise<{ data: { id: number; html_url: string } }>;
    };
};

type OctokitCtor = new (opts: object) => OctokitInstance;

let modPromise: Promise<{ Octokit: OctokitCtor }> | null = null;
function loadOctokit(): Promise<{ Octokit: OctokitCtor }> {
    if (!modPromise) {
        modPromise = import('@octokit/rest' as string) as Promise<{ Octokit: OctokitCtor }>;
    }
    return modPromise;
}

export async function getOctokit(): Promise<OctokitInstance> {
    const auth = await getGithubToken();
    const baseUrl = getEnterpriseBaseUrl();
    const { Octokit } = await loadOctokit();
    return new Octokit({ auth, ...(baseUrl ? { baseUrl } : {}) });
}
