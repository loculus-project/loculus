import * as XLSX from '@lokalise/xlsx';
import type { APIRoute } from 'astro';

import { cleanOrganism } from '../../../../components/Navigation/cleanOrganism';
import type { UploadAction } from '../../../../components/Submission/DataUploadForm.tsx';
import { getMetadataTemplateFields } from '../../../../config';

export type TemplateFileType = 'tsv' | 'xlsx';
const VALID_FILE_TYPES = ['tsv', 'xlsx'];
const CONTENT_TYPES = new Map<TemplateFileType, string>([
    ['tsv', 'text/tab-separated-values'],
    ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
]);

/** The TSV template file that users can download from the submission page. */
export const GET: APIRoute = ({ params, request }) => {
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

    const columnNames = Array.from(getMetadataTemplateFields(organism.key, action).keys());

    const fileBuffer = createTemplateFile(fileType, columnNames);

    return new Response(fileBuffer, {
        headers,
    });
};

function createTemplateFile(fileType: TemplateFileType, columnNames: string[]): ArrayBuffer {
    if (fileType === 'tsv') {
        const content = columnNames.join('\t') + '\n';
        return new TextEncoder().encode(content).buffer;
    }

    const worksheetData = [columnNames]; // Add headers as the first row
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');

    const buffer = XLSX.write(workbook, { type: 'array', bookType: fileType });
    return new Uint8Array(buffer as number[]).buffer;
}
