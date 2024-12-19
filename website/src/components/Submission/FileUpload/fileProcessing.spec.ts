import { describe, expect, test } from "vitest";
import { promises as fs } from "fs";
import { METADATA_FILE_KIND, type ProcessedFile } from "./fileProcessing";

function mimeType(fileName: string): string {
    const extension = fileName.split(".")[1];
    switch(extension) {
        case 'xls':
        case 'xlsx':
            return 'application/vnd.ms-excel'
        default:
            return 'text/plain'
    }
}

async function loadTestFile(fileName: string): Promise<File> {
    const path = `${import.meta.dirname}/test_files/${fileName}`;
    const contents = await fs.readFile(path);
    return new File([contents], fileName, {type: mimeType(fileName)});
}

describe('fileProcessing', () => {
    test('loading TSV', async () => {
        const file = await loadTestFile('testfile.tsv');
        const processingResult = await METADATA_FILE_KIND.processRawFile(file);

        expect(processingResult).toHaveProperty('inner');
        expect(processingResult).toHaveProperty('handle');
        expect(processingResult).toHaveProperty('warnings');

        const processedFile = processingResult as ProcessedFile;

        expect(processedFile.warnings().length).toBe(0);
        expect(processedFile.handle()).toBe(file);
    })

    test.each([
        ['testfile_different_formats.xls', 0],
        ['testfile_different_formats.xlsx', 0],
        ['testfile_with_second_sheet.xls', 1],
        ['testfile_with_second_sheet.xlsx', 1]
    ])('loading %s', async (filename, warningsCount) => {
        const file = await loadTestFile(filename);
        const processingResult = await METADATA_FILE_KIND.processRawFile(file);

        expect(processingResult).toHaveProperty('inner');
        expect(processingResult).toHaveProperty('handle');
        expect(processingResult).toHaveProperty('warnings');

        const processedFile = processingResult as ProcessedFile;

        console.log(await processedFile.inner().text())
        expect(processedFile.warnings().length).toBe(warningsCount);
    })
})