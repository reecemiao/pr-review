import { getOctokit } from './client';
import { type Finding, type ReviewDecision } from '../types';

export interface SubmitReviewInput {
    owner: string;
    repo: string;
    prNumber: number;
    headSha: string;
    decision: ReviewDecision;
    body: string;
    findings: Finding[];
}

export async function submitReview(
    input: SubmitReviewInput,
): Promise<{ id: number; htmlUrl: string }> {
    const octokit = await getOctokit();
    const comments = input.findings.map((f) => ({
        path: f.file,
        line: f.line,
        side: 'RIGHT' as const,
        body: renderCommentBody(f),
    }));

    const { data } = await octokit.pulls.createReview({
        owner: input.owner,
        repo: input.repo,
        pull_number: input.prNumber,
        commit_id: input.headSha,
        event: input.decision,
        body: input.body,
        comments,
    });
    return { id: data.id, htmlUrl: data.html_url };
}

function renderCommentBody(f: Finding): string {
    const head = `**[${f.severity}] ${f.title}**`;
    const fix = f.suggestedFix ? `\n\n_Suggested fix:_\n\`\`\`\n${f.suggestedFix}\n\`\`\`` : '';
    return `${head}\n\n${f.body}${fix}`;
}
