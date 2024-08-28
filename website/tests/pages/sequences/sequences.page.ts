import { expect, type Locator, type Page } from '@playwright/test';

import { routes } from '../../../src/routes/routes.ts';
import type { AccessionVersion } from '../../../src/types/backend.ts';
import { getAccessionVersionString } from '../../../src/utils/extractAccessionVersion.ts';
import { baseUrl } from '../../e2e.fixture';
import { throwOnConsole } from '../../util/throwOnConsole.ts';

export class SequencePage {
    public readonly notLatestVersionBanner: Locator;
    public readonly revocationVersionBanner: Locator;

    private readonly loadButton: Locator;
    private readonly allVersions: Locator;
    private readonly orf1aButton: Locator;

    constructor(public readonly page: Page) {
        this.loadButton = this.page.getByRole('button', { name: 'Load sequences' });
        this.orf1aButton = this.page.getByRole('button', { name: 'ORF1a' });
        this.allVersions = this.page.getByRole('link', {
            name: `All versions`,
        });
        throwOnConsole(page);
        this.notLatestVersionBanner = this.page.getByText('This is not the latest version of this sequence entry.');
        this.revocationVersionBanner = this.page.getByText('This is a revocation version.');
    }

    public async goto(accessionVersion: AccessionVersion) {
        await this.page.goto(`${baseUrl}${routes.sequencesDetailsPage(accessionVersion)}`);
        await expect(this.page).toHaveTitle(getAccessionVersionString(accessionVersion), { atStart: true });
    }

    public async gotoAllVersions() {
        await expect(this.allVersions).toBeVisible();
        await this.allVersions.click();
    }

    public async loadSequences() {
        await expect(this.loadButton).toBeVisible({ timeout: 60000 });
        await this.loadButton.click();
    }

    public async clickORF1aButton() {
        await expect(this.orf1aButton).toBeVisible();
        await this.orf1aButton.click();
    }
}
