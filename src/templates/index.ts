import * as vscode from 'vscode';
import * as path from 'path';
import { getExtraInstructions } from '../config/settings';

const EXT_TO_LANG: Record<string, string> = {
    '.py': 'python',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'typescript',
    '.jsx': 'typescript',
    '.mjs': 'typescript',
    '.cjs': 'typescript',
};

const LANG_TO_TEMPLATE: Record<string, string> = {
    python: 'python-reviewer.md',
    typescript: 'typescript-reviewer.md',
};

export function detectLanguages(changedFiles: string[]): string[] {
    const langs = new Set<string>();
    for (const f of changedFiles) {
        const ext = path.extname(f).toLowerCase();
        const lang = EXT_TO_LANG[ext];
        if (lang) {
            langs.add(lang);
        }
    }
    return [...langs];
}

async function readBundled(extensionUri: vscode.Uri, file: string): Promise<string> {
    const uri = vscode.Uri.joinPath(extensionUri, 'templates', file);
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder('utf-8').decode(bytes);
}

async function readWorkspaceFile(workspace: vscode.Uri, relPath: string): Promise<string | null> {
    try {
        const uri = vscode.Uri.joinPath(workspace, relPath);
        const bytes = await vscode.workspace.fs.readFile(uri);
        return new TextDecoder('utf-8').decode(bytes);
    } catch {
        return null;
    }
}

const SUBMIT_FINDINGS_INSTRUCTION = `

---

## How to deliver findings

You MUST call the \`submitFindings\` tool exactly once when you are done. Do not include findings in prose. The tool input is the structured list of findings; calling it ends the review.

Use the tool's schema for severity: CRITICAL, HIGH, MEDIUM, LOW, or INFO. Map this to the Approval Criteria above when deciding severities.
`;

export interface LoadedTemplate {
    systemPrompt: string;
    languages: string[];
}

export async function loadTemplate(
    extensionUri: vscode.Uri,
    workspace: vscode.Uri,
    changedFiles: string[],
): Promise<LoadedTemplate> {
    const languages = detectLanguages(changedFiles);
    const extras = getExtraInstructions();

    const parts: string[] = [];

    if (languages.length === 0) {
        parts.push(await readBundled(extensionUri, 'generic-reviewer.md'));
    } else {
        for (const lang of languages) {
            const tmplFile = LANG_TO_TEMPLATE[lang];
            if (tmplFile) {
                parts.push(await readBundled(extensionUri, tmplFile));
            }
            const extra = extras[lang];
            if (extra) {
                const content = await readWorkspaceFile(workspace, extra);
                if (content) {
                    parts.push(`\n\n## Additional instructions (${lang})\n\n${content}`);
                }
            }
        }
        if (parts.length === 0) {
            parts.push(await readBundled(extensionUri, 'generic-reviewer.md'));
        }
    }

    parts.push(SUBMIT_FINDINGS_INSTRUCTION);

    return {
        systemPrompt: parts.join('\n\n'),
        languages,
    };
}
