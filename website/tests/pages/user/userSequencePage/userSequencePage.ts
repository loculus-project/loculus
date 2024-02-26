import type { Page } from '@playwright/test';

import { routes } from '../../../../src/routes.ts';
import type { AccessionVersion, SequenceEntryStatus } from '../../../../src/types/backend.ts';
import { getAccessionVersionString } from '../../../../src/utils/extractAccessionVersion.ts';
import { baseUrl, dummyOrganism, expect } from '../../../e2e.fixture';

export class UserSequencePage {
    private readonly sequenceBoxNames = [
        `userSequences.receivedExpanded`,
        `userSequences.processingExpanded`,
        `userSequences.needsReviewExpanded`,
        `userSequences.stagingExpanded`,
        `userSequences.readyExpanded`,
        `userSequences.revokedExpanded`,
    ] as const;

    constructor(public readonly page: Page) {}

    public async gotoUserSequencePage() {
        await this.page.goto(`${baseUrl}${routes.userSequencesPage(dummyOrganism.key)}`, {
            waitUntil: 'networkidle',
        });
        await this.page.waitForURL(`${baseUrl}${routes.userSequencesPage(dummyOrganism.key)}`);

        for (const id of this.sequenceBoxNames) {
            const checkbox = this.page.getByTestId(id);
            if (!(await checkbox.isChecked())) {
                await checkbox.click();
            }
        }

        await this.page.waitForSelector('text=REVOKE');
    }

    public async gotoUserReviewPage() {
        await this.page.goto(`${baseUrl}${routes.userSequenceReviewPage(dummyOrganism.key)}`, {
            waitUntil: 'networkidle',
        });
        await this.page.waitForURL(`${baseUrl}${routes.userSequenceReviewPage(dummyOrganism.key)}`);

        await this.page.waitForSelector('text=Current submissions');
    }

    public async goToUserPage() {
        await this.page.goto(`${baseUrl}${routes.userOverviewPage()}`, { waitUntil: 'networkidle' });
        await this.page.waitForURL(`${baseUrl}${routes.userOverviewPage()}`);
    }

    public async logout() {
        await this.page.click('text=Logout');
        await this.page.waitForURL(`${baseUrl}/logout`);
    }

    public async verifyTableEntries(sequencesToCheck: SequenceEntryStatus[]) {
        const rows = (await this.page.locator('tr').allTextContents()).map((row) =>
            row.split(/\s+/).filter((entry) => entry !== ''),
        );

        const rowsWithCorrectEntries: string[][] = [];
        for (const { accession, version, status } of sequencesToCheck) {
            rowsWithCorrectEntries.push(
                ...rows.filter(
                    (row) => row.includes(status) && row.includes(getAccessionVersionString({ accession, version })),
                ),
            );
        }

        return rowsWithCorrectEntries.length === sequencesToCheck.length;
    }

    public async clickOnEditForSequenceEntry(accessionToCheck: AccessionVersion) {
        const testIdOfButton = `${getAccessionVersionString(accessionToCheck)}.edit`;
        const editButton = this.page.getByTestId(testIdOfButton);
        await editButton.click();

        await this.page.waitForURL(`${baseUrl}${routes.editPage(dummyOrganism.key, accessionToCheck)}`, {
            waitUntil: 'networkidle',
        });
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
