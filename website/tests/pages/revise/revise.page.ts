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
        await this.page.getByRole('button', { name: 'Submit' }).click();
    }

    private async setSequenceFile(file: string = sequencesTestFile) {
        await this.page.getByLabel('Sequence file').setInputFiles(file);
    }

    private async setRevisedMetadataFile(accessions: Accession[]) {
        await this.page.getByLabel('Metadata file').setInputFiles({
            name: 'metadata.tsv',
            mimeType: 'text/plain',
            buffer: Buffer.from(createModifiedFileContent(accessions).metadataContent),
        });
    }
}
