import type { Page } from '@playwright/test';

import { baseUrl, testuser } from '../../e2e.fixture';

interface SequenceVersionWithStatus {
    sequenceId: number;
    version: number;
    status: string;
}

export class UserPage {
    private readonly sequenceBoxNames = [
        `userSequences.${testuser}.receivedExpanded`,
        `userSequences.${testuser}.processingExpanded`,
        `userSequences.${testuser}.needsReviewExpanded`,
        `userSequences.${testuser}.reviewedExpanded`,
        `userSequences.${testuser}.stagingExpanded`,
        `userSequences.${testuser}.readyExpanded`,
        `userSequences.${testuser}.revokedExpanded`,
    ] as const;

    constructor(public readonly page: Page) {}

    public async goto() {
        await this.page.goto(`${baseUrl}/user/${testuser}`);
    }

    public async gotoUserSequencePage() {
        await this.page.goto(`${baseUrl}/user/${testuser}/sequences`);

        for (const id of this.sequenceBoxNames) {
            const checkbox = this.page.getByTestId(id);
            if (!(await checkbox.isChecked())) {
                await checkbox.click();
            }
        }

        await this.page.waitForSelector('text=REVOKE');
    }

    public async verifyTableEntries(sequencesToCheck: SequenceVersionWithStatus[]) {
        const rows = (await this.page.locator('tr').allTextContents()).map((row) =>
            row.split(/\s+/).filter((entry) => entry !== ''),
        );

        const rowsWithCorrectEntries: string[][] = [];
        for (const sequenceVersionWithStatus of sequencesToCheck) {
            const { sequenceId, version, status } = sequenceVersionWithStatus;
            rowsWithCorrectEntries.push(
                ...rows.filter((row) => row.includes(status) && row.includes(`${sequenceId}.${version}`)),
            );
        }

        return rowsWithCorrectEntries.length === sequencesToCheck.length;
    }
}
