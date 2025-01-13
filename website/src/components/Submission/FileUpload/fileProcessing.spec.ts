import { promises as fs } from 'fs';

import { describe, expect, test } from 'vitest';

import { METADATA_FILE_KIND } from './fileProcessing';

async function loadTestFile(fileName: string): Promise<File> {
    const path = `${import.meta.dirname}/test_files/${fileName}`;
    const contents = await fs.readFile(path);
    return new File([contents], fileName);
}

describe('fileProcessing', () => {
    test('loading TSV', async () => {
        const file = await loadTestFile('testfile.tsv');
        const processingResult = await METADATA_FILE_KIND.processRawFile(file);

        expect(processingResult.isOk());
        const processedFile = processingResult._unsafeUnwrap();

        expect(processedFile.warnings().length).toBe(0);
        expect(processedFile.handle()).toBe(file);
    });

    test.each([
        ['testfile_different_formats.xls', 0],
        ['testfile_different_formats.xlsx', 0],
        ['testfile_different_formats.xlsx.gz', 0],
        ['testfile_different_formats.xlsx.zip', 0],
        ['testfile_different_formats.xlsx.zst', 0],
        ['testfile_with_second_sheet.xls', 1],
        ['testfile_with_second_sheet.xlsx', 1],
    ])(
        'should load %s file correctly',
        async (filename, warningsCount) => {
            const tsvFileContent = await loadTestFile('testfile.tsv')
                .then((file) => file.text())
                .then((text) => text.replace(/[\r]+/g, ''));

            const file = await loadTestFile(filename);
            const processingResult = await METADATA_FILE_KIND.processRawFile(file);

            expect(processingResult.isOk()).toBe(true);
            const processedFile = processingResult._unsafeUnwrap();

            expect(processedFile.warnings().length).toBe(warningsCount);
            expect(await processedFile.inner().text()).toEqual(tsvFileContent);
        },
        10000,
    );

    test('LZMA compressed excel file cannot be processed', async () => {
        const file = await loadTestFile('testfile_different_formats.xlsx.xz');
        const processingResult = await METADATA_FILE_KIND.processRawFile(file);

        expect(processingResult.isErr()).toBeTruthy();
    });
});
