import * as vscode from 'vscode';

import { getEnterpriseBaseUrl } from '../config/settings';

export async function getGithubToken(): Promise<string> {
    const isEnterprise = !!getEnterpriseBaseUrl();
    // 'github-enterprise' is the auth provider id contributed by the official GitHub Authentication ext when Enterprise is configured.
    const providerId = isEnterprise ? 'github-enterprise' : 'github';
    const scopes = ['repo'];
    const session = await vscode.authentication.getSession(providerId, scopes, {
        createIfNone: true,
    });
    return session.accessToken;
}
