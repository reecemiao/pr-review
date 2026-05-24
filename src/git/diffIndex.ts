/**
 * Parse a unified diff into a per-file index of which (file, line) pairs are
 * commentable in a GitHub review, and on which side.
 *
 * Background: `pulls.createReview` rejects the entire request if any inline
 * comment cites a line that isn't part of the diff hunks, or if the `side`
 * disagrees with the line's role (added/context => RIGHT, deleted => LEFT).
 * Building this index up-front lets us filter findings before submission and
 * fall back to plain-prose mentions for out-of-hunk ones.
 *
 * The parser handles standard `git diff` output:
 *
 *     diff --git a/x b/y
 *     --- a/x
 *     +++ b/y
 *     @@ -5,3 +5,4 @@ context
 *      unchanged line
 *     -deleted line
 *     +added line
 *     +another added
 *
 * Lines starting with `+` are RIGHT-side at the new-file line number.
 * Lines starting with `-` are LEFT-side at the old-file line number.
 * Context lines (` `) live on both sides at the corresponding numbers.
 *
 * Renames and additions/deletions of whole files are supported. Binary diffs
 * and submodule pointers are skipped (they have no commentable line range).
 */

export type Side = 'RIGHT' | 'LEFT';

export interface FileIndex {
    /** Set of new-file line numbers that exist in any hunk (added or context). */
    right: Set<number>;
    /** Set of old-file line numbers that exist in any hunk (deleted or context). */
    left: Set<number>;
}

export type DiffIndex = Map<string, FileIndex>;

/**
 * Look up which side a (file, line) finding should attach to.
 * Returns null when the line isn't on the RIGHT side of any hunk —
 * the caller should NOT submit it as an inline comment.
 *
 * Policy: only RIGHT-side matches qualify. The model reviews the post-change
 * state and is told to cite new-file line numbers; a LEFT-only match would
 * mean the cited line doesn't exist in the new file at all, and matching it
 * to a coincidentally-numbered deleted line attaches the comment to unrelated
 * content. Findings on deleted lines are surfaced in the review body instead.
 */
export function findSide(index: DiffIndex, file: string, line: number): Side | null {
    const f = index.get(file);
    if (!f) {
        return null;
    }
    if (f.right.has(line)) {
        return 'RIGHT';
    }
    return null;
}

export function buildDiffIndex(diff: string): DiffIndex {
    const index: DiffIndex = new Map();
    if (!diff) {
        return index;
    }

    const lines = diff.split(/\r?\n/);
    let currentFile: string | null = null;
    let currentIdx: FileIndex | null = null;
    let oldLine = 0;
    let newLine = 0;
    let inHunk = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // New file section starts with `diff --git`. Reset state; we'll learn
        // the real new path from the next `+++` line below.
        if (line.startsWith('diff --git ')) {
            currentFile = null;
            currentIdx = null;
            inHunk = false;
            continue;
        }

        // The `+++ b/<path>` line carries the new-file path. Use this as the
        // canonical key because GitHub findings cite the new-file path.
        if (line.startsWith('+++ ')) {
            const path = stripDiffPath(line.slice(4));
            if (path === null) {
                // `/dev/null` => file deleted entirely; nothing to comment on.
                currentFile = null;
                currentIdx = null;
                continue;
            }
            currentFile = path;
            currentIdx = index.get(path) ?? { right: new Set(), left: new Set() };
            index.set(path, currentIdx);
            inHunk = false;
            continue;
        }

        // Skip `--- a/<path>`; we already keyed off the `+++` line.
        if (line.startsWith('--- ')) {
            continue;
        }

        // Hunk header: parse the line ranges.
        if (line.startsWith('@@')) {
            const parsed = parseHunkHeader(line);
            if (!parsed) {
                inHunk = false;
                continue;
            }
            oldLine = parsed.oldStart;
            newLine = parsed.newStart;
            inHunk = currentIdx !== null;
            continue;
        }

        if (!inHunk || !currentIdx) {
            continue;
        }

        // Body of a hunk.
        if (line.startsWith('+')) {
            currentIdx.right.add(newLine);
            newLine++;
        } else if (line.startsWith('-')) {
            currentIdx.left.add(oldLine);
            oldLine++;
        } else if (line.startsWith(' ')) {
            // Context line: belongs to both sides.
            currentIdx.right.add(newLine);
            currentIdx.left.add(oldLine);
            newLine++;
            oldLine++;
        } else if (line === '' || line.startsWith('\\')) {
            // Empty line in diff (rare; some diff dialects); or
            // `\ No newline at end of file`. Don't advance counters.
            continue;
        } else {
            // Any other content (e.g. `diff --git` of the next file already
            // handled above, or `Binary files differ`) ends the current hunk.
            inHunk = false;
        }
    }

    return index;
}

function parseHunkHeader(line: string): { oldStart: number; newStart: number } | null {
    // `@@ -<old_start>[,<old_count>] +<new_start>[,<new_count>] @@ [section]`
    const m = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(line);
    if (!m) {
        return null;
    }
    return { oldStart: parseInt(m[1], 10), newStart: parseInt(m[2], 10) };
}

function stripDiffPath(raw: string): string | null {
    // Strip a trailing timestamp if some diff producer added one.
    const tabIdx = raw.indexOf('\t');
    const trimmed = (tabIdx >= 0 ? raw.slice(0, tabIdx) : raw).trim();
    if (trimmed === '/dev/null') {
        return null;
    }
    if (trimmed.startsWith('b/') || trimmed.startsWith('a/')) {
        return trimmed.slice(2);
    }
    return trimmed;
}
