import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ActiveFilters } from './ActiveFilters';
import { FieldFilter, SelectFilter } from '../SearchPage/DownloadDialog/SequenceFilters';

describe('ActiveDownloadFilters', () => {
    describe('with LAPIS filters', () => {
        it('renders empty filters as null', () => {
            const { container } = render(<ActiveFilters sequenceFilter={new FieldFilter({}, {}, [])} />);
            expect(container).toBeEmptyDOMElement();
        });

        it('renders filters correctly', () => {
            render(
                <ActiveFilters
                    sequenceFilter={new FieldFilter({ field1: 'value1', nucleotideMutations: 'A123T,G234C' }, {}, [])}
                />,
            );
            expect(screen.queryByText(/Active filters/)).toBeInTheDocument();
            expect(screen.queryByText('field1:')).toBeInTheDocument();
            expect(screen.getByText('value1')).toBeInTheDocument();
            expect(screen.queryByText(/A123T,G234C/)).toBeInTheDocument();
        });
    });

    describe('with selected sequences', () => {
        it('renders an empty selection as null', () => {
            const { container } = render(<ActiveFilters sequenceFilter={new SelectFilter(new Set())} />);
            expect(container).toBeEmptyDOMElement();
        });

        it('renders a single selected sequence correctly', () => {
            render(<ActiveFilters sequenceFilter={new SelectFilter(new Set(['SEQID1']))} />);
            expect(screen.queryByText(/Active filters/)).toBeInTheDocument();
            expect(screen.getByText('single sequence:')).toBeInTheDocument();
            expect(screen.getByText('SEQID1')).toBeInTheDocument();
        });

        it('renders a two selected sequences correctly', () => {
            render(<ActiveFilters sequenceFilter={new SelectFilter(new Set(['SEQID1', 'SEQID2']))} />);
            expect(screen.queryByText(/Active filters/)).toBeInTheDocument();
            expect(screen.getByText('sequences selected:')).toBeInTheDocument();
            expect(screen.getByText('SEQID1, SEQID2')).toBeInTheDocument();
        });

        it('renders a three selected sequences correctly', () => {
            render(<ActiveFilters sequenceFilter={new SelectFilter(new Set(['SEQID1', 'SEQID2', 'SEQID3']))} />);
            expect(screen.queryByText(/Active filters/)).toBeInTheDocument();
            expect(screen.getByText('sequences selected:')).toBeInTheDocument();
            expect(screen.getByText('3')).toBeInTheDocument();
        });
    });
});
