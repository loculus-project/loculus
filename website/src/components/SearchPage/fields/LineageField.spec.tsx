import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { LineageField } from './LineageField';
import { lapisClientHooks } from '../../../services/serviceHooks.ts';
import type { MetadataFilter } from '../../../types/config';
import { Button } from '../../common/Button';

vi.mock('../../../services/serviceHooks.ts');
vi.mock('../../../clientLogger.ts', () => ({
    getClientLogger: () => ({
        error: vi.fn(),
    }),
}));

const mockUseAggregated = vi.fn();
const mockUseLineageDefinition = vi.fn();
// @ts-expect-error because mockReturnValue is not defined in the type definition
// eslint-disable-next-line @typescript-eslint/no-unsafe-call
lapisClientHooks.mockReturnValue({
    zodiosHooks: {
        useLineageDefinition: mockUseLineageDefinition,
        useAggregated: mockUseAggregated,
    },
});

describe('LineageField', () => {
    const field: MetadataFilter = { name: 'lineage', displayName: 'My Lineage', type: 'string' };
    const setSomeFieldValues = vi.fn();
    const lapisUrl = 'https://example.com/api';
    const lapisSearchParameters = {};

    beforeEach(() => {
        setSomeFieldValues.mockClear();

        mockUseLineageDefinition.mockReturnValue({
            /* eslint-disable @typescript-eslint/naming-convention */
            data: {
                'A': {},
                'A.1': {
                    parents: ['A'],
                },
                'A.1.1': {
                    parents: ['A.1'],
                    aliases: ['B'],
                },
                'B.1': {
                    parents: ['A.1.1'],
                    aliases: ['A.1.1.1'],
                },
                'A.2': {
                    parents: ['A'],
                    aliases: ['C'],
                },
            },
            /* eslint-enable @typescript-eslint/naming-convention */
            isLoading: false,
            error: null,
            mutate: vi.fn(),
        });

        mockUseAggregated.mockReturnValue({
            data: {
                data: [
                    { lineage: 'A.1', count: 10 },
                    { lineage: 'A.1.1.1', count: 20 },
                    { lineage: 'B.1', count: 15 },
                    { lineage: 'A.2', count: 8 },
                ],
            },
            isPending: false,
            error: null,
            mutate: vi.fn(),
        });
    });

    it('renders correctly with initial state', () => {
        render(
            <LineageField
                field={field}
                fieldValue='initialValue'
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        expect(screen.getByText('My Lineage')).toBeInTheDocument();
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).not.toBeChecked();
        const textbox = screen.getByRole('textbox');
        expect(textbox).toHaveValue('initialValue');
    });

    it('updates query when sublineages checkbox is toggled', () => {
        render(
            <LineageField
                field={field}
                fieldValue='A.1'
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        const checkbox = screen.getByRole('checkbox');
        fireEvent.click(checkbox);

        expect(checkbox).toBeChecked();
        expect(setSomeFieldValues).toHaveBeenCalledWith(['lineage', 'A.1*']);
    });

    it('aggregates counts for aliases correctly', async () => {
        render(
            <LineageField
                field={field}
                fieldValue='A.1'
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        await userEvent.click(screen.getByLabelText('My Lineage'));

        const options = await screen.findAllByRole('option');
        expect(options.length).toBe(5);
        expect(options[0].textContent).toBe('A');
        expect(options[1].textContent).toBe('A.1(10)');
        // A.1.1.1 and B.1 are aliases -> B.1 should have aggregated count
        expect(options[4].textContent).toBe('B.1(35)');
    });

    it('aggregates counts for sublineages correctly', async () => {
        render(
            <LineageField
                field={field}
                fieldValue='A.1'
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        const checkbox = screen.getByRole('checkbox');
        fireEvent.click(checkbox);

        await userEvent.click(screen.getByLabelText('My Lineage'));

        const options = await screen.findAllByRole('option');
        expect(options.length).toBe(5);
        expect.soft(options[0].textContent).toBe('A(53)');
        expect.soft(options[1].textContent).toBe('A.1(45)');
        expect.soft(options[2].textContent).toBe('A.1.1(35)');
        expect.soft(options[3].textContent).toBe('A.2(8)');
    });

    it('handles input changes and calls setSomeFieldValues', async () => {
        render(
            <LineageField
                field={field}
                fieldValue='A.1'
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        await userEvent.click(screen.getByLabelText('My Lineage'));

        const options = await screen.findAllByRole('option');
        await userEvent.click(options[2]);

        expect(setSomeFieldValues).toHaveBeenCalledWith(['lineage', 'A.1.1']);

        const checkbox = screen.getByRole('checkbox');
        fireEvent.click(checkbox);
        expect(checkbox).toBeChecked();

        expect(setSomeFieldValues).toHaveBeenCalledWith(['lineage', 'A.1.1*']);
    });

    it('clears wildcard when sublineages is unchecked', () => {
        render(
            <LineageField
                field={field}
                fieldValue='value*'
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toBeChecked();

        fireEvent.click(checkbox);

        expect(setSomeFieldValues).toHaveBeenCalledWith(['lineage', 'value']);
    });

    it('clears the whole input field when the fieldValue is updated externally', () => {
        const Wrapper = () => {
            const [value, setValue] = useState('A.1*');

            return (
                <>
                    <LineageField
                        field={field}
                        fieldValue={value}
                        setSomeFieldValues={setSomeFieldValues}
                        lapisUrl={lapisUrl}
                        lapisSearchParameters={lapisSearchParameters}
                    />
                    <Button onClick={() => setValue('')}>reset</Button>
                </>
            );
        };

        render(<Wrapper />);

        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toBeChecked();
        const textbox = screen.getByRole('textbox');
        expect(textbox).toHaveValue('A.1');

        fireEvent.click(screen.getByText('reset'));

        expect(checkbox).not.toBeChecked();
        expect(textbox).toHaveValue('');
    });
});
