import * as vscode from 'vscode';

import { type AgentTool, type ToolContext } from './tools';
import { type Finding } from '../types';
import { makeSubmitFindingsTool } from './tools/submitFindings';

export interface AgentRunInput {
    systemPrompt: string;
    userPrompt: string;
    model: vscode.LanguageModelChat;
    tools: AgentTool[];
    ctx: ToolContext;
    maxIterations: number;
    token: vscode.CancellationToken;
    onProgress?: (msg: string) => void;
}

export interface AgentRunResult {
    summary: string;
    findings: Finding[];
}

export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
    const { systemPrompt, userPrompt, model, tools, ctx, maxIterations, token, onProgress } = input;

    const { tool: submitTool, getResult } = makeSubmitFindingsTool();
    const allTools = [...tools, submitTool];

    const toolByName = new Map(allTools.map((t) => [t.spec.name, t]));
    const toolSpecs = allTools.map((t) => t.spec);

    const messages: vscode.LanguageModelChatMessage[] = [
        vscode.LanguageModelChatMessage.User(systemPrompt),
        vscode.LanguageModelChatMessage.User(userPrompt),
    ];

    for (let iter = 0; iter < maxIterations; iter++) {
        if (token.isCancellationRequested) {
            throw new vscode.CancellationError();
        }

        onProgress?.(`Thinking (iteration ${iter + 1}/${maxIterations})…`);

        const response = await model.sendRequest(messages, { tools: toolSpecs }, token);

        const toolCalls: vscode.LanguageModelToolCallPart[] = [];
        const textParts: string[] = [];

        for await (const part of response.stream) {
            if (part instanceof vscode.LanguageModelTextPart) {
                textParts.push(part.value);
            } else if (part instanceof vscode.LanguageModelToolCallPart) {
                toolCalls.push(part);
            }
        }

        if (toolCalls.length === 0) {
            const captured = getResult();
            if (captured) {
                return captured;
            }
            // Model gave a final text answer without calling submitFindings — surface as an empty review.
            return {
                summary: textParts.join('').trim() || 'Model ended without calling submitFindings.',
                findings: [],
            };
        }

        // Append assistant turn with tool calls and the corresponding user turn with tool results.
        messages.push(vscode.LanguageModelChatMessage.Assistant([...toolCalls]));

        const resultParts: vscode.LanguageModelToolResultPart[] = [];
        for (const call of toolCalls) {
            onProgress?.(`Calling ${call.name}`);
            const tool = toolByName.get(call.name);
            let resultText: string;
            try {
                if (!tool) {
                    resultText = `error: unknown tool "${call.name}"`;
                } else {
                    resultText = await tool.invoke(call.input, ctx, token);
                }
            } catch (err) {
                resultText = `error: ${err instanceof Error ? err.message : String(err)}`;
            }
            resultParts.push(
                new vscode.LanguageModelToolResultPart(call.callId, [
                    new vscode.LanguageModelTextPart(resultText),
                ]),
            );
        }
        messages.push(vscode.LanguageModelChatMessage.User(resultParts));

        const captured = getResult();
        if (captured) {
            return captured;
        }
    }

    throw new Error(`Agent did not terminate within ${maxIterations} iterations.`);
}
