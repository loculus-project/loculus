import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { MutationField } from './MutationField.tsx';
import type { SingleSegmentAndGeneInfo } from '../../../utils/sequenceTypeHelpers.ts';

const singleReferenceSegmentAndGeneInfo: SingleSegmentAndGeneInfo = {
    nucleotideSegmentInfo: { lapisName: 'main', name: 'main' },
    geneInfos: [
        { lapisName: 'gene1', name: 'gene1' },
        { lapisName: 'gene2', name: 'gene2' },
    ],
};

const singleSegMultiRefGenomesMap: SingleSegmentAndGeneInfo = {
    nucleotideSegmentInfo: { lapisName: 'ref1', name: 'main' },
    geneInfos: [
        { lapisName: 'gene1', name: 'gene1' },
        { lapisName: 'gene2', name: 'gene2' },
    ],
    useLapisMultiSegmentedEndpoint: true,
    multiSegmented: false,
};

// This test also covers the multi-segmented, multi-reference case
const multiSegmentedGenomesMap: SingleSegmentAndGeneInfo = {
    nucleotideSegmentInfo: { lapisName: 'seg1', name: 'seg1' },
    geneInfos: [
        { lapisName: 'gene1', name: 'gene1' },
        { lapisName: 'gene2', name: 'gene2' },
    ],
    useLapisMultiSegmentedEndpoint: true,
    multiSegmented: true,
};

function renderField(
    value: string,
    onChange: (mutationFilter: string) => void,
    segmentAndGeneInfo: SingleSegmentAndGeneInfo,
) {
    render(<MutationField value={value} onChange={onChange} singleSegmentAndGeneInfo={segmentAndGeneInfo} />);
}

describe('MutationField', () => {
    test('should render provided value', () => {
        const handleChange = vi.fn();
        renderField('gene1:10Y, A20T, ins_30:G?G', handleChange, singleReferenceSegmentAndGeneInfo);
        expect(screen.queryByText('gene1:10Y')).toBeInTheDocument();
        expect(screen.queryByText('A20T')).toBeInTheDocument();
        expect(screen.queryByText('ins_30:G?G')).toBeInTheDocument();
    });

    test('should accept input and dispatch events (single-segmented)', async () => {
        const handleChange = vi.fn();
        renderField('', handleChange, singleReferenceSegmentAndGeneInfo);

        await userEvent.type(screen.getByLabelText('Mutations'), 'G100A{enter}');
        expect(handleChange).toHaveBeenCalledWith('G100A');
    });

    test('should accept input and dispatch events (single-segment, multi-reference)', async () => {
        const handleChange = vi.fn();
        renderField('', handleChange, singleSegMultiRefGenomesMap);

        await userEvent.type(screen.getByLabelText('Mutations'), 'G100A{enter}');
        expect(handleChange).toHaveBeenCalledWith('G100A');
    });

    test('should accept input and dispatch events (multi-segmented)', async () => {
        const handleChange = vi.fn();
        renderField('', handleChange, multiSegmentedGenomesMap);

        await userEvent.type(screen.getByLabelText('Mutations'), 'seg1:G100A{enter}');
        expect(handleChange).toHaveBeenCalledWith('seg1:G100A');
    });

    test('should reject invalid input', async () => {
        const handleChange = vi.fn();
        renderField('', handleChange, singleReferenceSegmentAndGeneInfo);

        await userEvent.type(screen.getByLabelText('Mutations'), 'main:G200A{enter}');
        expect(handleChange).toHaveBeenCalledTimes(0);
    });
});
