import fs from 'fs';
import { expect, type Page } from '@playwright/test';
import * as XLSX from '@lokalise/xlsx';

export type TemplateRow = Record<string, string | Date>;
export type TemplateMistakes = {
    deleteHeaderRow?: boolean;
    renameHeaders?: Record<string, string>;
};

/** The XLSX metadata template of a submit or revise upload form, with SheetJS standing in for Excel. */
export class XlsxTemplate {
    private constructor(private readonly content: Buffer) {}

    /** Clicks the form's "XLSX template" link and opens the file the browser saves. */
    static async download(page: Page): Promise<XlsxTemplate> {
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('link', { name: 'XLSX template', exact: true }).click();
        return new XlsxTemplate(await fs.promises.readFile(await (await downloadPromise).path()));
    }

    /** The dropdown choices offered for a column, which the template keeps on its `_lists` sheet. */
    dropdownOptions(header: string): string[] {
        const [listHeaders, ...optionRows] = rowsOf(
            XLSX.read(this.content, { type: 'buffer' }),
            '_lists',
        );
        const column = listHeaders.indexOf(header);
        expect(column, `template has a dropdown for ${header}`).toBeGreaterThanOrEqual(0);
        return optionRows.map((row) => row[column]).filter(Boolean);
    }

    /**
     * Fills a fresh copy by column header and selects it; a local-time `Date` becomes a date serial, as when typed in Excel.
     * Mistakes a user can make: `deleteHeaderRow` deletes row 1 (data shifts up), `renameHeaders` edits header cells.
     */
    async fillAndUpload(
        page: Page,
        rows: TemplateRow[],
        { deleteHeaderRow = false, renameHeaders = {} }: TemplateMistakes = {},
    ) {
        const workbook = XLSX.read(this.content, { type: 'buffer' });
        const dataSheetName = workbook.SheetNames[0];
        const [headers] = rowsOf(workbook, dataSheetName);
        for (const row of rows) {
            expect(headers, 'template has a column for every value').toEqual(
                expect.arrayContaining(Object.keys(row)),
            );
        }
        XLSX.utils.sheet_add_aoa(
            workbook.Sheets[dataSheetName],
            rows.map((row) => headers.map((header) => row[header] ?? null)),
            { origin: deleteHeaderRow ? 'A1' : 'A2' },
        );
        if (!deleteHeaderRow) {
            const renamed = headers.map((header) => renameHeaders[header] ?? header);
            XLSX.utils.sheet_add_aoa(workbook.Sheets[dataSheetName], [renamed], { origin: 'A1' });
        }
        await page.getByTestId('metadata_file').setInputFiles({
            name: 'filled_template.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            // type 'buffer' does not yield a Node Buffer in the Playwright runner.
            buffer: Buffer.from(
                XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer,
            ),
        });
    }
}

function rowsOf(workbook: XLSX.WorkBook, sheetName: string): string[][] {
    const sheet = workbook.Sheets[sheetName];
    expect(sheet, `template has a ${sheetName} sheet`).toBeDefined();
    return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
}

/** The minimal TSV metadata template of an upload form: a single header row. */
export class TsvTemplate {
    private constructor(readonly headers: string[]) {}

    /** Clicks the form's "TSV" template link and reads the header row. */
    static async download(page: Page): Promise<TsvTemplate> {
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('link', { name: 'TSV', exact: true }).click();
        const content = await fs.promises.readFile(await (await downloadPromise).path(), 'utf8');
        return new TsvTemplate(content.trimEnd().split('\t'));
    }

    /** Fills rows by column header (dates as YYYY-MM-DD) and selects the file. */
    async fillAndUpload(
        page: Page,
        rows: TemplateRow[],
        { renameHeaders = {} }: TemplateMistakes = {},
    ) {
        for (const row of rows) {
            expect(this.headers, 'template has a column for every value').toEqual(
                expect.arrayContaining(Object.keys(row)),
            );
        }
        const cell = (value: string | Date | undefined) =>
            value instanceof Date
                ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
                : (value ?? '');
        const lines = [
            this.headers.map((header) => renameHeaders[header] ?? header),
            ...rows.map((row) => this.headers.map((header) => cell(row[header]))),
        ];
        await page.getByTestId('metadata_file').setInputFiles({
            name: 'filled_template.tsv',
            mimeType: 'text/tab-separated-values',
            buffer: Buffer.from(lines.map((line) => line.join('\t')).join('\n') + '\n'),
        });
    }
}
