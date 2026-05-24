import { getOctokit } from './client';
import { type DiffIndex, findSide } from '../git/diffIndex';
import { type Finding, type ReviewDecision } from '../types';

export interface SubmitReviewInput {
    owner: string;
    repo: string;
    prNumber: number;
    headSha: string;
    decision: ReviewDecision;
    body: string;
    findings: Finding[];
    /**
     * Diff index used to filter and side-classify inline comments. Findings
     * whose `file:line` isn't in any hunk are skipped as inline comments —
     * callers should make sure such findings are still mentioned in `body`.
     */
    diffIndex: DiffIndex;
}

export interface PartitionedFindings {
    /** Findings that mapped to a commentable (file, line, side) in the diff. */
    inline: Finding[];
    /** Findings whose file:line isn't part of any hunk — submit via summary only. */
    outOfHunk: Finding[];
}

/**
 * Split findings into inline-commentable and out-of-hunk groups based on the
 * diff index. Exposed so the caller can render the `outOfHunk` group into the
 * review body before the request is sent.
 */
export function partitionFindings(findings: Finding[], diffIndex: DiffIndex): PartitionedFindings {
    const inline: Finding[] = [];
    const outOfHunk: Finding[] = [];
    for (const f of findings) {
        if (findSide(diffIndex, f.file, f.line) !== null) {
            inline.push(f);
        } else {
            outOfHunk.push(f);
        }
    }
    return { inline, outOfHunk };
}

export async function submitReview(
    input: SubmitReviewInput,
): Promise<{ id: number; htmlUrl: string }> {
    const octokit = await getOctokit();
    const comments = input.findings
        .map((f) => {
            const side = findSide(input.diffIndex, f.file, f.line);
            if (!side) {
                // Defensive: caller should have filtered these out already.
                return null;
            }
            return {
                path: f.file,
                line: f.line,
                side,
                body: renderCommentBody(f),
            };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);

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
