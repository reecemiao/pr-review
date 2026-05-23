import * as vscode from 'vscode';

import { AgentTool, clampOutput } from './types';

interface Input {
    path: string;
    startLine?: number;
    endLine?: number;
}

export const readFileTool: AgentTool = {
    spec: {
        name: 'readFile',
        description:
            'Read the contents of a workspace file. Optionally restrict to a line range. Paths are workspace-relative.',
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
        const uri = vscode.Uri.joinPath(ctx.workspace, input.path);
        const bytes = await vscode.workspace.fs.readFile(uri);
        const text = new TextDecoder('utf-8').decode(bytes);
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
