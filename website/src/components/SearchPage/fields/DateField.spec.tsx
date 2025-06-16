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

        const input = screen.getByRole('textbox');
        expect(input).toHaveValue('2025-03-17');

        const clearButton = screen.getByLabelText('Clear releasedAtTimestampFrom');
        await userEvent.click(clearButton);

        expect(input).toHaveValue('YYYY-MM-DD');
        expect(setSomeFieldValues).toHaveBeenCalledWith(['releasedAtTimestampFrom', '']);
    });
});
