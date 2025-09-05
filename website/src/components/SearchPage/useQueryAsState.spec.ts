/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import useQueryAsState from './useQueryAsState';

describe('useQueryAsState', () => {
    let replaceStateMock: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // Mock window.location.search
        Object.defineProperty(window, 'location', {
            value: {
                search: '?key=value',
                pathname: '/test',
                host: 'localhost:3000',
                protocol: 'http:',
            },
            writable: true,
        });

        // Mock window.history.replaceState
        replaceStateMock = vi.spyOn(window.history, 'replaceState');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('initializes state from URL parameters', () => {
        const { result } = renderHook(() => useQueryAsState({}));

        expect(result.current[0]).toEqual({ key: 'value' });
    });

    test('updates URL when state changes', () => {
        const { result } = renderHook(() => useQueryAsState({}));

        act(() => {
            result.current[1]({ newKey: 'newValue' }); // setValueDict
        });

        expect(replaceStateMock).toHaveBeenCalledWith(
            { path: 'http://localhost:3000/test?newKey=newValue' },
            '',
            'http://localhost:3000/test?newKey=newValue',
        );
    });

    test('star is appended', () => {
        const { result } = renderHook(() => useQueryAsState({}));

        act(() => {
            result.current[1]({ newKey: '*' }); // setValueDict
        });

        expect(replaceStateMock).toHaveBeenCalledWith(
            { path: 'http://localhost:3000/test?newKey=*&' },
            '',
            'http://localhost:3000/test?newKey=*&',
        );
    });

    test('disables URL storage when exceeding max length', () => {
        const longValue = 'a'.repeat(2000); // Generate long string
        const { result } = renderHook(() => useQueryAsState({}));

        act(() => {
            result.current[1]({ longKey: longValue });
        });

        expect(replaceStateMock).toHaveBeenCalledWith({ path: '/test' }, '', '/test');
    });

    describe('array parameter handling', () => {
        test('initializes state with array values from multiple URL parameters with same key', () => {
            Object.defineProperty(window, 'location', {
                value: {
                    search: '?country=USA&country=Canada&country=Mexico',
                    pathname: '/test',
                    host: 'localhost:3000',
                    protocol: 'http:',
                },
                writable: true,
            });

            const { result } = renderHook(() => useQueryAsState({}));

            expect(result.current[0]).toEqual({ country: ['USA', 'Canada', 'Mexico'] });
        });

        test('initializes state with single value when only one parameter exists', () => {
            Object.defineProperty(window, 'location', {
                value: {
                    search: '?country=USA',
                    pathname: '/test',
                    host: 'localhost:3000',
                    protocol: 'http:',
                },
                writable: true,
            });

            const { result } = renderHook(() => useQueryAsState({}));

            expect(result.current[0]).toEqual({ country: 'USA' });
        });

        test('updates URL with multiple parameters when state contains array', () => {
            const { result } = renderHook(() => useQueryAsState({}));

            act(() => {
                result.current[1]({ country: ['USA', 'Canada', 'Mexico'] });
            });

            expect(replaceStateMock).toHaveBeenCalledWith(
                { path: 'http://localhost:3000/test?country=USA&country=Canada&country=Mexico' },
                '',
                'http://localhost:3000/test?country=USA&country=Canada&country=Mexico',
            );
        });

        test('handles mixed single values and arrays', () => {
            Object.defineProperty(window, 'location', {
                value: {
                    search: '?country=USA&country=Canada&host=Human&lineage=BA.1',
                    pathname: '/test',
                    host: 'localhost:3000',
                    protocol: 'http:',
                },
                writable: true,
            });

            const { result } = renderHook(() => useQueryAsState({}));

            expect(result.current[0]).toEqual({
                country: ['USA', 'Canada'],
                host: 'Human',
                lineage: 'BA.1',
            });
        });

        test('preserves order of array values in URL', () => {
            Object.defineProperty(window, 'location', {
                value: {
                    search: '?status=pending&status=approved&status=rejected',
                    pathname: '/test',
                    host: 'localhost:3000',
                    protocol: 'http:',
                },
                writable: true,
            });

            const { result } = renderHook(() => useQueryAsState({}));

            expect(result.current[0]).toEqual({
                status: ['pending', 'approved', 'rejected'],
            });
        });

        test('correctly serializes empty arrays', () => {
            const { result } = renderHook(() => useQueryAsState({}));

            act(() => {
                result.current[1]({ country: [] });
            });

            // Empty arrays should not appear in the URL
            expect(replaceStateMock).toHaveBeenCalledWith(
                { path: 'http://localhost:3000/test?' },
                '',
                'http://localhost:3000/test?',
            );
        });

    test('re-enables URL storage when length drops below max', () => {
        const longValue = 'a'.repeat(2000);
        const { result } = renderHook(() => useQueryAsState({}));

        act(() => {
            result.current[1]({ longKey: longValue });
        });

        act(() => {
            result.current[1]({ shortKey: 'b' });
        });

        expect(replaceStateMock).toHaveBeenLastCalledWith(
            { path: 'http://localhost:3000/test?shortKey=b' },
            '',
            'http://localhost:3000/test?shortKey=b',
        );
    });
});
