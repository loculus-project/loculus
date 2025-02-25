import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { DownloadDialog } from './DownloadDialog.tsx';
import { DownloadUrlGenerator } from './DownloadUrlGenerator.ts';
import { FieldFilter, SelectFilter, type SequenceFilter } from './SequenceFilters.tsx';
import type { Metadata } from '../../../types/config.ts';
import type { ReferenceGenomesSequenceNames, ReferenceAccession } from '../../../types/referencesGenomes.ts';

// Mock the FieldSelectorModal to avoid errors in tests
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

// Mock metadata for testing
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
}: {
    downloadParams?: SequenceFilter;
    allowSubmissionOfConsensusSequences?: boolean;
    dataUseTermsEnabled?: boolean;
} = {}) {
    render(
        <DownloadDialog
            downloadUrlGenerator={new DownloadUrlGenerator(defaultOrganism, defaultLapisUrl, dataUseTermsEnabled)}
            sequenceFilter={downloadParams}
            referenceGenomesSequenceNames={defaultReferenceGenome}
            allowSubmissionOfConsensusSequences={allowSubmissionOfConsensusSequences}
            dataUseTermsEnabled={dataUseTermsEnabled}
            metadata={mockMetadata}
        />,
    );

    // Open the panel
    const button = screen.getByRole('button', { name: /Download/ });
    await userEvent.click(button);
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
            /downloadAsFile=true&downloadFileBasename=ebola_nuc_\d{4}-\d{2}-\d{2}T\d{4}&dataUseTerms=OPEN&compression=gzip&accession=accession1&accession=accession2&field1=value1/,
        );

        await userEvent.click(screen.getByLabelText(/include restricted data/));
        await userEvent.click(screen.getByLabelText(/Zstandard/));

        [path, query] = getDownloadHref()?.split('?') ?? [];
        expect(path).toBe(`${defaultLapisUrl}/sample/unalignedNucleotideSequences`);
        expect(query).toMatch(
            /downloadAsFile=true&downloadFileBasename=ebola_nuc_\d{4}-\d{2}-\d{2}T\d{4}&compression=zstd&accession=accession1&accession=accession2&field1=value1/,
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
            /downloadAsFile=true&downloadFileBasename=ebola_nuc_\d{4}-\d{2}-\d{2}T\d{4}&dataUseTerms=OPEN&compression=gzip&accessionVersion=SEQID1&accessionVersion=SEQID2/,
        );

        await userEvent.click(screen.getByLabelText(/include restricted data/));
        await userEvent.click(screen.getByLabelText(/Zstandard/));

        [path, query] = getDownloadHref()?.split('?') ?? [];
        expect(path).toBe(`${defaultLapisUrl}/sample/unalignedNucleotideSequences`);
        expect(query).toMatch(
            /downloadAsFile=true&downloadFileBasename=ebola_nuc_\d{4}-\d{2}-\d{2}T\d{4}&compression=zstd&accessionVersion=SEQID1&accessionVersion=SEQID2/,
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
});

async function checkAgreement() {
    const agreementCheckbox = screen.getByLabelText('I agree to the data use terms.');
    await userEvent.click(agreementCheckbox);
}

function getDownloadHref() {
    const downloadButton = screen.getByRole('link', { name: 'Download' });
    return downloadButton.getAttribute('href');
}
