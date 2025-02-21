import * as XLSX from '@lokalise/xlsx';
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

        let download = await submitPage.downloadTsvMetadataTemplate();

        const expectedHeaders = ['id', 'country', 'date'];

        expect(download.suggestedFilename()).toBe('Test_Dummy_Organism_metadata_template.tsv');
        const content = await getDownloadedContentAsString(download);
        expect(content).toStrictEqual('id\tcountry\tdate\n');

        download = await submitPage.downloadXlsxMetadataTemplate();
        expect(download.suggestedFilename()).toBe('Test_Dummy_Organism_metadata_template.xlsx');
        const workbook = await getDownloadedContentAsExcel(download);
        expectHeaders(workbook, expectedHeaders);
    });

    test('should download the metadata file template for revision', async ({
        revisePage,
        loginAsTestUser,
        browserName,
    }) => {
        skipDownloadTestInWebkit(browserName);

        const { groupId } = await loginAsTestUser();
        await revisePage.goto(groupId);

        let download = await revisePage.downloadTsvMetadataTemplate();

        const expectedHeaders = ['accession', 'id', 'country', 'date'];

        expect(download.suggestedFilename()).toBe('Test_Dummy_Organism_metadata_revision_template.tsv');
        const content = await getDownloadedContentAsString(download);
        expect(content).toStrictEqual('accession\tid\tcountry\tdate\n');

        download = await revisePage.downloadXlsxMetadataTemplate();
        expect(download.suggestedFilename()).toBe('Test_Dummy_Organism_metadata_revision_template.xlsx');
        const workbook = await getDownloadedContentAsExcel(download);
        expectHeaders(workbook, expectedHeaders);
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
            'Playwright-webkit seems to ignore the content disposition header.\n' +
                "It doesn't download the file, instead it displays it.",
        );
    }
});
