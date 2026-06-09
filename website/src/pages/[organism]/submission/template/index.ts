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
 *    the field name and the values below are its allowed options. This is the dropdown source.
 *  - `Config` (read-only): a human-readable reference of every available field.
 *
 * Only columns whose field has a controlled vocabulary get a dropdown validation, each pointing
 * directly at that field's column in `_lists`. Free-text columns deliberately get no validation so
 * they accept any value — a `list` validation cannot express "allow anything", so a single grid-wide
 * rule would reject free text. Excel relocates a validation with its column when the user inserts or
 * moves columns, so the dropdowns stay attached to the right field.
 */
async function createXlsxTemplate(organism: string, action: UploadAction): Promise<ArrayBuffer> {
    const fields = getOrderedTemplateInputFields(organism, action);
    const workbook = new ExcelJS.Workbook();

    // --- Data sheet (must be added first) ---
    const dataSheet = workbook.addWorksheet(DATA_SHEET_NAME);
    dataSheet.addRow(fields.map((field) => field.name));
    dataSheet.getRow(1).font = { bold: true };
    fields.forEach((field, index) => {
        dataSheet.getColumn(index + 1).width = columnWidthFor(field);
    });

    const optionFields = fields.filter((field) => (field.options?.length ?? 0) > 0);

    if (optionFields.length > 0) {
        addOptionsLookup(workbook, dataSheet, fields, optionFields);
    }

    addConfigSheet(workbook, fields);

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
}

/**
 * Adds the hidden `_lists` lookup sheet and a dropdown validation for each field that has options,
 * pointing at that field's column of allowed values in `_lists`.
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

    // `dataValidations.add` exists at runtime but is missing from ExcelJS' type definitions. Using it
    // (rather than per-cell `cell.dataValidation`) writes one compact range rule per option field
    // instead of materialising a validation object for every cell.
    const dataValidations = (dataSheet as unknown as { dataValidations: WorksheetDataValidations }).dataValidations;
    optionFields.forEach((field, listsIndex) => {
        const dataColumn = columnLetter(fields.indexOf(field) + 1);
        const listsColumn = columnLetter(listsIndex + 1);
        const lastOptionRow = field.options!.length + 1; // row 1 is the header
        const source = `'${LISTS_SHEET_NAME}'!$${listsColumn}$2:$${listsColumn}$${lastOptionRow}`;
        dataValidations.add(`${dataColumn}2:${dataColumn}${MAX_DATA_ROWS}`, {
            type: 'list',
            allowBlank: true,
            formulae: [source],
            // Advisory, not strict: the dropdown offers the controlled vocabulary, but a value typed
            // outside the list only warns ("Yes" keeps it) rather than being rejected.
            showErrorMessage: true,
            errorStyle: 'warning',
            errorTitle: 'Value not in the suggested list',
            error: `"${field.name}" has a suggested list of values. You can pick one from the dropdown, or keep what you typed.`,
        });
    });
}

/** A roomy-but-bounded Data column width that fits the field name and its longest dropdown option. */
function columnWidthFor(field: TemplateInputField): number {
    const longestOption = (field.options ?? []).reduce((max, option) => Math.max(max, option.name.length), 0);
    return Math.min(45, Math.max(16, field.name.length + 2, longestOption + 2));
}

interface WorksheetDataValidations {
    add(sqref: string, validation: ExcelJS.DataValidation): void;
}

/** Adds the read-only `Config` reference sheet listing every available field. */
function addConfigSheet(workbook: ExcelJS.Workbook, fields: TemplateInputField[]): void {
    const configSheet = workbook.addWorksheet(CONFIG_SHEET_NAME);
    configSheet.addRow(['Field name', 'Display name', 'Enabled by default', 'Required', 'Allowed values']);
    configSheet.getRow(1).font = { bold: true };
    [28, 28, 18, 12, 60].forEach((width, index) => {
        configSheet.getColumn(index + 1).width = width;
    });
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
