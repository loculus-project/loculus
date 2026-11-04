import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { SequenceDownloadMenu } from './SequenceDownloadMenu';
import { SequenceActionButtons } from './SequencesDisplay/SequenceActionButtons';

const ACCESSION_VERSION = 'LOC_000001Y.1';

describe('SequenceDownloadMenu', () => {
    const assign = vi.fn();

    beforeEach(() => {
        vi.stubGlobal('location', { assign });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        assign.mockReset();
    });

    test('downloads open-use data without a confirmation dialog', async () => {
        render(
            <SequenceDownloadMenu accessionVersion={ACCESSION_VERSION} showFastaDownloadButton isRestricted={false} />,
        );

        const link = screen.getByRole('link', { name: 'Download FASTA' });
        expect(link).toHaveAttribute('href', expect.stringContaining(ACCESSION_VERSION));

        await userEvent.click(link);

        expect(screen.queryByText(/Restricted Use Terms/)).not.toBeInTheDocument();
        expect(assign).not.toHaveBeenCalled();
    });

    test('asks for agreement to the Restricted Use Terms before downloading restricted data', async () => {
        render(<SequenceDownloadMenu accessionVersion={ACCESSION_VERSION} showFastaDownloadButton isRestricted />);

        await userEvent.click(screen.getByRole('link', { name: 'Download metadata TSV' }));

        expect(screen.getByText(/By downloading it, you agree to follow the/)).toBeVisible();
        expect(assign).not.toHaveBeenCalled();

        await userEvent.click(screen.getByRole('button', { name: 'I agree, download' }));

        expect(assign).toHaveBeenCalledWith(expect.stringContaining(`${ACCESSION_VERSION}.tsv`));
    });

    test('does not download restricted data when the dialog is cancelled', async () => {
        render(<SequenceDownloadMenu accessionVersion={ACCESSION_VERSION} showFastaDownloadButton isRestricted />);

        await userEvent.click(screen.getByRole('link', { name: 'Download FASTA' }));
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(assign).not.toHaveBeenCalled();
    });
});

describe('SequenceActionButtons', () => {
    const createObjectURL = vi.fn(() => 'blob:test');

    beforeEach(() => {
        createObjectURL.mockClear();
        URL.createObjectURL = createObjectURL;
        URL.revokeObjectURL = vi.fn();
    });

    test('downloads open-use sequences immediately', async () => {
        render(<SequenceActionButtons sequenceName='seq' sequence='ACGT' />);

        await userEvent.click(screen.getByTestId('download-sequence-button'));

        expect(createObjectURL).toHaveBeenCalled();
        expect(screen.queryByText(/Restricted Use Terms/)).not.toBeInTheDocument();
    });

    test('asks for agreement to the Restricted Use Terms before downloading restricted sequences', async () => {
        render(<SequenceActionButtons sequenceName='seq' sequence='ACGT' isRestricted />);

        await userEvent.click(screen.getByTestId('download-sequence-button'));

        expect(createObjectURL).not.toHaveBeenCalled();

        await userEvent.click(screen.getByRole('button', { name: 'I agree, download' }));

        expect(createObjectURL).toHaveBeenCalled();
    });
});
