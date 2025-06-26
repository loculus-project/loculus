import { expect, test as setup } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import { GroupPage } from './pages/group.page';
import { readonlyGroup } from './fixtures/group.fixture';
import { SingleSequenceSubmissionPage } from './pages/submission.page';
import { readonlyUser } from './fixtures/user.fixture';

setup('Initialize a single ebola sequence as base data', async ({ page }) => {
    setup.setTimeout(90000);
    const authPage = new AuthPage(page);
    await authPage.tryLoginOrRegister(readonlyUser);

    const groupPage = new GroupPage(page);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const groupId = await groupPage.getOrCreateGroup(readonlyGroup);

    const submissionPage = new SingleSequenceSubmissionPage(page);
    const reviewPage = await submissionPage.completeSubmission(
        {
            submissionId: 'foobar',
            collectionCountry: 'France',
            collectionDate: '2021-05-12',
            authorAffiliations: 'Patho Institute, Paris',
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
