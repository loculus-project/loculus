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
 * Sheet names of the XLSX template. The upload parser selects the `Data` sheet by name (see
 * `fileProcessing.ts`); `Guidance` and `_lists` are recognised as reference sheets and ignored on
 * upload.
 */
export const DATA_SHEET_NAME = 'Data';
export const GUIDANCE_SHEET_NAME = 'Guidance';
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
 *  - `Guidance` (read-only): a human-readable reference of every available field.
 *
 * Only columns whose field has a controlled vocabulary get a dropdown validation. Each such
 * validation is header-driven: its source formula reads that column's own header cell and looks it
 * up in `_lists`, so the dropdown follows the field even if the user renames or reorders the column.
 * Free-text columns deliberately get no validation so they accept any value — a `list` validation
 * cannot express "allow anything", so applying a (strict) header-driven rule to them would reject
 * every entry (the lookup errors). Limiting it to option columns keeps free-text columns unrestricted.
 */
async function createXlsxTemplate(organism: string, action: UploadAction): Promise<ArrayBuffer> {
    const fields = getOrderedTemplateInputFields(organism, action);
    const workbook = new ExcelJS.Workbook();

    // --- Data sheet ---
    const dataSheet = workbook.addWorksheet(DATA_SHEET_NAME);
    dataSheet.addRow(fields.map((field) => field.name));
    dataSheet.views = [{ state: 'frozen', ySplit: 1 }]; // keep the header row visible while scrolling

    const headerRow = dataSheet.getRow(1);
    fields.forEach((field, index) => {
        dataSheet.getColumn(index + 1).width = columnWidthFor(field);
        if (field.metadataType === 'date') {
            dataSheet.getColumn(index + 1).numFmt = 'yyyy-mm-dd';
        }
        const headerCell = headerRow.getCell(index + 1);
        headerCell.font = { bold: true };
        headerCell.fill = tierFill(field); // colour-code required / default / opt-in
        headerCell.note = headerNoteFor(field); // hover help: definition, example, guidance
    });

    const optionFields = fields.filter((field) => (field.options?.length ?? 0) > 0);

    if (optionFields.length > 0) {
        addOptionsLookup(workbook, dataSheet, fields, optionFields);
    }

    addGuidanceSheet(workbook, fields);

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
}

/**
 * Adds the hidden `_lists` lookup sheet and a header-driven dropdown validation for each field that
 * has options. The validation reads its column's own header and resolves that field's option list in
 * `_lists`, so the dropdown follows the field when the column is renamed or moved.
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
    // Empty-string password: protection is cosmetic (guard against accidental edits), not a security boundary.
    void listsSheet.protect('', { selectLockedCells: false, selectUnlockedCells: false });

    // `dataValidations.add` exists at runtime but is missing from ExcelJS' type definitions. Using it
    // (rather than per-cell `cell.dataValidation`) writes one compact range rule per option field
    // instead of materialising a validation object for every cell.
    const dataValidations = (dataSheet as unknown as { dataValidations: WorksheetDataValidations }).dataValidations;
    const sheet = `'${LISTS_SHEET_NAME}'`;
    optionFields.forEach((field) => {
        const dataColumn = columnLetter(fields.indexOf(field) + 1);
        // Reference to this column's own header cell. It is column-relative to the validation range,
        // so Excel keeps it pointing at the header even after the column is moved.
        const headerCell = `${dataColumn}$1`;
        // Find the field's column in `_lists` by matching the header text, then return its options.
        const matchOffset = `MATCH(${headerCell},${sheet}!$1:$1,0)-1`;
        const source =
            `OFFSET(${sheet}!$A$1,1,${matchOffset},` +
            `COUNTA(OFFSET(${sheet}!$A$1,1,${matchOffset},${MAX_DATA_ROWS},1)),1)`;
        dataValidations.add(`${dataColumn}2:${dataColumn}${MAX_DATA_ROWS}`, {
            type: 'list',
            allowBlank: true,
            formulae: [source],
            // Strict: a value outside the controlled vocabulary is rejected. Only columns with a
            // controlled vocabulary get a validation, so free-text columns are unaffected.
            showErrorMessage: true,
            errorStyle: 'stop',
            errorTitle: 'Invalid value',
            error: `"${field.name}" must be one of the values in the dropdown list.`,
        });
    });
}

/** A roomy-but-bounded Data column width that fits the field name (not its dropdown options). */
function columnWidthFor(field: TemplateInputField): number {
    return Math.min(45, Math.max(16, field.name.length + 2));
}

interface WorksheetDataValidations {
    add(sqref: string, validation: ExcelJS.DataValidation): void;
}

/** Visual tiers used to colour-code field headers (and explained by the legend on `Config`). */
type FieldTier = 'required' | 'default' | 'optional';
const FIELD_TIERS: Record<FieldTier, { argb: string; label: string }> = {
    required: { argb: 'FFFCE4D6', label: 'Required field' },
    default: { argb: 'FFDDEBF7', label: 'Priority fields' },
    optional: { argb: 'FFF2F2F2', label: 'Optional — opt in by filling the column' },
};

function fieldTier(field: TemplateInputField): FieldTier {
    if (field.required === true) return 'required';
    return field.isTemplateField ? 'default' : 'optional';
}

function solidFill(argb: string): ExcelJS.Fill {
    return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function tierFill(field: TemplateInputField): ExcelJS.Fill {
    return solidFill(FIELD_TIERS[fieldTier(field)].argb);
}

/** Hover help for a Data header: display name, definition, guidance, an example, and the field tier. */
function headerNoteFor(field: TemplateInputField): string {
    const lines: string[] = [];
    if (field.displayName !== undefined && field.displayName !== field.name) lines.push(field.displayName);
    if (field.definition !== undefined) lines.push(field.definition);
    if (field.guidance !== undefined) lines.push(field.guidance);
    if (field.example !== undefined && field.example !== '') lines.push(`Example: ${field.example}`);
    lines.push(FIELD_TIERS[fieldTier(field)].label);
    return lines.join('\n');
}

/** Adds the read-only `Guidance` reference sheet listing every available field, plus a colour legend. */
function addGuidanceSheet(workbook: ExcelJS.Workbook, fields: TemplateInputField[]): void {
    const guidanceSheet = workbook.addWorksheet(GUIDANCE_SHEET_NAME);
    guidanceSheet.views = [{ state: 'frozen', ySplit: 1 }];
    const headerRow = guidanceSheet.addRow([
        'Field name',
        'Display name',
        'Required',
        'Definition',
        'Guidance',
        'Example',
        'Allowed values',
    ]);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
        cell.fill = solidFill('FFD9D9D9');
    });
    [28, 24, 10, 55, 55, 22, 55].forEach((width, index) => {
        const column = guidanceSheet.getColumn(index + 1);
        column.width = width;
        // Wrap the long free-text columns (definition, guidance, allowed values) so they stay readable.
        if (index === 3 || index === 4 || index === 6) {
            column.alignment = { wrapText: true, vertical: 'top' };
        }
    });
    fields.forEach((field) => {
        const row = guidanceSheet.addRow([
            field.name,
            field.displayName ?? '',
            field.required === true ? 'Yes' : 'No',
            field.definition ?? '',
            field.guidance ?? '',
            field.example !== undefined ? String(field.example) : '',
            (field.options ?? []).map((option) => option.name).join(', ') || 'free text',
        ]);
        row.getCell(1).fill = tierFill(field); // mirror the Data header colour
    });

    // Colour legend.
    guidanceSheet.addRow([]);
    guidanceSheet.addRow(['Colour key']).getCell(1).font = { bold: true };
    (Object.keys(FIELD_TIERS) as FieldTier[]).forEach((tier) => {
        const row = guidanceSheet.addRow(['', FIELD_TIERS[tier].label]);
        row.getCell(1).fill = solidFill(FIELD_TIERS[tier].argb);
    });

    void guidanceSheet.protect('', { selectLockedCells: true, selectUnlockedCells: true });
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
