import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

import { detectLanguages, loadTemplate } from '../../templates';

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

describe('loadTemplate extraInstructions resolution', () => {
    const extensionUri = { fsPath: '/ext', scheme: 'file', path: '/ext' } as unknown as vscode.Uri;

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves extraInstructions paths against the git root, not the workspace folder', async () => {
        // Bug guarded against: previously the workspace URI was passed in,
        // so a user opening `/repo/packages/web` and configuring
        // { python: "./.review/team-python.md" } would have the file looked
        // up at `/repo/packages/web/.review/team-python.md` and silently
        // missed because the `try/catch` in `readRepoFile` swallows ENOENT.
        vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
            get: <T>(key: string, defaultValue?: T): T | undefined => {
                if (key === 'extraInstructions') {
                    return { python: '.review/team-python.md' } as unknown as T;
                }
                return defaultValue;
            },
        } as unknown as vscode.WorkspaceConfiguration);

        const reads: string[] = [];
        vi.spyOn(vscode.workspace.fs, 'readFile').mockImplementation(async (u) => {
            const uri = u as { fsPath: string };
            reads.push(uri.fsPath);
            // Return distinguishable bytes so the template parts assemble
            // without error. The extras read uses the path we care about.
            return new TextEncoder().encode(
                uri.fsPath.endsWith('.review/team-python.md')
                    ? 'team rules: log secrets via redactor only'
                    : '# bundled python reviewer',
            );
        });

        const gitRoot = vscode.Uri.file('/repo');
        const result = await loadTemplate(extensionUri, gitRoot, ['packages/web/app.py']);

        const extrasRead = reads.find((p) => p.endsWith('.review/team-python.md'));
        expect(extrasRead, 'extras must be read').toBeDefined();
        // The fix: resolve from the git root URI we passed in.
        expect(extrasRead).toBe('/repo/.review/team-python.md');
        // Sanity: the extras content actually made it into the assembled prompt.
        expect(result.systemPrompt).toContain('Additional instructions (python)');
        expect(result.systemPrompt).toContain('log secrets via redactor only');
    });
});
