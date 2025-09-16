import { expect, type Download, type Page } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';
import * as XLSX from '@lokalise/xlsx';

test.describe('Metadata templates', () => {
    const organismSlug = 'ebola-sudan';
    const organismDisplayName = 'Ebola_Sudan';

    test('submission templates are downloadable as TSV and XLSX', async ({ page }) => {
        const tsvDownload = await downloadTemplate(page, organismSlug, 'submit', 'tsv');
        expect(tsvDownload.suggestedFilename()).toBe(
            `${organismDisplayName}_metadata_template.tsv`,
        );

        const tsvBody = await readDownloadAsString(tsvDownload);
        const tsvHeader = tsvBody.trim().split('\n')[0]?.split('\t') ?? [];
        expect(tsvHeader.length).toBeGreaterThan(0);
        expect(tsvHeader).toEqual(
            expect.arrayContaining(['id', 'authorAffiliations', 'sampleCollectionDate']),
        );

        const xlsxDownload = await downloadTemplate(page, organismSlug, 'submit', 'xlsx');
        expect(xlsxDownload.suggestedFilename()).toBe(
            `${organismDisplayName}_metadata_template.xlsx`,
        );

        const xlsxHeaders = extractXlsxHeaders(await readDownloadAsBuffer(xlsxDownload));
        expect(xlsxHeaders).toEqual(
            expect.arrayContaining(['id', 'authorAffiliations', 'sampleCollectionDate']),
        );
    });

    test('revision templates include accession column', async ({ page }) => {
        const tsvDownload = await downloadTemplate(page, organismSlug, 'revise', 'tsv');
        expect(tsvDownload.suggestedFilename()).toBe(
            `${organismDisplayName}_metadata_revision_template.tsv`,
        );

        const tsvBody = await readDownloadAsString(tsvDownload);
        const tsvHeader = tsvBody.trim().split('\n')[0]?.split('\t') ?? [];
        expect(tsvHeader).toEqual(
            expect.arrayContaining(['accession', 'id', 'sampleCollectionDate']),
        );

        const xlsxDownload = await downloadTemplate(page, organismSlug, 'revise', 'xlsx');
        expect(xlsxDownload.suggestedFilename()).toBe(
            `${organismDisplayName}_metadata_revision_template.xlsx`,
        );

        const xlsxHeaders = extractXlsxHeaders(await readDownloadAsBuffer(xlsxDownload));
        expect(xlsxHeaders).toEqual(
            expect.arrayContaining(['accession', 'id', 'sampleCollectionDate']),
        );
    });
});

type TemplateFormat = 'submit' | 'revise';
type TemplateFileType = 'tsv' | 'xlsx';

async function downloadTemplate(
    page: Page,
    organismSlug: string,
    format: TemplateFormat,
    fileType: TemplateFileType,
): Promise<Download> {
    const url = `/${organismSlug}/submission/template?format=${format}&fileType=${fileType}`;
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.goto(url).catch((error) => {
            const message = String(error);
            if (!message.includes('Download is starting')) {
                throw error;
            }
        }),
    ]);
    return download;
}

function extractXlsxHeaders(buffer: Buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const [sheetName] = workbook.SheetNames;
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    const headerRow = rows[0] ?? [];
    return headerRow.map((cell) => coerceCellToString(cell));
}

function coerceCellToString(cell: unknown): string {
    if (cell === undefined || cell === null) {
        return '';
    }

    if (typeof cell === 'string') {
        return cell;
    }

    if (typeof cell === 'number' || typeof cell === 'boolean') {
        return cell.toString();
    }

    throw new TypeError(`Unsupported cell type: ${typeof cell}`);
}

async function readDownloadAsBuffer(download: Download): Promise<Buffer> {
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];

    if (stream === null) {
        throw new Error('Failed to read download stream');
    }

    await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk as Buffer));
        stream.on('end', () => resolve());
        stream.on('error', (error) => reject(error));
    });

    return Buffer.concat(chunks);
}

async function readDownloadAsString(download: Download): Promise<string> {
    const buffer = await readDownloadAsBuffer(download);
    return new TextDecoder().decode(buffer);
}
