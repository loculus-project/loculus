import type { Download } from '@playwright/test';

import { expect, test } from '../../e2e.fixture.ts';

test.describe('The submit page', () => {
    test('should download the metadata file template for submission', async ({
        submitPage,
        loginAsTestUser,
        browserName,
    }) => {
        skipDownloadTestInWebkit(browserName);

        const { groupId } = await loginAsTestUser();
        await submitPage.goto(groupId);

        const download = await submitPage.downloadMetadataTemplate();

        expect(download.suggestedFilename()).toBe('Test_Dummy_Organism_metadata_template.tsv');
        const content = await getDownloadedContent(download);

        expect(content).toStrictEqual(
            'submissionId\tcountry\tdate\tdivision\thost\tpangoLineage\tregion\tversionComment\n',
        );
    });

    test('should download the metadata file template for revision', async ({
        revisePage,
        submitPage,
        loginAsTestUser,
        browserName,
    }) => {
        skipDownloadTestInWebkit(browserName);

        const { groupId } = await loginAsTestUser();
        await revisePage.goto(groupId);

        const download = await submitPage.downloadMetadataTemplate();

        expect(download.suggestedFilename()).toBe('Test_Dummy_Organism_metadata_revision_template.tsv');
        const content = await getDownloadedContent(download);
        expect(content).toStrictEqual(
            'accession\tsubmissionId\tcountry\tdate\tdivision\thost\tpangoLineage\tregion\tversionComment\n',
        );
    });

    async function getDownloadedContent(download: Download) {
        const readable = await download.createReadStream();
        return new Promise((resolve) => {
            let data = '';
            readable.on('data', (chunk) => (data += chunk));
            readable.on('end', () => resolve(data));
        });
    }

    function skipDownloadTestInWebkit(browserName: 'chromium' | 'firefox' | 'webkit') {
        test.skip(
            browserName === 'webkit',
            'Playwright-webkit seems to ignore the content disposition header.\n' +
                "It doesn't download the file, instead it displays it.",
        );
    }
});
