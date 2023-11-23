import type { Locator, Page } from '@playwright/test';

import { baseUrl, dummyOrganism, expect, metadataTestFile, sequencesTestFile } from '../../e2e.fixture';

export class SubmitPage {
    public readonly userField: Locator;
    public readonly submitButton: Locator;

    constructor(public readonly page: Page) {
        this.submitButton = page.getByRole('button', { name: 'Submit' });
        this.userField = page.getByPlaceholder('Username');
    }

    public async goto() {
        await this.page.goto(`${baseUrl}/${dummyOrganism}/submit`, { waitUntil: 'networkidle' });
    }

    public async uploadMetadata() {
        await this.page.getByPlaceholder('Metadata File:').setInputFiles(metadataTestFile);
        expect(this.page.getByText('metadata.tsv'));
    }

    public async uploadSequenceData() {
        await this.page.getByPlaceholder('Sequences File:').setInputFiles(sequencesTestFile);
    }

    public async setUsername(username: string) {
        await this.userField.fill(username);
    }
}
