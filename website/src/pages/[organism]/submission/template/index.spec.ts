import * as XLSX from '@lokalise/xlsx';
import type { APIContext } from 'astro';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, test, vi } from 'vitest';

import { GET } from './index';
import { METADATA_FILE_KIND } from '../../../../components/Submission/FileUpload/fileProcessing';
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
        if (rawOrganism === 'dash-organism') {
            return { organism: { key: 'dash-organism', displayName: 'Test – Organism' } };
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

    // Known bug: real Node rejects non-Latin-1 header values, so the download fails for such display names.
    test.fails('a display name outside Latin-1 is made safe in the download filename', async () => {
        const response = await callGet('dash-organism', { fileType: 'tsv' });
        expect(response.headers.get('Content-Disposition')).toMatch(/^[\x20-\x7e]*$/);
    });

    test('revision template filename includes "revision"', async () => {
        const response = await callGet('test-organism', { fileType: 'xlsx', format: 'revise' });
        expect(response.headers.get('Content-Disposition')).toBe(
            'attachment; filename="Test_Organism_metadata_revision_template.xlsx"',
        );
    });

    test('a filled-in template is parsed by the upload pipeline back to the entered values', async () => {
        const response = await callGet('test-organism', { fileType: 'xlsx' });
        const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' });
        // Fill the Data sheet like a submitter in Excel: a typed date is stored as a numeric date serial.
        XLSX.utils.sheet_add_aoa(
            workbook.Sheets[DATA_SHEET_NAME],
            [['sample1', new Date(2021, 0, 15), 'France', 'Homo sapiens', 'some note']],
            { origin: 'A2', dateNF: 'yyyy-mm-dd' },
        );
        const filled = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

        const result = await METADATA_FILE_KIND.processRawFile(new File([filled], 'metadata.xlsx'));
        const processedFile = result._unsafeUnwrap();

        expect(processedFile.warnings()).toEqual([]);
        expect(await processedFile.text()).toBe(
            'submissionId\tdate\tcountry\thost\tnotes\nsample1\t2021-01-15\tFrance\tHomo sapiens\tsome note',
        );
    });

    test('raw XML: _lists is hidden and locked, Guidance is read-only, Data stays editable', async () => {
        const response = await callGet('test-organism', { fileType: 'xlsx' });
        const zip = await JSZip.loadAsync(await response.arrayBuffer());

        const sheets = await readSheetEntries(zip);
        expect(sheets.map(({ name, state }) => [name, state])).toEqual([
            [DATA_SHEET_NAME, 'visible'],
            [LISTS_SHEET_NAME, 'hidden'],
            [GUIDANCE_SHEET_NAME, 'visible'],
        ]);
        const sheetXml = (name: string) => zip.file(sheets.find((sheet) => sheet.name === name)!.path)!.async('string');

        const dataXml = await sheetXml(DATA_SHEET_NAME);
        expect(dataXml).not.toContain('<sheetProtection');
        expect(tagAttributes(dataXml, 'pane')).toMatchObject({ ySplit: '1', state: 'frozen' });

        // In OOXML a select* attribute of "1" means selecting those cells is NOT allowed.
        expect(tagAttributes(await sheetXml(LISTS_SHEET_NAME), 'sheetProtection')).toEqual({
            sheet: '1',
            selectLockedCells: '1',
            selectUnlockedCells: '1',
        });
        expect(tagAttributes(await sheetXml(GUIDANCE_SHEET_NAME), 'sheetProtection')).toEqual({ sheet: '1' });
    });

    test('XLSX template XML matches the committed snapshot', async () => {
        const response = await callGet('test-organism', { fileType: 'xlsx' });
        const zip = await JSZip.loadAsync(await response.arrayBuffer());

        const partNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
        for (const partName of partNames.filter((name) => !LIBRARY_BOILERPLATE_PARTS.has(name))) {
            const xml = await zip.file(partName)!.async('string');
            await expect(normaliseXlsxPart(partName, xml)).toMatchFileSnapshot(
                `__snapshots__/xlsx-template/${partName}`,
            );
        }
        await expect(partNames.sort().join('\n') + '\n').toMatchFileSnapshot('__snapshots__/xlsx-template/parts.txt');
    });
});

/** Parts ExcelJS writes the same regardless of our input; still listed in parts.txt, not snapshotted. */
type FilledTemplateEdit = (workbook: XLSX.WorkBook, fill: (rows: unknown[][], origin?: string) => void) => void;
type UploadOutcome = { error?: string; text?: string; warnings: string[] };

const filledRow = ['sample1', new Date(2021, 0, 15), 'France', 'Homo sapiens', 'some note'];
const enteredValues = 'submissionId\tdate\tcountry\thost\tnotes\nsample1\t2021-01-15\tFrance\tHomo sapiens\tsome note';
const setCell = (workbook: XLSX.WorkBook, address: string, cell: XLSX.CellObject) => {
    workbook.Sheets[DATA_SHEET_NAME][address] = cell;
};

async function uploadFilledTemplate(edit: FilledTemplateEdit): Promise<UploadOutcome> {
    const response = await callGet('test-organism', { fileType: 'xlsx' });
    const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' });
    edit(workbook, (rows, origin = 'A2') =>
        XLSX.utils.sheet_add_aoa(workbook.Sheets[DATA_SHEET_NAME], rows, { origin, dateNF: 'yyyy-mm-dd' }),
    );
    const filled = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const result = await METADATA_FILE_KIND.processRawFile(new File([filled], 'metadata.xlsx'));
    return result.isErr()
        ? { error: result.error.message, warnings: [] }
        : { text: await result.value.text(), warnings: result.value.warnings() };
}

describe('upload of a filled-in template', () => {
    test.each([
        { mistake: 'no mistake', edit: ((_, fill) => fill([filledRow])) satisfies FilledTemplateEdit },
        {
            mistake: 'Data sheet renamed, still first',
            edit: ((workbook, fill) => {
                fill([filledRow]);
                workbook.Sheets.Samples = workbook.Sheets[DATA_SHEET_NAME];
                workbook.SheetNames[0] = 'Samples';
            }) satisfies FilledTemplateEdit,
        },
    ])('is parsed to the entered values: $mistake', async ({ edit }) => {
        expect(await uploadFilledTemplate(edit)).toEqual({ text: enteredValues, warnings: [] });
    });

    // Known bugs: each test asserts the intended behaviour and is expected to fail until the bug is fixed.
    test.fails.each<{ mistake: string; edit: FilledTemplateEdit; intended: (outcome: UploadOutcome) => void }>([
        {
            mistake: 'Data sheet deleted is rejected instead of reading the hidden _lists sheet',
            edit: (workbook) => {
                workbook.SheetNames = workbook.SheetNames.filter((name) => name !== DATA_SHEET_NAME);
            },
            intended: ({ error }) => expect(error).toMatch(/Data/),
        },
        {
            mistake: 'deleted header row with one data row is reported as a missing header',
            edit: (_, fill) => fill([filledRow], 'A1'),
            intended: ({ error }) => expect(error).toMatch(/header/i),
        },
        {
            mistake: 'deleted header row with several data rows is rejected',
            edit: (_, fill) => fill([filledRow, ['sample2', new Date(2021, 0, 16), 'Germany', 'Sus scrofa', '']], 'A1'),
            intended: ({ error }) => expect(error).toBeDefined(),
        },
        {
            mistake: 'duplicate header is rejected',
            edit: (workbook, fill) => {
                fill([filledRow]);
                setCell(workbook, 'B1', { t: 's', v: 'submissionId' });
            },
            intended: ({ error }) => expect(error).toBeDefined(),
        },
        {
            mistake: 'value right of the table does not become an __EMPTY column',
            edit: (_, fill) => fill([[...filledRow, 'call Anna']]),
            intended: ({ text }) => expect(text).not.toContain('__EMPTY'),
        },
        {
            mistake: '12-digit numeric id keeps all digits',
            edit: (_, fill) => fill([[123456789012, ...filledRow.slice(1)]]),
            intended: ({ text }) => expect(text).toContain('123456789012'),
        },
        {
            mistake: 'year typed into the date column stays the year',
            edit: (workbook, fill) => {
                fill([filledRow]);
                setCell(workbook, 'B2', { t: 'n', v: 2020, z: 'yyyy-mm-dd' });
            },
            intended: ({ text }) => expect(text).toContain('\t2020\t'),
        },
        {
            mistake: 'formula error in a cell is flagged',
            edit: (workbook, fill) => {
                fill([filledRow]);
                setCell(workbook, 'E2', { t: 'e', v: 0x2a, w: '#N/A' });
            },
            intended: ({ error, warnings }) => expect(error !== undefined || warnings.length > 0).toBe(true),
        },
    ])('$mistake', async ({ edit, intended }) => {
        intended(await uploadFilledTemplate(edit));
    });
});

const LIBRARY_BOILERPLATE_PARTS = new Set(['xl/theme/theme1.xml', 'docProps/app.xml']);

/** Drops the creation timestamps and puts one tag per line so snapshot diffs are readable. */
function normaliseXlsxPart(partName: string, xml: string): string {
    const stable =
        partName === 'docProps/core.xml'
            ? xml.replace(/(<dcterms:(created|modified)[^>]*>)[^<]*/g, '$1TIMESTAMP')
            : xml;
    return stable.replaceAll('><', '>\n<') + '\n';
}

async function readSheetEntries(zip: JSZip): Promise<{ name: string; state: string; path: string }[]> {
    const workbookXml = await zip.file('xl/workbook.xml')!.async('string');
    const relsXml = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
    const targets = new Map(
        [...relsXml.matchAll(/<Relationship\b[^>]*>/g)].map(([tag]) => {
            const attributes = parseAttributes(tag);
            return [attributes.Id, `xl/${attributes.Target.replace(/^\/?xl\//, '')}`];
        }),
    );
    return [...workbookXml.matchAll(/<sheet\b[^>]*>/g)].map(([tag]) => {
        const attributes = parseAttributes(tag);
        return {
            name: attributes.name,
            state: 'state' in attributes ? attributes.state : 'visible',
            path: targets.get(attributes['r:id'])!,
        };
    });
}

/** Attributes of the single `<tagName …>` element in `xml`; fails if there is not exactly one. */
function tagAttributes(xml: string, tagName: string): Record<string, string> {
    const tags = [...xml.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'g'))];
    expect(tags, `expected exactly one <${tagName}>`).toHaveLength(1);
    return parseAttributes(tags[0][0]);
}

function parseAttributes(tag: string): Record<string, string> {
    return Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
}
