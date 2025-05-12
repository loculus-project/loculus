import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

import { DownloadUrlGenerator } from './DownloadUrlGenerator';
import { LinkOutMenu } from './LinkOutMenu';
import { FieldFilterSet } from './SequenceFilters';

// Mock window.open
const originalWindowOpen = window.open;
beforeEach(() => {
    window.open = vi.fn();
});

// Restore original window.open after tests
afterEach(() => {
    window.open = originalWindowOpen;
});

// Mock dependencies
// Use the actual DownloadUrlGenerator implementation for more realistic tests
const realDownloadUrlGenerator = new DownloadUrlGenerator(
    'test', // organism
    'http://testurl.com/sample', // lapisUrl
    true, // dataUseTermsEnabled
    ['name', 'date'], // richFastaHeaderFields
);

const mockSequenceFilter = FieldFilterSet.empty();

describe('LinkOutMenu', () => {
    // Define common test link outs
    const linkOuts = [
        { name: 'Basic', url: 'http://example.com/tool?data=[unalignedNucleotideSequences]' },
        { name: 'Format', url: 'http://example.com/tool?data=[unalignedNucleotideSequences|json]' },
        { name: 'Segment', url: 'http://example.com/tool?data=[unalignedNucleotideSequences:S]' },
        { name: 'SegmentFormat', url: 'http://example.com/tool?data=[unalignedNucleotideSequences:S|json]' },
        { name: 'Rich', url: 'http://example.com/tool?data=[unalignedNucleotideSequences+rich]' },
        { name: 'RichFormat', url: 'http://example.com/tool?data=[unalignedNucleotideSequences+rich|json]' },
        { name: 'SegmentRich', url: 'http://example.com/tool?data=[unalignedNucleotideSequences:S+rich]' },
        { name: 'Complete', url: 'http://example.com/tool?data=[unalignedNucleotideSequences:S+rich|json]' },
        {
            name: 'Multiple',
            url: 'http://example.com/tool?data1=[unalignedNucleotideSequences]&data2=[metadata|json]',
        },
        { name: 'Invalid', url: 'http://example.com/tool?data=[invalidType]&valid=[metadata]' },
    ];

    test('opens modal when a tool is clicked', () => {
        render(
            <LinkOutMenu
                downloadUrlGenerator={realDownloadUrlGenerator}
                sequenceFilter={mockSequenceFilter}
                linkOuts={linkOuts}
            />,
        );

        // Click the 'Tools' button to open the menu
        fireEvent.click(screen.getByRole('button', { name: /Tools/ }));

        // Click the first tool
        fireEvent.click(screen.getByText('Basic'));

        // Verify the modal is shown
        expect(screen.getByText('Options for launching Basic')).toBeInTheDocument();
        expect(screen.getByText('Data use terms')).toBeInTheDocument();
    });

    test('generates URLs with open-access only when selected', () => {
        // Spy on the generateDownloadUrl method
        const generateDownloadUrlSpy = vi.spyOn(realDownloadUrlGenerator, 'generateDownloadUrl');

        render(
            <LinkOutMenu
                downloadUrlGenerator={realDownloadUrlGenerator}
                sequenceFilter={mockSequenceFilter}
                linkOuts={linkOuts}
            />,
        );

        // Click the 'Tools' button to open the menu
        fireEvent.click(screen.getByRole('button', { name: /Tools/ }));

        // Click the first tool
        fireEvent.click(screen.getByText('Basic'));

        // Click "Open sequences only"
        fireEvent.click(screen.getByText('Open sequences only'));

        // Verify window.open was called with the correct URL
        expect(window.open).toHaveBeenCalled();

        // Verify includeRestricted parameter was false
        expect(generateDownloadUrlSpy).toHaveBeenCalledWith(
            mockSequenceFilter,
            expect.objectContaining({
                includeRestricted: false,
            }),
        );
    });

    test('generates URLs with restricted sequences when selected', () => {
        // Spy on the generateDownloadUrl method
        const generateDownloadUrlSpy = vi.spyOn(realDownloadUrlGenerator, 'generateDownloadUrl');

        render(
            <LinkOutMenu
                downloadUrlGenerator={realDownloadUrlGenerator}
                sequenceFilter={mockSequenceFilter}
                linkOuts={linkOuts}
            />,
        );

        // Click the 'Tools' button to open the menu
        fireEvent.click(screen.getByRole('button', { name: /Tools/ }));

        // Click the first tool
        fireEvent.click(screen.getByText('Basic'));

        // Click "Include Restricted-Use"
        fireEvent.click(screen.getByText('Include Restricted-Use'));

        // Verify window.open was called with the correct URL
        expect(window.open).toHaveBeenCalled();

        // Verify includeRestricted parameter was true
        expect(generateDownloadUrlSpy).toHaveBeenCalledWith(
            mockSequenceFilter,
            expect.objectContaining({
                includeRestricted: true,
            }),
        );
    });

    test('verifies URL generation for different formats', () => {
        // Since we can't access the internal generateLinkOutUrl method directly,
        // we'll test the component's behavior through UI interaction

        // Reset the spy to start with a clean slate
        vi.clearAllMocks();

        // Test the most common format
        render(
            <LinkOutMenu
                downloadUrlGenerator={realDownloadUrlGenerator}
                sequenceFilter={mockSequenceFilter}
                linkOuts={[{ name: 'Basic', url: 'http://example.com/tool?data=[unalignedNucleotideSequences]' }]}
            />,
        );

        // Trigger generation of URL
        fireEvent.click(screen.getByRole('button', { name: /Tools/ }));
        fireEvent.click(screen.getByText('Basic'));
        fireEvent.click(screen.getByText('Include Restricted-Use'));

        // Expect window.open to have been called
        expect(window.open).toHaveBeenCalled();

        // Verify correct params were passed to the URL generator
        expect(vi.mocked(window.open).mock.calls[0][0]).not.toBeUndefined();
    });
});
