import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SegmentFilter } from './SegmentFilter.tsx';
import type { MetadataFilter } from '../../types/config.ts';
import {
    MULTI_SEG_MULTI_REF_REFERENCEGENOMES,
    MULTI_SEG_SINGLE_REF_REFERENCEGENOMES,
    SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
} from '../../types/referenceGenomes.spec.ts';
import { MetadataFilterSchema } from '../../utils/search.ts';

// Schema with length_From fields for both segments (S and L)
const lengthFields: MetadataFilter[] = [
    { name: 'length_SFrom', type: 'int' },
    { name: 'length_LFrom', type: 'int' },
];
const filterSchemaWithLengthFields = new MetadataFilterSchema(lengthFields);
const filterSchemaEmpty = new MetadataFilterSchema([]);

describe('SegmentFilter', () => {
    it('renders nothing for single-segmented organism', () => {
        const { container } = render(
            <SegmentFilter
                referenceGenomesInfo={SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES}
                fieldValues={{}}
                setSomeFieldValues={vi.fn()}
                filterSchema={filterSchemaWithLengthFields}
            />,
        );

        expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing when no length fields are in the schema', () => {
        const { container } = render(
            <SegmentFilter
                referenceGenomesInfo={MULTI_SEG_SINGLE_REF_REFERENCEGENOMES}
                fieldValues={{}}
                setSomeFieldValues={vi.fn()}
                filterSchema={filterSchemaEmpty}
            />,
        );

        expect(container).toBeEmptyDOMElement();
    });

    it('renders a checkbox for each segment that has a length field', () => {
        render(
            <SegmentFilter
                referenceGenomesInfo={MULTI_SEG_SINGLE_REF_REFERENCEGENOMES}
                fieldValues={{}}
                setSomeFieldValues={vi.fn()}
                filterSchema={filterSchemaWithLengthFields}
            />,
        );

        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes).toHaveLength(2);
    });

    it('shows segment display names when configured', () => {
        render(
            <SegmentFilter
                referenceGenomesInfo={MULTI_SEG_MULTI_REF_REFERENCEGENOMES}
                fieldValues={{}}
                setSomeFieldValues={vi.fn()}
                filterSchema={filterSchemaWithLengthFields}
            />,
        );

        expect(screen.getByText('S (segment)')).toBeInTheDocument();
        expect(screen.getByText('L (segment)')).toBeInTheDocument();
    });

    it('falls back to segment name when no display name is configured', () => {
        render(
            <SegmentFilter
                referenceGenomesInfo={MULTI_SEG_SINGLE_REF_REFERENCEGENOMES}
                fieldValues={{}}
                setSomeFieldValues={vi.fn()}
                filterSchema={filterSchemaWithLengthFields}
            />,
        );

        expect(screen.getByText('S')).toBeInTheDocument();
        expect(screen.getByText('L')).toBeInTheDocument();
    });

    it('renders checkbox as checked when length field value is greater than 0', () => {
        render(
            <SegmentFilter
                referenceGenomesInfo={MULTI_SEG_SINGLE_REF_REFERENCEGENOMES}
                // eslint-disable-next-line @typescript-eslint/naming-convention
                fieldValues={{ length_SFrom: '1' }}
                setSomeFieldValues={vi.fn()}
                filterSchema={filterSchemaWithLengthFields}
            />,
        );

        const sCheckbox = screen.getByRole('checkbox', { name: 'S' });
        expect(sCheckbox).toBeChecked();
    });

    it('renders checkbox as unchecked when length field value is empty', () => {
        render(
            <SegmentFilter
                referenceGenomesInfo={MULTI_SEG_SINGLE_REF_REFERENCEGENOMES}
                // eslint-disable-next-line @typescript-eslint/naming-convention
                fieldValues={{ length_SFrom: '' }}
                setSomeFieldValues={vi.fn()}
                filterSchema={filterSchemaWithLengthFields}
            />,
        );

        const checkboxes = screen.getAllByRole('checkbox');
        checkboxes.forEach((cb) => expect(cb).not.toBeChecked());
    });

    it('renders checkbox as unchecked when length field is absent from fieldValues', () => {
        render(
            <SegmentFilter
                referenceGenomesInfo={MULTI_SEG_SINGLE_REF_REFERENCEGENOMES}
                fieldValues={{}}
                setSomeFieldValues={vi.fn()}
                filterSchema={filterSchemaWithLengthFields}
            />,
        );

        const checkboxes = screen.getAllByRole('checkbox');
        checkboxes.forEach((cb) => expect(cb).not.toBeChecked());
    });

    it('calls setSomeFieldValues with "1" when an unchecked box is clicked', async () => {
        const setSomeFieldValues = vi.fn();
        render(
            <SegmentFilter
                referenceGenomesInfo={MULTI_SEG_SINGLE_REF_REFERENCEGENOMES}
                fieldValues={{}}
                setSomeFieldValues={setSomeFieldValues}
                filterSchema={filterSchemaWithLengthFields}
            />,
        );

        const sLabel = screen.getByText('S').closest('label')!;
        const sCheckbox = sLabel.querySelector('input[type="checkbox"]')!;
        await userEvent.click(sCheckbox);

        expect(setSomeFieldValues).toHaveBeenCalledWith(['length_SFrom', '1']);
    });

    it('calls setSomeFieldValues with null when a checked box is clicked', async () => {
        const setSomeFieldValues = vi.fn();
        render(
            <SegmentFilter
                referenceGenomesInfo={MULTI_SEG_SINGLE_REF_REFERENCEGENOMES}
                // eslint-disable-next-line @typescript-eslint/naming-convention
                fieldValues={{ length_SFrom: '1' }}
                setSomeFieldValues={setSomeFieldValues}
                filterSchema={filterSchemaWithLengthFields}
            />,
        );

        const sLabel = screen.getByText('S').closest('label')!;
        const sCheckbox = sLabel.querySelector('input[type="checkbox"]')!;
        await userEvent.click(sCheckbox);

        expect(setSomeFieldValues).toHaveBeenCalledWith(['length_SFrom', null]);
    });

    it('only shows segments that have a matching length field in the schema', () => {
        // Only provide a length field for S, not L
        const partialSchema = new MetadataFilterSchema([{ name: 'length_SFrom', type: 'int' }]);

        render(
            <SegmentFilter
                referenceGenomesInfo={MULTI_SEG_SINGLE_REF_REFERENCEGENOMES}
                fieldValues={{}}
                setSomeFieldValues={vi.fn()}
                filterSchema={partialSchema}
            />,
        );

        expect(screen.getByText('S')).toBeInTheDocument();
        expect(screen.queryByText('L')).not.toBeInTheDocument();
        expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    });
});
