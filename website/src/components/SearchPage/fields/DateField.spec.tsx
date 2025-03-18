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

        expect(input).toHaveValue('17/03/2025');
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
        await userEvent.type(input, '17032025');
        expect(input).toHaveValue('17/03/2025');
        expect(setSomeFieldValues).toHaveBeenCalledTimes(8);
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

        expect(input).toHaveValue('17/03/2025');
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
        await userEvent.type(input, '17032025');
        expect(input).toHaveValue('17/03/2025');
        expect(setSomeFieldValues).toHaveBeenCalledTimes(8);
        expect(setSomeFieldValues).lastCalledWith(['releasedAtTimestampTo', '1742255999']);
    });
});
