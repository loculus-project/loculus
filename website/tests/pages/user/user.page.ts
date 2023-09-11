import type { Page } from '@playwright/test';

import { baseUrl, testuser } from '../../e2e.fixture';

export type SubmitResponse = { sequenceId: number; customId: string };
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
    }

    public async gotoUserPageAndLocateSequenceWithStatus(sequenceId: number, status: string) {
        await this.gotoUserSequencePage();
        return this.page.getByRole('row', { name: `${sequenceId}`, exact: false }).getByRole('cell', { name: status });
    }

    public async gotoUserPageAndLocatorForSequence(
        sequencesWithStatus: { sequenceId: number; version: number; status: string }[],
    ) {
        await this.gotoUserSequencePage();
        return Promise.all(
            sequencesWithStatus.map(async (sequence) =>
                this.page
                    .getByRole('row', {
                        name: `${sequence.sequenceId}`,
                        exact: false,
                    })
                    .getByRole('cell', { name: `${sequence.sequenceId}`, exact: true }),
            ),
        );
    }
}
