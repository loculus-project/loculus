import type { APIRoute } from 'astro';
import ExcelJS from 'exceljs';

import { cleanOrganism } from '../../../../components/Navigation/cleanOrganism';
import type { UploadAction } from '../../../../components/Submission/DataUploadForm.tsx';
import { getMetadataTemplateFields, getOrderedTemplateInputFields, type TemplateInputField } from '../../../../config';

export type TemplateFileType = 'tsv' | 'xlsx';
const VALID_FILE_TYPES = ['tsv', 'xlsx'];
const CONTENT_TYPES = new Map<TemplateFileType, string>([
    ['tsv', 'text/tab-separated-values'],
    ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
]);

/**
 * Sheet names of the XLSX template. `Data` MUST be added to the workbook first, because the upload
 * parser only reads the first sheet. `Config` and `_lists` are recognised as reference sheets by
 * the upload parser, which therefore does not warn about them (see `fileProcessing.ts`).
 */
export const DATA_SHEET_NAME = 'Data';
export const CONFIG_SHEET_NAME = 'Config';
export const LISTS_SHEET_NAME = '_lists';

/**
 * The dropdown validation is applied to data rows 2..MAX_DATA_ROWS. We deliberately do not use
 * Excel's full column height (1048576): the on-disk file is the same size either way, but a
 * full-column `sqref` forces any tool that re-parses the workbook to materialise ~1M cells per
 * column. 100k rows far exceeds a realistic single metadata file; rows beyond it simply lack the
 * dropdown (free text), which is graceful degradation, not data loss.
 */
const MAX_DATA_ROWS = 100000;

/** The TSV/XLSX template file that users can download from the submission page. */
export const GET: APIRoute = async ({ params, request }) => {
    const rawOrganism = params.organism!;
    const { organism } = cleanOrganism(rawOrganism);
    if (organism === undefined) {
        return new Response(undefined, {
            status: 404,
        });
    }

    const searchParams = new URL(request.url).searchParams;
    const action: UploadAction = searchParams.get('format') === 'revise' ? 'revise' : 'submit';
    const fileTypeStr = searchParams.get('fileType')?.toLowerCase() ?? '';
    const fileType: TemplateFileType = VALID_FILE_TYPES.includes(fileTypeStr)
        ? (fileTypeStr as TemplateFileType)
        : 'tsv';

    const filename = `${organism.displayName.replaceAll(' ', '_')}_metadata_${action === 'revise' ? 'revision_' : ''}template.${fileType}`;

    /* eslint-disable @typescript-eslint/naming-convention */
    const headers: Record<string, string> = {
        'Content-Type': CONTENT_TYPES.get(fileType)!,
        'Content-Disposition': `attachment; filename="${filename}"`,
    };
    /* eslint-enable @typescript-eslint/naming-convention */

    const fileBuffer =
        fileType === 'tsv' ? createTsvTemplate(organism.key, action) : await createXlsxTemplate(organism.key, action);

    return new Response(fileBuffer, {
        headers,
    });
};

function createTsvTemplate(organism: string, action: UploadAction): ArrayBuffer {
    const columnNames = Array.from(getMetadataTemplateFields(organism, action).keys());
    const content = columnNames.join('\t') + '\n';
    return new TextEncoder().encode(content).buffer;
}

/**
 * Builds a workbook with three sheets:
 *  - `Data`: the sheet submitters fill in. Columns are the machine field names (so the file
 *    round-trips through upload), ordered template fields first, then the remaining opt-in fields.
 *  - `_lists` (hidden): one column per field that has a controlled vocabulary; the column header is
 *    the field name and the values below are its allowed options. This is the lookup source.
 *  - `Config` (read-only): a human-readable reference of every available field.
 *
 * Each `Data` cell carries a single, header-driven dropdown validation: the formula reads the cell's
 * own column header and looks it up in `_lists`, so the dropdown follows a column even if the user
 * reorders or renames it. Columns whose header is not in `_lists` (free-text fields) are left
 * unconstrained because the lookup yields an error, which Excel treats permissively.
 */
async function createXlsxTemplate(organism: string, action: UploadAction): Promise<ArrayBuffer> {
    const fields = getOrderedTemplateInputFields(organism, action);
    const workbook = new ExcelJS.Workbook();

    // --- Data sheet (must be added first) ---
    const dataSheet = workbook.addWorksheet(DATA_SHEET_NAME);
    dataSheet.addRow(fields.map((field) => field.name));
    dataSheet.getRow(1).font = { bold: true };

    const optionFields = fields.filter((field) => (field.options?.length ?? 0) > 0);

    if (optionFields.length > 0) {
        addOptionsLookup(workbook, dataSheet, fields, optionFields);
    }

    addConfigSheet(workbook, fields);

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
}

/**
 * Adds the hidden `_lists` lookup sheet and the whole-grid, header-driven dropdown validation on the
 * Data sheet.
 */
function addOptionsLookup(
    workbook: ExcelJS.Workbook,
    dataSheet: ExcelJS.Worksheet,
    fields: TemplateInputField[],
    optionFields: TemplateInputField[],
): void {
    const listsSheet = workbook.addWorksheet(LISTS_SHEET_NAME, { state: 'hidden' });
    optionFields.forEach((field, columnIndex) => {
        listsSheet.getCell(1, columnIndex + 1).value = field.name;
        field.options!.forEach((option, optionIndex) => {
            listsSheet.getCell(optionIndex + 2, columnIndex + 1).value = option.name;
        });
    });
    void listsSheet.protect('', { selectLockedCells: false, selectUnlockedCells: false });

    // The relative `A$1` resolves to each column's own header cell, so a single rule covers the whole
    // grid: look the header up in the `_lists` header row and return that field's column of options.
    const sheet = `'${LISTS_SHEET_NAME}'`;
    const matchColumn = `MATCH(A$1,${sheet}!$1:$1,0)-1`;
    const formula =
        `OFFSET(${sheet}!$A$1,1,${matchColumn},` +
        `COUNTA(OFFSET(${sheet}!$A$1,1,${matchColumn},${MAX_DATA_ROWS},1)),1)`;
    const range = `A2:${columnLetter(fields.length)}${MAX_DATA_ROWS}`;
    // `dataValidations.add` exists at runtime but is missing from ExcelJS' type definitions. Using it
    // (rather than per-cell `cell.dataValidation`) writes one compact range rule instead of
    // materialising a validation object for every cell in the grid.
    const dataValidations = (dataSheet as unknown as { dataValidations: WorksheetDataValidations }).dataValidations;
    dataValidations.add(range, {
        type: 'list',
        allowBlank: true,
        formulae: [formula],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Invalid value',
        error: 'Please choose a value from the dropdown list for this field.',
    });
}

interface WorksheetDataValidations {
    add(sqref: string, validation: ExcelJS.DataValidation): void;
}

/** Adds the read-only `Config` reference sheet listing every available field. */
function addConfigSheet(workbook: ExcelJS.Workbook, fields: TemplateInputField[]): void {
    const configSheet = workbook.addWorksheet(CONFIG_SHEET_NAME);
    configSheet.addRow(['Field name', 'Display name', 'Enabled by default', 'Required', 'Allowed values']);
    configSheet.getRow(1).font = { bold: true };
    fields.forEach((field) => {
        configSheet.addRow([
            field.name,
            field.displayName ?? '',
            field.isTemplateField ? 'Yes' : 'No',
            field.required === true ? 'Yes' : 'No',
            (field.options ?? []).map((option) => option.name).join(', ') || 'free text',
        ]);
    });
    void configSheet.protect('', { selectLockedCells: true, selectUnlockedCells: true });
}

/** Converts a 1-based column index to its Excel column letters (1 -> A, 27 -> AA). */
function columnLetter(columnIndex: number): string {
    let letters = '';
    let remaining = columnIndex;
    while (remaining > 0) {
        const modulo = (remaining - 1) % 26;
        letters = String.fromCharCode(65 + modulo) + letters;
        remaining = Math.floor((remaining - modulo - 1) / 26);
    }
    return letters;
}
