import { unlinkSync, writeFileSync } from 'fs';

import type { Locator, Page } from '@playwright/test';
import { v4 as uuid } from 'uuid';

import type { Accession } from '../../../src/types/backend.ts';
import { baseUrl, sequencesTestFile, testUser } from '../../e2e.fixture';
import { createModifiedFileContent } from '../../util/createFileContent.ts';

export class RevisePage {
    public readonly userField: Locator;
    public readonly submitButton: Locator;
    private readonly temporaryMetadataFile: string = `./tests/testData/${uuid()}_metadata.tsv`;

    constructor(public readonly page: Page) {
        this.submitButton = page.getByRole('button', { name: 'Submit' });
        this.userField = page.getByPlaceholder('Username');
    }

    public async goto() {
        await this.page.goto(`${baseUrl}/revise`, { waitUntil: 'networkidle' });
    }

    public async uploadSequenceData(file: string = sequencesTestFile) {
        await this.page.getByPlaceholder('Sequences File:').setInputFiles(file);
    }

    public async submitRevisedData(accessions: Accession[]) {
        try {
            await Promise.all([
                this.uploadSequenceData(),
                this.setUsername(testUser),
                this.uploadRevisedMetadata(accessions),
            ]);
            await this.submitButton.click();
            await this.page.waitForSelector('text=Result of Revision');
        } finally {
            unlinkSync(this.temporaryMetadataFile);
        }
    }

    public async setUsername(username: string) {
        await this.userField.fill(username);
    }

    private async uploadRevisedMetadata(accessions: Accession[]) {
        writeFileSync(this.temporaryMetadataFile, createModifiedFileContent(accessions).metadataContent);
        await this.page.getByPlaceholder('Metadata File:').setInputFiles(this.temporaryMetadataFile);
    }
}
