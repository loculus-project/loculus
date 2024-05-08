import type { Page } from '@playwright/test';

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
        await Promise.all([this.setSequenceFile(), this.setRevisedMetadataFile(accessions)]);
        await this.page.getByRole('button', { name: 'Discard file' }).nth(1).waitFor({ state: 'visible' }); // Wait for two buttons to be visible
        await this.page.getByRole('button', { name: 'Submit' }).click();
    }

    private async setSequenceFile(file: string = sequencesTestFile) {
        const sequencePicker = this.page.getByLabel('Sequence file');
        await sequencePicker.waitFor({ state: 'visible' });
        await sequencePicker.setInputFiles(file);
    }

    private async setRevisedMetadataFile(accessions: Accession[]) {
        const metadataPicker = this.page.getByLabel('Metadata file');
        await metadataPicker.waitFor({ state: 'visible' });
        await metadataPicker.setInputFiles({
            name: 'metadata.tsv',
            mimeType: 'text/plain',
            buffer: Buffer.from(createModifiedFileContent(accessions).metadataContent),
        });
    }
}
