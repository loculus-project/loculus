import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActiveFilters } from './ActiveFilters';
import { FilterSchema } from '../../utils/search';
import { FieldFilter, SelectFilter } from '../SearchPage/DownloadDialog/SequenceFilters';

describe('ActiveFilters', () => {
    describe('with LAPIS filters', () => {
        it('renders empty filters as null', () => {
            const { container } = render(
                <ActiveFilters sequenceFilter={new FieldFilter({}, {}, new FilterSchema([]))} />,
            );
            expect(container).toBeEmptyDOMElement();
        });

        it('renders filters correctly', () => {
            render(
                <ActiveFilters
                    sequenceFilter={
                        new FieldFilter(
                            { field1: 'value1', nucleotideMutations: 'A123T,G234C' },
                            {},
                            new FilterSchema([]),
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
                        new FieldFilter(
                            { field1: 'value1', nucleotideMutations: 'A123T,G234C' },
                            {},
                            new FilterSchema([]),
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
                        new FieldFilter(
                            { releaseTimestamp: '1742288104' },
                            {},
                            new FilterSchema([{ name: 'releaseTimestamp', type: 'timestamp' }]),
                        )
                    }
                />,
            );

            expect(screen.queryByText('2025-03-18')).toBeInTheDocument();
            expect(screen.queryByText('1742288104')).not.toBeInTheDocument();
        });
    });

    describe('with selected sequences', () => {
        it('renders an empty selection as null', () => {
            const { container } = render(<ActiveFilters sequenceFilter={new SelectFilter(new Set())} />);
            expect(container).toBeEmptyDOMElement();
        });

        it('renders a single selected sequence correctly', () => {
            render(<ActiveFilters sequenceFilter={new SelectFilter(new Set(['SEQID1']))} />);
            expect(screen.getByText('single sequence:')).toBeInTheDocument();
            expect(screen.getByText('SEQID1')).toBeInTheDocument();
        });

        it('renders a two selected sequences correctly', () => {
            render(<ActiveFilters sequenceFilter={new SelectFilter(new Set(['SEQID1', 'SEQID2']))} />);
            expect(screen.getByText('sequences selected:')).toBeInTheDocument();
            expect(screen.getByText('SEQID1, SEQID2')).toBeInTheDocument();
        });

        it('renders a three selected sequences correctly', () => {
            render(<ActiveFilters sequenceFilter={new SelectFilter(new Set(['SEQID1', 'SEQID2', 'SEQID3']))} />);
            expect(screen.getByText('sequences selected:')).toBeInTheDocument();
            expect(screen.getByText('3')).toBeInTheDocument();
        });
    });
});
