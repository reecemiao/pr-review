import { execFile } from 'child_process';
import { promisify } from 'util';

import { type AgentTool, clampOutput } from './types';

const execFileP = promisify(execFile);

/**
 * Linter definitions: how to scope each linter to a subset of changed files.
 *
 * `extensions` filters `ctx.changedFiles` — when empty after filtering, we
 * fall back to the linter's default whole-repo args so it still runs.
 *
 * `args` is the bare invocation. `scopedArgs(files)` returns the file-scoped
 * invocation; for linters where path args aren't a drop-in we keep the
 * full-repo form.
 */
interface LinterDef {
    args: string[];
    extensions: string[];
    scopedArgs?: (files: string[]) => string[];
}

const LINTERS: Record<string, LinterDef> = {
    ruff: {
        args: ['check', '.'],
        extensions: ['.py'],
        scopedArgs: (files) => ['check', ...files],
    },
    mypy: {
        args: ['.'],
        extensions: ['.py'],
        scopedArgs: (files) => files,
    },
    bandit: {
        args: ['-r', '.'],
        extensions: ['.py'],
        // bandit accepts file paths directly (recursion isn't needed for individual files).
        scopedArgs: (files) => files,
    },
    eslint: {
        args: ['.'],
        extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
        scopedArgs: (files) => files,
    },
};

interface Input {
    linter: keyof typeof LINTERS;
}

export const runLinterTool: AgentTool = {
    spec: {
        name: 'runLinter',
        description:
            'Run a fixed, allowlisted linter and return its output. Allowed: ruff, mypy, bandit, eslint. Automatically scoped to the diff-changed files when possible (10–100x faster on large repos); falls back to whole-repo if no changed files match the linter.',
        inputSchema: {
            type: 'object',
            properties: {
                linter: { type: 'string', enum: Object.keys(LINTERS) },
            },
            required: ['linter'],
        },
    },
    async invoke(rawInput, ctx) {
        const input = rawInput as Input;
        const def = LINTERS[input.linter];
        if (!def) {
            return `error: linter "${input.linter}" not allowed`;
        }

        const args = pickArgs(def, ctx.changedFiles);
        try {
            const { stdout, stderr } = await execFileP(input.linter, args, {
                cwd: ctx.cwd,
                maxBuffer: 16 * 1024 * 1024,
                windowsHide: true,
            });
            return clampOutput(
                [`$ ${input.linter} ${args.join(' ')}`, stdout, stderr].filter(Boolean).join('\n'),
            );
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

/**
 * Choose args based on whether the diff touches files this linter can lint.
 * Exported for unit tests.
 */
export function pickArgs(def: LinterDef, changedFiles: string[] | undefined): string[] {
    if (!def.scopedArgs || !changedFiles || changedFiles.length === 0) {
        return def.args;
    }
    const lower = (s: string) => s.toLowerCase();
    const matches = changedFiles.filter((f) =>
        def.extensions.some((ext) => lower(f).endsWith(ext)),
    );
    if (matches.length === 0) {
        // None of the changed files apply — skip the linter entirely. Returning
        // a single arg like '--version' would mislead the model into thinking
        // we ran it, so just hand back the whole-repo args; the user explicitly
        // opted into linters in `toolScope`.
        return def.args;
    }
    return def.scopedArgs(matches);
}
