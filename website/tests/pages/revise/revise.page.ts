import { expect, type Page } from '@playwright/test';

import { routes } from '../../../src/routes/routes.ts';
import type { Accession } from '../../../src/types/backend.ts';
import { baseUrl, dummyOrganism, sequencesTestFile } from '../../e2e.fixture';
import { createModifiedFileContent } from '../../util/createFileContent.ts';

export class RevisePage {
    constructor(public readonly page: Page) {}

    public async goto(groupId: number) {
        await this.page.goto(`${baseUrl}${routes.revisePage(dummyOrganism.key, groupId)}`);
    }

    public async submitRevisedData(accessions: Accession[]) {
        await this.setSequenceFile();
        await this.setRevisedMetadataFile(accessions);
        await this.page.getByText('I confirm I have not and will not submit this data independently to INSDC').click();
        await this.page.getByText('I confirm that the data submitted is not sensitive or human-identifiable').click();
        await this.page.getByRole('button', { name: 'Submit' }).click();
    }

    public async downloadTsvMetadataTemplate() {
        return this.downloadMetadataTemplate('TSV');
    }

    public async downloadXlsxMetadataTemplate() {
        return this.downloadMetadataTemplate('XLSX');
    }

    private async downloadMetadataTemplate(format: 'TSV' | 'XLSX') {
        const downloadPromise = this.page.waitForEvent('download');
        await this.page.getByText(format, { exact: true }).click();
        return downloadPromise;
    }

    private async setSequenceFile(file: string = sequencesTestFile) {
        await this.page.getByTestId('sequence_file').setInputFiles(file);
        await expect(this.page.getByTestId('discard_sequence_file')).toBeEnabled();
    }

    private async setRevisedMetadataFile(accessions: Accession[]) {
        await this.page.getByTestId('metadata_file').setInputFiles({
            name: 'metadata.tsv',
            mimeType: 'text/plain',
            buffer: Buffer.from(createModifiedFileContent(accessions).metadataContent),
        });
        await expect(this.page.getByTestId('discard_metadata_file')).toBeEnabled();
    }
}
