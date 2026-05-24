import { describe, expect, it } from 'vitest';

import { renderCommentBody } from '../../../github/submitReview';
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

describe('renderCommentBody', () => {
    it('omits the suggested-fix block when no fix is provided', () => {
        const out = renderCommentBody(f());
        expect(out).not.toContain('Suggested fix');
        expect(out).not.toContain('```');
    });

    it('wraps suggestedFix in a triple-backtick fence by default', () => {
        const out = renderCommentBody(f({ suggestedFix: 'const x = 1;' }));
        expect(out).toContain('_Suggested fix:_\n```\nconst x = 1;\n```');
    });

    it('escalates the fence when the fix itself contains ```', () => {
        const fix = "before\n```js\nconsole.log('x');\n```\nafter";
        const out = renderCommentBody(f({ suggestedFix: fix }));
        // The triple-backtick inside the fix would otherwise close the fence
        // prematurely on GitHub. Outer fence must be at least 4 backticks.
        expect(out).toContain(`_Suggested fix:_\n\`\`\`\`\n${fix}\n\`\`\`\``);
        expect(out).not.toMatch(/_Suggested fix:_\n```\n/);
    });

    it('escalates beyond 4 backticks when the fix has 4-backtick runs', () => {
        const fix = 'has ```` four backticks';
        const out = renderCommentBody(f({ suggestedFix: fix }));
        expect(out).toContain(`_Suggested fix:_\n\`\`\`\`\`\n${fix}\n\`\`\`\`\``);
    });
});
