import type { Page } from '@playwright/test';

import { routes } from '../../../../src/routes.ts';
import type { AccessionVersion, SequenceEntryStatus } from '../../../../src/types/backend.ts';
import { getAccessionVersionString } from '../../../../src/utils/extractAccessionVersion.ts';
import { baseUrl, dummyOrganism, expect } from '../../../e2e.fixture.ts';

export class UserPage {
    constructor(public readonly page: Page) {}

    public async goToUserPage() {
        await this.page.goto(`${baseUrl}${routes.userOverviewPage()}`, { waitUntil: 'networkidle' });
        await this.page.waitForURL(`${baseUrl}${routes.userOverviewPage()}`);
    }

    public async logout() {
        await this.page.click('text=Logout');
        await this.page.waitForURL(`${baseUrl}/logout`);
    }

    public async leaveGroup(uniqueGroupName: string) {
        const buttonToLeaveGroup = this.getLocatorForButtonToLeaveGroup(uniqueGroupName);
        await buttonToLeaveGroup.waitFor({ state: 'visible' });
        await buttonToLeaveGroup.click();

        const confirmButton = this.page.getByRole('button', { name: 'Confirm' });
        await confirmButton.click();
    }

    public getLocatorForButtonToLeaveGroup(groupName: string) {
        return this.page.locator('li').filter({ hasText: groupName }).getByRole('button');
    }

    public async verifyGroupIsNotPresent(uniqueGroupName: string) {
        const group = this.page.locator('li').filter({ hasText: uniqueGroupName });
        await expect(group).not.toBeVisible();
    }
}
