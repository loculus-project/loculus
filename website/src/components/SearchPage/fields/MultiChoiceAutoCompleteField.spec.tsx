import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MultiChoiceAutoCompleteField } from './MultiChoiceAutoCompleteField';
import { lapisClientHooks } from '../../../services/serviceHooks.ts';
import type { FieldPresetMap, MetadataFilter } from '../../../types/config.ts';

vi.mock('../../../services/serviceHooks.ts');
vi.mock('../../../clientLogger.ts', () => ({
    getClientLogger: () => ({
        error: vi.fn(),
    }),
}));

const mockUseAggregated = vi.fn();
// @ts-expect-error mock implementation for test double
// eslint-disable-next-line @typescript-eslint/no-unsafe-call
lapisClientHooks.mockReturnValue({
    useAggregated: mockUseAggregated,
});

describe('MultiChoiceAutoCompleteField', () => {
    const field: MetadataFilter = {
        name: 'testField',
        displayName: 'Test Field',
        type: 'string',
        autocomplete: true,
    };
    const setSomeFieldValues = vi.fn();
    const lapisUrl = 'https://example.com/api';
    const lapisSearchParameters = { param1: 'value1' };

    beforeEach(() => {
        setSomeFieldValues.mockClear();
        mockUseAggregated.mockReset();
    });

    const renderField = (overrides: Partial<Parameters<typeof MultiChoiceAutoCompleteField>[0]> = {}) => {
        mockUseAggregated.mockReturnValue({
            data: {
                data: [
                    { testField: 'Option 1', count: 10 },
                    { testField: 'Option 2', count: 20 },
                    { testField: 'Option 3', count: 30 },
                ],
            },
            isPending: false,
            error: null,
            mutate: vi.fn(),
        });

        return render(
            <MultiChoiceAutoCompleteField
                field={field}
                optionsProvider={{
                    type: 'generic',
                    lapisUrl,
                    lapisSearchParameters,
                    fieldName: field.name,
                }}
                setSomeFieldValues={setSomeFieldValues}
                fieldValues={[]}
                {...overrides}
            />,
        );
    };

    it('allows selecting multiple options', async () => {
        renderField();

        const input = screen.getByLabelText('Test Field');
        await userEvent.click(input);

        const options = await screen.findAllByRole('option');
        await userEvent.click(options[0]);

        expect(setSomeFieldValues).toHaveBeenCalledWith(['testField', ['Option 1']]);
    });

    it('displays selected values as badges', () => {
        renderField({ fieldValues: ['Option 1', 'Option 2'] });

        expect(screen.getByText('Option 1')).toBeInTheDocument();
        expect(screen.getByText('Option 2')).toBeInTheDocument();

        const removeButtons = screen.getAllByLabelText(/Remove/);
        expect(removeButtons).toHaveLength(2);
    });

    it('sends updated values when a badge remove button is clicked', async () => {
        renderField({ fieldValues: ['Option 1', 'Option 2'] });

        const removeButton = screen.getByLabelText('Remove Option 1');
        await userEvent.click(removeButton);

        expect(setSomeFieldValues).toHaveBeenCalledWith(['testField', ['Option 2']]);
    });

    it('clears all selections when the clear button is clicked', async () => {
        renderField({ fieldValues: ['Option 1', 'Option 2'] });

        const clearButton = screen.getByLabelText('Clear Test Field');
        await userEvent.click(clearButton);

        expect(setSomeFieldValues).toHaveBeenCalledWith(['testField', '']);
    });

    it('handles blank values in multi-select mode', async () => {
        mockUseAggregated.mockReturnValue({
            data: {
                data: [
                    { testField: null, count: 5 },
                    { testField: 'Option 1', count: 10 },
                ],
            },
            isPending: false,
            error: null,
            mutate: vi.fn(),
        });

        render(
            <MultiChoiceAutoCompleteField
                field={field}
                optionsProvider={{
                    type: 'generic',
                    lapisUrl,
                    lapisSearchParameters,
                    fieldName: field.name,
                }}
                setSomeFieldValues={setSomeFieldValues}
                fieldValues={[]}
            />,
        );

        const input = screen.getByLabelText('Test Field');
        await userEvent.click(input);

        const options = await screen.findAllByRole('option');
        expect(options[0]).toHaveTextContent('(blank)(5)');
        await userEvent.click(options[0]);

        expect(setSomeFieldValues).toHaveBeenCalledWith(['testField', [null]]);
    });

    it('shows badges for selected options and hides unselected ones', () => {
        renderField({ fieldValues: ['Option 1', 'Option 3'] });

        expect(screen.getByText('Option 1')).toBeInTheDocument();
        expect(screen.getByText('Option 3')).toBeInTheDocument();
        expect(screen.queryAllByText('Option 2')).toHaveLength(0);
    });

    describe('fieldPresets', () => {
        const presets: FieldPresetMap = {
            /* eslint-disable @typescript-eslint/naming-convention */
            'Option 1': { host: 'human', lineage: 'B.1' },
            'Option 2': { host: 'bat', lineage: 'BtCoV' },
            'Option 3': { host: 'human', lineage: 'H1N1' },
            /* eslint-disable @typescript-eslint/naming-convention */
        };

        it('sets preset fields when an option with a preset is selected', async () => {
            renderField({ fieldPresets: presets });

            const input = screen.getByLabelText('Test Field');
            await userEvent.click(input);

            const options = await screen.findAllByRole('option');
            await userEvent.click(options[0]); // Option 1

            expect(setSomeFieldValues).toHaveBeenCalledWith(
                ['testField', ['Option 1']],
                ['host', 'human'],
                ['lineage', 'B.1'],
            );
        });

        it('sets presets field when all selected options agree on the value', async () => {
            // Option 1 and Option 3 both have host: 'human'
            renderField({
                fieldValues: ['Option 1'],
                fieldPresets: presets,
            });

            const input = screen.getByLabelText('Test Field');
            await userEvent.click(input);

            const options = await screen.findAllByRole('option');
            await userEvent.click(options[2]); // Option 3

            expect(setSomeFieldValues).toHaveBeenCalledWith(['testField', ['Option 1', 'Option 3']], ['host', 'human']);
        });

        it('skips a preset field when not all selected options have a preset for that field', async () => {
            // Option 1 has host: 'bat', but Option 2 has no host preset at all
            const partialPresets: FieldPresetMap = {
                'Option 1': { host: 'bat' },
                'Option 2': { lineage: 'B.1' },
            };
            renderField({
                fieldValues: ['Option 1'],
                fieldPresets: partialPresets,
            });

            const input = screen.getByLabelText('Test Field');
            await userEvent.click(input);

            const options = await screen.findAllByRole('option');
            await userEvent.click(options[1]); // Option 2 — has no host preset

            expect(setSomeFieldValues).toHaveBeenCalledWith(['testField', ['Option 1', 'Option 2']]);
            expect(setSomeFieldValues).not.toHaveBeenCalledWith(
                expect.anything(),
                expect.arrayContaining([['host', expect.anything()]]),
            );
        });

        it('skips a preset field when selected options have conflicting values', async () => {
            // Option 1: host 'human', Option 2: host 'bat' → conflict, field should be skipped
            renderField({
                fieldValues: ['Option 1'],
                fieldPresets: presets,
            });

            const input = screen.getByLabelText('Test Field');
            await userEvent.click(input);

            const options = await screen.findAllByRole('option');
            await userEvent.click(options[1]); // Option 2

            expect(setSomeFieldValues).toHaveBeenCalledWith(['testField', ['Option 1', 'Option 2']]);
            expect(setSomeFieldValues).not.toHaveBeenCalledWith(
                expect.anything(),
                expect.arrayContaining([['host', expect.anything()]]),
            );
        });

        it('clears preset fields when the selection is cleared', async () => {
            const { rerender } = renderField({ fieldPresets: presets });

            // Select Option 1 to populate lastPresetKeysRef inside the component
            const input = screen.getByLabelText('Test Field');
            await userEvent.click(input);
            const options = await screen.findAllByRole('option');
            await userEvent.click(options[0]); // Option 1 → sets host and lineage in ref

            setSomeFieldValues.mockClear();

            // Rerender with Option 1 selected so the clear button is visible
            rerender(
                <MultiChoiceAutoCompleteField
                    field={field}
                    optionsProvider={{
                        type: 'generic',
                        lapisUrl,
                        lapisSearchParameters,
                        fieldName: field.name,
                    }}
                    setSomeFieldValues={setSomeFieldValues}
                    fieldValues={['Option 1']}
                    fieldPresets={presets}
                />,
            );

            const clearButton = screen.getByLabelText('Clear Test Field');
            await userEvent.click(clearButton);

            expect(setSomeFieldValues).toHaveBeenCalledWith(['testField', ''], ['host', ''], ['lineage', '']);
        });
    });
});
