import type { Locator, Page } from '@playwright/test';

import { routes } from '../../../src/routes.ts';
import {
    baseUrl,
    compressedMetadataTestFile,
    compressedSequencesTestFile,
    dummyOrganism,
    metadataTestFile,
    sequencesTestFile,
} from '../../e2e.fixture';

export class SubmitPage {
    public readonly submitButton: Locator;

    constructor(public readonly page: Page) {
        this.submitButton = page.getByRole('button', { name: 'Submit' });
    }

    public async goto() {
        await this.page.goto(`${baseUrl}${routes.submitPage(dummyOrganism.key)}`, { waitUntil: 'networkidle' });
    }

    public async uploadMetadata() {
        await this.page.getByPlaceholder('Metadata File:').setInputFiles(metadataTestFile);
    }
    public async uploadCompressedMetadata() {
        await this.page.getByPlaceholder('Metadata File:').setInputFiles(compressedMetadataTestFile);
    }

    public async uploadSequenceData() {
        await this.page.getByPlaceholder('Sequences File:').setInputFiles(sequencesTestFile);
    }
    public async uploadCompressedSequenceData() {
        await this.page.getByPlaceholder('Sequences File:').setInputFiles(compressedSequencesTestFile);
    }
}
