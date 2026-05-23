import * as vscode from 'vscode';

/**
 * "PR Review" Output Channel.
 *
 * Two log levels:
 *   - `log(...)`     — always-on: iteration counts, tool names, durations, errors.
 *   - `logDebug(...)`— gated by `prReview.debugLog` for full prompts / tool I/O.
 *
 * Avoid logging long strings at the always-on level — they balloon the channel.
 * Reach for `logDebug` when you want the user to be able to opt into deep traces.
 */

let channel: vscode.OutputChannel | undefined;
let debugEnabled = false;

export function initLogging(context: vscode.ExtensionContext): vscode.OutputChannel {
    channel = vscode.window.createOutputChannel('PR Review');
    context.subscriptions.push(channel);

    const read = (): boolean =>
        !!vscode.workspace.getConfiguration('prReview').get<boolean>('debugLog');
    debugEnabled = read();

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('prReview.debugLog')) {
                debugEnabled = read();
            }
        }),
    );

    return channel;
}

export function disposeLogging(): void {
    channel?.dispose();
    channel = undefined;
}

export function log(...parts: unknown[]): void {
    if (!channel) {
        return;
    }
    channel.appendLine(`[${timestamp()}] ${parts.map(stringify).join(' ')}`);
}

export function logError(prefix: string, err: unknown): void {
    const message = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    log(`${prefix}:`, message);
}

export function logDebug(...parts: unknown[]): void {
    if (!debugEnabled) {
        return;
    }
    log('[debug]', ...parts);
}

function timestamp(): string {
    return new Date().toISOString().slice(11, 23);
}

function stringify(v: unknown): string {
    if (typeof v === 'string') {
        return v;
    }
    if (v instanceof Error) {
        return `${v.name}: ${v.message}`;
    }
    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
}
