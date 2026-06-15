/**
 * Sheet names used by the downloadable XLSX metadata template
 * (`pages/[organism]/submission/template/index.ts`).
 *
 * Kept in this dependency-free module so that both the server-side generator and the client-side
 * upload parser (`components/Submission/FileUpload/fileProcessing.ts`) can import them, without the
 * client bundle pulling in the generator's server-only dependencies (ExcelJS).
 */
export const DATA_SHEET_NAME = 'Data';
export const GUIDANCE_SHEET_NAME = 'Guidance';
export const LISTS_SHEET_NAME = '_lists';

/** Reference/lookup sheets that the upload parser should ignore (everything except `Data`). */
export const TEMPLATE_REFERENCE_SHEET_NAMES = new Set<string>([GUIDANCE_SHEET_NAME, LISTS_SHEET_NAME]);
