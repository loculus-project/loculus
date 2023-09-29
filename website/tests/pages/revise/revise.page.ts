import { readFileSync, writeFileSync, unlinkSync } from 'fs';

import type { Locator, Page } from '@playwright/test';
import { v4 as uuid } from 'uuid';

import { baseUrl, metadataTestFile, sequencesTestFile, testuser } from '../../e2e.fixture';

export class RevisePage {
    public readonly userField: Locator;
    public readonly submitButton: Locator;
    private readonly temporaryMetadataFile: string = `./tests/testData/${uuid()}_metadata.tsv`;
    private readonly testSequenceCount: number = readFileSync(metadataTestFile, 'utf-8').split('\n').length - 2;

    constructor(public readonly page: Page) {
        this.submitButton = page.getByRole('button', { name: 'Submit' });
        this.userField = page.getByPlaceholder('Username');
    }

    public async goto() {
        await this.page.goto(`${baseUrl}/revise`);
    }

    public async uploadSequenceData(file: string = sequencesTestFile) {
        await this.page.getByPlaceholder('Sequences File:').setInputFiles(file);
    }

    public async submitRevisedData(sequenceIds: number[]) {
        try {
            await Promise.all([
                this.uploadSequenceData(),
                this.setUsername(testuser),
                this.uploadRevisedMetadata(sequenceIds),
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

    private async uploadRevisedMetadata(sequenceIds: number[]) {
        if (sequenceIds.length !== this.testSequenceCount) {
            throw new Error(
                `ReviseTestPage: expected ${this.testSequenceCount} sequence ids, got ${sequenceIds.length}`,
            );
        }

        const metadataContent = readFileSync(metadataTestFile, 'utf-8');
        const metadataRows = metadataContent
            .split('\n')
            .filter((line) => line.length > 0)
            .map((line) => line.split('\t'));

        if (sequenceIds.length !== metadataRows.length - 1) {
            throw new Error(
                `ReviseTestPage: expected ${metadataRows.length - 1} sequence ids, got ${sequenceIds.length}`,
            );
        }

        metadataRows[0].push('sequenceId');
        for (let i = 1; i < metadataRows.length; i++) {
            metadataRows[i].push(sequenceIds[i - 1].toString());
        }

        const modifiedMetadataContent = metadataRows.map((row) => row.join('\t')).join('\n');

        writeFileSync(this.temporaryMetadataFile, modifiedMetadataContent);
        await this.page.getByPlaceholder('Metadata File:').setInputFiles(this.temporaryMetadataFile);
    }
}
