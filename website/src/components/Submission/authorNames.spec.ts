import { describe, expect, test } from 'vitest';

import { RawFile } from './FileUpload/fileProcessing';
import { extractAuthorLists, parseAuthors } from './authorNames';

describe('parseAuthors', () => {
    test('splits authors into first and last names and flags malformed authors', () => {
        expect(
            parseAuthors('Smith, Anna; Perez,  Tom J.; Xu,; Anna Smith; Garcia, Maria, Okafor, Chinedu; , Anna;'),
        ).toEqual([
            { status: 'ok', firstName: 'Anna', lastName: 'Smith' },
            { status: 'ok', firstName: 'Tom J.', lastName: 'Perez' },
            { status: 'ok', firstName: '', lastName: 'Xu' },
            { status: 'missingComma', raw: 'Anna Smith' },
            { status: 'tooManyCommas', raw: 'Garcia, Maria, Okafor, Chinedu' },
            { status: 'missingLastName', raw: ', Anna' },
        ]);
    });
});

describe('extractAuthorLists', () => {
    test('returns the distinct author lists of the given columns with their number of entries', async () => {
        const file = new File(
            [
                'id\tauthors\tother\n' +
                    'a\tSmith, Anna; Perez, Tom\tx\n' +
                    'b\tSmith, Anna; Perez, Tom\ty\n' +
                    'c\t\tz\n' +
                    'd\tXu, X.\tw\n',
            ],
            'metadata.tsv',
        );

        expect(await extractAuthorLists(new RawFile(file), ['authors'])).toEqual([
            { authors: 'Smith, Anna; Perez, Tom', numberOfEntries: 2 },
            { authors: 'Xu, X.', numberOfEntries: 1 },
        ]);
    });
});
