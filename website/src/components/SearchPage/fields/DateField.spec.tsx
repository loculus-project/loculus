import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { TimestampField } from './DateField';

const setSomeFieldValues = vi.fn();

const date = new Date(Date.UTC(2025, 2, 17, 0, 0, 0)); // March 17, 2025, at midnight UTC
const dateDisplayString = date.toISOString().split('T')[0];
const dateDisplayStringWithoutDelims = dateDisplayString.replace(/\D/g, '');
const timestampDayStart = Math.floor(date.getTime() / 1000);
const timestampDayEnd = timestampDayStart + 24 * 60 * 60 - 1; // End of the day in UTC (23:59:59)

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
                fieldValue={timestampDayStart.toString()}
                setSomeFieldValues={setSomeFieldValues}
            />,
        );

        const input = screen.getByRole('textbox');
        expect(input).toBeInTheDocument();

        expect(input).toHaveValue(dateDisplayString);
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
        await userEvent.type(input, dateDisplayStringWithoutDelims);
        expect(input).toHaveValue(dateDisplayString);
        expect(setSomeFieldValues).lastCalledWith(['releasedAtTimestampFrom', timestampDayStart.toString()]);
    });

    test('"To" field renders date correctly', () => {
        render(
            <TimestampField
                field={{
                    name: 'releasedAtTimestampTo',
                    type: 'timestamp',
                }}
                fieldValue={timestampDayEnd}
                setSomeFieldValues={setSomeFieldValues}
            />,
        );

        const input = screen.getByRole('textbox');
        expect(input).toBeInTheDocument();

        expect(input).toHaveValue(dateDisplayString);
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
        await userEvent.type(input, dateDisplayStringWithoutDelims);
        expect(input).toHaveValue(dateDisplayString);
        expect(setSomeFieldValues).lastCalledWith(['releasedAtTimestampTo', timestampDayEnd.toString()]);
    });
});
