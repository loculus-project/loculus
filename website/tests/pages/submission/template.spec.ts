import type { Download } from '@playwright/test';
import * as XLSX from 'xlsx';

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

        expect(download.suggestedFilename()).toBe('Test_Dummy_Organism_metadata_template.tsv');
        const content = await getDownloadedContent(download);
        expect(content).toStrictEqual('submissionId\tcountry\tdate\n');

        download = await submitPage.downloadXlsMetadataTemplate();
        expect(download.suggestedFilename()).toBe('Test_Dummy_Organism_metadata_template.xls');

        download = await submitPage.downloadXlsMetadataTemplate();
        expect(download.suggestedFilename()).toBe('Test_Dummy_Organism_metadata_template.xlsx');
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

        const expectedHeaders = ["accession", "submissionId", "country", "date"];

        expect(download.suggestedFilename()).toBe('Test_Dummy_Organism_metadata_revision_template.tsv');
        const content = await getDownloadedContentAsString(download);
        expect(content).toStrictEqual('accession\tsubmissionId\tcountry\tdate\n');

        download = await revisePage.downloadXlsMetadataTemplate();
        expect(download.suggestedFilename()).toBe('Test_Dummy_Organism_metadata_revision_template.xls');
        var workbook = await getDownloadedContentAsXls(download);
        expectHeaders(workbook, expectedHeaders);

        download = await revisePage.downloadXlsxMetadataTemplate();
        expect(download.suggestedFilename()).toBe('Test_Dummy_Organism_metadata_revision_template.xlsx');
        workbook = await getDownloadedContentAsXls(download);
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

    async function getDownloadedContentAsXls(download: Download): Promise<XLSX.WorkBook> {
        const arrayBuffer = await getDownloadedContent(download);
        return XLSX.read(arrayBuffer);
    }

    function expectHeaders(workBook: XLSX.WorkBook, headers: string[]) {
        expect(workBook.SheetNames.length).toBe(1);
        const sheet = workBook.Sheets[workBook.SheetNames[0]];
    
        const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        expect(aoa.length).toBeGreaterThan(0);
    
        const sheetHeaders = aoa[0];
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
