import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { LineageField } from './LineageField';
import { lapisClientHooks } from '../../../services/serviceHooks.ts';
import type { MetadataFilter } from '../../../types/config';

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
        useAggregated: mockUseAggregated
    },
});

describe('LineageField', () => {
    const field: MetadataFilter = { name: 'lineage', label: 'My Lineage', type: 'string' };
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
                    { lineage: 'A.1.1', count: 20 },
                    { lineage: 'B', count: 15 },
                    { lineage: 'A.2', count: 8 },
                ],
            },
            isLoading: false,
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
        expect(options.length).toBe(6);
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
});
