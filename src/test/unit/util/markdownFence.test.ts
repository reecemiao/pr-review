import { describe, expect, it } from 'vitest';

import { pickFence } from '../../../util/markdownFence';

describe('pickFence', () => {
    it('returns the minimum 3-backtick fence for plain content', () => {
        expect(pickFence('hello world')).toBe('```');
        expect(pickFence('')).toBe('```');
    });

    it('escalates to 4 backticks when content contains a triple-backtick fence', () => {
        const diff = "diff --git a/x.md\n+```js\n+console.log('hi');\n+```\n";
        expect(pickFence(diff)).toBe('````');
    });

    it('escalates beyond 4 backticks when content has longer fences', () => {
        expect(pickFence('here is ```` four backticks')).toBe('`````');
        expect(pickFence('and here are ````` five')).toBe('``````');
    });

    it('counts only consecutive runs, not totals', () => {
        // Two separate runs of three backticks each — still need only 4.
        const content = '``` first\nthen ``` second';
        expect(pickFence(content)).toBe('````');
    });

    it('handles a fence at the very end of the content', () => {
        expect(pickFence('text\n```')).toBe('````');
    });
});
