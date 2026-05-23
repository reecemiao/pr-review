import { git } from './exec';

/**
 * Read a file at a specific git ref via `git show <ref>:<path>`.
 * Used by tools when the workspace is on a different branch than the review target
 * (e.g. PR-review-without-checkout mode), so reads must come from git's object store
 * rather than the working tree.
 */
export async function showFileAtRef(cwd: string, ref: string, relPath: string): Promise<string> {
    const out = await git(['show', `${ref}:${relPath}`], { cwd });
    return out;
}

/**
 * List directory entries at a ref via `git ls-tree`.
 * Returns rows like `file\tpath` or `dir\tpath`.
 */
export async function lsTreeAtRef(cwd: string, ref: string, relPath: string): Promise<string[]> {
    const target = relPath === '' || relPath === '.' ? `${ref}:` : `${ref}:${relPath}`;
    const out = await git(['ls-tree', '--name-only', '-z', target], { cwd });
    const names = out.split('\0').filter(Boolean);
    // We need the type, so re-query with --object-only mode is awkward;
    // simpler: a second pass using `git ls-tree <ref> -- <path>` non-name-only to get types.
    const detailed = await git(['ls-tree', '-z', target], { cwd });
    const rows = detailed
        .split('\0')
        .filter(Boolean)
        .map((line) => {
            // Format: <mode> SP <type> SP <object> TAB <name>
            const tabIdx = line.indexOf('\t');
            if (tabIdx < 0) {
                return null;
            }
            const meta = line.slice(0, tabIdx).split(' ');
            const type = meta[1] ?? 'blob';
            const name = line.slice(tabIdx + 1);
            return { type, name };
        })
        .filter((r): r is { type: string; name: string } => r !== null);
    // Map git types to our display kinds
    const seen = new Set<string>();
    const out2: string[] = [];
    for (const r of rows) {
        if (seen.has(r.name)) {
            continue;
        }
        seen.add(r.name);
        const kind = r.type === 'tree' ? 'dir' : r.type === 'blob' ? 'file' : 'other';
        out2.push(`${kind}\t${r.name}`);
    }
    // Note: we computed `names` for sanity but ls-tree -z above is authoritative.
    void names;
    return out2;
}

/**
 * Run `git grep <pattern> <ref>` and return matching `path:line\tcontent` rows.
 */
export async function grepAtRef(
    cwd: string,
    ref: string,
    pattern: string,
    pathspec?: string,
): Promise<string[]> {
    const args = ['grep', '-n', '-E', '--no-color', pattern, ref];
    if (pathspec) {
        args.push('--', pathspec);
    }
    try {
        const out = await git(args, { cwd });
        return out
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => {
                // git grep formats as `<ref>:<path>:<line>:<content>` — drop the ref prefix.
                const refColon = `${ref}:`;
                return line.startsWith(refColon) ? line.slice(refColon.length) : line;
            });
    } catch (err) {
        // git grep exits with code 1 when there are no matches; surface other errors.
        const e = err as { code?: number; stderr?: string };
        if (e.code === 1) {
            return [];
        }
        throw err;
    }
}
