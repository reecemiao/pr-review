import { type AgentTool, clampOutput } from './types';
import { grepAtRef, grepWorkingTree } from '../../git/refRead';

interface Input {
    pattern: string;
    glob?: string;
    maxResults?: number;
}

export const grepTool: AgentTool = {
    spec: {
        name: 'grep',
        description:
            'Search files for a regex pattern via `git grep -E`. Returns matching `path:line` rows. Use this before readFile to locate references. When a review ref is in effect, searches happen at that ref; otherwise against the working tree (tracked files).',
        inputSchema: {
            type: 'object',
            properties: {
                pattern: {
                    type: 'string',
                    description:
                        'POSIX extended regex (ERE), as accepted by `git grep -E`. Use character classes ([0-9], [A-Za-z_], [[:space:]]) — JS-style escapes like \\d, \\w, \\s and lookarounds are NOT supported.',
                },
                glob: {
                    type: 'string',
                    description:
                        'Optional git pathspec filter (e.g. "src/" or "*.py"). Same syntax in working-tree and ref modes.',
                },
                maxResults: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
            },
            required: ['pattern'],
        },
    },
    async invoke(rawInput, ctx) {
        const input = rawInput as Input;
        const maxResults = input.maxResults ?? 100;
        const rows = ctx.ref
            ? await grepAtRef(ctx.cwd, ctx.ref, input.pattern, input.glob, maxResults)
            : await grepWorkingTree(ctx.cwd, input.pattern, input.glob, maxResults);
        return clampOutput(rows.join('\n') || '(no matches)');
    },
};
