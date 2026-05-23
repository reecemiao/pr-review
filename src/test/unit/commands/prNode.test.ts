import { describe, expect, it } from 'vitest';

import { extractPrNumber } from '../../../commands/prNode';

describe('extractPrNumber', () => {
    it('returns null for null / undefined / primitives', () => {
        expect(extractPrNumber(null)).toBeNull();
        expect(extractPrNumber(undefined)).toBeNull();
        expect(extractPrNumber(42)).toBeNull();
        expect(extractPrNumber('123')).toBeNull();
    });

    it('extracts from pullRequestModel.number (current GitHub PR extension shape)', () => {
        expect(extractPrNumber({ pullRequestModel: { number: 42 } })).toBe(42);
    });

    it('extracts from pullRequest.number (alternate shape)', () => {
        expect(extractPrNumber({ pullRequest: { number: 7 } })).toBe(7);
    });

    it('extracts from item.number', () => {
        expect(extractPrNumber({ item: { number: 99 } })).toBe(99);
    });

    it('extracts from a top-level prNumber field', () => {
        expect(extractPrNumber({ prNumber: 3 })).toBe(3);
    });

    it('extracts from a top-level number field', () => {
        expect(extractPrNumber({ number: 12 })).toBe(12);
    });

    it('prefers earlier candidates when multiple are present', () => {
        // pullRequestModel.number wins over the others when both are set.
        expect(
            extractPrNumber({
                pullRequestModel: { number: 1 },
                pullRequest: { number: 2 },
                item: { number: 3 },
                prNumber: 4,
                number: 5,
            }),
        ).toBe(1);
    });

    it('returns null when fields exist but are not finite numbers', () => {
        expect(extractPrNumber({ number: NaN })).toBeNull();
        expect(extractPrNumber({ number: Infinity })).toBeNull();
        expect(extractPrNumber({ pullRequestModel: { number: '42' } })).toBeNull();
        expect(extractPrNumber({ pullRequest: {} })).toBeNull();
    });

    it('returns null when none of the known shapes match', () => {
        expect(extractPrNumber({})).toBeNull();
        expect(extractPrNumber({ id: 42, title: 'PR' })).toBeNull();
        expect(extractPrNumber({ pullRequestModel: null })).toBeNull();
    });
});
