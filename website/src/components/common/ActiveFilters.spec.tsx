import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActiveFilters } from './ActiveFilters';
import { MetadataFilterSchema } from '../../utils/search';
import { FieldFilterSet, SequenceEntrySelection } from '../SearchPage/DownloadDialog/SequenceFilters';

describe('ActiveFilters', () => {
    describe('with LAPIS filters', () => {
        it('renders empty filters as null', () => {
            const { container } = render(<ActiveFilters sequenceFilter={FieldFilterSet.empty()} />);
            expect(container).toBeEmptyDOMElement();
        });

        it('renders filters correctly', () => {
            render(
                <ActiveFilters
                    sequenceFilter={
                        new FieldFilterSet(
                            new MetadataFilterSchema([]),
                            { field1: 'value1', mutations: 'A123T,G234C' },
                            {},
                            { nucleotideSequences: ['main'], genes: [], insdcAccessionFull: [] },
                        )
                    }
                />,
            );
            expect(screen.queryByText('field1:')).toBeInTheDocument();
            expect(screen.getByText('value1')).toBeInTheDocument();
            expect(screen.queryByText(/A123T,G234C/)).toBeInTheDocument();
        });

        const mockRemoveFilter = vi.fn();
        beforeEach(() => {
            mockRemoveFilter.mockReset();
        });

        it('remove button is there and handles removal correctly', () => {
            render(
                <ActiveFilters
                    sequenceFilter={
                        new FieldFilterSet(
                            new MetadataFilterSchema([]),
                            { field1: 'value1' },
                            {},
                            { nucleotideSequences: [], genes: [], insdcAccessionFull: [] },
                        )
                    }
                    removeFilter={mockRemoveFilter}
                />,
            );

            const field1Text = screen.getByText('field1:');
            const removeButton = field1Text.closest('div')!.querySelector('button');
            expect(removeButton).toBeInTheDocument();
            fireEvent.click(removeButton!);

            expect(mockRemoveFilter).toHaveBeenCalledWith('field1');
        });

        it('renders UNIX timestamps as YYYY-MM-DD', () => {
            render(
                <ActiveFilters
                    sequenceFilter={
                        new FieldFilterSet(
                            new MetadataFilterSchema([{ name: 'releaseTimestamp', type: 'timestamp' }]),
                            { releaseTimestamp: '1742288104' },
                            {},
                            { nucleotideSequences: [], genes: [], insdcAccessionFull: [] },
                        )
                    }
                />,
            );

            expect(screen.queryByText('2025-03-18')).toBeInTheDocument();
            expect(screen.queryByText('1742288104')).not.toBeInTheDocument();
        });

        it('render substring-search fields correctly', () => {
            render(
                <ActiveFilters
                    sequenceFilter={
                        new FieldFilterSet(
                            new MetadataFilterSchema([
                                { name: 'authorAffiliations', type: 'string', substringSearch: true },
                            ]),
                            { authorAffiliations: 'foo' },
                            {},
                            { nucleotideSequences: [], genes: [], insdcAccessionFull: [] },
                        )
                    }
                />,
            );

            screen.debug();
            expect(screen.queryByText('authorAffiliations:')).toBeInTheDocument();
            expect(screen.queryByText('authorAffiliations.regex:')).not.toBeInTheDocument();
        });
    });

    describe('with selected sequences', () => {
        it('renders an empty selection as null', () => {
            const { container } = render(<ActiveFilters sequenceFilter={new SequenceEntrySelection(new Set())} />);
            expect(container).toBeEmptyDOMElement();
        });

        it('renders a single selected sequence correctly', () => {
            render(<ActiveFilters sequenceFilter={new SequenceEntrySelection(new Set(['SEQID1']))} />);
            expect(screen.getByText('single sequence:')).toBeInTheDocument();
            expect(screen.getByText('SEQID1')).toBeInTheDocument();
        });

        it('renders a two selected sequences correctly', () => {
            render(<ActiveFilters sequenceFilter={new SequenceEntrySelection(new Set(['SEQID1', 'SEQID2']))} />);
            expect(screen.getByText('sequences selected:')).toBeInTheDocument();
            expect(screen.getByText('SEQID1, SEQID2')).toBeInTheDocument();
        });

        it('renders a three selected sequences correctly', () => {
            render(
                <ActiveFilters sequenceFilter={new SequenceEntrySelection(new Set(['SEQID1', 'SEQID2', 'SEQID3']))} />,
            );
            expect(screen.getByText('sequences selected:')).toBeInTheDocument();
            expect(screen.getByText('3')).toBeInTheDocument();
        });
    });
});
