import { git } from './exec';
import { getMergeBase } from './branch';

export interface DiffResult {
    diff: string;
    changedFiles: string[];
    mergeBase: string;
}

export async function getDiffAgainstBase(cwd: string, base: string): Promise<DiffResult> {
    const mergeBase = await getMergeBase(cwd, base, 'HEAD');
    const diff = await git(['diff', '--no-color', `${mergeBase}...HEAD`], { cwd });
    const nameOnly = await git(['diff', '--name-only', `${mergeBase}...HEAD`], { cwd });
    const changedFiles = nameOnly
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    return { diff, changedFiles, mergeBase };
}
