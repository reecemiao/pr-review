import * as vscode from 'vscode';

import { type AgentTool, type ToolContext } from './tools';
import { log, logDebug, logError } from '../logging';
import { type Finding, type ThinkingEffort } from '../types';
import { makeSubmitFindingsTool } from './tools/submitFindings';

export interface AgentRunInput {
    systemPrompt: string;
    userPrompt: string;
    model: vscode.LanguageModelChat;
    tools: AgentTool[];
    ctx: ToolContext;
    maxIterations: number;
    thinkingEffort?: ThinkingEffort;
    token: vscode.CancellationToken;
    onProgress?: (msg: string) => void;
}

export interface AgentRunResult {
    summary: string;
    findings: Finding[];
}

export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
    const {
        systemPrompt,
        userPrompt,
        model,
        tools,
        ctx,
        maxIterations,
        thinkingEffort,
        token,
        onProgress,
    } = input;

    const { tool: submitTool, getResult } = makeSubmitFindingsTool();
    const allTools = [...tools, submitTool];

    const toolByName = new Map(allTools.map((t) => [t.spec.name, t]));
    const toolSpecs = allTools.map((t) => t.spec);

    const messages: vscode.LanguageModelChatMessage[] = [
        vscode.LanguageModelChatMessage.User(systemPrompt),
        vscode.LanguageModelChatMessage.User(userPrompt),
    ];

    const agentStartedAt = Date.now();
    log(
        `agent: start tools=${allTools.length} maxIter=${maxIterations} effort=${thinkingEffort ?? '-'} model=${model.family ?? model.id ?? '?'}`,
    );
    logDebug('agent: system prompt:\n' + systemPrompt);
    logDebug('agent: user prompt:\n' + userPrompt);

    for (let iter = 0; iter < maxIterations; iter++) {
        if (token.isCancellationRequested) {
            log(`agent: cancelled before iter ${iter + 1}`);
            throw new vscode.CancellationError();
        }

        onProgress?.(`Thinking (iteration ${iter + 1}/${maxIterations})…`);
        const iterStartedAt = Date.now();
        log(`agent: iter ${iter + 1}/${maxIterations} sending request`);

        const requestOptions: vscode.LanguageModelChatRequestOptions = { tools: toolSpecs };
        if (thinkingEffort) {
            // Pass via modelOptions; the underlying provider routes the key it understands.
            // OpenAI / gpt-5 / o-series use `reasoning_effort`. Anthropic ignores unknown keys.
            requestOptions.modelOptions = { reasoning_effort: thinkingEffort };
        }
        const response = await model.sendRequest(messages, requestOptions, token);

        const toolCalls: vscode.LanguageModelToolCallPart[] = [];
        const textParts: string[] = [];

        for await (const part of response.stream) {
            if (part instanceof vscode.LanguageModelTextPart) {
                textParts.push(part.value);
            } else if (part instanceof vscode.LanguageModelToolCallPart) {
                toolCalls.push(part);
            }
        }

        log(
            `agent: iter ${iter + 1} response in ${Date.now() - iterStartedAt}ms ` +
                `(${toolCalls.length} tool calls, ${textParts.join('').length}b text)`,
        );

        if (toolCalls.length === 0) {
            const captured = getResult();
            if (captured) {
                log(
                    `agent: done in ${Date.now() - agentStartedAt}ms findings=${captured.findings.length}`,
                );
                return captured;
            }
            // Model gave a final text answer without calling submitFindings — surface as an empty review.
            log(
                `agent: done in ${Date.now() - agentStartedAt}ms findings=0 (no submitFindings call)`,
            );
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
            const callStartedAt = Date.now();
            logDebug(`agent: tool ${call.name} input:`, call.input);
            let resultText: string;
            try {
                if (!tool) {
                    resultText = `error: unknown tool "${call.name}"`;
                } else {
                    resultText = await tool.invoke(call.input, ctx, token);
                }
                log(
                    `agent: tool ${call.name} -> ${resultText.length}b in ${Date.now() - callStartedAt}ms`,
                );
            } catch (err) {
                resultText = `error: ${err instanceof Error ? err.message : String(err)}`;
                logError(`agent: tool ${call.name} threw`, err);
            }
            logDebug(`agent: tool ${call.name} result:\n` + resultText);
            resultParts.push(
                new vscode.LanguageModelToolResultPart(call.callId, [
                    new vscode.LanguageModelTextPart(resultText),
                ]),
            );
        }
        messages.push(vscode.LanguageModelChatMessage.User(resultParts));

        const captured = getResult();
        if (captured) {
            log(
                `agent: done in ${Date.now() - agentStartedAt}ms findings=${captured.findings.length}`,
            );
            return captured;
        }
    }

    log(`agent: hit maxIterations=${maxIterations} after ${Date.now() - agentStartedAt}ms`);
    throw new Error(`Agent did not terminate within ${maxIterations} iterations.`);
}
