/**
 * Choose a backtick fence longer than any run of backticks inside `content`.
 *
 * Prevents content that contains its own ``` (e.g. a diff that touches a
 * markdown file with code blocks) from prematurely closing the surrounding
 * fenced code block in a Markdown / chat prompt.
 *
 * Always returns at least 3 backticks.
 */
export function pickFence(content: string): string {
    let longest = 0;
    const re = /`+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
        if (m[0].length > longest) {
            longest = m[0].length;
        }
    }
    return '`'.repeat(Math.max(3, longest + 1));
}
