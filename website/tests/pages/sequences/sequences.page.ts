import { expect, type Locator, type Page } from '@playwright/test';

import { baseUrl, dummyOrganism, testSequence } from '../../e2e.fixture';

export class SequencePage {
    private readonly loadButton: Locator;
    private readonly orf1aButton: Locator;

    constructor(public readonly page: Page) {
        this.loadButton = this.page.getByRole('button', { name: 'Load sequences' });
        this.orf1aButton = this.page.getByRole('button', { name: 'ORF1a' });
    }

    public async goto() {
        await this.page.goto(`${baseUrl}/${dummyOrganism.key}/sequences/${testSequence.name}`, {
            waitUntil: 'networkidle',
        });
        await expect(this.page).toHaveTitle(`${testSequence.name}`);
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
