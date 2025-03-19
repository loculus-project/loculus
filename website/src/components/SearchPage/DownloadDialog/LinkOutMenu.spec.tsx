import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { LinkOutMenu } from './LinkOutMenu';
import { DownloadUrlGenerator } from './DownloadUrlGenerator';
import { FieldFilter } from './SequenceFilters';

// Mock dependencies
const mockDownloadUrlGenerator = {
    generateDownloadUrl: vi.fn((sequenceFilter: any, downloadOption: any) => {
        return {
            url: `http://testurl.com/${downloadOption.dataType.type}${downloadOption.dataType.segment ? '/' + downloadOption.dataType.segment : ''}${downloadOption.dataType.includeRichFastaHeaders ? '/rich' : ''}${downloadOption.dataFormat ? '?format=' + downloadOption.dataFormat : ''}`,
            baseUrl: 'http://testurl.com',
            params: new URLSearchParams(),
        };
    }),
};

const mockSequenceFilter = new FieldFilter({}, {}, []);

describe('LinkOutMenu', () => {
    test('generates correct URLs for different placeholder formats', async () => {
        // Test all different placeholder formats in one test
        const linkOuts = [
            { name: 'Basic', url: 'http://example.com/tool?data=[unalignedNucleotideSequences]' },
            { name: 'Format', url: 'http://example.com/tool?data=[unalignedNucleotideSequences|json]' },
            { name: 'Segment', url: 'http://example.com/tool?data=[unalignedNucleotideSequences:S]' },
            { name: 'SegmentFormat', url: 'http://example.com/tool?data=[unalignedNucleotideSequences:S|json]' },
            { name: 'Rich', url: 'http://example.com/tool?data=[unalignedNucleotideSequences+rich]' },
            { name: 'RichFormat', url: 'http://example.com/tool?data=[unalignedNucleotideSequences+rich|json]' },
            { name: 'SegmentRich', url: 'http://example.com/tool?data=[unalignedNucleotideSequences:S+rich]' },
            { name: 'Complete', url: 'http://example.com/tool?data=[unalignedNucleotideSequences:S+rich|json]' },
            { name: 'Multiple', url: 'http://example.com/tool?data1=[unalignedNucleotideSequences]&data2=[metadata|json]' },
            { name: 'Invalid', url: 'http://example.com/tool?data=[invalidType]&valid=[metadata]' },
        ];

        render(
            <LinkOutMenu
                downloadUrlGenerator={mockDownloadUrlGenerator as any}
                sequenceFilter={mockSequenceFilter}
                linkOuts={linkOuts}
            />,
        );

        // Click the 'Tools' button to open the menu
        await fireEvent.click(screen.getByRole('button', { name: /Tools/ }));

        // Now we can check the various menu items and verify the generated URLs
        // For each test case, we need to check that mockDownloadUrlGenerator.generateDownloadUrl was called
        // with the expected parameters

        // Verify the basic call
        expect(mockDownloadUrlGenerator.generateDownloadUrl).toHaveBeenCalledWith(
            mockSequenceFilter,
            expect.objectContaining({
                dataType: {
                    type: 'unalignedNucleotideSequences',
                    segment: undefined,
                    includeRichFastaHeaders: undefined,
                },
                dataFormat: undefined,
            })
        );

        // Verify format call
        expect(mockDownloadUrlGenerator.generateDownloadUrl).toHaveBeenCalledWith(
            mockSequenceFilter,
            expect.objectContaining({
                dataType: {
                    type: 'unalignedNucleotideSequences',
                    segment: undefined,
                    includeRichFastaHeaders: undefined,
                },
                dataFormat: 'json',
            })
        );

        // Verify segment call
        expect(mockDownloadUrlGenerator.generateDownloadUrl).toHaveBeenCalledWith(
            mockSequenceFilter,
            expect.objectContaining({
                dataType: {
                    type: 'unalignedNucleotideSequences',
                    segment: 'S',
                    includeRichFastaHeaders: undefined,
                },
                dataFormat: undefined,
            })
        );

        // Verify segment with format call
        expect(mockDownloadUrlGenerator.generateDownloadUrl).toHaveBeenCalledWith(
            mockSequenceFilter,
            expect.objectContaining({
                dataType: {
                    type: 'unalignedNucleotideSequences',
                    segment: 'S',
                    includeRichFastaHeaders: undefined,
                },
                dataFormat: 'json',
            })
        );

        // Verify rich headers call
        expect(mockDownloadUrlGenerator.generateDownloadUrl).toHaveBeenCalledWith(
            mockSequenceFilter,
            expect.objectContaining({
                dataType: {
                    type: 'unalignedNucleotideSequences',
                    segment: undefined,
                    includeRichFastaHeaders: true,
                },
                dataFormat: undefined,
            })
        );

        // Verify rich headers with format call
        expect(mockDownloadUrlGenerator.generateDownloadUrl).toHaveBeenCalledWith(
            mockSequenceFilter,
            expect.objectContaining({
                dataType: {
                    type: 'unalignedNucleotideSequences',
                    segment: undefined,
                    includeRichFastaHeaders: true,
                },
                dataFormat: 'json',
            })
        );

        // Verify segment with rich headers call
        expect(mockDownloadUrlGenerator.generateDownloadUrl).toHaveBeenCalledWith(
            mockSequenceFilter,
            expect.objectContaining({
                dataType: {
                    type: 'unalignedNucleotideSequences',
                    segment: 'S',
                    includeRichFastaHeaders: true,
                },
                dataFormat: undefined,
            })
        );

        // Verify segment with rich headers and format call
        expect(mockDownloadUrlGenerator.generateDownloadUrl).toHaveBeenCalledWith(
            mockSequenceFilter,
            expect.objectContaining({
                dataType: {
                    type: 'unalignedNucleotideSequences',
                    segment: 'S',
                    includeRichFastaHeaders: true,
                },
                dataFormat: 'json',
            })
        );

        // Verify metadata call
        expect(mockDownloadUrlGenerator.generateDownloadUrl).toHaveBeenCalledWith(
            mockSequenceFilter,
            expect.objectContaining({
                dataType: {
                    type: 'metadata',
                    segment: undefined,
                },
                dataFormat: 'json',
            })
        );

        // Invalid data type should not call generateDownloadUrl
        expect(mockDownloadUrlGenerator.generateDownloadUrl).not.toHaveBeenCalledWith(
            mockSequenceFilter,
            expect.objectContaining({
                dataType: {
                    type: 'invalidType',
                },
            })
        );
    });
});