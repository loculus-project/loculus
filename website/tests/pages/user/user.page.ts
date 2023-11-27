import type { Page } from '@playwright/test';

import type { AccessionVersion, SequenceEntryStatus } from '../../../src/types/backend.ts';
import { getAccessionVersionString } from '../../../src/utils/extractAccessionVersion.ts';
import { baseUrl, dummyOrganism, testUser } from '../../e2e.fixture';
import { routes } from '../../../src/routes.ts';

export class UserPage {
    private readonly sequenceBoxNames = [
        `userSequences.${testUser}.receivedExpanded`,
        `userSequences.${testUser}.processingExpanded`,
        `userSequences.${testUser}.needsReviewExpanded`,
        `userSequences.${testUser}.stagingExpanded`,
        `userSequences.${testUser}.readyExpanded`,
        `userSequences.${testUser}.revokedExpanded`,
    ] as const;

    constructor(public readonly page: Page) {}

    public async gotoUserSequencePage() {
        await this.page.goto(`${baseUrl}${routes.userSequencesPage(dummyOrganism.key, testUser)}`, {
            waitUntil: 'networkidle',
        });
        await this.page.waitForURL(`${baseUrl}${routes.userSequencesPage(dummyOrganism.key, testUser)}`);

        for (const id of this.sequenceBoxNames) {
            const checkbox = this.page.getByTestId(id);
            if (!(await checkbox.isChecked())) {
                await checkbox.click();
            }
        }

        await this.page.waitForSelector('text=REVOKE');
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
                ...rows.filter((row) => row.includes(status) && row.includes(`${accession}.${version}`)),
            );
        }

        return rowsWithCorrectEntries.length === sequencesToCheck.length;
    }

    public async clickOnReviewForSequenceEntry(accessionToCheck: AccessionVersion) {
        const testIdOfButton = `${getAccessionVersionString(accessionToCheck)}.review`;
        const reviewButton = this.page.getByTestId(testIdOfButton);
        await reviewButton.click();

        await this.page.waitForURL(`${baseUrl}${routes.reviewPage(dummyOrganism.key, testUser, accessionToCheck)}`, {
            waitUntil: 'networkidle',
        });
    }
}
