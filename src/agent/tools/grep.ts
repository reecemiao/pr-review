import * as vscode from 'vscode';

import { type AgentTool, clampOutput } from './types';
import { grepAtRef } from '../../git/refRead';

interface Input {
    pattern: string;
    glob?: string;
    maxResults?: number;
}

export const grepTool: AgentTool = {
    spec: {
        name: 'grep',
        description:
            'Search workspace files for a regex pattern. Returns matching lines with file:line prefixes. Use this before readFile to locate references. When a review ref is in effect, searches via `git grep` at that ref.',
        inputSchema: {
            type: 'object',
            properties: {
                pattern: {
                    type: 'string',
                    description:
                        'POSIX extended regex (ERE). JS-style escapes like \\d, \\w, \\s and lookarounds are NOT portable — use character classes ([0-9], [A-Za-z_], [[:space:]]). The same pattern is used by JS RegExp in workspace mode and by `git grep -E` in review-ref mode; sticking to ERE keeps results consistent across modes.',
                },
                glob: {
                    type: 'string',
                    description:
                        'Optional include filter. Workspace mode: VS Code glob (e.g. "**/*.py"). Review-ref mode: git pathspec (e.g. "src/" or "*.py"). Plain extensions and directory prefixes work in both.',
                },
                maxResults: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
            },
            required: ['pattern'],
        },
    },
    async invoke(rawInput, ctx, token) {
        const input = rawInput as Input;
        const maxResults = input.maxResults ?? 100;

        if (ctx.ref) {
            const rows = await grepAtRef(ctx.cwd, ctx.ref, input.pattern, input.glob, maxResults);
            return clampOutput(rows.join('\n') || '(no matches)');
        }

        const include = input.glob ?? '**/*';
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
