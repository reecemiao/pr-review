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
            'Read the contents of a workspace file. Optionally restrict to a line range. Paths are workspace-relative. When a review ref is in effect, reads come from git at that ref (not the working tree).',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Workspace-relative path' },
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
    ctx: { workspace: vscode.Uri; cwd: string; ref?: string },
    relPath: string,
): Promise<string> {
    if (ctx.ref) {
        return showFileAtRef(ctx.cwd, ctx.ref, relPath);
    }
    const uri = vscode.Uri.joinPath(ctx.workspace, relPath);
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder('utf-8').decode(bytes);
}
