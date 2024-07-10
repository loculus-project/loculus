import type { Locator, Page } from '@playwright/test';

import { routes } from '../../../src/routes/routes.ts';
import {
    baseUrl,
    compressedMetadataTestFile,
    compressedSequencesTestFile,
    dummyOrganism,
    metadataTestFile,
    sequencesTestFile,
} from '../../e2e.fixture.ts';

export class SubmitPage {
    public readonly submitButton: Locator;
    public readonly confirmationINSDCTerms: Locator;
    public readonly dataUseTermsDropdown: Locator;
    public readonly loginButton: Locator;

    constructor(public readonly page: Page) {
        this.submitButton = page.getByRole('button', { name: 'submit' });
        this.confirmationINSDCTerms = page.getByText(
            'I confirm I have not and will not submit this data independently to INSDC',
        );
        this.dataUseTermsDropdown = page.locator('#dataUseTermsDropdown');
        this.loginButton = page.locator('a', { hasText: 'Login or register' });
    }

    public async goto(groupId: number) {
        await this.page.goto(`${baseUrl}${routes.submitPage(dummyOrganism.key, groupId)}`);
    }

    public async uploadMetadata() {
        await this.page.getByLabel('Metadata file').setInputFiles(metadataTestFile);
    }
    public async uploadCompressedMetadata() {
        await this.page.getByLabel('Metadata file').setInputFiles(compressedMetadataTestFile);
    }

    public async uploadSequenceData() {
        await this.page.getByLabel('Sequence file').setInputFiles(sequencesTestFile);
    }
    public async uploadCompressedSequenceData() {
        await this.page.getByLabel('Sequence file').setInputFiles(compressedSequencesTestFile);
    }

    public async selectRestrictedDataUseTerms() {
        const restrictedSelector = '#data-use-restricted';

        await this.page.waitForSelector(restrictedSelector);

        await this.page.click(restrictedSelector);
    }
}
