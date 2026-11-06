import Papa from 'papaparse';

import type { ProcessedFile } from './FileUpload/fileProcessing';

/**
 * Preprocessing requires exactly one comma per author, separating a non-empty last name from the first name(s).
 * `Xu,` (first name unknown) is accepted, but `Anna Xu`, `Smith, Anna, Jr.` and `, Anna` are rejected.
 */
export type ParsedAuthor =
    | { status: 'ok'; firstName: string; lastName: string }
    | { status: 'missingComma' | 'tooManyCommas' | 'missingLastName'; raw: string };

export type AuthorListOccurrence = {
    authors: string;
    numberOfEntries: number;
};

/**
 * Splits an authors string in the Loculus format (`Last, First; Last, First`) into last and first names.
 * This approximates preprocessing, which is the source of truth: it only checks the commas and that a last name
 * is present, not the allowed characters, and does not reformat names.
 */
export const parseAuthors = (authors: string): ParsedAuthor[] =>
    authors
        .split(';')
        .map((author) => author.trim())
        .filter((author) => author !== '')
        .map((author): ParsedAuthor => {
            const parts = author.split(',');
            if (parts.length === 1) return { status: 'missingComma', raw: author };
            if (parts.length > 2) return { status: 'tooManyCommas', raw: author };
            const [lastName, firstName] = parts;
            if (lastName.trim() === '') return { status: 'missingLastName', raw: author };
            return {
                status: 'ok',
                firstName: firstName.trim().replace(/\s+/g, ' '),
                lastName: lastName.trim().replace(/\s+/g, ' '),
            };
        });

/**
 * Reads the distinct, non-empty author lists from the given columns of a metadata TSV,
 * together with the number of entries that use each list.
 */
export const extractAuthorLists = async (
    metadataFile: ProcessedFile,
    authorsFields: string[],
): Promise<AuthorListOccurrence[]> => {
    if (authorsFields.length === 0) return [];

    const text = await metadataFile.text();

    const parsed = Papa.parse<string[]>(text, { delimiter: '\t', skipEmptyLines: true });
    if (parsed.data.length === 0) return [];

    const [header, ...rows] = parsed.data;
    const authorColumnIndices = header
        .map((column, index) => (authorsFields.includes(column.trim()) ? index : -1))
        .filter((index) => index !== -1);

    const occurrences = new Map<string, number>();
    for (const row of rows) {
        for (const index of authorColumnIndices) {
            const authors = row[index]?.trim() ?? '';
            if (authors === '') continue;
            occurrences.set(authors, (occurrences.get(authors) ?? 0) + 1);
        }
    }

    return Array.from(occurrences, ([authors, numberOfEntries]) => ({ authors, numberOfEntries }));
};
