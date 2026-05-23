import { gitShowTool } from './gitShow';
import { grepTool } from './grep';
import { runLinterTool } from './linters';
import { listDirTool } from './listDir';
import { readFileTool } from './readFile';
import { runShellTool } from './shell';
import { AgentTool } from './types';
import { ToolScope } from '../../types';

export { makeSubmitFindingsTool } from './submitFindings';
export type { AgentTool, ToolContext } from './types';

export function getToolsForScope(scope: ToolScope): AgentTool[] {
    const base = [readFileTool, listDirTool, grepTool, gitShowTool];
    if (scope === 'read-only') {
        return base;
    }
    if (scope === 'read-only-with-linters') {
        return [...base, runLinterTool];
    }
    return [...base, runLinterTool, runShellTool];
}
