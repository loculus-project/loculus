import { expect } from '@playwright/test';
import { test as setup } from './fixtures/console-warnings.fixture';
import { AuthPage } from './pages/auth.page';
import { GroupPage } from './pages/group.page';
import { readonlyGroup } from './utils/testGroup';
import { SingleSequenceSubmissionPage } from './pages/submission.page';
import { SearchPage } from './pages/search.page';
import { readonlyUser } from './fixtures/user.fixture';

setup('Initialize some ebola sequences as base data', async ({ page }) => {
    setup.setTimeout(180_000);
    const authPage = new AuthPage(page);
    await authPage.tryLoginOrRegister(readonlyUser);

    const groupPage = new GroupPage(page);
    const groupId = await groupPage.getOrCreateGroup(readonlyGroup);

    const searchPage = new SearchPage(page);

    // Navigate directly to the group's released sequences page to check for data.
    await searchPage.goToReleasedSequences('ebola-sudan', groupId);
    // Wait for page to load by asserting on presence of the group name
    await expect(page.getByText(readonlyGroup.name).first()).toBeVisible();

    const sequenceCount = await page.getByRole('link', { name: /LOC_/ }).count();

    if (sequenceCount >= 3) {
        return; // Data exists, so we're done.
    }

    const submissionPage = new SingleSequenceSubmissionPage(page);
    const mainSequence =
        'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn' +
        'ATGGATAAACGGGTGAGAGGTTCATGGGCCCTGGGAGGACAATCTGAAGTTGATCTTGACTACCACAAAA' +
        'TATTAACAGCCGGGCTTTCGGTCCAACAAGGGATTGTGCGACAAAGAGTCATCCCGGTATATGTTGTGAG' +
        'TGATCTTGAGGGTATTTGTCAACATATCATTCAGGCCTTTGAAGCAGGCGTAGATTTCCAAGATAATGCT' +
        'GACAGCTTCCTTTTACTTTTATGTTTACATCATGCTTACCAAGGAGATCATAGGCTCTTCCTCAAAAGTG' +
        'ATGCAGTTCAATACTTAGAGGGCCATGGTTTCAGGTTTGAGGTCCGAGAAAAGGAGAATGTGCACCGTCT' +
        'GGATGAATTGTTGCCCAATGTCACCGGTGGAAAAAATCTTAGGAGAACATTGGCTGCAATGCCTGAAGAG' +
        'GAGACAACAGAAGCTAATGCTGGTCAGTTTTTATCCTTTGCCAGTTTGTTTCTACCCAAACTTGTCGTTG' +
        'GGGAGAAAGCGTGTCTGGAAAAAGTACAAAGGCAGATTCAGGTCCATGCAGAACAAGGGCTCATTCAATA' +
        'TCCAACTTCCTGGCAATCAGTTGGACACATGATGGTGATCTTCCGTTTGATGAGAACAAACTTTTTAATC' +
        'AAGTTCCTACTAATACATCAGGGGATGCACATGGTCGCAGGCCATGATGCGAATGACACAGTAATATCTA' +
        'ATTCTGTTGCCCAAGCAAGGTTCTCTGGTCTTCTGATTGTAAAGACTGTTCTGGACCACATCCTACAAAA' +
        'AACAGATCTTGGAGTACGACTTCATCCACTGGCCAGGACAGCAAAAGTCAAGAATGAGGTCAGTTCATTC' +
        'AAGGCAGCTCTTGGCTCACTTGCCAAGCATGGAGAATATGCTCCATTTGCACGTCTCCTCAATCTTTCTG';

    const sequences = [
        {
            submissionId: 'foobar-readonly-1',
            collectionCountry: 'France',
            collectionDate: '2021-05-12',
            authorAffiliations: 'Patho Institute, Paris',
        },
        {
            submissionId: 'foobar-readonly-2',
            collectionCountry: 'Brazil',
            collectionDate: '2021-06-15',
            authorAffiliations: 'Research Center, Rio',
        },
        {
            submissionId: 'foobar-readonly-3',
            collectionCountry: 'Switzerland',
            collectionDate: '2021-07-20',
            authorAffiliations: 'University Hospital, Zurich',
        },
    ];

    for (const seq of sequences) {
        const reviewPage = await submissionPage.completeSubmission(
            {
                ...seq,
                groupId: groupId.toString(),
            },
            {
                fastaHeader: mainSequence,
            },
        );

        await reviewPage.waitForZeroProcessing();
        await reviewPage.releaseValidSequences();
    }

    await page.getByRole('link', { name: 'released sequences' }).click();
    // Reloading is required as the page does not automatically update with new data
    await expect
        .poll(
            async () => {
                await page.reload();
                return page.getByRole('link', { name: /LOC_/ }).count();
            },
            {
                message: 'Expected 3 sequences to become visible.',
                timeout: 60000,
            },
        )
        .toBeGreaterThanOrEqual(3);
});
