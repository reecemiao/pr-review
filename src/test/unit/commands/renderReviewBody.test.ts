import { describe, expect, it } from 'vitest';

import { renderReviewBody } from '../../../commands/runReview';
import { type Finding } from '../../../types';

function f(overrides: Partial<Finding> = {}): Finding {
    return {
        id: 'f0',
        severity: 'MEDIUM',
        title: 'title',
        body: 'body',
        file: 'a.ts',
        line: 1,
        ...overrides,
    };
}

describe('renderReviewBody', () => {
    it('renders summary and counts when there are no findings', () => {
        const out = renderReviewBody('looks good', []);
        expect(out).toContain('looks good');
        expect(out).toContain('no findings');
    });

    it('includes the decision header when provided', () => {
        const out = renderReviewBody('s', [], 'APPROVE');
        expect(out.startsWith('**Decision:** APPROVE')).toBe(true);
    });

    it('renders a finding with a default triple-backtick fence for suggestedFix', () => {
        const out = renderReviewBody('s', [f({ suggestedFix: 'fix me' })]);
        expect(out).toContain('```\nfix me\n```');
    });

    it('escalates the fence when suggestedFix contains a triple-backtick run', () => {
        const fix = '```\nconst x = 1;\n```';
        const out = renderReviewBody('s', [f({ suggestedFix: fix })]);
        // Outer fence must be at least 4 backticks so the inner triple doesn't
        // close it prematurely on GitHub's renderer.
        expect(out).toContain(`\`\`\`\`\n${fix}\n\`\`\`\``);
        // Sanity: no bare 3-backtick fence directly hugging the fix.
        expect(out).not.toMatch(/\n```\n```\n/);
    });

    it('appends an out-of-hunk section when supplied', () => {
        const out = renderReviewBody('s', [f({ id: 'a', file: 'in.ts', line: 1 })], 'COMMENT', [
            f({ id: 'b', file: 'out.ts', line: 9 }),
        ]);
        expect(out).toContain('Additional findings outside the diff hunks');
        expect(out).toContain('`out.ts:9`');
    });
});
