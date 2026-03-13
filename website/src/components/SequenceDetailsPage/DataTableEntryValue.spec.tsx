import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import CustomDisplayComponent from './DataTableEntryValue';
import type { TableDataEntry } from './types';
import type { ReferenceGenomesInfo } from '../../types/referencesGenomes';

const makeData = (jsonValue: object, overrides: Partial<TableDataEntry> = {}): TableDataEntry => ({
    label: 'Test Field',
    name: 'testField',
    value: JSON.stringify(jsonValue),
    header: 'Test Header',
    type: { kind: 'metadata', metadataType: 'string' },
    customDisplay: { type: 'variantReference' },
    ...overrides,
});

const renderVariantReference = (jsonValue: object, referenceGenomesInfo: ReferenceGenomesInfo) =>
    render(
        <CustomDisplayComponent
            data={makeData(jsonValue)}
            dataUseTermsHistory={[]}
            referenceGenomesInfo={referenceGenomesInfo}
        />,
    );

const singleSegInfo: ReferenceGenomesInfo = {
    segmentReferenceGenomes: {
        main: {
            refA: { lapisName: 'main', insdcAccessionFull: null, genes: [], displayName: 'Reference A' },
            refB: { lapisName: 'main-refB', insdcAccessionFull: null, genes: [], displayName: 'Reference B' },
        },
    },
    segmentDisplayNames: { main: 'Main Segment' },
    isMultiSegmented: false,
    useLapisMultiSegmentedEndpoint: false,
};

describe('VariantReferenceComponent', () => {
    it('shows the reference displayName when not a variant', () => {
        renderVariantReference(
            [
                { name: 'reference_main', value: 'refA' },
                { name: 'variant_main', value: 'false' },
            ],
            singleSegInfo,
        );

        expect(screen.getByText('Reference A')).toBeInTheDocument();
        expect(screen.queryByText(/variant/)).not.toBeInTheDocument();
    });

    it('appends "(variant)" when variant is true', () => {
        renderVariantReference(
            [
                { name: 'reference_main', value: 'refA' },
                { name: 'variant_main', value: 'true' },
            ],
            singleSegInfo,
        );

        expect(screen.getByText('Reference A (variant)')).toBeInTheDocument();
    });

    it('shows "N/A" when no matching reference entry is present', () => {
        renderVariantReference([], singleSegInfo);

        expect(screen.getByText('N/A')).toBeInTheDocument();
    });

    it('falls back to the raw reference name when no displayName is configured', () => {
        const infoWithoutDisplayName: ReferenceGenomesInfo = {
            segmentReferenceGenomes: {
                main: {
                    refA: { lapisName: 'main', insdcAccessionFull: null, genes: [] },
                },
            },
            segmentDisplayNames: {},
            isMultiSegmented: false,
            useLapisMultiSegmentedEndpoint: false,
        };

        renderVariantReference([{ name: 'reference_main', value: 'refA' }], infoWithoutDisplayName);

        expect(screen.getByText('refA')).toBeInTheDocument();
    });

    it('treats absent variant entry as non-variant', () => {
        renderVariantReference([{ name: 'reference_main', value: 'refA' }], singleSegInfo);

        expect(screen.getByText('Reference A')).toBeInTheDocument();
        expect(screen.queryByText(/variant/)).not.toBeInTheDocument();
    });
});
