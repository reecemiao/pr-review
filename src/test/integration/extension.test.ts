import * as assert from 'assert';

import * as vscode from 'vscode';

const EXPECTED_COMMANDS = [
    'prReview.run',
    'prReview.reviewBranch',
    'prReview.reviewPrNoCheckout',
    'prReview.reviewPrCheckout',
    'prReview.reviewPrWorktree',
];

// vscode-test loads the extension under "<publisher>.pr-review"; publisher is "undefined_publisher"
// when package.json has none. Tolerate both rather than hardcoding.
function findExtension(): vscode.Extension<unknown> | undefined {
    return vscode.extensions.all.find((e) => e.packageJSON?.name === 'pr-review');
}

suite('PR Review extension', () => {
    test('is present in the extensions registry', () => {
        const ext = findExtension();
        assert.ok(ext, 'extension "pr-review" should be discoverable');
    });

    test('activates successfully', async () => {
        const ext = findExtension();
        assert.ok(ext);
        await ext.activate();
        assert.strictEqual(ext.isActive, true);
    });

    test('registers its contributed commands', async () => {
        const ext = findExtension();
        await ext?.activate();

        const all = await vscode.commands.getCommands(true);
        for (const cmd of EXPECTED_COMMANDS) {
            assert.ok(all.includes(cmd), `expected command "${cmd}" to be registered`);
        }
    });
});
