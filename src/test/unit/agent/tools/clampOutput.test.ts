import { describe, expect, it } from 'vitest';

import { MAX_TOOL_OUTPUT_BYTES, clampOutput } from '../../../../agent/tools/types';

describe('clampOutput', () => {
    it('returns input unchanged when under the limit', () => {
        const s = 'hello world';
        expect(clampOutput(s)).toBe(s);
    });

    it('returns input unchanged when exactly at the limit', () => {
        const s = 'x'.repeat(MAX_TOOL_OUTPUT_BYTES);
        expect(clampOutput(s)).toBe(s);
    });

    it('truncates and appends a marker when over the limit', () => {
        const overshoot = 137;
        const s = 'x'.repeat(MAX_TOOL_OUTPUT_BYTES + overshoot);
        const result = clampOutput(s);

        expect(result.startsWith('x'.repeat(MAX_TOOL_OUTPUT_BYTES))).toBe(true);
        expect(result).toContain(`[truncated ${overshoot} bytes]`);
    });

    it('handles empty input', () => {
        expect(clampOutput('')).toBe('');
    });
});
