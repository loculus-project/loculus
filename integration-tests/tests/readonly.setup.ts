import { expect, test as setup } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import { GroupPage } from './pages/group.page';
import { readonlyGroup } from './fixtures/group.fixture';
import { SingleSequenceSubmissionPage } from './pages/submission.page';
import { readonlyUser } from './fixtures/user.fixture';

setup('Initialize a single ebola sequence as base data', async ({ page, baseURL }) => {
    setup.setTimeout(90_000);
    const authPage = new AuthPage(page);
    await authPage.tryLoginOrRegister(readonlyUser);

    const groupPage = new GroupPage(page);
    const groupId = await groupPage.getOrCreateGroup(readonlyGroup);

    // Navigate directly to the group's released sequences page to check for data.
    const releasedSequencesUrl = new URL(
        `/ebola-sudan/submission/${groupId}/released`,
        baseURL,
    ).toString();
    await page.goto(releasedSequencesUrl);
    // Wait for page to load by asserting on presence of group name
    await expect(page.getByRole('button', { name: readonlyGroup.name })).toBeVisible({
        timeout: 5000,
    });

    const sequenceCount = await page.getByRole('link', { name: /LOC_/ }).count();

    if (sequenceCount > 0) {
        return; // Data exists, so we're done.
    }

    const submissionPage = new SingleSequenceSubmissionPage(page);
    const reviewPage = await submissionPage.completeSubmission(
        {
            submissionId: 'foobar-readonly',
            collectionCountry: 'France',
            collectionDate: '2021-05-12',
            authorAffiliations: 'Patho Institute, Paris',
            groupId: groupId,
        },
        {
            main:
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
                'AAGGCAGCTCTTGGCTCACTTGCCAAGCATGGAGAATATGCTCCATTTGCACGTCTCCTCAATCTTTCTG',
        },
    );

    await reviewPage.waitForZeroProcessing();
    await reviewPage.releaseValidSequences();
    await page.getByRole('link', { name: 'released sequences' }).click();
    // Reloading is required as the page does not automatically update with new data
    await expect
        .poll(
            async () => {
                await page.reload();
                return page.getByRole('link', { name: /LOC_/ }).first().isVisible();
            },
            {
                message: 'Link with name /LOC_/ never became visible.',
                timeout: 60000,
            },
        )
        .toBe(true);
});
