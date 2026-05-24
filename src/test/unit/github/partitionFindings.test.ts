import { describe, expect, it } from 'vitest';

import { buildDiffIndex } from '../../../git/diffIndex';
import { partitionFindings } from '../../../github/submitReview';
import { type Finding } from '../../../types';

function f(overrides: Partial<Finding> & Pick<Finding, 'file' | 'line'>): Finding {
    return {
        id: overrides.id ?? 'f0',
        severity: overrides.severity ?? 'INFO',
        title: overrides.title ?? 't',
        body: overrides.body ?? 'b',
        suggestedFix: overrides.suggestedFix,
        ...overrides,
    };
}

describe('partitionFindings', () => {
    it('routes RIGHT-side matches to inline', () => {
        const diff = [
            'diff --git a/x.ts b/x.ts',
            '--- a/x.ts',
            '+++ b/x.ts',
            '@@ -10,1 +10,2 @@',
            ' context',
            '+added 11',
        ].join('\n');
        const idx = buildDiffIndex(diff);

        const findings = [
            f({ id: 'a', file: 'x.ts', line: 10 }),
            f({ id: 'b', file: 'x.ts', line: 11 }),
        ];
        const { inline, outOfHunk } = partitionFindings(findings, idx);
        expect(inline.map((x) => x.id)).toEqual(['a', 'b']);
        expect(outOfHunk).toEqual([]);
    });

    it('routes findings on unknown files to outOfHunk', () => {
        const idx = buildDiffIndex('');
        const findings = [f({ file: 'nowhere.ts', line: 1 })];
        const { inline, outOfHunk } = partitionFindings(findings, idx);
        expect(inline).toEqual([]);
        expect(outOfHunk.map((x) => x.file)).toEqual(['nowhere.ts']);
    });

    it('routes findings on out-of-hunk lines to outOfHunk', () => {
        const diff = [
            'diff --git a/x.ts b/x.ts',
            '--- a/x.ts',
            '+++ b/x.ts',
            '@@ -10,1 +10,1 @@',
            '-old',
            '+new',
        ].join('\n');
        const idx = buildDiffIndex(diff);
        const { inline, outOfHunk } = partitionFindings(
            [f({ id: 'far', file: 'x.ts', line: 99 })],
            idx,
        );
        expect(inline).toEqual([]);
        expect(outOfHunk.map((x) => x.id)).toEqual(['far']);
    });

    it('routes findings on LEFT-only lines to outOfHunk (post-fix behavior)', () => {
        // `@@ -20,3 +20,1 @@` deletes old lines 21 and 22. A finding cited
        // at line 21 should NOT become an inline comment on a deleted line
        // (the model is reviewing the post-change file). It belongs in the
        // review body, where reviewers can see it without GitHub attaching
        // it to unrelated removed content.
        const diff = [
            'diff --git a/foo.ts b/foo.ts',
            '--- a/foo.ts',
            '+++ b/foo.ts',
            '@@ -20,3 +20,1 @@',
            ' context',
            '-deleted 21',
            '-deleted 22',
        ].join('\n');
        const idx = buildDiffIndex(diff);

        const { inline, outOfHunk } = partitionFindings(
            [
                f({ id: 'left21', file: 'foo.ts', line: 21 }),
                f({ id: 'left22', file: 'foo.ts', line: 22 }),
                f({ id: 'ctx20', file: 'foo.ts', line: 20 }),
            ],
            idx,
        );
        expect(inline.map((x) => x.id)).toEqual(['ctx20']);
        expect(outOfHunk.map((x) => x.id)).toEqual(['left21', 'left22']);
    });
});
