import { AgentTool } from './types';
import { Finding, Severity } from '../../types';

const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

interface RawFinding {
    severity: string;
    title: string;
    body: string;
    file: string;
    line: number;
    suggestedFix?: string;
}

interface Input {
    summary: string;
    findings: RawFinding[];
}

export interface SubmitFindingsCapture {
    summary: string;
    findings: Finding[];
}

export function makeSubmitFindingsTool(): {
    tool: AgentTool;
    getResult: () => SubmitFindingsCapture | null;
} {
    let captured: SubmitFindingsCapture | null = null;

    const tool: AgentTool = {
        spec: {
            name: 'submitFindings',
            description:
                'Submit the final structured review. Call this exactly once when the review is complete. Calling this ends the review loop.',
            inputSchema: {
                type: 'object',
                properties: {
                    summary: {
                        type: 'string',
                        description: 'One-paragraph overall review summary.',
                    },
                    findings: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                severity: { type: 'string', enum: SEVERITIES },
                                title: { type: 'string' },
                                body: { type: 'string' },
                                file: { type: 'string', description: 'Workspace-relative path' },
                                line: { type: 'integer', minimum: 1 },
                                suggestedFix: { type: 'string' },
                            },
                            required: ['severity', 'title', 'body', 'file', 'line'],
                        },
                    },
                },
                required: ['summary', 'findings'],
            },
        },
        async invoke(rawInput) {
            const input = rawInput as Input;
            const findings: Finding[] = (input.findings ?? []).map((f, i) => ({
                id: `f${i}`,
                severity: (SEVERITIES.includes(f.severity as Severity)
                    ? f.severity
                    : 'INFO') as Severity,
                title: f.title,
                body: f.body,
                file: f.file,
                line: f.line,
                suggestedFix: f.suggestedFix,
            }));
            captured = { summary: input.summary ?? '', findings };
            return 'findings recorded';
        },
    };

    return { tool, getResult: () => captured };
}
