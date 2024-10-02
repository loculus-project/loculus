import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ActiveDownloadFilters } from "./ActiveDownloadFilters";

describe('Test ActiveDownloadFilters', () => {
    test('renders empty filters as null', () => {
        const { container } = render(<ActiveDownloadFilters downloadParameters={{
            type: 'filter',
            lapisSearchParameters: {},
            hiddenFieldValues: {}
        }} />);
        expect(container).toBeEmptyDOMElement();
    })

    test('renders an empty selection as null', () => {
        const { container } = render(<ActiveDownloadFilters downloadParameters={{
            type: 'select',
            selectedSequences: [],
        }} />);
        expect(container).toBeEmptyDOMElement();
    })

    test('renders a single selected sequence correctly', () => {
        render(<ActiveDownloadFilters downloadParameters={{
            type: 'select',
            selectedSequences: ['SEQID1'],
        }} />);
        expect(screen.queryByText(/Active filters/)).toBeInTheDocument();
        expect(screen.getByText('1 sequence selected')).toBeInTheDocument();
    })

    test('renders a two selected sequences correctly', () => {
        render(<ActiveDownloadFilters downloadParameters={{
            type: 'select',
            selectedSequences: ['SEQID1', 'SEQID2'],
        }} />);
        expect(screen.queryByText(/Active filters/)).toBeInTheDocument();
        expect(screen.getByText('2 sequences selected')).toBeInTheDocument();
    })

    test('renders filters correctly', () => {
        render(<ActiveDownloadFilters downloadParameters={{
            type: 'filter',
            lapisSearchParameters: { field1: 'value1', nucleotideMutations: 'A123T,G234C' },
            hiddenFieldValues: {}
        }} />);
        expect(screen.queryByText(/Active filters/)).toBeInTheDocument();
        expect(screen.queryByText('field1: value1')).toBeInTheDocument();
        expect(screen.queryByText(/A123T,G234C/)).toBeInTheDocument();
    });
});