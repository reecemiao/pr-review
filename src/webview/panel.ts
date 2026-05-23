import * as vscode from 'vscode';
import { ReviewResult, SubmitPayload, Finding, ReviewDecision } from '../types';
import { ToWebview, FromWebview } from './types';

export interface ReviewPanelCallbacks {
    onSubmit(payload: SubmitPayload): Promise<{ ok: true; url: string } | { ok: false; error: string }>;
    onOpenFile(file: string, line: number): Promise<void>;
    onCopyMarkdown(findings: Finding[], decision: ReviewDecision, summary: string): Promise<void>;
}

export class ReviewPanel {
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];

    static create(
        extensionUri: vscode.Uri,
        result: ReviewResult,
        callbacks: ReviewPanelCallbacks,
    ): ReviewPanel {
        const panel = vscode.window.createWebviewPanel(
            'prReview.reviewPanel',
            `Review: ${result.headBranch}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
            },
        );
        return new ReviewPanel(panel, extensionUri, result, callbacks);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        result: ReviewResult,
        callbacks: ReviewPanelCallbacks,
    ) {
        this.panel = panel;

        const mediaRoot = vscode.Uri.joinPath(extensionUri, 'media');
        const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'main.js'));
        const styleUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'main.css'));
        const nonce = makeNonce();

        panel.webview.html = renderHtml(panel.webview.cspSource, nonce, scriptUri, styleUri);

        this.disposables.push(
            panel.webview.onDidReceiveMessage(async (msg: FromWebview) => {
                if (msg.kind === 'openFile') {
                    await callbacks.onOpenFile(msg.file, msg.line);
                } else if (msg.kind === 'submit') {
                    const r = await callbacks.onSubmit(msg.payload);
                    this.post(
                        r.ok
                            ? { kind: 'submitResult', ok: true, url: r.url }
                            : { kind: 'submitResult', ok: false, error: r.error },
                    );
                } else if (msg.kind === 'copyMarkdown') {
                    await callbacks.onCopyMarkdown(msg.payload.findings, msg.payload.decision, msg.payload.summary);
                }
            }),
            panel.onDidDispose(() => this.dispose()),
        );

        // Defer init until webview is ready.
        queueMicrotask(() => this.post({ kind: 'init', result }));
    }

    post(msg: ToWebview): void {
        this.panel.webview.postMessage(msg);
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables = [];
    }
}

function renderHtml(cspSource: string, nonce: string, scriptUri: vscode.Uri, styleUri: vscode.Uri): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src ${cspSource}; script-src 'nonce-${nonce}'; img-src ${cspSource} data:;" />
    <link href="${styleUri}" rel="stylesheet" />
    <title>PR Review</title>
</head>
<body>
    <div id="root">Loading review…</div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function makeNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < 32; i++) {
        s += chars[Math.floor(Math.random() * chars.length)];
    }
    return s;
}
