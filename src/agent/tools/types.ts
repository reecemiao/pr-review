import * as vscode from 'vscode';

export interface ToolContext {
    workspace: vscode.Uri;
    cwd: string;
}

export interface AgentTool {
    spec: vscode.LanguageModelChatTool;
    invoke(input: unknown, ctx: ToolContext, token: vscode.CancellationToken): Promise<string>;
}

export const MAX_TOOL_OUTPUT_BYTES = 64 * 1024;

export function clampOutput(s: string): string {
    if (s.length <= MAX_TOOL_OUTPUT_BYTES) {
        return s;
    }
    return (
        s.slice(0, MAX_TOOL_OUTPUT_BYTES) +
        `\n\n[truncated ${s.length - MAX_TOOL_OUTPUT_BYTES} bytes]`
    );
}
