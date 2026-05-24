import { type AgentTool, clampOutput } from './types';
import { git } from '../../git/exec';
import { assertSafeRefPath } from '../../git/refSafety';

interface Input {
    ref: string;
}

export const gitShowTool: AgentTool = {
    spec: {
        name: 'gitShow',
        description:
            'Run `git show <ref>` to inspect a specific commit, tag, or file at a revision (e.g. "HEAD~1:src/foo.py"). Read-only.',
        inputSchema: {
            type: 'object',
            properties: {
                ref: { type: 'string', description: 'A git ref or ref:path expression' },
            },
            required: ['ref'],
        },
    },
    async invoke(rawInput, ctx) {
        const input = rawInput as Input;
        assertSafeRefPath(input.ref);
        const cacheKey = `gitShow:${input.ref}`;
        const hit = ctx.cache?.get(cacheKey);
        if (hit !== undefined) {
            return clampOutput(hit);
        }
        const out = await git(['show', '--no-color', input.ref], { cwd: ctx.cwd });
        ctx.cache?.set(cacheKey, out);
        return clampOutput(out);
    },
};
