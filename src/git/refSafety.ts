/**
 * Guard against model-supplied ref strings being interpreted as git options.
 *
 * `execFile('git', ['show', ref, …])` blocks shell injection, but git itself
 * still parses `-`-prefixed arguments as options (e.g. `--upload-pack=…`,
 * `-c core.fsmonitor=…`). Reject any value that would be parsed as an option
 * before it reaches the `git` binary.
 *
 * Apply to any ref / pathspec value that originates from outside the
 * extension (LLM tool input, user input boxes, GitHub API responses).
 */
export function assertSafeRef(ref: string, label = 'ref'): void {
    if (typeof ref !== 'string' || ref.length === 0) {
        throw new Error(`Invalid ${label}: must be a non-empty string.`);
    }
    if (ref.startsWith('-')) {
        throw new Error(
            `Invalid ${label} "${ref}": refs starting with "-" are rejected to prevent option injection.`,
        );
    }
    if (ref.includes('\0')) {
        throw new Error(`Invalid ${label}: NUL byte not allowed.`);
    }
}

/** Convenience helper for `ref:path` expressions accepted by `git show`. */
export function assertSafeRefPath(refPath: string, label = 'ref:path'): void {
    assertSafeRef(refPath, label);
}
