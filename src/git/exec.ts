import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);

export interface GitExecOptions {
    cwd: string;
    maxBuffer?: number;
}

export async function git(args: string[], opts: GitExecOptions): Promise<string> {
    const { stdout } = await execFileP('git', args, {
        cwd: opts.cwd,
        maxBuffer: opts.maxBuffer ?? 32 * 1024 * 1024,
        windowsHide: true,
    });
    return stdout;
}
