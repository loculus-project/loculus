import { describe, expect, test } from 'vitest';

import { parseUrlSearchParams } from './parseUrlSearchParams';

describe('parseUrlSearchParams', () => {
    test('returns empty object for no params', () => {
        const params = new URLSearchParams('');
        const result = parseUrlSearchParams(params);
        expect(result).toEqual({});
    });

    test('single param becomes a string', () => {
        const params = new URLSearchParams('foo=bar');
        const result = parseUrlSearchParams(params);
        expect(result).toEqual({ foo: 'bar' });
    });

    test('multiple different params become separate strings', () => {
        const params = new URLSearchParams('a=1&b=2&c=3');
        const result = parseUrlSearchParams(params);
        expect(result).toEqual({ a: '1', b: '2', c: '3' });
    });

    test('repeated key becomes an array (order preserved)', () => {
        const params = new URLSearchParams('key=one&key=two&key=three');
        const result = parseUrlSearchParams(params);
        expect(result).toEqual({ key: ['one', 'two', 'three'] });
    });

    test('mix of single and repeated keys', () => {
        const params = new URLSearchParams('x=1&y=2&y=3&z=4');
        const result = parseUrlSearchParams(params);
        expect(result).toEqual({ x: '1', y: ['2', '3'], z: '4' });
    });

    test('handles empty values', () => {
        const params = new URLSearchParams('empty=&key=val&empty=&key=');
        const result = parseUrlSearchParams(params);
        expect(result).toEqual({ empty: ['', ''], key: ['val', ''] });
    });

    test('decodes percent-encoded values via URLSearchParams', () => {
        const params = new URLSearchParams('q=hello%20world&sym=%26%3D');
        const result = parseUrlSearchParams(params);
        expect(result).toEqual({ q: 'hello world', sym: '&=' });
    });
});
