import type { APIContext } from 'astro';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, test, vi } from 'vitest';

import { CONFIG_SHEET_NAME, DATA_SHEET_NAME, GET, LISTS_SHEET_NAME } from './index';
import type { TemplateInputField } from '../../../../config';

const submissionDetailFields: TemplateInputField[] = [{ name: 'submissionId', required: true, isTemplateField: true }];

const templateFields: TemplateInputField[] = [
    { name: 'date', displayName: 'Collection date', required: true, isTemplateField: true },
    {
        name: 'country',
        displayName: 'Country',
        isTemplateField: true,
        options: [{ name: 'Germany' }, { name: 'France' }],
    },
];

const restFields: TemplateInputField[] = [
    {
        name: 'host',
        displayName: 'Host',
        isTemplateField: false,
        options: [{ name: 'Homo sapiens' }, { name: 'Sus scrofa' }],
    },
    { name: 'notes', displayName: 'Notes', isTemplateField: false },
];

const orderedFields = [...submissionDetailFields, ...templateFields, ...restFields];

vi.mock('../../../../config', () => ({
    getMetadataTemplateFields: () =>
        new Map<string, string | undefined>([
            ['submissionId', undefined],
            ['date', 'Collection date'],
        ]),
    getOrderedTemplateInputFields: (organism: string) => {
        if (organism === 'test-organism') {
            return orderedFields;
        }
        throw new Error(`Unknown organism: ${organism}`);
    },
}));

vi.mock('../../../../components/Navigation/cleanOrganism', () => ({
    cleanOrganism: (rawOrganism: string) => {
        if (rawOrganism === 'test-organism') {
            return { organism: { key: 'test-organism', displayName: 'Test Organism' } };
        }
        return { organism: undefined };
    },
}));

function callGet(organism: string, params: Record<string, string> = {}): Promise<Response> {
    const search = new URLSearchParams(params).toString();
    return GET({
        params: { organism },
        request: new Request(`http://localhost/${organism}/submission/template?${search}`),
    } as unknown as APIContext) as Promise<Response>;
}

async function loadWorkbook(response: Response): Promise<ExcelJS.Workbook> {
    const buffer = await response.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    return workbook;
}

describe('submission template API route', () => {
    test('returns 404 for an unknown organism', async () => {
        const response = await callGet('invalid-organism', { fileType: 'xlsx' });
        expect(response.status).toBe(404);
    });

    test('TSV template keeps the existing (template-only) field set and headers', async () => {
        const response = await callGet('test-organism', { fileType: 'tsv' });

        expect(response.headers.get('Content-Type')).toBe('text/tab-separated-values');
        expect(response.headers.get('Content-Disposition')).toBe(
            'attachment; filename="Test_Organism_metadata_template.tsv"',
        );
        const text = await response.text();
        expect(text).toBe('submissionId\tdate\n');
    });

    test('XLSX template has Data, Config and hidden _lists sheets, with Data first', async () => {
        const response = await callGet('test-organism', { fileType: 'xlsx' });
        expect(response.headers.get('Content-Type')).toBe(
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );

        const workbook = await loadWorkbook(response);
        const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
        expect(sheetNames[0]).toBe(DATA_SHEET_NAME);
        expect(sheetNames).toContain(CONFIG_SHEET_NAME);
        expect(sheetNames).toContain(LISTS_SHEET_NAME);

        expect(workbook.getWorksheet(LISTS_SHEET_NAME)!.state).toBe('hidden');
    });

    test('Data sheet headers are machine names, template fields before the rest', async () => {
        const response = await callGet('test-organism', { fileType: 'xlsx' });
        const workbook = await loadWorkbook(response);

        const headerRow = workbook.getWorksheet(DATA_SHEET_NAME)!.getRow(1);
        const headers = (headerRow.values as unknown[]).slice(1);
        expect(headers).toEqual(['submissionId', 'date', 'country', 'host', 'notes']);
    });

    test('_lists holds an options column per field with choices, keyed by field name', async () => {
        const response = await callGet('test-organism', { fileType: 'xlsx' });
        const workbook = await loadWorkbook(response);
        const listsSheet = workbook.getWorksheet(LISTS_SHEET_NAME)!;

        expect(listsSheet.getCell('A1').value).toBe('country');
        expect(listsSheet.getCell('A2').value).toBe('Germany');
        expect(listsSheet.getCell('A3').value).toBe('France');
        expect(listsSheet.getCell('B1').value).toBe('host');
        expect(listsSheet.getCell('B2').value).toBe('Homo sapiens');
    });

    test('only option columns get an advisory, header-driven dropdown looking up _lists', async () => {
        // Asserted against the raw written XML: ExcelJS' own re-read expands a range `sqref` into
        // per-cell entries, which makes the compact per-column rules unreadable.
        const response = await callGet('test-organism', { fileType: 'xlsx' });
        const zip = await JSZip.loadAsync(await response.arrayBuffer());
        // `Data` is the first sheet, so it is sheet1.xml.
        const sheetXml = await zip.file('xl/worksheets/sheet1.xml')!.async('string');

        const validationBlock = /<dataValidations[\s\S]*?<\/dataValidations>/.exec(sheetXml)?.[0] ?? '';
        // Only the two option fields (country -> col C, host -> col D) are validated; the free-text
        // columns (submissionId/A, date/B, notes/E) get no validation so they accept any value.
        expect(validationBlock).toContain('count="2"');
        expect(validationBlock).toContain('sqref="C2:C100000"');
        expect(validationBlock).toContain('sqref="D2:D100000"');
        expect(validationBlock).not.toContain('sqref="A2');
        expect(validationBlock).not.toContain('sqref="E2');
        // Advisory, not strict: a warning the user can dismiss, rather than a hard rejection.
        expect(validationBlock).toContain('errorStyle="warning"');
        expect(validationBlock).not.toContain('errorStyle="stop"');
        // Header-driven: each validation looks up its own column header (C$1 / D$1) in `_lists`,
        // so the dropdown follows the field if the column is renamed or moved.
        expect(validationBlock).toContain('MATCH(C$1');
        expect(validationBlock).toContain('MATCH(D$1');
        expect(validationBlock).toContain(LISTS_SHEET_NAME);
    });

    test('Data columns are widened to fit field names and their options', async () => {
        const response = await callGet('test-organism', { fileType: 'xlsx' });
        const workbook = await loadWorkbook(response);
        const dataSheet = workbook.getWorksheet(DATA_SHEET_NAME)!;

        // Every column is at least the minimum width...
        for (let column = 1; column <= 5; column++) {
            expect(dataSheet.getColumn(column).width).toBeGreaterThanOrEqual(16);
        }
        // ...and the `host` column (col D) widens to fit "Homo sapiens" (12) -> 14 < 16, stays at 16,
        // while a longer option would push it wider. Sanity-check it is a finite, bounded number.
        expect(dataSheet.getColumn(4).width).toBeLessThanOrEqual(45);
    });

    test('Config sheet lists every field with enabled/required flags and allowed values', async () => {
        const response = await callGet('test-organism', { fileType: 'xlsx' });
        const workbook = await loadWorkbook(response);
        const configSheet = workbook.getWorksheet(CONFIG_SHEET_NAME)!;

        expect((configSheet.getRow(1).values as unknown[]).slice(1)).toEqual([
            'Field name',
            'Display name',
            'Enabled by default',
            'Required',
            'Allowed values',
        ]);

        // country: enabled by default, optional, with allowed values
        const countryRow = configSheet.getRow(4).values as unknown[];
        expect(countryRow.slice(1)).toEqual(['country', 'Country', 'Yes', 'No', 'Germany, France']);

        // host: opt-in (not a template field), free text label only when no options
        const hostRow = configSheet.getRow(5).values as unknown[];
        expect(hostRow.slice(1, 4)).toEqual(['host', 'Host', 'No']);

        const notesRow = configSheet.getRow(6).values as unknown[];
        expect(notesRow[5]).toBe('free text');
    });

    test('revision template filename includes "revision"', async () => {
        const response = await callGet('test-organism', { fileType: 'xlsx', format: 'revise' });
        expect(response.headers.get('Content-Disposition')).toBe(
            'attachment; filename="Test_Organism_metadata_revision_template.xlsx"',
        );
    });
});
