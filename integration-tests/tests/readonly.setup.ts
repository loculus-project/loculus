import { test as setup } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import { GroupPage } from './pages/group.page';
import { createTestGroup } from './fixtures/group.fixture';
import { SingleSequenceSubmissionPage } from './pages/submission.page';
import { v4 as uuidv4 } from 'uuid';

setup('Initialize a single ebola sequence as base data', async ({ page }) => {
    setup.setTimeout(90000);
    const authPage = new AuthPage(page);
    const username = uuidv4().substring(0, 8);
    const password = uuidv4().substring(0, 8);
    await authPage.createAccount({
        firstName: 'Foo',
        lastName: 'Bar',
        email: `${username}@foo.org`,
        organization: 'Foo University',
        password,
        username,
    });

    const groupPage = new GroupPage(page);
    await groupPage.createGroup(createTestGroup());

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
                'ATGGATTCTCGTCCTCAGAAAATCTGGATGGCGCCGAGTCTCACTGAATCTGACATGGATTACCACAAGA' +
                'TCTTGACAGCAGGTCTGTCCGTTCAACAGGGGATTGTTCGGCAAAGAGTCATCCCAGTGTATCAAGTAAA' +
                'CAATCTTGAAGAAATTTGCCAACTTATCATACAGGCCTTTGAAGCAGGTGTTGATTTTCAAGAGAGTGCG' +
                'GACAGTTTCCTTCTCATGCTTTGTCTTCATCATGCGTACCAGGGAGATTACAAACTTTTCTTGGAAAGTG' +
                'GCGCAGTCAAGTATTTGGAAGGGCACGGGTTCCGTTTTGAAGTCAAGAAGCGTGATGGAGTGAAGCGCCT' +
                'TGAGGAATTGCTGCCAGCAGTATCTAGTGGAAAAAACATTAAGAGAACACTTGCTGCCATGCCGGAAGAG' +
                'GAGACAACTGAAGCTAATGCCGGTCAGTTTCTCTCCTTTGCAAGTCTATTCCTTCCGAAATTGGTAGTAG' +
                'GAGAAAAGGCTTGCCTTGAGAAGGTTCAAAGGCAAATTCAAGTACATGCAGAGCAAGGACTGATACAATA' +
                'TCCAACAGCTTGGCAATCAGTAGGACACATGATGGTGATTTTCCGTTTGATGCGAACAAATTTTCTGATC' +
                'AAATTTCTCCTAATACACCAAGGGATGCACATGGTTGCCGGGCATGATGCCAACGATGCTGTGATTTCAA' +
                'ATTCAGTGGCTCAAGCTCGTTTTTCAGGCTTATTGATTGTCAAAACAGTACTTGATCATATCCTACAAAA' +
                'GACAGAACGAGGAGTTCGTCTCCATCCTCTTGCAAGGACCGCCAAGGTAAAAAATGAGGTGAACTCCTTT' +
                'AAGGCTGCACTCAGCTCCCTGGCCAAGCATGGAGAGTATGCTCCTTTCGCCCGACTTTTGAACCTTTCTG' +
                'GAGTAAATAATCTTGAGCATGGTCTTTTCCCTCAACTATCGGCAATTGCACTCGGAGTCGCCACAGCACA',
        },
    );

    await reviewPage.waitForZeroProcessing();
    await reviewPage.releaseValidSequences();
    await page.getByRole('link', { name: 'released sequences' }).click();
    while (!(await page.getByRole('link', { name: /LOC_/ }).isVisible())) {
        await page.reload();
        await page.waitForTimeout(2000);
    }
});
