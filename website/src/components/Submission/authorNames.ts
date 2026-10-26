import Papa from 'papaparse';

import { CompressedFile, RawFile, splitFileExtensions } from './FileUpload/fileProcessing';

/**
 * Preprocessing requires exactly one comma per author: it separates the last name from the first name(s).
 * `Xu,` (first name unknown) is accepted, but `Anna Xu` and `Smith, Anna, Jr.` are rejected.
 */
export type ParsedAuthor =
    { status: 'ok'; firstName: string; lastName: string } | { status: 'missingComma' | 'tooManyCommas'; raw: string };

export type AuthorListOccurrence = {
    authors: string;
    numberOfEntries: number;
};

/**
 * Splits an authors string in the Loculus format (`Last, First; Last, First`) into last and first names,
 * mirroring how preprocessing interprets it.
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
    metadataFile: File,
    authorsFields: string[],
): Promise<AuthorListOccurrence[]> => {
    if (authorsFields.length === 0) return [];

    const processedFile =
        splitFileExtensions(metadataFile).compressionExtension !== null
            ? new CompressedFile(metadataFile)
            : new RawFile(metadataFile);

    let text: string;
    try {
        text = await processedFile.text();
    } catch {
        return [];
    }

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
