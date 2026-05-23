import { getOctokit } from './client';

export async function findOpenPr(
    owner: string,
    repo: string,
    headBranch: string,
): Promise<{ number: number; headSha: string } | null> {
    const octokit = await getOctokit();
    // Querying by head=owner:branch is the documented way to filter list-pulls by branch.
    const { data } = await octokit.pulls.list({
        owner,
        repo,
        state: 'open',
        head: `${owner}:${headBranch}`,
        per_page: 5,
    });
    if (data.length === 0) {
        return null;
    }
    const pr = data[0];
    return { number: pr.number, headSha: pr.head.sha };
}
