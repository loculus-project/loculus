import { test as setup } from '@playwright/test';
import { AuthPage } from './pages/auth.page';
import { GroupPage } from './pages/group.page';
import { createTestGroup } from './fixtures/group.fixture';
import { SingleSequenceSubmissionPage } from './pages/singlesubmission.page';
import { v4 as uuidv4 } from 'uuid';

setup('init some stuff', async ({ page }) => {
    setup.setTimeout(90000);
    const authPage = new AuthPage(page);
    await authPage.navigateToRegister();
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
    await groupPage.navigateToCreateGroupPage();
    await groupPage.createGroup(createTestGroup());

    const submissionPage = new SingleSequenceSubmissionPage(page);
    const reviewPage = await submissionPage.completeSubmission({
        submissionId: 'foobar',
        collectionCountry: 'France',
        collectionDate: '2021-05-12',
        authorAffiliations: 'Patho Institute, Paris'
    }, {
        main: 'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnntgtgtgcgaataactatga' +
        'ggaagattaataattttcctnctcattgaaatttatatcggnaatttaaattgaaattgt' +
        'tactgtaatcatacctggtttgntttcagagccatatcaccaagatagagaacaacctag' +
        'gtctccggagggggcaagggcatcagtgtgctcagttgaaaatcccttgtcaacatctag' +
        'gccttatcacatcacaagttccgccttaaactctgcagggtgatccaacaaccttaatag' +
        'caacattattgttaaaggacagcattagttcacagtcaaacaagcaagattgagaattaa' +
        'ctttgattttgaacctgaacacccagaggactggagactcaacaaccctaaagcctaggg' +
        'taaaacattagaaatagtttaaagacaaattgctcggaatcacaaaattccgagtatgga' +
        'ttctcgtcctcagaaagtctggatgacgccgagtctcactgaatctgacatggattacca' +
        'caagatcttgacagcaggtctgtccgttcaacaggggattgttcggcaaagagtcatccc' +
        'agtgtatcaagtaaacaatcttgaggaaatttgccaacttatcatacaggcctttgaagc' +
        'tggtgttgattttcaagagagtgcggacagtttccttctcatgctttgtcttcatcatgc' +
        'gtaccaaggagattacaaacttttcttggaaagtggcgcagtcaagt'
    })

    await reviewPage.waitForZeroProcessing();
    await reviewPage.releaseValidSequences();

    // wait for backend to load the sequence
    await page.waitForTimeout(35000);
});