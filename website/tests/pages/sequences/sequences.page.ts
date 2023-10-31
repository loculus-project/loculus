import { expect, type Locator, type Page } from '@playwright/test';

import { routes } from '../../../src/routes.ts';
import type { AccessionVersion } from '../../../src/types/backend.ts';
import { getAccessionVersionString } from '../../../src/utils/extractAccessionVersion.ts';
import { baseUrl, dummyOrganism, testSequenceEntry } from '../../e2e.fixture';

export class SequencePage {
    private readonly loadButton: Locator;
    private readonly orf1aButton: Locator;

    constructor(public readonly page: Page) {
        this.loadButton = this.page.getByRole('button', { name: 'Load sequences' });
        this.orf1aButton = this.page.getByRole('button', { name: 'ORF1a' });
    }

    public async goto(accessionVersion: AccessionVersion = testSequenceEntry) {
        await this.page.goto(`${baseUrl}${routes.sequencesDetailsPage(dummyOrganism.key, accessionVersion)}`, {
            waitUntil: 'networkidle',
        });
        await expect(this.page).toHaveTitle(getAccessionVersionString(accessionVersion));
        await expect(this.loadButton).toBeVisible();
    }

    public async loadSequences() {
        await expect(this.loadButton).toBeVisible();
        await this.loadButton.click();
    }

    public async clickORF1aButton() {
        await expect(this.orf1aButton).toBeVisible();
        await this.orf1aButton.click();
    }
}
