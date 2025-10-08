import { expect } from '@playwright/test';
import { test } from '../../../fixtures/group.fixture';
import { ReviewPage } from '../../../pages/review.page';
import { SearchPage } from '../../../pages/search.page';
import { SingleSequenceSubmissionPage } from '../../../pages/submission.page';
import { v4 as uuidv4 } from 'uuid';

test('Override hidden fields', async ({ page, pageWithGroup }) => {
    test.setTimeout(95_000);
    const uuid = uuidv4();

    await page.goto('/');
    const submissionPage = new SingleSequenceSubmissionPage(pageWithGroup);
    await submissionPage.completeSubmission(
        {
            submissionId: 'foo1',
            collectionCountry: 'France',
            collectionDate: '2023-10-15',
            authorAffiliations: uuid,
        },
        [
            'ATTGATCTCATCATTTACCAATTGGAGACCGTTTAACTAGTCAATCCCCCATTTGGGGGCATTCCTAAAGTGTTGCAAAGGTATGTGGGTCGTATTGCTTTGCCTTTTCCTAACCTGGCTCCTCCTACAATTCTAACCTGCTTGATAAGTGTGATTACCTGAGTAATAGACTAATTTCGTCCTGGTAATTAGCATTTTCTAGTAAAACCAATACTATCTCAAGTCCTAAGAGGAGGTGAGAAGAGGGTCTCGAGGTATCCCTCCAGTCCACAAAATCTAGCTAATTTTAGCTGAGTGGACTGATTACTCTCATCACACGCTAACTACTAAGGGTTTACCTGAGAGCCTACAACATGGATAAACGGGTGAGAGGTTCATGGGCCCTGGGAGGACAATCTGAAGTTGATCTTGACTACCACAAAATATTAACAGCCGGGCTTTCGGTCCAACAAGGGATTGTGCGACAAAGAGTCATCCCGGTATATGTTGTGAGTGATCTTGAGGGTATTTGTCAACATATCATTCAGGCCTTTGAAGCAGGCGTAGATTTCCAAGATAATGCTGACAGCTTCCTTTTACTTTTATGTTTACATCATGCTTACCAAGGAGATCATAGGCTCTTCCTCAAAAGTGATGCAGTTCAATACTTAGAGGGCCATGGTTTCAGGTTTGAGGTCCGAGAAAAGGAGAATGTGCACCGTCTGGATGAATTGTTGCCCAATGTCACCGGTGGAAAAAATCTTAGGAGAACATTGGCTGCAATGCCTGAAGAGGAGACAACAGAAGCTAACGCTGGTCAGTTTTTATCCTTTGCCAGTTTGTTTCTACCCAAACTTGTCGTTGGGGAGAAAGCGTGTCTGGAAAAAGTACAAAGGCAGATTCAGGTCCATGCAGAACAAGGGCTCATTCAATATCCAACTTCCTGGCAATCAGTTGGACACATGATGGTGATCTTCCGTTTGATGAGAACAAACTTTTTAATCAAGTTCCTACTAATACATCAGGGGATGCACATGG',
        ],
    );
    await page.goto('/');
    let reviewPage = await submissionPage.completeSubmission(
        {
            submissionId: 'foo1',
            collectionCountry: 'Uganda',
            collectionDate: '2023-10-15',
            authorAffiliations: uuid,
        },
        [
            'ATTGATCTCATCATTTACCAATTGGAGACCGTTTAACTAGTCAATCCCCCATTTGGGGGCATTCCTAAAGTGTTGCAAAGGTATGTGGGTCGTATTGCTTTGCCTTTTCCTAACCTGGCTCCTCCTACAATTCTAACCTGCTTGATAAGTGTGATTACCTGAGTAATAGACTAATTTCGTCCTGGTAATTAGCATTTTCTAGTAAAACCAATACTATCTCAAGTCCTAAGAGGAGGTGAGAAGAGGGTCTCGAGGTATCCCTCCAGTCCACAAAATCTAGCTAATTTTAGCTGAGTGGACTGATTACTCTCATCACACGCTAACTACTAAGGGTTTACCTGAGAGCCTACAACATGGATAAACGGGTGAGAGGTTCATGGGCCCTGGGAGGACAATCTGAAGTTGATCTTGACTACCACAAAATATTAACAGCCGGGCTTTCGGTCCAACAAGGGATTGTGCGACAAAGAGTCATCCCGGTATATGTTGTGAGTGATCTTGAGGGTATTTGTCAACATATCATTCAGGCCTTTGAAGCAGGCGTAGATTTCCAAGATAATGCTGACAGCTTCCTTTTACTTTTATGTTTACATCATGCTTACCAAGGAGATCATAGGCTCTTCCTCAAAAGTGATGCAGTTCAATACTTAGAGGGCCATGGTTTCAGGTTTGAGGTCCGAGAAAAGGAGAATGTGCACCGTCTGGATGAATTGTTGCCCAATGTCACCGGTGGAAAAAATCTTAGGAGAACATTGGCTGCAATGCCTGAAGAGGAGACAACAGAAGCTAACGCTGGTCAGTTTTTATCCTTTGCCAGTTTGTTTCTACCCAAACTTGTCGTTGGGGAGAAAGCGTGTCTGGAAAAAGTACAAAGGCAGATTCAGGTCCATGCAGAACAAGGGCTCATTCAATATCCAACTTCCTGGCAATCAGTTGGACACATGATGGTGATCTTCCGTTTGATGAGAACAAACTTTTTAATCAAGTTCCTACTAATACATCAGGGGATGCACATGG',
        ],
    );

    await reviewPage.waitForZeroProcessing();
    await reviewPage.releaseValidSequences();
    await page.getByRole('link', { name: 'released sequences' }).click();

    while (!(await page.getByText('Search returned 2 sequences').isVisible())) {
        await page.reload();
        await page.waitForTimeout(2000);
    }

    let search = new SearchPage(page);
    await search.ebolaSudan();

    // This is just to ensure that things are interactive and ready - bit of a hack for now
    await search.select('Collection country', 'France');
    await page.getByLabel('Clear').click();

    await search.enableSearchFields('Author affiliations');
    await search.fill('Author affiliations', uuid);

    await page.getByRole('cell', { name: 'France' }).click();
    await page.getByRole('link', { name: 'Revise this sequence' }).click();
    await page.getByLabel('Collection date').fill('2012-12-13');
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Review current submissions')).toBeVisible();

    search = new SearchPage(page);
    await search.ebolaSudan();

    await search.select('Collection country', 'Uganda');
    await search.enableSearchFields('Author affiliations');
    await search.fill('Author affiliations', uuid);
    await search.expectSequenceCount(1);
    const revokedId = await page.getByRole('link', { name: /LOC_[A-Z0-9]{2,20}\.1/ }).textContent();
    const revokedAccession = revokedId.split('.')[0];
    const expectedRevocationAccessionVersion = `${revokedAccession}.2`;
    await page.getByRole('cell', { name: 'Uganda' }).click();
    await page.getByRole('button', { name: 'Revoke this sequence' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();

    reviewPage = new ReviewPage(page);
    await reviewPage.waitForZeroProcessing();
    await reviewPage.releaseValidSequences();
    await page.getByRole('link', { name: 'released sequences' }).click();
    while (!(await page.getByRole('cell', { name: '2012-12-13' }).isVisible())) {
        await page.reload();
        await page.waitForTimeout(2000);
    }

    await search.ebolaSudan();

    // This is just to ensure that things are interactive and ready - bit of a hack for now
    await search.select('Collection country', 'France');
    await page.getByLabel('Clear').click();

    await search.enableSearchFields('Author affiliations', 'Version status');
    await search.fill('Author affiliations', uuid);

    await search.expectSequenceCount(1);
    await search.clearSelect('Version status');
    await search.expectSequenceCount(3);
    await search.select('Collection country', 'France');
    await search.expectSequenceCount(2);

    await page.getByRole('button', { name: 'Reset' }).click();
    await search.enableSearchFields('Is revocation');
    await search.select('Is revocation', 'true');
    await expect(
        page.getByRole('link', { name: expectedRevocationAccessionVersion }),
    ).toBeVisible();
});
