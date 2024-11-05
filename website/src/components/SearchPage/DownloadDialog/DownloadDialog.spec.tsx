import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, test, vi } from 'vitest';

import { DownloadDialog } from './DownloadDialog.tsx';
import type { DownloadParameters } from './DownloadParameters.tsx';
import { DownloadUrlGenerator } from './DownloadUrlGenerator.ts';
import type { ReferenceGenomesSequenceNames, ReferenceAccession } from '../../../types/referencesGenomes.ts';

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

async function renderDialog(downloadParams: DownloadParameters = { type: 'select', selectedSequences: new Set([]) }) {
    render(
        <DownloadDialog
            downloadUrlGenerator={new DownloadUrlGenerator(defaultOrganism, defaultLapisUrl)}
            downloadParams={downloadParams}
            referenceGenomesSequenceNames={defaultReferenceGenome}
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

    test('should generate the right download link from filters', async () => {
        await renderDialog({
            type: 'filter',
            lapisSearchParameters: { accession: ['accession1', 'accession2'], field1: 'value1' },
            hiddenFieldValues: {},
        });
        await checkAgreement();

        let [path, query] = getDownloadHref()?.split('?') ?? [];
        expect(path).toBe(`${defaultLapisUrl}/sample/details`);
        expect(query).toMatch(
            /downloadAsFile=true&downloadFileBasename=ebola_metadata_\d{4}-\d{2}-\d{2}T\d{4}&versionStatus=LATEST_VERSION&isRevocation=false&dataUseTerms=OPEN&dataFormat=tsv&accession=accession1&accession=accession2&field1=value1/,
        );

        await userEvent.click(screen.getByLabelText(/Yes, include older versions/));
        await userEvent.click(screen.getByLabelText(/Raw nucleotide sequences/));
        await userEvent.click(screen.getByLabelText(/Gzip/));

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
        await renderDialog({
            type: 'select',
            selectedSequences: new Set(['SEQID1', 'SEQID2']),
        });
        await checkAgreement();

        let [path, query] = getDownloadHref()?.split('?') ?? [];
        expect(path).toBe(`${defaultLapisUrl}/sample/details`);
        expect(query).toMatch(
            /downloadAsFile=true&downloadFileBasename=ebola_metadata_\d{4}-\d{2}-\d{2}T\d{4}&versionStatus=LATEST_VERSION&isRevocation=false&dataUseTerms=OPEN&dataFormat=tsv&accessionVersion=SEQID1&accessionVersion=SEQID2/,
        );

        await userEvent.click(screen.getByLabelText(/Yes, include older versions/));
        await userEvent.click(screen.getByLabelText(/Raw nucleotide sequences/));
        await userEvent.click(screen.getByLabelText(/Gzip/));

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
});

async function checkAgreement() {
    const agreementCheckbox = screen.getByLabelText('I agree to the data use terms.');
    await userEvent.click(agreementCheckbox);
}

function getDownloadHref() {
    const downloadButton = screen.getByRole('link', { name: 'Download' });
    return downloadButton.getAttribute('href');
}
