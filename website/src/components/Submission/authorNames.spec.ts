import { describe, expect, test } from 'vitest';

import { extractAuthorLists, parseAuthors } from './authorNames';

describe('parseAuthors', () => {
    test('splits authors into first and last names and flags missing commas', () => {
        expect(parseAuthors('Smith, Anna; Perez,  Tom J.; Xu,; Anna Smith;')).toEqual([
            { firstName: 'Anna', lastName: 'Smith', hasComma: true },
            { firstName: 'Tom J.', lastName: 'Perez', hasComma: true },
            { firstName: '', lastName: 'Xu', hasComma: true },
            { firstName: '', lastName: 'Anna Smith', hasComma: false },
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
});
