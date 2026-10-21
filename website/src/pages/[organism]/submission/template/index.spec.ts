import type { APIContext } from 'astro';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, test, vi } from 'vitest';

import { GET } from './index';
import type { TemplateInputField } from '../../../../config';
import { DATA_SHEET_NAME, GUIDANCE_SHEET_NAME, LISTS_SHEET_NAME } from '../../../../utils/metadataTemplateSheets';

const submissionDetailFields: TemplateInputField[] = [{ name: 'submissionId', required: true, isTemplateField: true }];

const templateFields: TemplateInputField[] = [
    { name: 'date', displayName: 'Collection date', required: true, isTemplateField: true, metadataType: 'date' },
    {
        name: 'country',
        displayName: 'Country',
        isTemplateField: true,
        definition: 'Country where the sample was collected',
        example: 'Germany',
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

    test('XLSX template has Data, Guidance and hidden _lists sheets, with Data first', async () => {
        const response = await callGet('test-organism', { fileType: 'xlsx' });
        expect(response.headers.get('Content-Type')).toBe(
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );

        const workbook = await loadWorkbook(response);
        const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
        expect(sheetNames[0]).toBe(DATA_SHEET_NAME);
        expect(sheetNames).toContain(GUIDANCE_SHEET_NAME);
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

    test('only option columns get a strict, header-driven dropdown looking up _lists', async () => {
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
        // Strict: off-list values on a controlled-vocabulary column are rejected.
        expect(validationBlock).toContain('errorStyle="stop"');
        expect(validationBlock).not.toContain('errorStyle="warning"');
        // Header-driven: each validation looks up its own column header (C$1 / D$1) in `_lists`,
        // so the dropdown follows the field if the column is renamed or moved.
        expect(validationBlock).toContain('MATCH(C$1');
        expect(validationBlock).toContain('MATCH(D$1');
        expect(validationBlock).toContain(LISTS_SHEET_NAME);
    });

    test('Data columns are sized to the field name, bounded and not widened by options', async () => {
        const response = await callGet('test-organism', { fileType: 'xlsx' });
        const workbook = await loadWorkbook(response);
        const dataSheet = workbook.getWorksheet(DATA_SHEET_NAME)!;

        // Every column is between the minimum and maximum width...
        for (let column = 1; column <= 5; column++) {
            const width = dataSheet.getColumn(column).width!;
            expect(width).toBeGreaterThanOrEqual(16);
            expect(width).toBeLessThanOrEqual(45);
        }
        // ...and short-named option fields stay at the minimum rather than widening to fit a long
        // option value (e.g. country -> "Germany"/"France" does not stretch column C).
        expect(dataSheet.getColumn(3).width).toBe(16);
    });

    test('Guidance sheet lists every field with description columns and allowed values', async () => {
        const response = await callGet('test-organism', { fileType: 'xlsx' });
        const workbook = await loadWorkbook(response);
        const guidanceSheet = workbook.getWorksheet(GUIDANCE_SHEET_NAME)!;

        expect((guidanceSheet.getRow(1).values as unknown[]).slice(1)).toEqual([
            'Field name',
            'Display name',
            'Required',
            'Definition',
            'Guidance',
            'Example',
            'Allowed values',
        ]);

        // country: optional, carries its definition + example, with allowed values
        const countryRow = guidanceSheet.getRow(4).values as unknown[];
        expect(countryRow.slice(1)).toEqual([
            'country',
            'Country',
            'No',
            'Country where the sample was collected',
            '',
            'Germany',
            'Germany, France',
        ]);

        // notes: no description, free text label only when no options
        const notesRow = guidanceSheet.getRow(6).values as unknown[];
        expect(notesRow.slice(1)).toEqual(['notes', 'Notes', 'No', '', '', '', 'free text']);
    });

    test('Data sheet freezes the header row and is not in filter mode', async () => {
        const response = await callGet('test-organism', { fileType: 'xlsx' });
        const workbook = await loadWorkbook(response);
        const dataSheet = workbook.getWorksheet(DATA_SHEET_NAME)!;

        expect(dataSheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
        // No auto-filter: its dropdown arrows clutter the header and confuse with the validation
        // dropdowns.
        expect(dataSheet.autoFilter).toBeFalsy();
    });

    test('headers are colour-coded by tier and carry hover notes', async () => {
        const response = await callGet('test-organism', { fileType: 'xlsx' });
        const workbook = await loadWorkbook(response);
        const header = workbook.getWorksheet(DATA_SHEET_NAME)!.getRow(1);

        // date (required) -> required tier; country (default template) -> default tier;
        // notes (opt-in) -> optional tier.
        const fillArgb = (column: number) => (header.getCell(column).fill as ExcelJS.FillPattern).fgColor?.argb;
        expect(fillArgb(2)).toBe('FFFCE4D6'); // date, required
        expect(fillArgb(3)).toBe('FFDDEBF7'); // country, default
        expect(fillArgb(5)).toBe('FFF2F2F2'); // notes, optional

        // The country header note surfaces its definition and example.
        const note = JSON.stringify(header.getCell(3).note);
        expect(note).toContain('Country where the sample was collected');
        expect(note).toContain('Example: Germany');
    });

    test('date columns are formatted as yyyy-mm-dd', async () => {
        const response = await callGet('test-organism', { fileType: 'xlsx' });
        const workbook = await loadWorkbook(response);
        const dataSheet = workbook.getWorksheet(DATA_SHEET_NAME)!;
        expect(dataSheet.getColumn(2).numFmt).toBe('yyyy-mm-dd'); // date is column B
    });

    test('Guidance sheet includes a colour legend', async () => {
        const response = await callGet('test-organism', { fileType: 'xlsx' });
        const workbook = await loadWorkbook(response);
        const guidanceSheet = workbook.getWorksheet(GUIDANCE_SHEET_NAME)!;

        const cellTexts: string[] = [];
        guidanceSheet.eachRow((row) => row.eachCell((cell) => cellTexts.push(cell.text)));
        expect(cellTexts).toContain('Colour key');
        expect(cellTexts).toContain('Required field');
        expect(cellTexts).toContain('Priority fields');
    });

    test('revision template filename includes "revision"', async () => {
        const response = await callGet('test-organism', { fileType: 'xlsx', format: 'revise' });
        expect(response.headers.get('Content-Disposition')).toBe(
            'attachment; filename="Test_Organism_metadata_revision_template.xlsx"',
        );
    });
});
