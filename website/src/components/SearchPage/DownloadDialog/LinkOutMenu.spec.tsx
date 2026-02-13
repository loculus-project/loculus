import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

import { DownloadUrlGenerator } from './DownloadUrlGenerator';
import { LinkOutMenu } from './LinkOutMenu';
import { FieldFilterSet } from './SequenceFilters';
import type { SegmentAndGeneInfo } from '../../../utils/sequenceTypeHelpers';

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

const mockSegmentAndGeneInfo: SegmentAndGeneInfo = {
    nucleotideSegmentInfos: [
        {
            lapisName: 'lapisName-main',
            name: 'label-main',
        },
    ],
    geneInfos: [],
    useLapisMultiSegmentedEndpoint: false,
};

describe('LinkOutMenu with enabled data use terms', () => {
    test('opens modal when a tool is clicked', () => {
        render(
            <LinkOutMenu
                downloadUrlGenerator={realDownloadUrlGenerator}
                sequenceFilter={mockSequenceFilter}
                sequenceCount={1}
                linkOuts={linkOuts}
                dataUseTermsEnabled={true}
                segmentAndGeneInfo={mockSegmentAndGeneInfo}
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
                segmentAndGeneInfo={mockSegmentAndGeneInfo}
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
            mockSegmentAndGeneInfo,
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
                segmentAndGeneInfo={mockSegmentAndGeneInfo}
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
            mockSegmentAndGeneInfo,
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
                segmentAndGeneInfo={mockSegmentAndGeneInfo}
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
                segmentAndGeneInfo={mockSegmentAndGeneInfo}
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
            mockSegmentAndGeneInfo,
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
                segmentAndGeneInfo={mockSegmentAndGeneInfo}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Tools/ }));
        fireEvent.click(screen.getByText('MetadataSingle'));
        fireEvent.click(screen.getByText('Include Restricted-Use'));

        expect(generateDownloadUrlSpy).toHaveBeenCalledWith(
            mockSequenceFilter,
            expect.objectContaining({ dataType: { type: 'metadata', fields: ['fieldA'] } }),
            mockSegmentAndGeneInfo,
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
                segmentAndGeneInfo={mockSegmentAndGeneInfo}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Tools/ }));
        fireEvent.click(screen.getByText('Basic'));

        expect(window.open).toHaveBeenCalled();
    });
});
