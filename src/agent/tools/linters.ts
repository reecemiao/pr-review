import { execFile } from 'child_process';
import { promisify } from 'util';
import { AgentTool, clampOutput } from './types';

const execFileP = promisify(execFile);

const ALLOWED: Record<string, string[]> = {
    ruff: ['check', '.'],
    mypy: ['.'],
    bandit: ['-r', '.'],
    eslint: ['.'],
};

interface Input {
    linter: keyof typeof ALLOWED;
}

export const runLinterTool: AgentTool = {
    spec: {
        name: 'runLinter',
        description:
            'Run a fixed, allowlisted linter against the workspace and return its output. Allowed: ruff, mypy, bandit, eslint.',
        inputSchema: {
            type: 'object',
            properties: {
                linter: { type: 'string', enum: Object.keys(ALLOWED) },
            },
            required: ['linter'],
        },
    },
    async invoke(rawInput, ctx) {
        const input = rawInput as Input;
        const args = ALLOWED[input.linter];
        if (!args) {
            return `error: linter "${input.linter}" not allowed`;
        }
        try {
            const { stdout, stderr } = await execFileP(input.linter, args, {
                cwd: ctx.cwd,
                maxBuffer: 16 * 1024 * 1024,
                windowsHide: true,
            });
            return clampOutput([`$ ${input.linter} ${args.join(' ')}`, stdout, stderr].filter(Boolean).join('\n'));
        } catch (err) {
            const e = err as { stdout?: string; stderr?: string; message?: string; code?: number };
            return clampOutput(
                [
                    `$ ${input.linter} ${args.join(' ')} (exit ${e.code ?? '?'})`,
                    e.stdout ?? '',
                    e.stderr ?? '',
                    e.message ?? '',
                ]
                    .filter(Boolean)
                    .join('\n'),
            );
        }
    },
};
