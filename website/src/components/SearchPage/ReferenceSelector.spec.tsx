import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReferenceSelector } from './ReferenceSelector.tsx';
import { lapisClientHooks } from '../../services/serviceHooks.ts';
import {
    MULTI_SEG_MULTI_REF_REFERENCEGENOMES,
    SINGLE_SEG_MULTI_REF_REFERENCEGENOMES,
    SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
} from '../../types/referenceGenomes.spec.ts';
import { MetadataFilterSchema } from '../../utils/search.ts';

vi.mock('../../services/serviceHooks.ts');
vi.mock('../../clientLogger.ts', () => ({
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

const referenceIdentifierField = 'genotype';
const lapisUrl = 'http://lapis.dummy.url';
const lapisSearchParameters = {};

const filterSchema = new MetadataFilterSchema([
    {
        name: referenceIdentifierField,
        displayName: 'My Genotype',
        type: 'string',
    },
]);

const multiSegmentFilterSchema = new MetadataFilterSchema([
    {
        name: `${referenceIdentifierField}_L`,
        displayName: 'My Genotype L',
        type: 'string',
    },
    {
        name: `${referenceIdentifierField}_S`,
        displayName: 'My Genotype S',
        type: 'string',
    },
]);

describe('ReferenceSelector', () => {
    beforeEach(() => {
        mockUseAggregated.mockReset();
        mockUseAggregated.mockReturnValue({
            data: {
                data: [
                    { genotype: 'ref1', count: 100 },
                    { genotype: 'ref2', count: 200 },
                ],
            },
            isPending: false,
            error: null,
            mutate: vi.fn(),
        });
    });

    it('renders nothing in single reference case', () => {
        const { container } = render(
            <ReferenceSelector
                filterSchema={filterSchema}
                referenceGenomesInfo={SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES}
                referenceIdentifierField={referenceIdentifierField}
                fieldValues={{}}
                setSomeFieldValues={vi.fn()}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        expect(container).toBeEmptyDOMElement();
    });

    it('renders autocomplete UI in multi-reference case', async () => {
        render(
            <ReferenceSelector
                filterSchema={filterSchema}
                referenceGenomesInfo={SINGLE_SEG_MULTI_REF_REFERENCEGENOMES}
                referenceIdentifierField={referenceIdentifierField}
                fieldValues={{}}
                setSomeFieldValues={vi.fn()}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        const input = screen.getByLabelText('My Genotype');
        expect(input).toBeInTheDocument();

        await userEvent.click(input);

        const options = await screen.findAllByRole('option');
        expect(options).toHaveLength(2);
    });

    it('renders autocomplete UI in multi-segment multi-reference case', async () => {
        mockUseAggregated.mockReturnValue({
            data: {
                data: [
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    { genotype_L: 'ref1', count: 50 },
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    { genotype_L: 'ref2', count: 75 },
                ],
            },
            isPending: false,
            error: null,
            mutate: vi.fn(),
        });

        render(
            <ReferenceSelector
                filterSchema={multiSegmentFilterSchema}
                referenceGenomesInfo={MULTI_SEG_MULTI_REF_REFERENCEGENOMES}
                referenceIdentifierField={referenceIdentifierField}
                fieldValues={{}}
                setSomeFieldValues={vi.fn()}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        const input = screen.getByLabelText('My Genotype L');
        expect(input).toBeInTheDocument();

        await userEvent.click(input);

        const options = await screen.findAllByRole('option');
        expect(options).toHaveLength(2);
    });

    it('updates selection when an option is clicked', async () => {
        const setSomeFieldValues = vi.fn();
        render(
            <ReferenceSelector
                filterSchema={filterSchema}
                referenceGenomesInfo={SINGLE_SEG_MULTI_REF_REFERENCEGENOMES}
                referenceIdentifierField={referenceIdentifierField}
                fieldValues={{}}
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        const input = screen.getByLabelText('My Genotype');
        await userEvent.click(input);

        const options = await screen.findAllByRole('option');
        await userEvent.click(options[0]);

        expect(setSomeFieldValues).toHaveBeenCalledWith(['genotype', 'ref1']);
    });

    it('clears selection when clear button is clicked', async () => {
        const setSomeFieldValues = vi.fn();
        render(
            <ReferenceSelector
                filterSchema={filterSchema}
                referenceGenomesInfo={SINGLE_SEG_MULTI_REF_REFERENCEGENOMES}
                referenceIdentifierField={referenceIdentifierField}
                fieldValues={{ genotype: 'ref1' }}
                setSomeFieldValues={setSomeFieldValues}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        const clearButton = screen.getByLabelText('Clear My Genotype');
        await userEvent.click(clearButton);

        expect(setSomeFieldValues).toHaveBeenCalledWith(['genotype', '']);
    });
});
