import { routes } from '../../../src/routes/routes.ts';
import { getAccessionVersionString } from '../../../src/utils/extractAccessionVersion.ts';
import { baseUrl, expect, test, testSequenceEntryData } from '../../e2e.fixture';
import { getTestSequences } from '../../util/testSequenceProvider.ts';

test.describe('The detailed sequence page', () => {
    test('can load and show sequence data', async ({ sequencePage }) => {
        const testSequenceEntry = getTestSequences().testSequenceEntry;

        await sequencePage.goto(testSequenceEntry);
        await expect(sequencePage.page.getByText(testSequenceEntryData.orf1a)).not.toBeVisible();

        await sequencePage.loadSequences();
        await sequencePage.selectORF1a();

        await expect(sequencePage.page.getByText(testSequenceEntryData.orf1a, { exact: false })).toBeVisible();
    });

    test('check initial sequences and verify that banners are shown when revoked or revised', async ({
        sequencePage,
    }) => {
        const testSequences = getTestSequences();

        await sequencePage.goto(testSequences.revokedSequenceEntry);
        await expect(sequencePage.page.getByText(`This sequence entry has been revoked!`)).toBeVisible();
        await expect(sequencePage.notLatestVersionBanner).toBeVisible();

        await sequencePage.goto(testSequences.revocationSequenceEntry);
        await expect(sequencePage.revocationVersionBanner).toBeVisible();

        await sequencePage.goto(testSequences.deprecatedSequenceEntry);
        await expect(sequencePage.notLatestVersionBanner).toBeVisible();

        await sequencePage.goto(testSequences.revisedSequenceEntry);
        await expect(sequencePage.notLatestVersionBanner).not.toBeVisible();
    });

    test('can navigate to the versions page and click the link to the deprecated version', async ({ sequencePage }) => {
        const testSequences = getTestSequences();

        await sequencePage.goto(testSequences.revisedSequenceEntry);
        await sequencePage.gotoAllVersions();
        await expect(
            sequencePage.page.getByText(`Versions for accession ${testSequences.revisedSequenceEntry.accession}`),
        ).toBeVisible();
        await expect(sequencePage.page.getByText(`Latest version`)).toBeVisible();
        await expect(sequencePage.page.getByText(`Revised`)).toBeVisible();

        const deprecatedVersionString = getAccessionVersionString(testSequences.deprecatedSequenceEntry);
        const linkToDeprecatedVersion = sequencePage.page.getByRole('link', {
            name: `${deprecatedVersionString}`,
        });
        await expect(linkToDeprecatedVersion).toBeVisible();
        await linkToDeprecatedVersion.click();

        await sequencePage.page.waitForURL(baseUrl + routes.sequencesDetailsPage(deprecatedVersionString));
    });
});
