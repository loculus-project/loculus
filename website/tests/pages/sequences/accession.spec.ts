import { routes } from '../../../src/routes.ts';
import { getAccessionVersionString } from '../../../src/utils/extractAccessionVersion.ts';
import {
    baseUrl,
    deprecatedSequenceEntry,
    dummyOrganism,
    expect,
    revisedSequenceEntry,
    revokedSequenceEntry,
    test,
    testSequenceEntry,
} from '../../e2e.fixture';

test.describe('The detailed sequence page', () => {
    test('can load and show sequence data', async ({ sequencePage }) => {
        await sequencePage.goto();
        await expect(sequencePage.page.getByText(testSequenceEntry.orf1a)).not.toBeVisible();

        await sequencePage.loadSequences();
        await sequencePage.clickORF1aButton();

        await expect(sequencePage.page.getByText(testSequenceEntry.orf1a, { exact: false })).toBeVisible();
    });

    // TODO(#619): revoked entries should show a link to the newest version. Since SILO cannot process revocation_entries yet, this is not tested.
    test('check initial sequences and verify that banners are shown when revoked or revised', async ({
        sequencePage,
    }) => {
        await sequencePage.goto(revokedSequenceEntry);
        await expect(sequencePage.page.getByText(`This sequence entry has been revoked!`)).toBeVisible();
        // await expect(
        //     sequencePage.page.getByText(`This is not the latest version of this sequence entry.`),
        // ).toBeVisible();

        await sequencePage.goto(deprecatedSequenceEntry);
        await expect(
            sequencePage.page.getByText(`This is not the latest version of this sequence entry.`),
        ).toBeVisible();

        await sequencePage.goto(revisedSequenceEntry);
        await expect(
            sequencePage.page.getByText(`This is not the latest version of this sequence entry.`),
        ).not.toBeVisible();
    });

    test('can navigate to the versions page and click the link to the deprecated version', async ({ sequencePage }) => {
        await sequencePage.goto(revisedSequenceEntry);
        await sequencePage.gotoAllVersions();
        await expect(
            sequencePage.page.getByText(`Versions for accession ${revisedSequenceEntry.accession}`),
        ).toBeVisible();
        await expect(sequencePage.page.getByText(`Latest version`)).toBeVisible();
        await expect(sequencePage.page.getByText(`Revised`)).toBeVisible();

        const deprecatedVersionString = getAccessionVersionString(deprecatedSequenceEntry);
        const linkToDeprecatedVersion = sequencePage.page.getByRole('link', {
            name: `${deprecatedVersionString}`,
        });
        await expect(linkToDeprecatedVersion).toBeVisible();
        await linkToDeprecatedVersion.click();

        await sequencePage.page.waitForURL(
            baseUrl + routes.sequencesDetailsPage(dummyOrganism.key, deprecatedVersionString),
        );
    });
});
