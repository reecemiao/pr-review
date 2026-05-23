import * as vscode from 'vscode';

import { type ThinkingEffort, type ToolScope } from '../types';

const SECTION = 'prReview';

function cfg(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(SECTION);
}

export function getBaseBranch(): string {
    return cfg().get<string>('baseBranch', 'origin/master');
}

export function getModelSelector(): { vendor: string; family: string } {
    return {
        vendor: cfg().get<string>('model.vendor', 'copilot'),
        family: cfg().get<string>('model.family', 'gpt-4o'),
    };
}

export function getToolScope(): ToolScope {
    return cfg().get<ToolScope>('toolScope', 'read-only');
}

export function getExtraInstructions(): Record<string, string> {
    return cfg().get<Record<string, string>>('extraInstructions', {});
}

export function getEnterpriseBaseUrl(): string | undefined {
    const v = cfg().get<string>('githubEnterprise.baseUrl', '').trim();
    return v ? v : undefined;
}

export function getMaxAgentIterations(): number {
    return cfg().get<number>('maxAgentIterations', 20);
}

export function getThinkingEffort(): ThinkingEffort {
    return cfg().get<ThinkingEffort>('thinkingEffort', 'medium');
}
