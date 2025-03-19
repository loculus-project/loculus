import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { DownloadDialog } from './DownloadDialog.tsx';
import { DownloadUrlGenerator } from './DownloadUrlGenerator.ts';
import { FieldFilter, SelectFilter, type SequenceFilter } from './SequenceFilters.tsx';
import { approxMaxAcceptableUrlLength } from '../../../routes/routes.ts';
import type { Metadata } from '../../../types/config.ts';
import type { ReferenceGenomesSequenceNames, ReferenceAccession } from '../../../types/referencesGenomes.ts';

vi.mock('./FieldSelector/FieldSelectorModal.tsx', () => ({
    getDefaultSelectedFields: () => ['field1', 'field2'],
    // eslint-disable-next-line @typescript-eslint/naming-convention
    FieldSelectorModal: vi.fn(() => null),
}));

const defaultAccession: ReferenceAccession = {
    name: 'main',
    insdcAccessionFull: undefined,
};

const defaultReferenceGenome: ReferenceGenomesSequenceNames = {
    nucleotideSequences: ['main'],
    genes: ['gene1', 'gene2'],
    insdcAccessionFull: [defaultAccession],
};

const defaultLapisUrl = 'https://lapis';
const defaultOrganism = 'ebola';

const mockMetadata: Metadata[] = [
    {
        name: 'field1',
        displayName: 'Field 1',
        type: 'string',
        header: 'Group 1',
        includeInDownloadsByDefault: true,
    },
    {
        name: 'field2',
        displayName: 'Field 2',
        type: 'string',
        header: 'Group 1',
    },
];

async function renderDialog({
    downloadParams = new SelectFilter(new Set()),
    allowSubmissionOfConsensusSequences = true,
    dataUseTermsEnabled = true,
    richFastaHeaderFields,
}: {
    downloadParams?: SequenceFilter;
    allowSubmissionOfConsensusSequences?: boolean;
    dataUseTermsEnabled?: boolean;
    richFastaHeaderFields?: string[];
} = {}) {
    render(
        <DownloadDialog
            downloadUrlGenerator={
                new DownloadUrlGenerator(defaultOrganism, defaultLapisUrl, dataUseTermsEnabled, richFastaHeaderFields)
            }
            sequenceFilter={downloadParams}
            referenceGenomesSequenceNames={defaultReferenceGenome}
            allowSubmissionOfConsensusSequences={allowSubmissionOfConsensusSequences}
            dataUseTermsEnabled={dataUseTermsEnabled}
            metadata={mockMetadata}
            richFastaHeaderFields={richFastaHeaderFields}
        />,
    );

    // Open the panel
    const button = screen.getByRole('button', { name: /Download/ });
    await userEvent.click(button);
}

/**
 * Helper function to check if a string starts with a given prefix
 * @param {string} actualString - The string to check
 * @param {string} expectedPrefix - The expected prefix
 * @returns {void}
 */
function expectStringStartsWith(actualString: string, expectedPrefix: string): void {
    if (!actualString.startsWith(expectedPrefix)) {
        expect.fail(`URL prefix mismatch:\nExpected to start with: "${expectedPrefix}"\nActual: "${actualString}"`);
    }
}

/**
 * Helper function to check if a string ends with a given suffix
 * @param {string} actualString - The string to check
 * @param {string} expectedSuffix - The expected suffix
 * @returns {void}
 */
function expectStringEndsWith(actualString: string, expectedSuffix: string): void {
    const actualSuffix = actualString.substring(Math.max(0, actualString.length - expectedSuffix.length));
    if (actualSuffix !== expectedSuffix) {
        expect.fail(`URL suffix mismatch:\nExpected: "${expectedSuffix}"\nActual: "${actualSuffix}"`);
    }
}

describe('DownloadDialog', () => {
    test('should activate download button only after agreeing to the terms', async () => {
        await renderDialog();

        const downloadButton = screen.getByRole('link', { name: 'Download' });
        expect(downloadButton).toHaveClass('btn-disabled');
        expect(getDownloadHref()).not.toMatch(new RegExp(`^${defaultLapisUrl}`));

        await checkAgreement();
        expect(downloadButton).not.toHaveClass('btn-disabled');
        expect(getDownloadHref()).toMatch(new RegExp(`^${defaultLapisUrl}`));
    });

    const olderVersionsLabel = /Yes, include older versions/;
    const rawNucleotideSequencesLabel = /Raw nucleotide sequences/;
    const gzipCompressionLabel = /Gzip/;
    const displayNameFastaHeaderStyleLabel = /Display name/;

    test('should generate the right download link from filters', async () => {
        await renderDialog({
            downloadParams: new FieldFilter(
                {
                    accession: ['accession1', 'accession2'],
                    field1: 'value1',
                },
                {},
                [],
            ),
        });
        await checkAgreement();

        let [path, query] = getDownloadHref()?.split('?') ?? [];
        expect(path).toBe(`${defaultLapisUrl}/sample/details`);
        expect(query).toMatch(
            /downloadAsFile=true&downloadFileBasename=ebola_metadata_\d{4}-\d{2}-\d{2}T\d{4}&versionStatus=LATEST_VERSION&isRevocation=false&dataUseTerms=OPEN&dataFormat=tsv&fields=accessionVersion%2Cfield1%2Cfield2&accession=accession1&accession=accession2&field1=value1/,
        );

        await userEvent.click(screen.getByLabelText(olderVersionsLabel));
        await userEvent.click(screen.getByLabelText(rawNucleotideSequencesLabel));
        await userEvent.click(screen.getByLabelText(gzipCompressionLabel));

        [path, query] = getDownloadHref()?.split('?') ?? [];
        expect(path).toBe(`${defaultLapisUrl}/sample/unalignedNucleotideSequences`);
        expect(query).toMatch(
            /downloadAsFile=true&downloadFileBasename=ebola_nuc_\d{4}-\d{2}-\d{2}T\d{4}&dataUseTerms=OPEN&dataFormat=fasta&compression=gzip&accession=accession1&accession=accession2&field1=value1/,
        );

        await userEvent.click(screen.getByLabelText(/include restricted data/));
        await userEvent.click(screen.getByLabelText(/Zstandard/));

        [path, query] = getDownloadHref()?.split('?') ?? [];
        expect(path).toBe(`${defaultLapisUrl}/sample/unalignedNucleotideSequences`);
        expect(query).toMatch(
            /downloadAsFile=true&downloadFileBasename=ebola_nuc_\d{4}-\d{2}-\d{2}T\d{4}&dataFormat=fasta&compression=zstd&accession=accession1&accession=accession2&field1=value1/,
        );
    });

    test('should generate the right download link from selected sequences', async () => {
        await renderDialog({ downloadParams: new SelectFilter(new Set(['SEQID1', 'SEQID2'])) });
        await checkAgreement();

        let [path, query] = getDownloadHref()?.split('?') ?? [];
        expect(path).toBe(`${defaultLapisUrl}/sample/details`);
        expect(query).toMatch(
            /downloadAsFile=true&downloadFileBasename=ebola_metadata_\d{4}-\d{2}-\d{2}T\d{4}&versionStatus=LATEST_VERSION&isRevocation=false&dataUseTerms=OPEN&dataFormat=tsv&fields=accessionVersion%2Cfield1%2Cfield2&accessionVersion=SEQID1&accessionVersion=SEQID2/,
        );

        await userEvent.click(screen.getByLabelText(olderVersionsLabel));
        await userEvent.click(screen.getByLabelText(rawNucleotideSequencesLabel));
        await userEvent.click(screen.getByLabelText(gzipCompressionLabel));

        [path, query] = getDownloadHref()?.split('?') ?? [];
        expect(path).toBe(`${defaultLapisUrl}/sample/unalignedNucleotideSequences`);
        expect(query).toMatch(
            /downloadAsFile=true&downloadFileBasename=ebola_nuc_\d{4}-\d{2}-\d{2}T\d{4}&dataUseTerms=OPEN&dataFormat=fasta&compression=gzip&accessionVersion=SEQID1&accessionVersion=SEQID2/,
        );

        await userEvent.click(screen.getByLabelText(/include restricted data/));
        await userEvent.click(screen.getByLabelText(/Zstandard/));

        [path, query] = getDownloadHref()?.split('?') ?? [];
        expect(path).toBe(`${defaultLapisUrl}/sample/unalignedNucleotideSequences`);
        expect(query).toMatch(
            /downloadAsFile=true&downloadFileBasename=ebola_nuc_\d{4}-\d{2}-\d{2}T\d{4}&dataFormat=fasta&compression=zstd&accessionVersion=SEQID1&accessionVersion=SEQID2/,
        );
    });

    test('should render with allowSubmissionOfConsensusSequences = false', async () => {
        await renderDialog({ allowSubmissionOfConsensusSequences: false });
        await checkAgreement();

        const [path] = getDownloadHref()?.split('?') ?? [];
        expect(path).toBe(`${defaultLapisUrl}/sample/details`);

        expect(screen.queryByLabelText(rawNucleotideSequencesLabel)).not.toBeInTheDocument();
        expect(screen.getByLabelText(olderVersionsLabel)).toBeInTheDocument();
        expect(screen.getByLabelText(gzipCompressionLabel)).toBeInTheDocument();
    });

    test('should show copy URL button when using GET request', async () => {
        await renderDialog();
        await checkAgreement();

        const copyUrlButton = screen.getByTestId('copy-download-url');
        expect(copyUrlButton).toBeInTheDocument();
        expect(copyUrlButton).toHaveAttribute('title', 'Copy download URL');
    });

    test('should not show copy URL button when using POST request', async () => {
        await renderDialog({
            downloadParams: new SelectFilter(new Set<string>(['x'.repeat(approxMaxAcceptableUrlLength * 2)])),
        });
        await checkAgreement();

        expect(screen.queryByTestId('copy-download-url')).not.toBeInTheDocument();
    });

    test('should copy the right URL when clicking on the copy button', async () => {
        const clipboardMock = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

        await renderDialog();
        await checkAgreement();

        const copyUrlButton = screen.getByTestId('copy-download-url');
        await userEvent.click(copyUrlButton);
        expect(clipboardMock).toHaveBeenCalledTimes(1);
        const copiedText = clipboardMock.mock.calls[0][0];

        const expectedPrefix = 'https://lapis/sample/details?downloadAsFile=true&downloadFileBasename=ebola_metadata_';
        expectStringStartsWith(copiedText, expectedPrefix);

        const expectedSuffix =
            '&versionStatus=LATEST_VERSION&isRevocation=false&dataUseTerms=OPEN&dataFormat=tsv&fields=accessionVersion%2Cfield1%2Cfield2';
        expectStringEndsWith(copiedText, expectedSuffix);

        clipboardMock.mockRestore();
    });

    test('should exclude empty parameters from the generated download URLs', async () => {
        await renderDialog({
            downloadParams: new FieldFilter(
                {
                    field1: '',
                    field2: 'value2',
                },
                {},
                [],
            ),
        });
        await checkAgreement();

        const [path, query] = getDownloadHref()?.split('?') ?? [];
        expect(path).toBe(`${defaultLapisUrl}/sample/details`);
        expect(query).toMatch(/field2=/);
        expect(query).not.toMatch(/field1=/);
    });

    test('should not show the fasta header options when rich fasta headers are disabled', async () => {
        await renderDialog({ richFastaHeaderFields: undefined });

        expect(screen.queryByLabelText(displayNameFastaHeaderStyleLabel)).not.toBeInTheDocument();
    });

    describe('DataUseTerms disabled', () => {
        test('download button activated by default', async () => {
            await renderDialog({ dataUseTermsEnabled: false });

            const downloadButton = screen.getByRole('link', { name: 'Download' });
            expect(downloadButton).not.toHaveClass('btn-disabled');
        });

        test('checkbox not in the document', async () => {
            await renderDialog({ dataUseTermsEnabled: false });

            expect(screen.queryByLabelText('I agree to the data use terms.')).not.toBeInTheDocument();
        });

        test('restricted data switch is not in the document', async () => {
            await renderDialog({ dataUseTermsEnabled: false });

            expect(screen.queryByLabelText(/restricted data/)).not.toBeInTheDocument();
        });
    });

    describe('with richFastaHeaderFields', () => {
        test('should target Astro endpoint when downloading raw sequences with rich fasta headers', async () => {
            await renderDialog({
                richFastaHeaderFields: ['field1', 'field2'],
            });

            await checkAgreement();
            await userEvent.click(screen.getByLabelText(rawNucleotideSequencesLabel));
            await userEvent.click(screen.getByLabelText(displayNameFastaHeaderStyleLabel));

            const [path, query] = getDownloadHref()?.split('?') ?? [];
            expect(path).toBe(`http://localhost:3000/${defaultOrganism}/api/sequences`);
            expect(query).toMatch(
                /^downloadFileBasename=ebola_nuc_\d{4}-\d{2}-\d{2}T\d{4}&versionStatus=LATEST_VERSION&isRevocation=false&dataUseTerms=OPEN&headerFields=field1&headerFields=field2$/,
            );
        });

        test('should include filters in download url', async () => {
            await renderDialog({
                richFastaHeaderFields: ['field1', 'field2'],
                downloadParams: new FieldFilter(
                    {
                        accession: ['accession1', 'accession2'],
                        field1: 'value1',
                    },
                    {},
                    [],
                ),
            });

            await checkAgreement();
            await userEvent.click(screen.getByLabelText(rawNucleotideSequencesLabel));
            await userEvent.click(screen.getByLabelText(displayNameFastaHeaderStyleLabel));

            const [path, query] = getDownloadHref()?.split('?') ?? [];
            expect(path).toBe(`http://localhost:3000/${defaultOrganism}/api/sequences`);
            expect(query).toMatch(
                /^downloadFileBasename=ebola_nuc_\d{4}-\d{2}-\d{2}T\d{4}&versionStatus=LATEST_VERSION&isRevocation=false&dataUseTerms=OPEN&headerFields=field1&headerFields=field2&accession=accession1&accession=accession2&field1=value1/,
            );
        });

        test('should ignore previously selected compression', async () => {
            await renderDialog({
                richFastaHeaderFields: ['field1', 'field2'],
            });

            await checkAgreement();
            await userEvent.click(screen.getByLabelText(gzipCompressionLabel));
            await userEvent.click(screen.getByLabelText(rawNucleotideSequencesLabel));
            await userEvent.click(screen.getByLabelText(displayNameFastaHeaderStyleLabel));

            const [_, query] = getDownloadHref()?.split('?') ?? [];
            expect(query).not.contains('compression');
        });
    });
});

async function checkAgreement() {
    const agreementCheckbox = screen.getByLabelText('I agree to the data use terms.');
    await userEvent.click(agreementCheckbox);
}

function getDownloadHref() {
    const downloadButton = screen.getByRole('link', { name: 'Download' });
    return downloadButton.getAttribute('href');
}
