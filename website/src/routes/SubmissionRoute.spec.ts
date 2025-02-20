import { describe, expect, test } from 'vitest';

import { SubmissionRouteUtils } from './SubmissionRoute';

describe('SubmissionRouteUtils', () => {
    test('parseToRoute - valid portal route', () => {
        expect(SubmissionRouteUtils.parseToRoute('/cchf/submission/123', '')).toEqual({
            name: 'portal',
            organism: 'cchf',
            groupId: 123,
        });
    });

    test('parseToRoute - valid submit route with inputMode', () => {
        expect(SubmissionRouteUtils.parseToRoute('/cchf/submission/123/submit', '?inputMode=form')).toEqual({
            name: 'submit',
            organism: 'cchf',
            groupId: 123,
            inputMode: 'form',
        });
    });

    test('parseToRoute - submit - inputMode defaults to bulk', () => {
        expect(SubmissionRouteUtils.parseToRoute('/cchf/submission/123/submit', '')).toEqual({
            name: 'submit',
            organism: 'cchf',
            groupId: 123,
            inputMode: 'bulk',
        });
    });

    test('parseToRoute - invalid route', () => {
        expect(SubmissionRouteUtils.parseToRoute('/invalid/path', '')).toBeUndefined();
    });

    test('toUrl - portal route', () => {
        expect(SubmissionRouteUtils.toUrl({ name: 'portal', organism: 'cchf', groupId: 123 })).toBe(
            '/cchf/submission/123',
        );
    });

    test('toUrl - submit route', () => {
        expect(SubmissionRouteUtils.toUrl({ name: 'submit', organism: 'cchf', groupId: 123, inputMode: 'bulk' })).toBe(
            '/cchf/submission/123/submit?inputMode=bulk',
        );
        expect(SubmissionRouteUtils.toUrl({ name: 'submit', organism: 'ebola', groupId: 123, inputMode: 'form' })).toBe(
            '/ebola/submission/123/submit?inputMode=form',
        );
    });
});
