export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type ReviewDecision = 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES';

export interface Finding {
    id: string;
    severity: Severity;
    title: string;
    body: string;
    file: string;
    line: number;
    suggestedFix?: string;
}

export interface ReviewResult {
    findings: Finding[];
    proposedDecision: ReviewDecision;
    summary: string;
    prNumber: number | null;
    repo: { owner: string; name: string } | null;
    baseBranch: string;
    headBranch: string;
}

export interface SubmitPayload {
    selectedIds: string[];
    finalDecision: ReviewDecision;
    summaryOverride?: string;
}

export type ToolScope = 'read-only' | 'read-only-with-linters' | 'shell-with-confirm';

export type ThinkingEffort = 'minimal' | 'low' | 'medium' | 'high';

export type ReviewMode =
    | 'current-branch'
    | 'pr-no-checkout'
    | 'pr-checkout'
    | 'pr-worktree'
    | 'branch-no-checkout'
    | 'branch-checkout'
    | 'branch-worktree';

export const BRANCH_MODES = ['branch-no-checkout', 'branch-checkout', 'branch-worktree'] as const;
export const PR_MODES = ['pr-no-checkout', 'pr-checkout', 'pr-worktree'] as const;

export function severityToDecision(findings: Finding[]): ReviewDecision {
    if (findings.length === 0) {
        return 'APPROVE';
    }
    const blocking: Severity[] = ['CRITICAL', 'HIGH'];
    if (findings.some((f) => blocking.includes(f.severity))) {
        return 'REQUEST_CHANGES';
    }
    return 'COMMENT';
}
