import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { AgentTool, clampOutput } from './types';

const execP = promisify(exec);

interface Input {
    command: string;
    rationale: string;
}

export const runShellTool: AgentTool = {
    spec: {
        name: 'runShell',
        description:
            'Propose a shell command to run in the workspace root. The user will be prompted to approve each call. Provide a one-sentence rationale.',
        inputSchema: {
            type: 'object',
            properties: {
                command: { type: 'string' },
                rationale: { type: 'string' },
            },
            required: ['command', 'rationale'],
        },
    },
    async invoke(rawInput, ctx) {
        const input = rawInput as Input;
        const choice = await vscode.window.showWarningMessage(
            `Agent wants to run: ${input.command}\n\nReason: ${input.rationale}`,
            { modal: true },
            'Allow',
            'Deny',
        );
        if (choice !== 'Allow') {
            return 'denied by user';
        }
        try {
            const { stdout, stderr } = await execP(input.command, {
                cwd: ctx.cwd,
                maxBuffer: 16 * 1024 * 1024,
                windowsHide: true,
            });
            return clampOutput([stdout, stderr].filter(Boolean).join('\n'));
        } catch (err) {
            const e = err as { stdout?: string; stderr?: string; message?: string; code?: number };
            return clampOutput(
                [`(exit ${e.code ?? '?'})`, e.stdout ?? '', e.stderr ?? '', e.message ?? ''].filter(Boolean).join('\n'),
            );
        }
    },
};
