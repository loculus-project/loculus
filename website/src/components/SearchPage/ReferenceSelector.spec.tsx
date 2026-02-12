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
    });

    it('renders nothing in single reference case', () => {
        const { container } = render(
            <ReferenceSelector
                lapisSearchParameters={{}}
                lapisUrl='https://example.com/lapis'
                filterSchema={filterSchema}
                referenceGenomesInfo={SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES}
                referenceIdentifierField={referenceIdentifierField}
                selectedReferences={{ main: null }}
                setSelectedReferences={vi.fn()}
                segmentName='main'
            />,
        );

        expect(container).toBeEmptyDOMElement();
    });

    it('renders selector UI in multi-reference case', () => {
        mockUseAggregated.mockReturnValue({
            data: {
                data: [
                    { [referenceIdentifierField]: 'ref1', count: 10 },
                    { [referenceIdentifierField]: 'ref2', count: 20 },
                ],
            },
            isPending: false,
            error: null,
            mutate: vi.fn(),
        });
        const setSelected = vi.fn();
        render(
            <ReferenceSelector
                lapisSearchParameters={{}}
                lapisUrl='https://example.com/lapis'
                filterSchema={filterSchema}
                referenceGenomesInfo={SINGLE_SEG_MULTI_REF_REFERENCEGENOMES}
                referenceIdentifierField={referenceIdentifierField}
                selectedReferences={{ main: null }}
                setSelectedReferences={setSelected}
                segmentName='main'
            />,
        );

        expect(screen.getByText('My Genotype')).toBeInTheDocument();
        expect(screen.getByRole('combobox')).toBeInTheDocument();
        expect(screen.getAllByRole('option')).toHaveLength(3); // Includes disabled option
        const options = screen.getAllByRole('option');
        const optionTexts = options.map((option) => option.textContent);
        expect(optionTexts).toEqual(expect.arrayContaining(['ref1 (10)', 'ref2 (20)']));
    });

    it('renders selector UI in multi-segment multi-reference case', () => {
        mockUseAggregated.mockReturnValue({
            data: {
                data: [
                    { [`${referenceIdentifierField}_L`]: 'L-ref1', count: 10 },
                    { [`${referenceIdentifierField}_L`]: 'L-ref2', count: 20 },
                ],
            },
            isPending: false,
            error: null,
            mutate: vi.fn(),
        });
        const setSelected = vi.fn();
        render(
            <ReferenceSelector
                lapisSearchParameters={{}}
                lapisUrl='https://example.com/lapis'
                filterSchema={multiSegmentFilterSchema}
                referenceGenomesInfo={MULTI_SEG_MULTI_REF_REFERENCEGENOMES}
                referenceIdentifierField={referenceIdentifierField}
                selectedReferences={{ main: null }}
                setSelectedReferences={setSelected}
                segmentName='L'
            />,
        );

        expect(screen.getByText('My Genotype L')).toBeInTheDocument();
        expect(screen.getByRole('combobox')).toBeInTheDocument();
        expect(screen.getAllByRole('option')).toHaveLength(3); // Includes disabled option
    });

    it('updates selection when changed', async () => {
        mockUseAggregated.mockReturnValue({
            data: {
                data: [
                    { [referenceIdentifierField]: 'ref1', count: 10 },
                    { [referenceIdentifierField]: 'ref2', count: 20 },
                ],
            },
            isPending: false,
            error: null,
            mutate: vi.fn(),
        });
        const setSelected = vi.fn();
        render(
            <ReferenceSelector
                lapisSearchParameters={{}}
                lapisUrl='https://example.com/lapis'
                filterSchema={filterSchema}
                referenceGenomesInfo={SINGLE_SEG_MULTI_REF_REFERENCEGENOMES}
                referenceIdentifierField={referenceIdentifierField}
                selectedReferences={{ main: null }}
                setSelectedReferences={setSelected}
                segmentName='main'
            />,
        );

        await userEvent.selectOptions(screen.getByRole('combobox'), 'ref1');
        expect(setSelected).toHaveBeenCalledWith({ main: 'ref1' });
    });

    it('shows clear button and clears selection', async () => {
        mockUseAggregated.mockReturnValue({
            data: {
                data: [
                    { [referenceIdentifierField]: 'ref1', count: 10 },
                    { [referenceIdentifierField]: 'ref2', count: 20 },
                ],
            },
            isPending: false,
            error: null,
            mutate: vi.fn(),
        });
        const setSelected = vi.fn();
        render(
            <ReferenceSelector
                lapisSearchParameters={{}}
                lapisUrl='https://example.com/lapis'
                filterSchema={filterSchema}
                referenceGenomesInfo={SINGLE_SEG_MULTI_REF_REFERENCEGENOMES}
                referenceIdentifierField={referenceIdentifierField}
                selectedReferences={{ main: 'ref1' }}
                setSelectedReferences={setSelected}
                segmentName='main'
            />,
        );

        await userEvent.click(screen.getByRole('button'));
        expect(setSelected).toHaveBeenCalledWith({ main: null });
    });
});
