import { expect, test, describe } from 'vitest';

import { splitString } from '../splitLines';

describe('splitString', () => {
    test('should handle empty string', () => {
        const result = splitString('', 100);
        expect(result).toEqual([]);
    });

    test('should handle a string with more than maxLength characters', () => {
        const inputStr =
            'ePpBsLe1gLOtBfXyJdbIlrCf879JcwcnCH3vr3pxUZlI4ULIPJlKdoS2vkLjJ9CeUtX2' +
            'QXNjifCfFGRpTeLPHx7moZqb7GzeMSW06iLwW0B9DQZiWvH3tb2c';
        const result = splitString(inputStr, 100);

        expect(result.length).toBe(2);
        expect(result[0].length).toBe(100);
        expect(result[1].length).toBe(20);
        expect(result.join('')).toBe(inputStr);
    });

    test('should handle a string with exactly maxLength characters', () => {
        const inputStr =
            'ePpBsLe1gLOtBfXyJdbIlrCf879JcwcnCH3vr3pxUZlI4ULIPJlKdoS2vkLjJ9CeUtX2Q' + 'XNjifCfFGRpTeLPHx7moZqb7GzeMSW0';
        const result = splitString(inputStr, 100);

        expect(result.length).toBe(1);
        expect(result[0].length).toBe(100);
        expect(result[0]).toBe(inputStr);
    });

    test('should handle a string with less than maxLength characters', () => {
        const inputStr = 'ePpBsLe1gLOtBfXyJdbIlrCf879JcwcnCH3vr3pxUZlI4ULIPJ';
        const result = splitString(inputStr, 100);

        expect(result.length).toBe(1);
        expect(result[0].length).toBe(50);
        expect(result[0]).toBe(inputStr);
    });
});
