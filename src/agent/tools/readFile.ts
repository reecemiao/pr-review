import * as path from 'path';

import * as vscode from 'vscode';

import { type AgentTool, clampOutput } from './types';
import { showFileAtRef } from '../../git/refRead';

interface Input {
    path: string;
    startLine?: number;
    endLine?: number;
}

export const readFileTool: AgentTool = {
    spec: {
        name: 'readFile',
        description:
            'Read the contents of a workspace file. Optionally restrict to a line range. Paths are relative to the git repo root (matching what the diff prints). When a review ref is in effect, reads come from git at that ref (not the working tree).',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Git-root-relative path' },
                startLine: { type: 'integer', minimum: 1 },
                endLine: { type: 'integer', minimum: 1 },
            },
            required: ['path'],
        },
    },
    async invoke(rawInput, ctx) {
        const input = rawInput as Input;
        const text = await readText(ctx, input.path);
        if (input.startLine === undefined && input.endLine === undefined) {
            return clampOutput(text);
        }
        const lines = text.split(/\r?\n/);
        const start = Math.max(1, input.startLine ?? 1);
        const end = Math.min(lines.length, input.endLine ?? lines.length);
        const slice = lines.slice(start - 1, end);
        const numbered = slice.map((l, i) => `${start + i}\t${l}`).join('\n');
        return clampOutput(numbered);
    },
};

async function readText(
    ctx: {
        cwd: string;
        ref?: string;
        cache?: Map<string, string>;
    },
    relPath: string,
): Promise<string> {
    // Cache key includes the ref so working-tree and ref-mode reads of the
    // same path don't collide. "WT" marks working-tree reads.
    const cacheKey = `readFile:${ctx.ref ?? 'WT'}:${relPath}`;
    const hit = ctx.cache?.get(cacheKey);
    if (hit !== undefined) {
        return hit;
    }
    const text = ctx.ref
        ? await showFileAtRef(ctx.cwd, ctx.ref, relPath)
        : new TextDecoder('utf-8').decode(
              await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(ctx.cwd, relPath))),
          );
    ctx.cache?.set(cacheKey, text);
    return text;
}
