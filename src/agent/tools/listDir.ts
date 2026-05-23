import * as vscode from 'vscode';

import { type AgentTool, clampOutput } from './types';
import { lsTreeAtRef } from '../../git/refRead';

interface Input {
    path: string;
}

export const listDirTool: AgentTool = {
    spec: {
        name: 'listDir',
        description:
            'List the entries of a workspace directory (workspace-relative path). When a review ref is in effect, the listing comes from git at that ref.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Workspace-relative directory path' },
            },
            required: ['path'],
        },
    },
    async invoke(rawInput, ctx) {
        const input = rawInput as Input;
        if (ctx.ref) {
            const rows = await lsTreeAtRef(ctx.cwd, ctx.ref, input.path);
            return clampOutput(rows.join('\n'));
        }
        const uri = vscode.Uri.joinPath(ctx.workspace, input.path);
        const entries = await vscode.workspace.fs.readDirectory(uri);
        const lines = entries.map(([name, kind]) => {
            const t =
                kind === vscode.FileType.Directory
                    ? 'dir'
                    : kind === vscode.FileType.File
                      ? 'file'
                      : 'other';
            return `${t}\t${name}`;
        });
        return clampOutput(lines.join('\n'));
    },
};
