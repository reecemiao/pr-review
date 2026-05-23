import * as vscode from 'vscode';

import { type AgentTool, clampOutput } from './types';

interface Input {
    pattern: string;
    glob?: string;
    maxResults?: number;
}

export const grepTool: AgentTool = {
    spec: {
        name: 'grep',
        description:
            'Search workspace files for a regex pattern. Returns matching lines with file:line prefixes. Use this before readFile to locate references.',
        inputSchema: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: 'JavaScript regex pattern (not anchored)' },
                glob: {
                    type: 'string',
                    description: 'Optional include glob, e.g. "**/*.py"',
                },
                maxResults: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
            },
            required: ['pattern'],
        },
    },
    async invoke(rawInput, _ctx, token) {
        const input = rawInput as Input;
        const include = input.glob ?? '**/*';
        const maxResults = input.maxResults ?? 100;
        const re = new RegExp(input.pattern);
        const files = await vscode.workspace.findFiles(include, '**/node_modules/**', 2000, token);
        const out: string[] = [];
        for (const file of files) {
            if (token.isCancellationRequested || out.length >= maxResults) {
                break;
            }
            try {
                const bytes = await vscode.workspace.fs.readFile(file);
                const text = new TextDecoder('utf-8').decode(bytes);
                const lines = text.split(/\r?\n/);
                const rel = vscode.workspace.asRelativePath(file);
                for (let i = 0; i < lines.length; i++) {
                    if (re.test(lines[i])) {
                        out.push(`${rel}:${i + 1}\t${lines[i]}`);
                        if (out.length >= maxResults) {
                            break;
                        }
                    }
                }
            } catch {
                // skip binary or unreadable
            }
        }
        return clampOutput(out.join('\n') || '(no matches)');
    },
};
