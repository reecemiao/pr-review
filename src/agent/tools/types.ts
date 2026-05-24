import type * as vscode from 'vscode';

export interface ToolContext {
    workspace: vscode.Uri;
    cwd: string;
    /**
     * When set, ref-aware tools (readFile / listDir / grep) read from git's
     * object store at this ref instead of the working tree. Used in
     * `pr-no-checkout` mode where the on-disk workspace is on a different
     * branch than the PR being reviewed.
     */
    ref?: string;
    /**
     * Files touched by the diff under review. The linter tool scopes its
     * invocation to these (filtered by extension) instead of running across
     * the whole workspace.
     */
    changedFiles?: string[];
    /**
     * Per-review read cache. `readFile` and `gitShow` write to it after
     * the first hit so subsequent iterations don't re-fetch the same blob.
     * Lifetime is one review — runReview allocates a fresh map.
     */
    cache?: Map<string, string>;
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
