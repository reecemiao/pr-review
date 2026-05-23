import { describe, expect, it } from 'vitest';

import { detectLanguages } from '../../templates';

describe('detectLanguages', () => {
    it('returns empty array when no files match known extensions', () => {
        expect(detectLanguages([])).toEqual([]);
        expect(detectLanguages(['README.md', 'config.yml', 'data.csv'])).toEqual([]);
    });

    it('detects python from .py files', () => {
        expect(detectLanguages(['src/app.py'])).toEqual(['python']);
    });

    it('detects typescript from .ts/.tsx/.js/.jsx/.mjs/.cjs files', () => {
        for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']) {
            expect(detectLanguages([`foo${ext}`])).toEqual(['typescript']);
        }
    });

    it('returns each language only once for mixed files of the same kind', () => {
        expect(detectLanguages(['a.ts', 'b.tsx', 'c.js'])).toEqual(['typescript']);
    });

    it('returns multiple languages for mixed files', () => {
        const langs = detectLanguages(['app.py', 'web.ts']);
        expect(langs.sort()).toEqual(['python', 'typescript']);
    });

    it('is case-insensitive on extension', () => {
        expect(detectLanguages(['Foo.PY', 'Bar.TS'])).toEqual(
            expect.arrayContaining(['python', 'typescript']),
        );
    });

    it('ignores files with no extension', () => {
        expect(detectLanguages(['Makefile', 'Dockerfile'])).toEqual([]);
    });
});
