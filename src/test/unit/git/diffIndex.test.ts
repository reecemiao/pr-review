import { describe, expect, it } from 'vitest';

import { buildDiffIndex, findSide } from '../../../git/diffIndex';

describe('buildDiffIndex', () => {
    it('returns an empty index for empty input', () => {
        expect(buildDiffIndex('').size).toBe(0);
    });

    it('indexes added lines on RIGHT at the new-file line numbers', () => {
        const diff = [
            'diff --git a/foo.ts b/foo.ts',
            '--- a/foo.ts',
            '+++ b/foo.ts',
            '@@ -10,3 +10,4 @@',
            ' context1',
            ' context2',
            '+added line 12',
            '+added line 13',
        ].join('\n');

        const idx = buildDiffIndex(diff);
        expect(findSide(idx, 'foo.ts', 10)).toBe('RIGHT'); // context
        expect(findSide(idx, 'foo.ts', 11)).toBe('RIGHT'); // context
        expect(findSide(idx, 'foo.ts', 12)).toBe('RIGHT'); // added
        expect(findSide(idx, 'foo.ts', 13)).toBe('RIGHT'); // added
        expect(findSide(idx, 'foo.ts', 14)).toBeNull(); // outside hunk
    });

    it('indexes deleted lines on LEFT at the old-file line numbers', () => {
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
        // The deleted lines populate the underlying LEFT set so that
        // policy decisions can inspect them, even though `findSide` does
        // not surface LEFT matches as commentable (see policy below).
        expect(idx.get('foo.ts')?.left.has(21)).toBe(true);
        expect(idx.get('foo.ts')?.left.has(22)).toBe(true);
        // Context line is on both sides at the corresponding line number.
        expect(findSide(idx, 'foo.ts', 20)).toBe('RIGHT');
    });

    it('does not classify LEFT-only lines as commentable (policy: RIGHT-only)', () => {
        // `@@ -20,3 +20,1 @@` deletes old lines 21 and 22. The model
        // reviews the post-change state and cites new-file line numbers, so
        // a finding on line 21 or 22 almost certainly means "line 21 of the
        // current file" — which doesn't exist in the new file at all.
        // Attaching such a comment to the LEFT side of the diff would land
        // it on coincidentally-numbered deleted content. Out-of-hunk is the
        // safer classification; runReview surfaces it in the review body.
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
        expect(findSide(idx, 'foo.ts', 21)).toBeNull();
        expect(findSide(idx, 'foo.ts', 22)).toBeNull();
    });

    it('handles single-line hunk headers without the count', () => {
        const diff = [
            'diff --git a/x b/x',
            '--- a/x',
            '+++ b/x',
            '@@ -5 +5 @@',
            '-old',
            '+new',
        ].join('\n');

        const idx = buildDiffIndex(diff);
        expect(findSide(idx, 'x', 5)).toBe('RIGHT'); // RIGHT preferred when both sides match
    });

    it('keys off the new-file path from the +++ line', () => {
        // Rename case: a/foo.ts -> b/bar.ts. Findings come back citing bar.ts.
        const diff = [
            'diff --git a/foo.ts b/bar.ts',
            'similarity index 90%',
            'rename from foo.ts',
            'rename to bar.ts',
            '--- a/foo.ts',
            '+++ b/bar.ts',
            '@@ -1,2 +1,2 @@',
            ' keep',
            '-old',
            '+new',
        ].join('\n');

        const idx = buildDiffIndex(diff);
        expect(idx.has('bar.ts')).toBe(true);
        expect(idx.has('foo.ts')).toBe(false);
        expect(findSide(idx, 'bar.ts', 2)).toBe('RIGHT');
    });

    it('skips deleted files (+++ /dev/null)', () => {
        const diff = [
            'diff --git a/gone.ts b/gone.ts',
            'deleted file mode 100644',
            '--- a/gone.ts',
            '+++ /dev/null',
            '@@ -1,2 +0,0 @@',
            '-line1',
            '-line2',
        ].join('\n');

        const idx = buildDiffIndex(diff);
        expect(idx.size).toBe(0);
    });

    it('handles multiple files in one diff', () => {
        const diff = [
            'diff --git a/a.ts b/a.ts',
            '--- a/a.ts',
            '+++ b/a.ts',
            '@@ -1 +1 @@',
            '-old A',
            '+new A',
            'diff --git a/b.ts b/b.ts',
            '--- a/b.ts',
            '+++ b/b.ts',
            '@@ -10,1 +10,2 @@',
            ' context',
            '+new B',
        ].join('\n');

        const idx = buildDiffIndex(diff);
        expect(findSide(idx, 'a.ts', 1)).toBe('RIGHT');
        expect(findSide(idx, 'b.ts', 10)).toBe('RIGHT');
        expect(findSide(idx, 'b.ts', 11)).toBe('RIGHT');
        expect(findSide(idx, 'a.ts', 99)).toBeNull();
    });

    it('handles multiple hunks within one file', () => {
        const diff = [
            'diff --git a/x b/x',
            '--- a/x',
            '+++ b/x',
            '@@ -1,1 +1,1 @@',
            '-a',
            '+A',
            '@@ -100,1 +100,1 @@',
            '-b',
            '+B',
        ].join('\n');

        const idx = buildDiffIndex(diff);
        expect(findSide(idx, 'x', 1)).toBe('RIGHT');
        expect(findSide(idx, 'x', 100)).toBe('RIGHT');
        expect(findSide(idx, 'x', 50)).toBeNull();
    });

    it('ignores "\\ No newline at end of file" markers', () => {
        const diff = [
            'diff --git a/x b/x',
            '--- a/x',
            '+++ b/x',
            '@@ -1,1 +1,1 @@',
            '-a',
            '\\ No newline at end of file',
            '+b',
            '\\ No newline at end of file',
        ].join('\n');

        const idx = buildDiffIndex(diff);
        expect(findSide(idx, 'x', 1)).toBe('RIGHT');
    });
});
