import type { Page } from '@playwright/test';

import { routes } from '../../../src/routes/routes.ts';
import type { AccessionVersion } from '../../../src/types/backend.ts';
import { baseUrl, dummyOrganism, expect } from '../../e2e.fixture';

export class EditPage {
    private readonly submitButton;

    constructor(public readonly page: Page) {
        this.submitButton = this.page.getByRole('button', { name: 'Submit' });
    }

    public async goto(accessionVersion: AccessionVersion) {
        await this.page.goto(`${baseUrl}${routes.editPage(dummyOrganism.key, accessionVersion)}`);
    }

    public async submit(groupId: number) {
        await this.submitButton.click();
        expect(await this.page.isVisible('text=Do you really want to submit?')).toBe(true);
        await this.page.getByRole('button', { name: 'Confirm' }).click();
        await this.page.waitForURL(`${baseUrl}${routes.userSequenceReviewPage(dummyOrganism.key, groupId)}`);
    }
}
