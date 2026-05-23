import { describe, expect, it } from 'vitest';

import { type Finding, severityToDecision } from '../../types';

function f(severity: Finding['severity']): Finding {
    return {
        id: 'x',
        severity,
        title: 't',
        body: 'b',
        file: 'a.ts',
        line: 1,
    };
}

describe('severityToDecision', () => {
    it('approves when there are no findings', () => {
        expect(severityToDecision([])).toBe('APPROVE');
    });

    it('requests changes if any finding is CRITICAL', () => {
        expect(severityToDecision([f('INFO'), f('CRITICAL')])).toBe('REQUEST_CHANGES');
    });

    it('requests changes if any finding is HIGH', () => {
        expect(severityToDecision([f('HIGH')])).toBe('REQUEST_CHANGES');
    });

    it('comments for MEDIUM-and-below only', () => {
        expect(severityToDecision([f('MEDIUM'), f('LOW'), f('INFO')])).toBe('COMMENT');
    });

    it('prioritizes blocking severity even with many lower findings', () => {
        const many = [...Array(10)].map(() => f('LOW'));
        expect(severityToDecision([...many, f('CRITICAL')])).toBe('REQUEST_CHANGES');
    });
});
