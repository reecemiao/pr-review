import * as vscode from 'vscode';
import { registerRunReview } from './commands/runReview';

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(...registerRunReview(context));
}

export function deactivate(): void {
    // no-op
}
