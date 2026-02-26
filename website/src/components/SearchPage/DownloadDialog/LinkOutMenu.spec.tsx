import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

import { DownloadUrlGenerator } from './DownloadUrlGenerator';
import { LinkOutMenu } from './LinkOutMenu';
import { FieldFilterSet } from './SequenceFilters';
import type { LinkOut } from '../../../types/config';
import {
    MULTI_SEG_MULTI_REF_REFERENCEGENOMES,
    SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
} from '../../../types/referenceGenomes.spec';

const originalWindowOpen = window.open;
beforeEach(() => {
    window.open = vi.fn();
});

afterEach(() => {
    window.open = originalWindowOpen;
});

const realDownloadUrlGenerator = new DownloadUrlGenerator('test', 'http://testurl.com/sample', true, ['name', 'date']);

const mockSequenceFilter = FieldFilterSet.empty();

const linkOuts = [
    {
        name: 'Basic',
        url: 'http://example.com/tool?data=[unalignedNucleotideSequences]',
        description: 'Basic tool description',
    },
    { name: 'Format', url: 'http://example.com/tool?data=[unalignedNucleotideSequences|json]' },
    { name: 'Segment', url: 'http://example.com/tool?data=[unalignedNucleotideSequences:S]' },
    { name: 'SegmentFormat', url: 'http://example.com/tool?data=[unalignedNucleotideSequences:S|json]' },
    { name: 'Rich', url: 'http://example.com/tool?data=[unalignedNucleotideSequences+rich]' },
    { name: 'RichFormat', url: 'http://example.com/tool?data=[unalignedNucleotideSequences+rich|json]' },
    { name: 'SegmentRich', url: 'http://example.com/tool?data=[unalignedNucleotideSequences:S+rich]' },
    {
        name: 'Complete',
        url: 'http://example.com/tool?data=[unalignedNucleotideSequences:S+rich|json]',
        description: 'Complete tool with all options',
    },
    {
        name: 'Multiple',
        url: 'http://example.com/tool?data1=[unalignedNucleotideSequences]&data2=[metadata|json]',
    },
    { name: 'MetadataFields', url: 'http://example.com/tool?data=[metadata+fieldA,fieldB]' },
    { name: 'MetadataSingle', url: 'http://example.com/tool?data=[metadata+fieldA]' },
    { name: 'Invalid', url: 'http://example.com/tool?data=[invalidType]&valid=[metadata]' },
];

describe('LinkOutMenu with enabled data use terms', () => {
    test('opens modal when a tool is clicked', () => {
        render(
            <LinkOutMenu
                downloadUrlGenerator={realDownloadUrlGenerator}
                sequenceFilter={mockSequenceFilter}
                sequenceCount={1}
                linkOuts={linkOuts}
                dataUseTermsEnabled={true}
                referenceGenomesInfo={SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Tools/ }));
        fireEvent.click(screen.getByText('Basic'));

        expect(screen.getByText('Options for launching Basic')).toBeInTheDocument();
        expect(screen.getByText('Data use terms')).toBeInTheDocument();
    });

    test('generates URLs with open-access only when selected', () => {
        const generateDownloadUrlSpy = vi.spyOn(realDownloadUrlGenerator, 'generateDownloadUrl');

        render(
            <LinkOutMenu
                downloadUrlGenerator={realDownloadUrlGenerator}
                sequenceFilter={mockSequenceFilter}
                sequenceCount={1}
                linkOuts={linkOuts}
                dataUseTermsEnabled={true}
                referenceGenomesInfo={SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Tools/ }));
        fireEvent.click(screen.getByText('Basic'));
        fireEvent.click(screen.getByText('Open sequences only'));

        expect(window.open).toHaveBeenCalled();
        expect(generateDownloadUrlSpy).toHaveBeenCalledWith(
            mockSequenceFilter,
            expect.objectContaining({
                includeRestricted: false,
            }),
        );
    });

    test('generates URLs with restricted sequences when selected', () => {
        const generateDownloadUrlSpy = vi.spyOn(realDownloadUrlGenerator, 'generateDownloadUrl');

        render(
            <LinkOutMenu
                downloadUrlGenerator={realDownloadUrlGenerator}
                sequenceFilter={mockSequenceFilter}
                sequenceCount={1}
                linkOuts={linkOuts}
                dataUseTermsEnabled={true}
                referenceGenomesInfo={SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Tools/ }));
        fireEvent.click(screen.getByText('Basic'));
        fireEvent.click(screen.getByText('Include Restricted-Use'));

        expect(window.open).toHaveBeenCalled();
        expect(generateDownloadUrlSpy).toHaveBeenCalledWith(
            mockSequenceFilter,
            expect.objectContaining({
                includeRestricted: true,
            }),
        );
    });

    test('verifies URL generation for different formats', () => {
        vi.clearAllMocks();

        render(
            <LinkOutMenu
                downloadUrlGenerator={realDownloadUrlGenerator}
                sequenceFilter={mockSequenceFilter}
                sequenceCount={1}
                linkOuts={[{ name: 'Basic', url: 'http://example.com/tool?data=[unalignedNucleotideSequences]' }]}
                dataUseTermsEnabled={true}
                referenceGenomesInfo={SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Tools/ }));
        fireEvent.click(screen.getByText('Basic'));
        fireEvent.click(screen.getByText('Include Restricted-Use'));

        expect(window.open).toHaveBeenCalled();
        expect(vi.mocked(window.open).mock.calls[0][0]).not.toBeUndefined();
    });

    test('passes metadata fields to URL generator', () => {
        vi.clearAllMocks();
        const generateDownloadUrlSpy = vi.spyOn(realDownloadUrlGenerator, 'generateDownloadUrl');

        render(
            <LinkOutMenu
                downloadUrlGenerator={realDownloadUrlGenerator}
                sequenceFilter={mockSequenceFilter}
                sequenceCount={1}
                linkOuts={[{ name: 'MetadataFields', url: 'http://example.com/tool?data=[metadata+fieldA,fieldB]' }]}
                dataUseTermsEnabled={true}
                referenceGenomesInfo={SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Tools/ }));
        fireEvent.click(screen.getByText('MetadataFields'));
        fireEvent.click(screen.getByText('Include Restricted-Use'));

        expect(generateDownloadUrlSpy).toHaveBeenCalledWith(
            mockSequenceFilter,
            expect.objectContaining({
                dataType: { type: 'metadata', fields: ['fieldA', 'fieldB'] },
            }),
        );
    });

    test('passes single metadata field to URL generator', () => {
        vi.clearAllMocks();
        const generateDownloadUrlSpy = vi.spyOn(realDownloadUrlGenerator, 'generateDownloadUrl');

        render(
            <LinkOutMenu
                downloadUrlGenerator={realDownloadUrlGenerator}
                sequenceFilter={mockSequenceFilter}
                sequenceCount={1}
                linkOuts={[{ name: 'MetadataSingle', url: 'http://example.com/tool?data=[metadata+fieldA]' }]}
                dataUseTermsEnabled={true}
                referenceGenomesInfo={SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Tools/ }));
        fireEvent.click(screen.getByText('MetadataSingle'));
        fireEvent.click(screen.getByText('Include Restricted-Use'));

        expect(generateDownloadUrlSpy).toHaveBeenCalledWith(
            mockSequenceFilter,
            expect.objectContaining({ dataType: { type: 'metadata', fields: ['fieldA'] } }),
        );
    });
});

describe('LinkOutMenu with disabled data use terms', () => {
    test('opens tool when it is clicked', () => {
        render(
            <LinkOutMenu
                downloadUrlGenerator={realDownloadUrlGenerator}
                sequenceFilter={mockSequenceFilter}
                sequenceCount={1}
                linkOuts={linkOuts}
                dataUseTermsEnabled={false}
                referenceGenomesInfo={SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Tools/ }));
        fireEvent.click(screen.getByText('Basic'));

        expect(window.open).toHaveBeenCalled();
    });
});

describe('LinkOutMenu filtering with onlyForReferences', () => {
    const filteredLinkOut = {
        name: 'FilteredTool',
        url: 'http://example.com/tool?data=[unalignedNucleotideSequences]',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        onlyForReferences: { S: 'ref1' },
    };
    const unfilteredLinkOut = {
        name: 'UnfilteredTool',
        url: 'http://example.com/tool?data=[unalignedNucleotideSequences]',
    };

    test('shows linkOut with onlyForReferences when no referenceSelection is provided', () => {
        render(
            <LinkOutMenu
                downloadUrlGenerator={realDownloadUrlGenerator}
                sequenceFilter={mockSequenceFilter}
                sequenceCount={1}
                linkOuts={[filteredLinkOut, unfilteredLinkOut]}
                dataUseTermsEnabled={false}
                referenceGenomesInfo={MULTI_SEG_MULTI_REF_REFERENCEGENOMES}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Tools/ }));
        expect(screen.getByText('FilteredTool')).toBeInTheDocument();
        expect(screen.getByText('UnfilteredTool')).toBeInTheDocument();
    });

    test('shows linkOut with onlyForReferences when the selected reference matches', () => {
        render(
            <LinkOutMenu
                downloadUrlGenerator={realDownloadUrlGenerator}
                sequenceFilter={mockSequenceFilter}
                sequenceCount={1}
                linkOuts={[filteredLinkOut, unfilteredLinkOut]}
                dataUseTermsEnabled={false}
                // eslint-disable-next-line @typescript-eslint/naming-convention
                referenceSelection={{ referenceIdentifierField: 'reference', selectedReferences: { S: 'ref1' } }}
                referenceGenomesInfo={MULTI_SEG_MULTI_REF_REFERENCEGENOMES}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Tools/ }));
        expect(screen.getByText('FilteredTool')).toBeInTheDocument();
        expect(screen.getByText('UnfilteredTool')).toBeInTheDocument();
    });

    test('hides linkOut with onlyForReferences when the selected reference does not match', () => {
        render(
            <LinkOutMenu
                downloadUrlGenerator={realDownloadUrlGenerator}
                sequenceFilter={mockSequenceFilter}
                sequenceCount={1}
                linkOuts={[filteredLinkOut, unfilteredLinkOut]}
                dataUseTermsEnabled={false}
                // eslint-disable-next-line @typescript-eslint/naming-convention
                referenceSelection={{ referenceIdentifierField: 'reference', selectedReferences: { S: 'ref2' } }}
                referenceGenomesInfo={MULTI_SEG_MULTI_REF_REFERENCEGENOMES}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Tools/ }));
        expect(screen.queryByText('FilteredTool')).not.toBeInTheDocument();
        expect(screen.getByText('UnfilteredTool')).toBeInTheDocument();
    });

    test('shows linkOut with onlyForReferences when the segment reference is null (no selection)', () => {
        render(
            <LinkOutMenu
                downloadUrlGenerator={realDownloadUrlGenerator}
                sequenceFilter={mockSequenceFilter}
                sequenceCount={1}
                linkOuts={[filteredLinkOut, unfilteredLinkOut]}
                dataUseTermsEnabled={false}
                // eslint-disable-next-line @typescript-eslint/naming-convention
                referenceSelection={{ referenceIdentifierField: 'reference', selectedReferences: { S: null } }}
                referenceGenomesInfo={MULTI_SEG_MULTI_REF_REFERENCEGENOMES}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Tools/ }));
        expect(screen.getByText('FilteredTool')).toBeInTheDocument();
        expect(screen.getByText('UnfilteredTool')).toBeInTheDocument();
    });
});

describe('LinkOutMenu grouping with category field', () => {
    const categorizedLinkOuts: LinkOut[] = [
        {
            name: 'GlobalTool',
            url: 'http://example.com/tool?data=[unalignedNucleotideSequences]',
        },
        {
            name: 'SegmentLTool',
            url: 'http://example.com/tool?data=[unalignedNucleotideSequences:L]',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            onlyForReferences: { L: 'ref1' },
            category: 'L',
        },
        {
            name: 'SegmentSTool',
            url: 'http://example.com/tool?data=[unalignedNucleotideSequences:S]',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            onlyForReferences: { S: 'ref2' },
            category: 'S',
        },
    ];

    test('places categorized linkOuts into labelled sections and uncategorized tools at the top', () => {
        render(
            <LinkOutMenu
                downloadUrlGenerator={realDownloadUrlGenerator}
                sequenceFilter={mockSequenceFilter}
                sequenceCount={1}
                linkOuts={categorizedLinkOuts}
                dataUseTermsEnabled={false}
                referenceGenomesInfo={MULTI_SEG_MULTI_REF_REFERENCEGENOMES}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Tools/ }));

        expect(screen.getByText('GlobalTool')).toBeInTheDocument();
        expect(screen.getByText('L')).toBeInTheDocument();
        expect(screen.getByText('SegmentLTool')).toBeInTheDocument();
        expect(screen.getByText('S')).toBeInTheDocument();
        expect(screen.getByText('SegmentSTool')).toBeInTheDocument();
    });

    test('hides a categorized linkOut when its reference does not match, removing empty category headers', () => {
        render(
            <LinkOutMenu
                downloadUrlGenerator={realDownloadUrlGenerator}
                sequenceFilter={mockSequenceFilter}
                sequenceCount={1}
                linkOuts={categorizedLinkOuts}
                dataUseTermsEnabled={false}
                referenceGenomesInfo={MULTI_SEG_MULTI_REF_REFERENCEGENOMES}
                referenceSelection={{
                    referenceIdentifierField: 'reference',
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    selectedReferences: { L: 'other', S: null },
                }}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Tools/ }));

        expect(screen.getByText('GlobalTool')).toBeInTheDocument();
        expect(screen.queryByText('SegmentLTool')).not.toBeInTheDocument();
        expect(screen.getByText('SegmentSTool')).toBeInTheDocument();
        expect(screen.queryByText('L')).not.toBeInTheDocument();
        expect(screen.getByText('S')).toBeInTheDocument();
    });

});
