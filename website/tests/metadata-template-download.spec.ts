import * as XLSX from '@lokalise/xlsx';
import type { Download } from '@playwright/test';

import { expect, test } from './e2e.fixture.ts';

test.describe('Metadata template download', () => {
    test('submission and revision templates can be downloaded', async ({
        submitPage,
        revisePage,
        loginAsTestUser,
        browserName,
    }) => {
        skipDownloadTestInWebkit(browserName);

        const { groupId } = await loginAsTestUser();

        await submitPage.goto(groupId);
        let download = await submitPage.downloadTsvMetadataTemplate();
        expect(download.suggestedFilename()).toBe('Test_Dummy_Organism_metadata_template.tsv');
        expect(await getDownloadedContentAsString(download)).toStrictEqual('submissionId\tcountry\tdate\n');

        download = await submitPage.downloadXlsxMetadataTemplate();
        expect(download.suggestedFilename()).toBe('Test_Dummy_Organism_metadata_template.xlsx');
        expectHeaders(await getDownloadedContentAsExcel(download), ['submissionId', 'country', 'date']);

        await revisePage.goto(groupId);
        download = await revisePage.downloadTsvMetadataTemplate();
        expect(download.suggestedFilename()).toBe('Test_Dummy_Organism_metadata_revision_template.tsv');
        expect(await getDownloadedContentAsString(download)).toStrictEqual('accession\tsubmissionId\tcountry\tdate\n');

        download = await revisePage.downloadXlsxMetadataTemplate();
        expect(download.suggestedFilename()).toBe('Test_Dummy_Organism_metadata_revision_template.xlsx');
        expectHeaders(await getDownloadedContentAsExcel(download), ['accession', 'submissionId', 'country', 'date']);
    });

    async function getDownloadedContent(download: Download): Promise<ArrayBuffer> {
        const readable = await download.createReadStream();
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            readable.on('data', (chunk) => chunks.push(chunk as Buffer));
            readable.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
            });
            readable.on('error', reject);
        });
    }

    async function getDownloadedContentAsString(download: Download): Promise<string> {
        const arrayBuffer = await getDownloadedContent(download);
        return new TextDecoder().decode(arrayBuffer);
    }

    async function getDownloadedContentAsExcel(download: Download): Promise<XLSX.WorkBook> {
        const arrayBuffer = await getDownloadedContent(download);
        return XLSX.read(arrayBuffer);
    }

    function expectHeaders(workBook: XLSX.WorkBook, headers: string[]) {
        expect(workBook.SheetNames.length).toBe(1);
        const sheet = workBook.Sheets[workBook.SheetNames[0]];
        const arrayOfArrays = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        expect(arrayOfArrays.length).toBeGreaterThan(0);
        const sheetHeaders = arrayOfArrays[0];
        expect(sheetHeaders).toEqual(headers);
    }

    function skipDownloadTestInWebkit(browserName: 'chromium' | 'firefox' | 'webkit') {
        test.skip(
            browserName === 'webkit',
            'Playwright-webkit seems to ignore the content disposition header.\nIt does not download the file and shows it inline.',
        );
    }
});
