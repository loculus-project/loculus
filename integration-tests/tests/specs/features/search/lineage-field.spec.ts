import { expect } from '@playwright/test';
import { test } from '../../../fixtures/group.fixture';
import { ReviewPage } from '../../../pages/review.page';
import { SearchPage } from '../../../pages/search.page';
import { BulkSubmissionPage } from '../../../pages/submission.page';
import { v4 as uuidv4 } from 'uuid';

const SEQUENCE = 'ATTGATCTCATCATTT';

test.only('Override hidden fields', async ({ page, pageWithGroup }) => {
    test.setTimeout(95_000);
    const uuid = uuidv4();

    await page.goto('/');
    const submissionPage = new BulkSubmissionPage(pageWithGroup);
    await submissionPage.navigateToSubmissionPage('Test organism (without alignment)')
    await submissionPage.uploadMetadataFile(
        ['id', 'date', 'host', 'lineage'],
        [
            ['FOO.1', '2023-05-12', uuid, 'A.1'],
            ['FOO.2', '2023-05-12', uuid, 'A.2'],
            ['FOO.3', '2023-05-12', uuid, 'A.1.1'],
            ['FOO.4', '2023-05-12', uuid, 'B.1'],
            ['FOO.5', '2023-05-12', uuid, 'B.1.1'],
            ['FOO.6', '2023-05-12', uuid, 'C.1'],
        ]
    )
    await submissionPage.uploadSequencesFile({
        'FOO.1': SEQUENCE,
        'FOO.2': SEQUENCE,
        'FOO.3': SEQUENCE,
        'FOO.4': SEQUENCE,
        'FOO.5': SEQUENCE,
        'FOO.6': SEQUENCE,
    })
    await submissionPage.acceptTerms();
    let reviewPage = await submissionPage.submitSequence();

    await reviewPage.waitForZeroProcessing();
    await reviewPage.releaseValidSequences();
    await page.getByRole('link', { name: 'released sequences' }).click();

    while (!(await page.getByText('Search returned 6 sequences').isVisible())) {
        await page.reload();
        await page.waitForTimeout(2000);
    }

    let search = new SearchPage(page);
    await search.testOrganismWithoutAlignment();

    await search.select('Host', uuid);

    await page.waitForTimeout(60000);  // for now
});
