import { describe, expect, test } from 'vitest';

import { extractAuthorLists, parseAuthors } from './authorNames';

describe('parseAuthors', () => {
    test('splits authors into last and first names', () => {
        expect(parseAuthors('Smith, Anna; Perez,  Tom J.;Xu, X.L.;')).toEqual([
            { firstName: 'Anna', lastName: 'Smith', hasComma: true },
            { firstName: 'Tom J.', lastName: 'Perez', hasComma: true },
            { firstName: 'X.L.', lastName: 'Xu', hasComma: true },
        ]);
    });

    test('returns an empty first name when it is missing', () => {
        expect(parseAuthors('Xu,')).toEqual([{ firstName: '', lastName: 'Xu', hasComma: true }]);
    });

    test('flags authors without a comma, keeping the whole entry as the last name', () => {
        expect(parseAuthors('Anna Smith; Xu, X.')).toEqual([
            { firstName: '', lastName: 'Anna Smith', hasComma: false },
            { firstName: 'X.', lastName: 'Xu', hasComma: true },
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

        expect(await extractAuthorLists(file, ['authors'])).toEqual([
            { authors: 'Smith, Anna; Perez, Tom', numberOfEntries: 2 },
            { authors: 'Xu, X.', numberOfEntries: 1 },
        ]);
    });

    test('returns nothing when the metadata has no authors column', async () => {
        const file = new File(['id\tother\na\tx\n'], 'metadata.tsv');

        expect(await extractAuthorLists(file, ['authors'])).toEqual([]);
    });
});
