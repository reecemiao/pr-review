import * as path from 'path';

import * as vscode from 'vscode';

import { getExtraInstructions } from '../config/settings';

const EXT_TO_LANG: Record<string, string> = {
    '.py': 'python',
    // `.pyi` stub files are first-class Python — mypy/ruff/pyright all
    // treat them as source. Without this, a PR touching only stubs would
    // fall through to the generic reviewer.
    '.pyi': 'python',
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

async function readRepoFile(gitRoot: vscode.Uri, relPath: string): Promise<string | null> {
    try {
        const uri = vscode.Uri.joinPath(gitRoot, relPath);
        const bytes = await vscode.workspace.fs.readFile(uri);
        return new TextDecoder('utf-8').decode(bytes);
    } catch {
        return null;
    }
}

const TOOL_USAGE_INSTRUCTION = `

---

## How to use tools efficiently

You operate in a tool-calling loop with a per-review iteration cap. **One iteration is one model response, regardless of how many tool calls it contains.** A response that emits five parallel tool calls counts as one iteration, not five.

- When you need multiple **independent** reads — different files, unrelated greps, listings of separate directories — emit them as multiple tool calls in a **single** response. They run in parallel and their results come back together in the next turn. Serializing the same calls across iterations is strictly more expensive with no benefit.
- Only chain calls across iterations when a later call genuinely depends on an earlier result.
- Do not duplicate reads: \`readFile\` and \`gitShow\` results are cached for the review, so re-requesting the same path wastes a slot in your output without giving you new information.
`;

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

/**
 * Build the agent's system prompt.
 *
 *  - `extensionUri` is where the bundled `templates/*.md` files live.
 *  - `gitRoot` is the repo's top-level. `prReview.extraInstructions` values
 *    are resolved relative to this — NOT the VS Code workspace folder —
 *    so the same setting works whether the user opens the repo root or a
 *    subdirectory (monorepo case), and so all roots in a multi-root
 *    workspace see the same file when they share a repo.
 */
export async function loadTemplate(
    extensionUri: vscode.Uri,
    gitRoot: vscode.Uri,
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
                const content = await readRepoFile(gitRoot, extra);
                if (content) {
                    parts.push(`\n\n## Additional instructions (${lang})\n\n${content}`);
                }
            }
        }
        if (parts.length === 0) {
            parts.push(await readBundled(extensionUri, 'generic-reviewer.md'));
        }
    }

    parts.push(TOOL_USAGE_INSTRUCTION);
    parts.push(SUBMIT_FINDINGS_INSTRUCTION);

    return {
        systemPrompt: parts.join('\n\n'),
        languages,
    };
}
