import { describe, expect, it } from 'vitest';

import { assertSafeRef, assertSafeRefPath } from '../../../git/refSafety';

describe('assertSafeRef', () => {
    it('accepts ordinary refs', () => {
        expect(() => assertSafeRef('HEAD')).not.toThrow();
        expect(() => assertSafeRef('main')).not.toThrow();
        expect(() => assertSafeRef('origin/feature/foo')).not.toThrow();
        expect(() => assertSafeRef('abc123def')).not.toThrow();
        expect(() => assertSafeRef('refs/pull/42/head')).not.toThrow();
    });

    it('rejects option-like refs', () => {
        expect(() => assertSafeRef('--upload-pack=evil')).toThrow(/option injection/);
        expect(() => assertSafeRef('-c')).toThrow(/option injection/);
        expect(() => assertSafeRef('-')).toThrow(/option injection/);
    });

    it('rejects empty / non-string input', () => {
        expect(() => assertSafeRef('')).toThrow(/non-empty/);
        // @ts-expect-error — exercising runtime guard against non-string input
        expect(() => assertSafeRef(undefined)).toThrow(/non-empty/);
    });

    it('rejects NUL bytes', () => {
        expect(() => assertSafeRef('main\0--bad')).toThrow(/NUL/);
    });

    it('includes the label in the error message', () => {
        expect(() => assertSafeRef('-foo', 'baseRef')).toThrow(/baseRef/);
    });
});

describe('assertSafeRefPath', () => {
    it('accepts ref:path expressions', () => {
        expect(() => assertSafeRefPath('HEAD:src/foo.ts')).not.toThrow();
        expect(() => assertSafeRefPath('abc123:README.md')).not.toThrow();
    });

    it('rejects option-like prefixes', () => {
        expect(() => assertSafeRefPath('--upload-pack=evil:src/foo.ts')).toThrow(
            /option injection/,
        );
    });
});
