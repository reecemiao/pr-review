import { describe, expect, it } from 'vitest';

import { parseRepoSlug } from '../../../git/branch';

describe('parseRepoSlug', () => {
    it('parses SSH urls', () => {
        expect(parseRepoSlug('git@github.com:acme/widgets.git')).toEqual({
            host: 'github.com',
            owner: 'acme',
            name: 'widgets',
        });
    });

    it('parses SSH urls without .git suffix', () => {
        expect(parseRepoSlug('git@github.example.com:org/repo')).toEqual({
            host: 'github.example.com',
            owner: 'org',
            name: 'repo',
        });
    });

    it('parses HTTPS urls', () => {
        expect(parseRepoSlug('https://github.com/acme/widgets.git')).toEqual({
            host: 'github.com',
            owner: 'acme',
            name: 'widgets',
        });
    });

    it('parses HTTPS urls without .git suffix', () => {
        expect(parseRepoSlug('https://github.example.com/org/repo')).toEqual({
            host: 'github.example.com',
            owner: 'org',
            name: 'repo',
        });
    });

    it('parses HTTPS urls with trailing slash', () => {
        expect(parseRepoSlug('https://github.com/acme/widgets/')).toEqual({
            host: 'github.com',
            owner: 'acme',
            name: 'widgets',
        });
    });

    it('parses HTTP urls (not just HTTPS)', () => {
        expect(parseRepoSlug('http://internal.example/team/repo.git')).toEqual({
            host: 'internal.example',
            owner: 'team',
            name: 'repo',
        });
    });

    it('handles repo names that contain dots (but not .git)', () => {
        expect(parseRepoSlug('git@github.com:acme/my.cool.repo.git')).toEqual({
            host: 'github.com',
            owner: 'acme',
            name: 'my.cool.repo',
        });
    });

    it('returns null for unrecognized formats', () => {
        expect(parseRepoSlug('not a url at all')).toBeNull();
        expect(parseRepoSlug('')).toBeNull();
        expect(parseRepoSlug('ftp://example.com/foo/bar')).toBeNull();
    });
});
