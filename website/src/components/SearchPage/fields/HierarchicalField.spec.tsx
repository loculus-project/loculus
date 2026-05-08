import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { HierarchicalField } from './HierarchicalField.tsx';
import { lapisClientHooks } from '../../../services/serviceHooks.ts';
import type { MetadataFilter } from '../../../types/config.ts';
import { Button } from '../../common/Button.tsx';

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
    useAggregated: mockUseAggregated,
    useLineageDefinition: mockUseLineageDefinition,
});

describe('HierarchicalField - lineage mode', () => {
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
            <HierarchicalField
                field={field}
                fieldValue='initialValue'
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
                mode='lineage'
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
            <HierarchicalField
                field={field}
                fieldValue='A.1'
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
                mode='lineage'
            />,
        );

        const checkbox = screen.getByRole('checkbox');
        fireEvent.click(checkbox);

        expect(checkbox).toBeChecked();
        expect(setSomeFieldValues).toHaveBeenCalledWith(['lineage', 'A.1*']);
    });

    it('aggregates counts for aliases correctly', async () => {
        render(
            <HierarchicalField
                field={field}
                fieldValue='A.1'
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
                mode='lineage'
            />,
        );

        await userEvent.click(screen.getByLabelText('My Lineage'));

        const options = await screen.findAllByRole('option');
        expect(options.length).toBe(5);
        expect(options[0].textContent).toBe('A(0)');
        expect(options[1].textContent).toBe('A.1(10)');
        // A.1.1.1 and B.1 are aliases -> B.1 should have aggregated count
        expect(options[4].textContent).toBe('B.1(35)');
    });

    it('aggregates counts for sublineages correctly', async () => {
        render(
            <HierarchicalField
                field={field}
                fieldValue='A.1'
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
                mode='lineage'
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
            <HierarchicalField
                field={field}
                fieldValue='A.1'
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
                mode='lineage'
            />,
        );

        await userEvent.click(screen.getByLabelText('My Lineage'));

        await screen.findAllByRole('option');
        await userEvent.click(screen.getByRole('option', { name: /A\.1\.1/ }));

        expect(setSomeFieldValues).toHaveBeenCalledWith(['lineage', 'A.1.1']);

        const checkbox = screen.getByRole('checkbox');
        fireEvent.click(checkbox);
        expect(checkbox).toBeChecked();

        expect(setSomeFieldValues).toHaveBeenCalledWith(['lineage', 'A.1.1*']);
    });

    it('clears wildcard when sublineages is unchecked', () => {
        render(
            <HierarchicalField
                field={field}
                fieldValue='value*'
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
                mode='lineage'
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
                    <HierarchicalField
                        field={field}
                        fieldValue={value}
                        setSomeFieldValues={setSomeFieldValues}
                        lapisUrl={lapisUrl}
                        lapisSearchParameters={lapisSearchParameters}
                        mode='lineage'
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
describe('HierarchicalField - default mode', () => {
    const field: MetadataFilter = {
        name: 'hostTaxon',
        displayName: 'Host Taxon',
        type: 'string',
        hierarchicalSearchLabel: 'include subtaxa',
    };
    const setSomeFieldValues = vi.fn();
    const lapisUrl = 'https://example.com/api';
    const lapisSearchParameters = {};

    beforeEach(() => {
        setSomeFieldValues.mockClear();

        mockUseLineageDefinition.mockReturnValue({
            /* eslint-disable @typescript-eslint/naming-convention */
            data: {
                'Mammalia': {},
                'Rodentia': {
                    parents: ['Mammalia'],
                },
                'Muridae': {
                    parents: ['Rodentia'],
                    aliases: ['True mice'],
                },
                'Mus musculus': {
                    parents: ['Muridae'],
                    aliases: ['House mouse'],
                },
                'Rattus rattus': {
                    parents: ['Rodentia'],
                    aliases: ['Black rat'],
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
                    { hostTaxon: 'Mammalia', count: 2 },
                    { hostTaxon: 'Rodentia', count: 10 },
                    { hostTaxon: 'Muridae', count: 5 },
                    { hostTaxon: 'Mus musculus', count: 20 },
                    { hostTaxon: 'Rattus rattus', count: 8 },
                ],
            },
            isPending: false,
            error: null,
            mutate: vi.fn(),
        });
    });

    it('defaults the subtaxa checkbox to checked when fieldValue is empty', () => {
        render(
            <HierarchicalField
                field={field}
                fieldValue=''
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        expect(screen.getByRole('checkbox')).toBeChecked();
    });

    it('appends wildcard when selecting from an empty field', async () => {
        render(
            <HierarchicalField
                field={field}
                fieldValue=''
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        await userEvent.click(screen.getByLabelText('Host Taxon'));
        await screen.findAllByRole('option');
        await userEvent.click(screen.getByRole('option', { name: /Rodentia/ }));

        expect(setSomeFieldValues).toHaveBeenCalledWith(['hostTaxon', 'Rodentia*']);
    });

    it('respects an explicit non-wildcard fieldValue', () => {
        render(
            <HierarchicalField
                field={field}
                fieldValue='Rodentia'
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        expect(screen.getByRole('checkbox')).not.toBeChecked();
    });

    it('shows common names instead of scientific names when an alias exists', async () => {
        render(
            <HierarchicalField
                field={field}
                fieldValue=''
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        await userEvent.click(screen.getByLabelText('Host Taxon'));
        const optionTexts = (await screen.findAllByRole('option')).map((o) => o.textContent);

        // Muridae → 'True mice', Mus musculus → 'House mouse', Rattus rattus → 'Black rat'
        expect(optionTexts).toEqual([
            'Black rat(8)',
            'House mouse(20)',
            'Mammalia(45)',
            'Rodentia(43)',
            'True mice(25)',
        ]);
    });

    it('uses the scientific name as the value when a common name is selected', async () => {
        render(
            <HierarchicalField
                field={field}
                fieldValue=''
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        await userEvent.click(screen.getByLabelText('Host Taxon'));
        await screen.findAllByRole('option');
        // 'True mice' is the alias for canonical 'Muridae'
        await userEvent.click(screen.getByRole('option', { name: /True mice/ }));

        expect(setSomeFieldValues).toHaveBeenCalledWith(['hostTaxon', 'Muridae*']);
    });

    it('displays the common name in the input when fieldValue is a scientific name with an alias', async () => {
        render(
            <HierarchicalField
                field={field}
                fieldValue='Mus musculus*'
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        expect(await screen.findByDisplayValue('House mouse')).toBeInTheDocument();
    });

    it('uses the hierarchicalSearchLabel as the checkbox label', () => {
        render(
            <HierarchicalField
                field={field}
                fieldValue=''
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        expect(screen.getByText('include subtaxa')).toBeInTheDocument();
    });
});
