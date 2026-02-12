import { expect } from '@playwright/test';
import { test } from '../../../fixtures/group.fixture';
import { SearchPage } from '../../../pages/search.page';
import { BulkSubmissionPage } from '../../../pages/submission.page';
import { randomUUID } from 'crypto';

const SEQUENCE = 'ATTGATCTCATCATTT';

test('Lineage field lineage counts', async ({ page, groupId }) => {
    test.setTimeout(95_000);
    void groupId;
    const uuid = randomUUID();

    await page.goto('/');
    const submissionPage = new BulkSubmissionPage(page);
    await submissionPage.navigateToSubmissionPage('Test organism (without alignment)');
    await submissionPage.uploadMetadataFile(
        ['id', 'date', 'host', 'lineage'],
        [
            ['FOO.1', '2023-05-12', uuid, 'A.1'],
            ['FOO.2', '2023-05-12', uuid, 'A.2'],
            ['FOO.3', '2023-05-12', uuid, 'A.1.1'],
            ['FOO.4', '2023-05-12', uuid, 'B.1'],
            ['FOO.5', '2023-05-12', uuid, 'B.1.1'],
            ['FOO.6', '2023-05-12', uuid, 'C.1'],
        ],
    );
    await submissionPage.uploadSequencesFile({
        'FOO.1': SEQUENCE,
        'FOO.2': SEQUENCE,
        'FOO.3': SEQUENCE,
        'FOO.4': SEQUENCE,
        'FOO.5': SEQUENCE,
        'FOO.6': SEQUENCE,
    });
    await submissionPage.acceptTerms();
    const reviewPage = await submissionPage.submitSequence();

    await reviewPage.waitForZeroProcessing();
    await reviewPage.releaseValidSequences();
    await page.getByRole('link', { name: 'released sequences' }).click();

    while (!(await page.getByText('Search returned 6 sequences').isVisible())) {
        await page.reload();
        await page.waitForTimeout(2000);
    }

    const search = new SearchPage(page);
    await search.testOrganismWithoutAlignment();

    await search.select('Host', uuid);

    await page.getByRole('checkbox', { name: 'include sublineages' }).check();
    await page.getByRole('textbox', { name: 'Lineage' }).click();
    // check diamond structure of A is correct
    await expect(page.getByRole('option', { name: 'A(3)' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'A.1(2)' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'A.2(2)' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'A.1.1(1)' })).toBeVisible();
    // check alias with B/C works correctly
    await expect(page.getByRole('option', { name: 'B.1(3)' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'B.1.1(2)' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'C.1(1)' })).toBeVisible();
});
