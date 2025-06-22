import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { TimestampField } from './DateField';

const setValue = vi.fn();

describe('TimestampField', () => {
    beforeEach(() => {
        setValue.mockReset();
    });

    test('"From" field renders date correctly', () => {
        render(
            <TimestampField
                field={{
                    name: 'releasedAtTimestampFrom',
                    type: 'timestamp',
                }}
                fieldValue={'1742169600'}
                setValue={setValue}
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
                setValue={setValue}
            />,
        );

        const input = screen.getByRole('textbox');
        await userEvent.type(input, '17032025');
        expect(input).toHaveValue('17/03/2025');
        expect(setValue).lastCalledWith(['releasedAtTimestampFrom', '1742169600']);
    });

    test('"To" field renders date correctly', () => {
        render(
            <TimestampField
                field={{
                    name: 'releasedAtTimestampTo',
                    type: 'timestamp',
                }}
                fieldValue={'1742255999'}
                setValue={setValue}
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
                setValue={setValue}
            />,
        );

        const input = screen.getByRole('textbox');
        await userEvent.type(input, '17032025');
        expect(input).toHaveValue('17/03/2025');
        expect(setValue).lastCalledWith('1742255999');
    });
});
