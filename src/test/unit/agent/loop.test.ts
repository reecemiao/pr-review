import { describe, expect, it } from 'vitest';
import * as vscode from 'vscode';

import { runAgent } from '../../../agent/loop';
import { type AgentTool, type ToolContext } from '../../../agent/tools';

interface MockTurn {
    text?: string;
    toolCalls?: Array<{ callId: string; name: string; input?: unknown }>;
}

interface MockMessage {
    role: 'user' | 'assistant';
    content: unknown;
}

const noopToken: vscode.CancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => undefined }),
};

const mockCtx: ToolContext = {
    cwd: '/tmp',
    ref: undefined,
    changedFiles: [],
    cache: new Map<string, string>(),
};

function makeMockModel(turns: MockTurn[]): {
    model: vscode.LanguageModelChat;
    sentSnapshots: MockMessage[][];
} {
    let i = 0;
    const sentSnapshots: MockMessage[][] = [];
    const model = {
        id: 'mock-id',
        family: 'mock',
        vendor: 'mock',
        name: 'mock',
        version: '1',
        maxInputTokens: 1024,
        sendRequest: (messages: MockMessage[]) => {
            sentSnapshots.push([...messages]);
            const turn = turns[i++];
            if (!turn) {
                throw new Error(`mock model exhausted at turn ${i}`);
            }
            return Promise.resolve({
                text: (async function* () {})(),
                stream: (async function* () {
                    if (turn.text) {
                        yield new vscode.LanguageModelTextPart(turn.text);
                    }
                    for (const tc of turn.toolCalls ?? []) {
                        yield new vscode.LanguageModelToolCallPart(
                            tc.callId,
                            tc.name,
                            tc.input ?? {},
                        );
                    }
                })(),
            });
        },
        countTokens: () => Promise.resolve(0),
    };
    return { model: model as unknown as vscode.LanguageModelChat, sentSnapshots };
}

function makeTool(
    name: string,
    invoke: (input: unknown) => Promise<string> = async () => `${name}-result`,
): AgentTool {
    return {
        spec: {
            name,
            description: '',
            inputSchema: { type: 'object', properties: {} },
        } as unknown as vscode.LanguageModelChatTool,
        invoke,
    };
}

const submitFindingsCall = (
    callId: string,
    summary: string,
    findings: Array<Record<string, unknown>> = [],
) => ({
    callId,
    name: 'submitFindings',
    input: { summary, findings },
});

describe('runAgent', () => {
    it('terminates when submitFindings is called and returns the captured findings', async () => {
        const { model } = makeMockModel([
            {
                toolCalls: [
                    submitFindingsCall('c1', 'looks good', [
                        {
                            severity: 'INFO',
                            title: 'nit',
                            body: 'consider renaming',
                            file: 'src/x.ts',
                            line: 12,
                        },
                    ]),
                ],
            },
        ]);
        const result = await runAgent({
            systemPrompt: 'sys',
            userPrompt: 'user',
            model,
            tools: [],
            ctx: mockCtx,
            maxIterations: 5,
            token: noopToken,
        });
        expect(result.summary).toBe('looks good');
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0].title).toBe('nit');
        expect(result.findings[0].severity).toBe('INFO');
    });

    it("preserves the model's prose alongside tool calls in the assistant turn", async () => {
        const readTool = makeTool('readFile');
        const { model, sentSnapshots } = makeMockModel([
            {
                text: 'I will check the imports first.',
                toolCalls: [{ callId: 'c1', name: 'readFile' }],
            },
            {
                toolCalls: [submitFindingsCall('c2', 'done')],
            },
        ]);
        await runAgent({
            systemPrompt: 'sys',
            userPrompt: 'user',
            model,
            tools: [readTool],
            ctx: mockCtx,
            maxIterations: 5,
            token: noopToken,
        });
        // The second sendRequest must see an assistant turn whose content has
        // BOTH the model's prose (as a LanguageModelTextPart) and the tool
        // call (as a LanguageModelToolCallPart). Before the fix the text was
        // dropped, so iteration N+1 lost the mid-loop reasoning.
        const secondCall = sentSnapshots[1];
        const assistant = secondCall.find((m) => m.role === 'assistant');
        expect(assistant).toBeDefined();
        const parts = assistant?.content as unknown[];
        const hasText = parts.some(
            (p): p is vscode.LanguageModelTextPart =>
                p instanceof vscode.LanguageModelTextPart &&
                p.value === 'I will check the imports first.',
        );
        const hasToolCall = parts.some(
            (p): p is vscode.LanguageModelToolCallPart =>
                p instanceof vscode.LanguageModelToolCallPart && p.callId === 'c1',
        );
        expect(hasText).toBe(true);
        expect(hasToolCall).toBe(true);
    });

    it('does not push an empty TextPart when the model emits no prose', async () => {
        const readTool = makeTool('readFile');
        const { model, sentSnapshots } = makeMockModel([
            {
                // No text — only a tool call.
                toolCalls: [{ callId: 'c1', name: 'readFile' }],
            },
            {
                toolCalls: [submitFindingsCall('c2', 'ok')],
            },
        ]);
        await runAgent({
            systemPrompt: 'sys',
            userPrompt: 'user',
            model,
            tools: [readTool],
            ctx: mockCtx,
            maxIterations: 5,
            token: noopToken,
        });
        const secondCall = sentSnapshots[1];
        const assistant = secondCall.find((m) => m.role === 'assistant');
        const parts = assistant?.content as unknown[];
        expect(parts).toHaveLength(1);
        expect(parts[0]).toBeInstanceOf(vscode.LanguageModelToolCallPart);
    });

    it('runs same-iteration tool calls in parallel', async () => {
        let active = 0;
        let peakActive = 0;
        const slow = (name: string) =>
            makeTool(name, async () => {
                active++;
                peakActive = Math.max(peakActive, active);
                await new Promise((r) => setTimeout(r, 30));
                active--;
                return `${name}-ok`;
            });
        const { model } = makeMockModel([
            {
                toolCalls: [
                    { callId: 'a', name: 'readFile' },
                    { callId: 'b', name: 'grep' },
                    { callId: 'c', name: 'listDir' },
                ],
            },
            {
                toolCalls: [submitFindingsCall('d', 'ok')],
            },
        ]);
        await runAgent({
            systemPrompt: 'sys',
            userPrompt: 'user',
            model,
            tools: [slow('readFile'), slow('grep'), slow('listDir')],
            ctx: mockCtx,
            maxIterations: 5,
            token: noopToken,
        });
        // If tool calls were serialized, peakActive would be 1. With
        // Promise.all all three are in-flight at once.
        expect(peakActive).toBe(3);
    });

    it('preserves tool-result order even when later calls finish first', async () => {
        // Tool that sleeps `input.delayMs` before returning. The first call
        // (A) is deliberately the slowest, so a wrong implementation that
        // returns results in finish-order would put B/C before A.
        const orderedTool = makeTool('read', async (input) => {
            const { id, delayMs } = input as { id: string; delayMs: number };
            await new Promise((r) => setTimeout(r, delayMs));
            return `done:${id}`;
        });
        const { model, sentSnapshots } = makeMockModel([
            {
                toolCalls: [
                    { callId: 'A', name: 'read', input: { id: 'A', delayMs: 50 } },
                    { callId: 'B', name: 'read', input: { id: 'B', delayMs: 5 } },
                    { callId: 'C', name: 'read', input: { id: 'C', delayMs: 25 } },
                ],
            },
            {
                toolCalls: [submitFindingsCall('D', 'ok')],
            },
        ]);
        await runAgent({
            systemPrompt: 'sys',
            userPrompt: 'user',
            model,
            tools: [orderedTool],
            ctx: mockCtx,
            maxIterations: 5,
            token: noopToken,
        });
        // The user message appended after iter 1 (the tool-results turn) is
        // the most recent message visible at iter 2.
        const secondCall = sentSnapshots[1];
        const lastUserTurn = secondCall[secondCall.length - 1];
        const resultParts = lastUserTurn.content as vscode.LanguageModelToolResultPart[];
        expect(resultParts.map((p) => p.callId)).toEqual(['A', 'B', 'C']);
    });

    it('continues after an "unknown tool" call by returning an error string to the model', async () => {
        const { model, sentSnapshots } = makeMockModel([
            {
                toolCalls: [{ callId: 'c1', name: 'mysteryTool' }],
            },
            {
                toolCalls: [submitFindingsCall('c2', 'recovered')],
            },
        ]);
        const result = await runAgent({
            systemPrompt: 'sys',
            userPrompt: 'user',
            model,
            tools: [],
            ctx: mockCtx,
            maxIterations: 5,
            token: noopToken,
        });
        expect(result.summary).toBe('recovered');
        // The error message was passed back to the model so it could recover.
        const secondCall = sentSnapshots[1];
        const lastUserTurn = secondCall[secondCall.length - 1];
        const parts = lastUserTurn.content as vscode.LanguageModelToolResultPart[];
        const textInside = (parts[0].content[0] as vscode.LanguageModelTextPart).value;
        expect(textInside).toMatch(/unknown tool/);
    });

    it('throws when maxIterations is reached without submitFindings', async () => {
        const noopTool = makeTool('readFile');
        const turns: MockTurn[] = Array.from({ length: 3 }, () => ({
            toolCalls: [{ callId: 'x', name: 'readFile' }],
        }));
        const { model } = makeMockModel(turns);
        await expect(
            runAgent({
                systemPrompt: 'sys',
                userPrompt: 'user',
                model,
                tools: [noopTool],
                ctx: mockCtx,
                maxIterations: 3,
                token: noopToken,
            }),
        ).rejects.toThrow(/did not terminate within 3 iterations/);
    });

    it('returns the final text as summary when the model exits without calling submitFindings', async () => {
        const { model } = makeMockModel([
            {
                text: 'Nothing to flag here.',
                // No tool calls — graceful exit.
            },
        ]);
        const result = await runAgent({
            systemPrompt: 'sys',
            userPrompt: 'user',
            model,
            tools: [],
            ctx: mockCtx,
            maxIterations: 5,
            token: noopToken,
        });
        expect(result.summary).toBe('Nothing to flag here.');
        expect(result.findings).toEqual([]);
    });
});
