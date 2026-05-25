import * as path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

import { listDirTool } from '../../../../agent/tools/listDir';
import { readFileTool } from '../../../../agent/tools/readFile';
import { type ToolContext } from '../../../../agent/tools/types';

// Regression: paths in `changedFiles` and in `Finding.file` are git-root
// relative (that's what `git diff --name-only` and the diff hunks print).
// readFile and listDir must resolve them against the git root (= ctx.cwd in
// the new model), NOT against a workspace subdirectory. Before the fix,
// monorepo users opening `/repo/packages/web` would see ENOENT on
// `packages/web/src/foo.ts` because the URI got joined with the workspace.

const noopToken = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => undefined }),
} as unknown as vscode.CancellationToken;

afterEach(() => {
    vi.restoreAllMocks();
});

describe('readFileTool path resolution', () => {
    it('joins ctx.cwd with the relative path in working-tree mode', async () => {
        const spy = vi
            .spyOn(vscode.workspace.fs, 'readFile')
            .mockResolvedValue(new TextEncoder().encode('hello'));

        const ctx: ToolContext = { cwd: '/repo' };
        const result = await readFileTool.invoke(
            { path: 'packages/web/src/foo.ts' },
            ctx,
            noopToken,
        );

        expect(result).toBe('hello');
        expect(spy).toHaveBeenCalledOnce();
        const uri = spy.mock.calls[0][0] as { fsPath: string };
        // The fix: resolve from the git root, never from a workspace subdir.
        expect(uri.fsPath).toBe(path.join('/repo', 'packages/web/src/foo.ts'));
    });

    it('does not touch the FS when a review ref is in effect (delegates to git show)', async () => {
        const spy = vi.spyOn(vscode.workspace.fs, 'readFile');
        const ctx: ToolContext = { cwd: '/repo', ref: 'HEAD' };
        // We don't care about the result here — only that the FS path is not
        // taken. The git.show call will fail because there's no real repo at
        // /repo, so swallow the rejection.
        await readFileTool.invoke({ path: 'a.ts' }, ctx, noopToken).catch(() => {});
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('listDirTool path resolution', () => {
    it('joins ctx.cwd with the relative path in working-tree mode', async () => {
        const spy = vi.spyOn(vscode.workspace.fs, 'readDirectory').mockResolvedValue([
            ['index.ts', vscode.FileType.File],
            ['lib', vscode.FileType.Directory],
        ]);

        const ctx: ToolContext = { cwd: '/repo' };
        const result = await listDirTool.invoke({ path: 'packages/web/src' }, ctx, noopToken);

        expect(result).toContain('file\tindex.ts');
        expect(result).toContain('dir\tlib');
        const uri = spy.mock.calls[0][0] as { fsPath: string };
        expect(uri.fsPath).toBe(path.join('/repo', 'packages/web/src'));
    });
});
