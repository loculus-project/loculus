import type { Locator, Page } from '@playwright/test';

import { routes } from '../../../src/routes.ts';
import { restrictedDataUseTermsType } from '../../../src/types/backend.ts';
import {
    baseUrl,
    compressedMetadataTestFile,
    compressedSequencesTestFile,
    dummyOrganism,
    metadataTestFile,
    sequencesTestFile,
} from '../../e2e.fixture';
import { expect } from '../../e2e.fixture.ts';

export class SubmitPage {
    public readonly submitButton: Locator;
    public readonly dataUseTermsDropdown: Locator;

    constructor(public readonly page: Page) {
        this.submitButton = page.getByRole('button', { name: 'Submit' });
        this.dataUseTermsDropdown = page.locator('#dataUseTermsDropdown');
    }

    public async goto() {
        await this.page.goto(`${baseUrl}${routes.submitPage(dummyOrganism.key)}`, { waitUntil: 'networkidle' });
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
        const dropdownSelector = '#dataUseTermsDropdown';

        await this.page.waitForSelector(dropdownSelector);

        await this.page.selectOption(dropdownSelector, { value: restrictedDataUseTermsType });

        const selectedValue = await this.page.$eval(dropdownSelector, (select) => (select as HTMLSelectElement).value);
        expect(selectedValue).toBe(restrictedDataUseTermsType);
    }
}
