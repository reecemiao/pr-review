import { registerRunReview } from './commands/runReview';

import type * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(...registerRunReview(context));
}

export function deactivate(): void {
    // no-op
}
