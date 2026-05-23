import { getMergeBase } from './branch';
import { git } from './exec';

export interface DiffResult {
    diff: string;
    changedFiles: string[];
    mergeBase: string;
}

export async function getDiffAgainstBase(cwd: string, base: string): Promise<DiffResult> {
    return getDiffBetween(cwd, base, 'HEAD');
}

export async function getDiffBetween(cwd: string, base: string, head: string): Promise<DiffResult> {
    const mergeBase = await getMergeBase(cwd, base, head);
    const range = `${mergeBase}...${head}`;
    const diff = await git(['diff', '--no-color', range], { cwd });
    const nameOnly = await git(['diff', '--name-only', range], { cwd });
    const changedFiles = nameOnly
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    return { diff, changedFiles, mergeBase };
}
