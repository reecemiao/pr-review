import { git } from './exec';
import { assertSafeRef } from './refSafety';

/**
 * Read a file at a specific git ref via `git show <ref>:<path>`.
 * Used by tools when the workspace is on a different branch than the review target
 * (e.g. PR-review-without-checkout mode), so reads must come from git's object store
 * rather than the working tree.
 */
export async function showFileAtRef(cwd: string, ref: string, relPath: string): Promise<string> {
    assertSafeRef(ref);
    const out = await git(['show', `${ref}:${relPath}`], { cwd });
    return out;
}

/**
 * List directory entries at a ref via `git ls-tree`.
 * Returns rows like `file\tpath` or `dir\tpath`.
 */
export async function lsTreeAtRef(cwd: string, ref: string, relPath: string): Promise<string[]> {
    assertSafeRef(ref);
    const target = relPath === '' || relPath === '.' ? `${ref}:` : `${ref}:${relPath}`;
    // Single `ls-tree -z` call gives us mode/type/object/name; parse types from it directly.
    const out = await git(['ls-tree', '-z', target], { cwd });
    const seen = new Set<string>();
    const rows: string[] = [];
    for (const entry of out.split('\0')) {
        if (!entry) {
            continue;
        }
        // Format: <mode> SP <type> SP <object> TAB <name>
        const tabIdx = entry.indexOf('\t');
        if (tabIdx < 0) {
            continue;
        }
        const meta = entry.slice(0, tabIdx).split(' ');
        const type = meta[1] ?? 'blob';
        const name = entry.slice(tabIdx + 1);
        if (seen.has(name)) {
            continue;
        }
        seen.add(name);
        const kind = type === 'tree' ? 'dir' : type === 'blob' ? 'file' : 'other';
        rows.push(`${kind}\t${name}`);
    }
    return rows;
}

/**
 * Run `git grep <pattern> <ref>` and return matching `path:line\tcontent` rows.
 * Capped per-file via `-m` and globally via early-return to keep memory bounded
 * even for high-cardinality matches.
 */
export async function grepAtRef(
    cwd: string,
    ref: string,
    pattern: string,
    pathspec: string | undefined,
    maxResults: number,
): Promise<string[]> {
    assertSafeRef(ref);
    const args = [
        'grep',
        '-n',
        '-E',
        '--no-color',
        // Per-file match cap. Most callers ask for ~100 total results, so 50 per
        // file is plenty without letting one noisy file flood the buffer.
        `-m${Math.max(1, Math.min(maxResults, 50))}`,
        pattern,
        ref,
    ];
    if (pathspec) {
        args.push('--', pathspec);
    }
    let out: string;
    try {
        out = await git(args, { cwd });
    } catch (err) {
        // git grep exits with code 1 when there are no matches; surface other errors.
        const e = err as { code?: number };
        if (e.code === 1) {
            return [];
        }
        throw err;
    }
    const refColon = `${ref}:`;
    const rows: string[] = [];
    for (const line of out.split(/\r?\n/)) {
        if (!line) {
            continue;
        }
        // git grep formats as `<ref>:<path>:<line>:<content>` — drop the ref prefix.
        rows.push(line.startsWith(refColon) ? line.slice(refColon.length) : line);
        if (rows.length >= maxResults) {
            break;
        }
    }
    return rows;
}
