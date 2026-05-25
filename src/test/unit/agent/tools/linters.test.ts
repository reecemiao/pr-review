import { describe, expect, it } from 'vitest';

import { pickArgs } from '../../../../agent/tools/linters';

const eslintDef = {
    args: ['.'],
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
    scopedArgs: (files: string[]) => files,
};

const ruffDef = {
    args: ['check', '.'],
    extensions: ['.py', '.pyi'],
    scopedArgs: (files: string[]) => ['check', ...files],
};

describe('pickArgs', () => {
    it('returns the whole-repo args when changedFiles is undefined', () => {
        expect(pickArgs(eslintDef, undefined)).toEqual(['.']);
    });

    it('returns the whole-repo args when changedFiles is empty', () => {
        expect(pickArgs(eslintDef, [])).toEqual(['.']);
    });

    it('scopes eslint to JS/TS files in the diff', () => {
        const files = ['src/foo.ts', 'README.md', 'src/bar.tsx', 'pkg.json'];
        expect(pickArgs(eslintDef, files)).toEqual(['src/foo.ts', 'src/bar.tsx']);
    });

    it('scopes ruff and prefixes the "check" subcommand', () => {
        const files = ['app/main.py', 'docs/intro.md', 'tests/test_x.py'];
        expect(pickArgs(ruffDef, files)).toEqual(['check', 'app/main.py', 'tests/test_x.py']);
    });

    it('falls back to whole-repo args when no changed file matches the linter', () => {
        const files = ['README.md', 'docs/foo.md', 'CHANGELOG'];
        expect(pickArgs(eslintDef, files)).toEqual(['.']);
        expect(pickArgs(ruffDef, files)).toEqual(['check', '.']);
    });

    it('matches extensions case-insensitively', () => {
        expect(pickArgs(eslintDef, ['src/Foo.TS', 'README.md'])).toEqual(['src/Foo.TS']);
    });

    it('scopes ruff to .pyi stub files alongside .py', () => {
        const files = ['app/main.py', 'app/types.pyi', 'README.md'];
        expect(pickArgs(ruffDef, files)).toEqual(['check', 'app/main.py', 'app/types.pyi']);
    });
});
