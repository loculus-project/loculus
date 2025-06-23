import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { TimestampField } from './DateField';

const setSomeFieldValues = vi.fn();

describe('TimestampField', () => {
    beforeEach(() => {
        setSomeFieldValues.mockReset();
    });

    test('"From" field renders date correctly', () => {
        render(
            <TimestampField
                field={{
                    name: 'releasedAtTimestampFrom',
                    type: 'timestamp',
                }}
                fieldValue={'1742169600'}
                setSomeFieldValues={setSomeFieldValues}
            />,
        );

        const input = screen.getByRole('textbox');
        expect(input).toBeInTheDocument();

        expect(input).toHaveValue('2025-03-17');
    });

    test('"From" field sets date correctly', async () => {
        render(
            <TimestampField
                field={{
                    name: 'releasedAtTimestampFrom',
                    type: 'timestamp',
                }}
                fieldValue={''}
                setSomeFieldValues={setSomeFieldValues}
            />,
        );

        const input = screen.getByRole('textbox');
        await userEvent.type(input, '20250317');
        expect(input).toHaveValue('2025-03-17');
        expect(setSomeFieldValues).lastCalledWith(['releasedAtTimestampFrom', '1742169600']);
    });

    test('"To" field renders date correctly', () => {
        render(
            <TimestampField
                field={{
                    name: 'releasedAtTimestampTo',
                    type: 'timestamp',
                }}
                fieldValue={'1742255999'}
                setSomeFieldValues={setSomeFieldValues}
            />,
        );

        const input = screen.getByRole('textbox');
        expect(input).toBeInTheDocument();

        expect(input).toHaveValue('2025-03-17');
    });

    test('"To" field sets date correctly', async () => {
        render(
            <TimestampField
                field={{
                    name: 'releasedAtTimestampTo',
                    type: 'timestamp',
                }}
                fieldValue={''}
                setSomeFieldValues={setSomeFieldValues}
            />,
        );

        const input = screen.getByRole('textbox');
        await userEvent.type(input, '20250317');
        expect(input).toHaveValue('2025-03-17');
        expect(setSomeFieldValues).lastCalledWith(['releasedAtTimestampTo', '1742255999']);
    });

    test('Clear button clears the date field', async () => {
        render(
            <TimestampField
                field={{
                    name: 'releasedAtTimestampFrom',
                    type: 'timestamp',
                }}
                fieldValue={'1742169600'}
                setSomeFieldValues={setSomeFieldValues}
            />,
        );

        const input = () => screen.getByRole('textbox');
        expect(input()).toHaveValue('2025-03-17');

        const clear = () => screen.getByRole('button');
        await userEvent.click(clear());

        expect(input()).toHaveValue('');
        expect(setSomeFieldValues).toHaveBeenCalledWith(['releasedAtTimestampFrom', '']);
    });

    test('Invalid date input does not set filter', async () => {
        render(
            <TimestampField
                field={{
                    name: 'releasedAtTimestampFrom',
                    type: 'timestamp',
                }}
                fieldValue={''}
                setSomeFieldValues={setSomeFieldValues}
            />,
        );

        const input = () => screen.getByRole('textbox');

        // Test incomplete date
        await userEvent.type(input(), '202503');
        expect(input()).toHaveDisplayValue(/2025-03-DD/i);
        await userEvent.tab();
        expect(setSomeFieldValues).toHaveBeenCalledWith(['releasedAtTimestampFrom', '']);
    });
});
