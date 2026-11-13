import { fail } from 'assert';
import { promises as fs } from 'fs';

import * as XLSX from '@lokalise/xlsx';
import { describe, expect, test } from 'vitest';

import { FASTA_FILE_KIND, METADATA_FILE_KIND, PLAIN_SEGMENT_KIND } from './fileProcessing';

/** An XLSX file whose sheets are written in the given order; the parser looks up `Data` by name. */
function buildWorkbookFile(sheets: [name: string, rows: string[][]][]): File {
    const workbook = XLSX.utils.book_new();
    for (const [name, rows] of sheets) {
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
    }
    return new File([XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer], 'metadata.xlsx');
}

const dataRows = [
    ['submissionId', 'country'],
    ['sample1', 'Germany'],
];

async function loadTestFile(fileName: string): Promise<File> {
    const path = `${import.meta.dirname}/test_files/${fileName}`;
    const contents = await fs.readFile(path);
    return new File([new Uint8Array(contents)], fileName);
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
        ['testfile.tsv.zip', 0],
        ['testfile.tsv.gz', 0],
        ['testfile.tsv.zst', 0],
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
            expect(await processedFile.text().then((text) => text.replace(/[\r]+/g, ''))).toEqual(tsvFileContent);
        },
        10000,
    );

    test('LZMA compressed TSV file cannot be processed', async () => {
        const file = new File(['dummy'], 'testfile.tsv.xz');
        const processingResult = await METADATA_FILE_KIND.processRawFile(file);

        expect(processingResult.isErr()).toBeTruthy();
        expect(processingResult._unsafeUnwrapErr().message).toContain('LZMA compression');
    });

    test('LZMA compressed excel file cannot be processed', async () => {
        const file = await loadTestFile('testfile_different_formats.xlsx.xz');
        const processingResult = await METADATA_FILE_KIND.processRawFile(file);

        expect(processingResult.isErr()).toBeTruthy();
    });

    test('Unsupported metadata extension results in error with message', async () => {
        const file = new File(['dummy'], 'unsupported.txt');
        const processingResult = await METADATA_FILE_KIND.processRawFile(file);

        expect(processingResult.isErr()).toBeTruthy();
        const message = processingResult._unsafeUnwrapErr().message;
        expect(message).toContain('Unsupported file extension');
    });

    test('Plain segment file content is extracted correctly', async () => {
        const dummyFile = new File(['>fooid description\nACTG\n\nACTG\nACTG\n'], 'example.fasta', {
            type: 'text/plain',
        });
        const result = await PLAIN_SEGMENT_KIND.processRawFile(dummyFile);
        if (result.isErr()) {
            fail(`result was error: ${result._unsafeUnwrapErr().message}`);
        }
        const processedFile = result._unsafeUnwrap();
        const processedText = await processedFile.text();
        expect(processedText).toBe('ACTGACTGACTG');
        expect(processedFile.fastaHeader()).toBe('fooid description');
    });

    test('an unexpected extra sheet triggers a multi-sheet warning', async () => {
        const file = buildWorkbookFile([
            ['Data', dataRows],
            ['Guidance', [['ignored']]],
            ['My other data', [['x']]],
        ]);
        const processingResult = await METADATA_FILE_KIND.processRawFile(file);

        expect(processingResult.isOk()).toBe(true);
        expect(processingResult._unsafeUnwrap().warnings()).toHaveLength(1);
    });

    test('parses the Data sheet by name even when it is not the first sheet', async () => {
        // Reference sheet dragged in front of Data — the Data sheet must still be the one parsed.
        const file = buildWorkbookFile([
            ['Guidance', [['Field name', 'Display name']]],
            ['Data', dataRows],
        ]);
        const processingResult = await METADATA_FILE_KIND.processRawFile(file);
        expect(processingResult.isOk()).toBe(true);
        const processedFile = processingResult._unsafeUnwrap();

        expect(processedFile.warnings()).toHaveLength(0);
        expect(await processedFile.text()).toBe('submissionId\tcountry\nsample1\tGermany');
    });

    test.each([
        ['metadata.tsv', true],
        ['metadata.xlsx.gz', true],
        ['sequences.fasta.zst', false],
        ['sequences.txt', false],
    ])('sequence file field rejects %s: %s', async (fileName, isRejected) => {
        const processingResult = await FASTA_FILE_KIND.processRawFile(new File(['content'], fileName));

        expect(processingResult.isErr()).toBe(isRejected);
    });
});
