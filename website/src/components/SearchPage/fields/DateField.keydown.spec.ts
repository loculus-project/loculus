import { describe, expect, test } from 'vitest';

import { handleDateKeyDown, type DateSegment } from './DateField';

const segments: DateSegment[] = [
    { length: 4, placeholder: 'Y', separator: '' },
    { length: 2, placeholder: 'M', separator: '-' },
    { length: 2, placeholder: 'D', separator: '-' },
];

describe('handleDateKeyDown', () => {
    describe('Backspace key', () => {
        test('backspace at start does nothing', () => {
            const result = handleDateKeyDown('Backspace', 'YYYY-MM-DD', 0, 0, segments);
            expect(result).toEqual({
                value: 'YYYY-MM-DD',
                selectionStart: 0,
                selectionEnd: 0,
                preventDefault: true,
            });
        });

        test('backspace after first digit removes it and selects remaining', () => {
            const result = handleDateKeyDown('Backspace', '2YYY-MM-DD', 1, 1, segments);
            expect(result).toEqual({
                value: 'YYYY-MM-DD',
                selectionStart: 0,
                selectionEnd: 4,
                preventDefault: true,
            });
        });

        test('backspace in middle of year', () => {
            const result = handleDateKeyDown('Backspace', '2024-MM-DD', 3, 3, segments);
            expect(result).toEqual({
                value: '20YY-MM-DD',
                selectionStart: 2,
                selectionEnd: 4,
                preventDefault: true,
            });
        });

        test('backspace after complete year', () => {
            const result = handleDateKeyDown('Backspace', '2024-MM-DD', 4, 4, segments);
            expect(result).toEqual({
                value: '202Y-MM-DD',
                selectionStart: 3,
                selectionEnd: 4,
                preventDefault: true,
            });
        });

        test('backspace in month section', () => {
            const result = handleDateKeyDown('Backspace', '2024-12-DD', 7, 7, segments);
            expect(result).toEqual({
                value: '2024-1M-DD',
                selectionStart: 6,
                selectionEnd: 7,
                preventDefault: true,
            });
        });

        test('backspace with full month selected clears month and keeps selection', () => {
            const result = handleDateKeyDown('Backspace', 'YYYY-12-05', 5, 7, segments);
            expect(result).toEqual({
                value: 'YYYY-MM-05',
                selectionStart: 5,
                selectionEnd: 7,
                preventDefault: true,
            });
        });

        test('backspace with full day selected clears day and keeps selection', () => {
            const result = handleDateKeyDown('Backspace', '2020-12-DD', 8, 10, segments);
            expect(result).toEqual({
                value: '2020-12-DD',
                selectionStart: 8,
                selectionEnd: 10,
                preventDefault: true,
            });
        });
    });

    describe('Digit key with selection', () => {
        test('type digit when year is fully selected - should replace with single digit', () => {
            const result = handleDateKeyDown('1', '2023-MM-DD', 0, 4, segments);
            expect(result).toEqual({
                value: '1YYY-MM-DD',
                selectionStart: 1,
                selectionEnd: 4,
                preventDefault: true,
            });
        });

        test('type digit when month is fully selected', () => {
            const result = handleDateKeyDown('1', '2024-03-DD', 5, 7, segments);
            expect(result).toEqual({
                value: '2024-1M-DD',
                selectionStart: 6,
                selectionEnd: 7,
                preventDefault: true,
            });
        });

        test('type digit when day is fully selected', () => {
            const result = handleDateKeyDown('2', '2024-03-17', 8, 10, segments);
            expect(result).toEqual({
                value: '2024-03-2D',
                selectionStart: 9,
                selectionEnd: 10,
                preventDefault: true,
            });
        });

        test('type digit with partial year selection', () => {
            const result = handleDateKeyDown('9', '2024-MM-DD', 1, 3, segments);
            expect(result).toEqual({
                value: '29YY-MM-DD',
                selectionStart: 2,
                selectionEnd: 4,
                preventDefault: true,
            });
        });

        test('complete year triggers auto-advance to month', () => {
            const result = handleDateKeyDown('4', '202Y-MM-DD', 3, 4, segments);
            expect(result).toEqual({
                value: '2024-MM-DD',
                selectionStart: 5,
                selectionEnd: 7,
                preventDefault: true,
            });
        });

        test('complete month triggers auto-advance to day', () => {
            const result = handleDateKeyDown('2', '2024-1M-DD', 6, 7, segments);
            expect(result).toEqual({
                value: '2024-12-DD',
                selectionStart: 8,
                selectionEnd: 10,
                preventDefault: true,
            });
        });

        test('complete day positions cursor at end', () => {
            const result = handleDateKeyDown('5', '2024-12-2D', 9, 10, segments);
            expect(result).toEqual({
                value: '2024-12-25',
                selectionStart: 10,
                selectionEnd: 10,
                preventDefault: true,
            });
        });
    });

    describe('Other keys', () => {
        test('arrow key - no change', () => {
            const result = handleDateKeyDown('ArrowLeft', '2024-03-17', 5, 5, segments);
            expect(result).toEqual({
                value: '2024-03-17',
                selectionStart: 5,
                selectionEnd: 5,
                preventDefault: false,
            });
        });

        test('letter key - no change', () => {
            const result = handleDateKeyDown('a', '2024-03-17', 5, 5, segments);
            expect(result).toEqual({
                value: '2024-03-17',
                selectionStart: 5,
                selectionEnd: 5,
                preventDefault: true,
            });
        });
    });

    describe('Edge cases', () => {
        test('type digit when full year is selected in complete date', () => {
            const result = handleDateKeyDown('1', '2020-05-05', 0, 4, segments);
            expect(result).toEqual({
                value: '1YYY-05-05',
                selectionStart: 1,
                selectionEnd: 4,
                preventDefault: true,
            });
        });
    });
});
