import { expect } from '@playwright/test';
import { SearchPage } from '../../pages/search.page';
import { test } from '../../fixtures/group.fixture';
import { SingleSequenceSubmissionPage } from '../../pages/singlesubmission.page';

test.describe('Search', () => {
    let searchPage: SearchPage;

    test.beforeEach(async ({ page }) => {
        searchPage = new SearchPage(page);
    });

    test('test that search form resets when the reset button is clicked', async ({ page }) => {
        await searchPage.ebolaSudan();
        await searchPage.select('Collection country', 'Canada');
        await expect(page.getByText('Collection country:Canada')).toBeVisible();
        await searchPage.enterMutation('A23T');
        await expect(page.getByText('nucleotideMutations:A23T')).toBeVisible();
        await searchPage.resetSearchForm();
        expect(new URL(page.url()).searchParams.size).toBe(0);
    });

    test('test that filter can be removed by clicking the X', async ({ page, pageWithGroup }) => {
        test.setTimeout(60000);
        const submissionPage = new SingleSequenceSubmissionPage(pageWithGroup);
        const reviewPage = await submissionPage.completeSubmission(
            {
                submissionId: 'TEST-ID-123',
                collectionCountry: 'Canada',
                collectionDate: '2023-10-15',
                authorAffiliations: 'Research Lab, University',
            },
            {
                main: 'ATTGATCTCATCATTTACCAATTGGAGACCGTTTAACTAGTCAATCCCCCATTTGGGGGCATTCCTAAAGTGTTGCAAAGGTATGTGGGTCGTATTGCTTTGCCTTTTCCTAACCTGGCTCCTCCTACAATTCTAACCTGCTTGATAAGTGTGATTACCTGAGTAATAGACTAATTTCGTCCTGGTAATTAGCATTTTCTAGTAAAACCAATACTATCTCAAGTCCTAAGAGGAGGTGAGAAGAGGGTCTCGAGGTATCCCTCCAGTCCACAAAATCTAGCTAATTTTAGCTGAGTGGACTGATTACTCTCATCACACGCTAACTACTAAGGGTTTACCTGAGAGCCTACAACATGGATAAACGGGTGAGAGGTTCATGGGCCCTGGGAGGACAATCTGAAGTTGATCTTGACTACCACAAAATATTAACAGCCGGGCTTTCGGTCCAACAAGGGATTGTGCGACAAAGAGTCATCCCGGTATATGTTGTGAGTGATCTTGAGGGTATTTGTCAACATATCATTCAGGCCTTTGAAGCAGGCGTAGATTTCCAAGATAATGCTGACAGCTTCCTTTTACTTTTATGTTTACATCATGCTTACCAAGGAGATCATAGGCTCTTCCTCAAAAGTGATGCAGTTCAATACTTAGAGGGCCATGGTTTCAGGTTTGAGGTCCGAGAAAAGGAGAATGTGCACCGTCTGGATGAATTGTTGCCCAATGTCACCGGTGGAAAAAATCTTAGGAGAACATTGGCTGCAATGCCTGAAGAGGAGACAACAGAAGCTAACGCTGGTCAGTTTTTATCCTTTGCCAGTTTGTTTCTACCCAAACTTGTCGTTGGGGAGAAAGCGTGTCTGGAAAAAGTACAAAGGCAGATTCAGGTCCATGCAGAACAAGGGCTCATTCAATATCCAACTTCCTGGCAATCAGTTGGACACATGATGGTGATCTTCCGTTTGATGAGAACAAACTTTTTAATCAAGTTCCTACTAATACATCAGGGGATGCACATGG',
            },
        );
        await reviewPage.releaseValidSequences();
        await searchPage.ebolaSudan();
        await searchPage.select('Collection country', 'Canada');
        await expect(page.getByText('Collection country:Canada')).toBeVisible();
        await page.getByLabel('remove filter').click();
        await expect(page.getByText('Collection country:Canada')).not.toBeVisible();
        await expect(page.getByLabel('Collection country')).toBeEmpty();
        expect(new URL(page.url()).searchParams.size).toBe(0);
    });

    test('test that mutation filter can be removed by clicking the X', async ({ page }) => {
        test.setTimeout(60000);
        await searchPage.ebolaSudan();
        await searchPage.enterMutation('A23T');
        await expect(page.getByText('nucleotideMutations:A23T')).toBeVisible();
        await page.getByLabel('remove filter').click();
        await expect(page.getByText('nucleotideMutations:A23T')).not.toBeVisible();
        expect(new URL(page.url()).searchParams.size).toBe(0);
    });
});
