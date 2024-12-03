import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ActiveDownloadFilters } from './ActiveDownloadFilters';
import { FieldFilter, SelectFilter } from './SequenceFilters';

describe('ActiveDownloadFilters', () => {
    describe('with LAPIS filters', () => {
        it('renders empty filters as null', () => {
            const { container } = render(<ActiveDownloadFilters downloadParameters={new FieldFilter({}, {})} />);
            expect(container).toBeEmptyDOMElement();
        });

        it('renders filters correctly', () => {
            render(
                <ActiveDownloadFilters
                    downloadParameters={new FieldFilter({ field1: 'value1', nucleotideMutations: 'A123T,G234C' }, {})}
                />,
            );
            expect(screen.queryByText(/Active filters/)).toBeInTheDocument();
            expect(screen.queryByText('field1: value1')).toBeInTheDocument();
            expect(screen.queryByText(/A123T,G234C/)).toBeInTheDocument();
        });
    });

    describe('with selected sequences', () => {
        it('renders an empty selection as null', () => {
            const { container } = render(<ActiveDownloadFilters downloadParameters={new SelectFilter(new Set())} />);
            expect(container).toBeEmptyDOMElement();
        });

        it('renders a single selected sequence correctly', () => {
            render(<ActiveDownloadFilters downloadParameters={new SelectFilter(new Set(['SEQID1']))} />);
            expect(screen.queryByText(/Active filters/)).toBeInTheDocument();
            expect(screen.getByText('1 sequence selected')).toBeInTheDocument();
        });

        it('renders a two selected sequences correctly', () => {
            render(<ActiveDownloadFilters downloadParameters={new SelectFilter(new Set(['SEQID1', 'SEQID2']))} />);
            expect(screen.queryByText(/Active filters/)).toBeInTheDocument();
            expect(screen.getByText('2 sequences selected')).toBeInTheDocument();
        });
    });
});
