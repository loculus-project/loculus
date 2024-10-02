import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, test, vi } from 'vitest';

import { DownloadDialog } from './DownloadDialog.tsx';
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

async function renderDialog(lapisSearchParameters: any = {}) {
    render(
        <DownloadDialog
            downloadParams={{
                type: 'filter',
                lapisSearchParameters,
                hiddenFieldValues: {},
            }}
            referenceGenomesSequenceNames={defaultReferenceGenome}
            lapisUrl={defaultLapisUrl}
        />,
    );

    // Open the panel
    const button = screen.getByRole('button', { name: 'Download' });
    await userEvent.click(button);
}

describe('DownloadDialog', () => {
    beforeAll(() => {
        // Vitest does not seem to support showModal, yet.
        // Workaround from https://github.com/jsdom/jsdom/issues/3294#issuecomment-1268330372
        HTMLDialogElement.prototype.showModal = vi.fn(function mock(this: HTMLDialogElement) {
            this.open = true;
        });

        HTMLDialogElement.prototype.close = vi.fn(function mock(this: HTMLDialogElement) {
            this.open = false;
        });
    });

    test('should display active filters if there are some', async () => {
        await renderDialog({ field1: 'value1', nucleotideMutations: 'A123T,G234C' });
        expect(screen.queryByText(/Active filters/)).toBeInTheDocument();
        expect(screen.queryByText('field1: value1')).toBeInTheDocument();

        expect(screen.queryByText(/A123T,G234C/)).toBeInTheDocument();
    });

    test('should not display active filters if there are none', async () => {
        await renderDialog();
        expect(screen.queryByText(/Active filters/)).not.toBeInTheDocument();
        expect(screen.queryByText('field1: value1')).not.toBeInTheDocument();
        expect(screen.queryByText(/A123T, G234C/)).not.toBeInTheDocument();
    });

    test('should activate download button only after agreeing to the terms', async () => {
        await renderDialog();

        const downloadButton = screen.getByRole('link', { name: 'Download' });
        expect(downloadButton).toHaveClass('btn-disabled');
        expect(getDownloadHref()).not.toMatch(new RegExp(`^${defaultLapisUrl}`));

        await checkAgreement();
        expect(downloadButton).not.toHaveClass('btn-disabled');
        expect(getDownloadHref()).toMatch(new RegExp(`^${defaultLapisUrl}`));
    });

    test('should generate the right download link', async () => {
        await renderDialog({ accession: ['accession1', 'accession2'], field1: 'value1' });
        await checkAgreement();

        expect(getDownloadHref()).toBe(
            `${defaultLapisUrl}/sample/details?downloadAsFile=true&versionStatus=LATEST_VERSION&isRevocation=false&dataUseTerms=OPEN&dataFormat=tsv&accession=accession1&accession=accession2&field1=value1`,
        );

        await userEvent.click(screen.getByLabelText(/Yes, include older versions/));
        await userEvent.click(screen.getByLabelText(/Raw nucleotide sequences/));
        await userEvent.click(screen.getByLabelText(/Gzip/));
        expect(getDownloadHref()).toBe(
            `${defaultLapisUrl}/sample/unalignedNucleotideSequences?downloadAsFile=true&dataUseTerms=OPEN&compression=gzip&accession=accession1&accession=accession2&field1=value1`,
        );

        await userEvent.click(screen.getByLabelText(/include restricted data/));
        await userEvent.click(screen.getByLabelText(/Zstandard/));
        expect(getDownloadHref()).toBe(
            `${defaultLapisUrl}/sample/unalignedNucleotideSequences?downloadAsFile=true&compression=zstd&accession=accession1&accession=accession2&field1=value1`,
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
