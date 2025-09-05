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
