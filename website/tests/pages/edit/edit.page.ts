import type { Page } from '@playwright/test';

import { routes } from '../../../src/routes/routes.ts';
import type { AccessionVersion } from '../../../src/types/backend.ts';
import { baseUrl, dummyOrganism, expect } from '../../e2e.fixture';

export class EditPage {
    private readonly submitButton;
    private readonly downloadButton;

    constructor(public readonly page: Page) {
        this.submitButton = this.page.getByRole('button', { name: 'Submit' });
        this.downloadButton = this.page.getByRole('button', { name: 'Download', exact: false });
    }

    public async goto(accessionVersion: AccessionVersion) {
        await this.page.goto(`${baseUrl}${routes.editPage(dummyOrganism.key, accessionVersion)}`, {
            waitUntil: 'networkidle',
        });
    }

    public async submit(groupId: number) {
        await this.submitButton.click();
        expect(await this.page.isVisible('text=Do you really want to submit?')).toBe(true);
        await this.page.getByRole('button', { name: 'Confirm' }).click();
        await this.page.waitForURL(`${baseUrl}${routes.userSequenceReviewPage(dummyOrganism.key, groupId)}`);
    }
}
