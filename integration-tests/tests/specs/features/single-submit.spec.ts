import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { SingleSequenceSubmissionPage } from '../../pages/submission.page';

test('submit a single sequence', async ({ page, groupId }) => {
    test.setTimeout(90_000);
    void groupId;
    const submissionPage = new SingleSequenceSubmissionPage(page);

    await submissionPage.navigateToSubmissionPage();
    await submissionPage.fillSubmissionForm({
        submissionId: 'TEST-ID-123',
        collectionCountry: 'Uganda',
        collectionDate: '2023-10-15',
        authorAffiliations: 'Research Lab, University',
    });
    await submissionPage.fillSequenceData({
        fastaHeader:
            'ATTGATCTCATCATTTACCAATTGGAGACCGTTTAACTAGTCAATCCCCCATTTGGGGGCATTCCTAAAGTGTTGCAAAGGTATGTGGGTCGTATTGCTTTGCCTTTTCCTAACCTGGCTCCTCCTACAATTCTAACCTGCTTGATAAGTGTGATTACCTGAGTAATAGACTAATTTCGTCCTGGTAATTAGCATTTTCTAGTAAAACCAATACTATCTCAAGTCCTAAGAGGAGGTGAGAAGAGGGTCTCGAGGTATCCCTCCAGTCCACAAAATCTAGCTAATTTTAGCTGAGTGGACTGATTACTCTCATCACACGCTAACTACTAAGGGTTTACCTGAGAGCCTACAACATGGATAAACGGGTGAGAGGTTCATGGGCCCTGGGAGGACAATCTGAAGTTGATCTTGACTACCACAAAATATTAACAGCCGGGCTTTCGGTCCAACAAGGGATTGTGCGACAAAGAGTCATCCCGGTATATGTTGTGAGTGATCTTGAGGGTATTTGTCAACATATCATTCAGGCCTTTGAAGCAGGCGTAGATTTCCAAGATAATGCTGACAGCTTCCTTTTACTTTTATGTTTACATCATGCTTACCAAGGAGATCATAGGCTCTTCCTCAAAAGTGATGCAGTTCAATACTTAGAGGGCCATGGTTTCAGGTTTGAGGTCCGAGAAAAGGAGAATGTGCACCGTCTGGATGAATTGTTGCCCAATGTCACCGGTGGAAAAAATCTTAGGAGAACATTGGCTGCAATGCCTGAAGAGGAGACAACAGAAGCTAACGCTGGTCAGTTTTTATCCTTTGCCAGTTTGTTTCTACCCAAACTTGTCGTTGGGGAGAAAGCGTGTCTGGAAAAAGTACAAAGGCAGATTCAGGTCCATGCAGAACAAGGGCTCATTCAATATCCAACTTCCTGGCAATCAGTTGGACACATGATGGTGATCTTCCGTTTGATGAGAACAAACTTTTTAATCAAGTTCCTACTAATACATCAGGGGATGCACATGG',
    });
    await submissionPage.acceptTerms();
    await submissionPage.submitSequence();
    await page.waitForURL('**/review');
});

test('submit a single sequence, all in one method', async ({ page, groupId }) => {
    test.setTimeout(90_000);
    void groupId;
    const submissionPage = new SingleSequenceSubmissionPage(page);
    await submissionPage.completeSubmission(
        {
            submissionId: 'TEST-ID-123',
            collectionCountry: 'Uganda',
            collectionDate: '2023-10-15',
            authorAffiliations: 'Research Lab, University',
        },
        {
            fastaHeader:
                'ATTGATCTCATCATTTACCAATTGGAGACCGTTTAACTAGTCAATCCCCCATTTGGGGGCATTCCTAAAGTGTTGCAAAGGTATGTGGGTCGTATTGCTTTGCCTTTTCCTAACCTGGCTCCTCCTACAATTCTAACCTGCTTGATAAGTGTGATTACCTGAGTAATAGACTAATTTCGTCCTGGTAATTAGCATTTTCTAGTAAAACCAATACTATCTCAAGTCCTAAGAGGAGGTGAGAAGAGGGTCTCGAGGTATCCCTCCAGTCCACAAAATCTAGCTAATTTTAGCTGAGTGGACTGATTACTCTCATCACACGCTAACTACTAAGGGTTTACCTGAGAGCCTACAACATGGATAAACGGGTGAGAGGTTCATGGGCCCTGGGAGGACAATCTGAAGTTGATCTTGACTACCACAAAATATTAACAGCCGGGCTTTCGGTCCAACAAGGGATTGTGCGACAAAGAGTCATCCCGGTATATGTTGTGAGTGATCTTGAGGGTATTTGTCAACATATCATTCAGGCCTTTGAAGCAGGCGTAGATTTCCAAGATAATGCTGACAGCTTCCTTTTACTTTTATGTTTACATCATGCTTACCAAGGAGATCATAGGCTCTTCCTCAAAAGTGATGCAGTTCAATACTTAGAGGGCCATGGTTTCAGGTTTGAGGTCCGAGAAAAGGAGAATGTGCACCGTCTGGATGAATTGTTGCCCAATGTCACCGGTGGAAAAAATCTTAGGAGAACATTGGCTGCAATGCCTGAAGAGGAGACAACAGAAGCTAACGCTGGTCAGTTTTTATCCTTTGCCAGTTTGTTTCTACCCAAACTTGTCGTTGGGGAGAAAGCGTGTCTGGAAAAAGTACAAAGGCAGATTCAGGTCCATGCAGAACAAGGGCTCATTCAATATCCAACTTCCTGGCAATCAGTTGGACACATGATGGTGATCTTCCGTTTGATGAGAACAAACTTTTTAATCAAGTTCCTACTAATACATCAGGGGATGCACATGG',
        },
    );
    await page.waitForURL('**/review');
});

test('field description tooltip appears on hover', async ({ page, groupId }) => {
    void groupId;
    const submissionPage = new SingleSequenceSubmissionPage(page);
    await submissionPage.navigateToSubmissionPage();

    // sampleCollectionDate has a definition and guidance in the config, so the info icon should be present
    const infoIcon = page.locator('[data-tooltip-id="field-tooltipsampleCollectionDate"]');
    await expect(infoIcon).toBeVisible();

    const tooltip = page.locator('#field-tooltipsampleCollectionDate');
    // The form is server-rendered before react hydrates, and a hover dispatched before the tooltip
    // has attached its listeners is lost, so retry the hover instead of hovering once.
    await expect(async () => {
        await page.mouse.move(0, 0);
        await infoIcon.hover();
        await expect(tooltip).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await expect(tooltip).toContainText('sampleCollectionDate');
});
