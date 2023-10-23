import { unlinkSync, writeFileSync } from 'fs';

import type { Locator, Page } from '@playwright/test';
import { v4 as uuid } from 'uuid';

import { routes } from '../../../src/routes.ts';
import type { Accession } from '../../../src/types/backend.ts';
import { baseUrl, dummyOrganism, sequencesTestFile } from '../../e2e.fixture';
import { createModifiedFileContent } from '../../util/createFileContent.ts';

export class RevisePage {
    public readonly submitButton: Locator;
    private readonly temporaryMetadataFile: string = `./tests/testData/${uuid()}_metadata.tsv`;

    constructor(public readonly page: Page) {
        this.submitButton = page.getByRole('button', { name: 'Submit' });
    }

    public async goto() {
        await this.page.goto(`${baseUrl}${routes.revisePage(dummyOrganism.key)}`, { waitUntil: 'networkidle' });
    }

    public async uploadSequenceData(file: string = sequencesTestFile) {
        await this.page.getByPlaceholder('Sequences File:').setInputFiles(file);
    }

    public async submitRevisedData(accessions: Accession[]) {
        try {
            await Promise.all([this.uploadSequenceData(), this.uploadRevisedMetadata(accessions)]);
            await this.submitButton.click();
        } finally {
            unlinkSync(this.temporaryMetadataFile);
        }
    }

    private async uploadRevisedMetadata(accessions: Accession[]) {
        writeFileSync(this.temporaryMetadataFile, createModifiedFileContent(accessions).metadataContent);
        await this.page.getByPlaceholder('Metadata File:').setInputFiles(this.temporaryMetadataFile);
    }
}
