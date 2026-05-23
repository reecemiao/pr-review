import { describe, expect, it } from 'vitest';

import { makeSubmitFindingsTool } from '../../../../agent/tools/submitFindings';

type Ctx = Parameters<ReturnType<typeof makeSubmitFindingsTool>['tool']['invoke']>[1];
type Token = Parameters<ReturnType<typeof makeSubmitFindingsTool>['tool']['invoke']>[2];

const dummyCtx = {} as unknown as Ctx;
const dummyToken = {} as unknown as Token;

describe('makeSubmitFindingsTool', () => {
    it('returns null from getResult before invoke is called', () => {
        const { getResult } = makeSubmitFindingsTool();
        expect(getResult()).toBeNull();
    });

    it('captures the summary and assigns sequential IDs to findings', async () => {
        const { tool, getResult } = makeSubmitFindingsTool();

        await tool.invoke(
            {
                summary: 'looks good',
                findings: [
                    { severity: 'HIGH', title: 'one', body: 'b1', file: 'a.ts', line: 10 },
                    {
                        severity: 'LOW',
                        title: 'two',
                        body: 'b2',
                        file: 'b.ts',
                        line: 20,
                        suggestedFix: 'fix me',
                    },
                ],
            },
            dummyCtx,
            dummyToken,
        );

        const result = getResult();
        expect(result).not.toBeNull();
        expect(result!.summary).toBe('looks good');
        expect(result!.findings).toHaveLength(2);
        expect(result!.findings[0]).toMatchObject({
            id: 'f0',
            severity: 'HIGH',
            title: 'one',
            file: 'a.ts',
            line: 10,
        });
        expect(result!.findings[1]).toMatchObject({
            id: 'f1',
            severity: 'LOW',
            suggestedFix: 'fix me',
        });
    });

    it('coerces unknown severity values to INFO', async () => {
        const { tool, getResult } = makeSubmitFindingsTool();

        await tool.invoke(
            {
                summary: '',
                findings: [
                    { severity: 'BANANAS', title: 't', body: 'b', file: 'a.ts', line: 1 },
                    { severity: 'critical', title: 't', body: 'b', file: 'a.ts', line: 1 },
                ],
            },
            dummyCtx,
            dummyToken,
        );

        const findings = getResult()!.findings;
        expect(findings[0].severity).toBe('INFO');
        // lowercase doesn't match the enum, so it also becomes INFO.
        expect(findings[1].severity).toBe('INFO');
    });

    it('defaults missing summary to empty string', async () => {
        const { tool, getResult } = makeSubmitFindingsTool();
        await tool.invoke({ findings: [] }, dummyCtx, dummyToken);
        expect(getResult()).toEqual({ summary: '', findings: [] });
    });

    it('tolerates missing findings array', async () => {
        const { tool, getResult } = makeSubmitFindingsTool();
        await tool.invoke({ summary: 'hi' }, dummyCtx, dummyToken);
        expect(getResult()).toEqual({ summary: 'hi', findings: [] });
    });

    it('returns "findings recorded" as the tool result text', async () => {
        const { tool } = makeSubmitFindingsTool();
        const result = await tool.invoke({ summary: 's', findings: [] }, dummyCtx, dummyToken);
        expect(result).toBe('findings recorded');
    });

    it('each instance has independent capture state', async () => {
        const a = makeSubmitFindingsTool();
        const b = makeSubmitFindingsTool();

        await a.tool.invoke({ summary: 'A', findings: [] }, dummyCtx, dummyToken);

        expect(a.getResult()!.summary).toBe('A');
        expect(b.getResult()).toBeNull();
    });
});
