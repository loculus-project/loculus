import { describe, expect, test } from 'vitest';

import { extractAuthorLists, parseAuthors } from './AuthorNamesConfirmationDialog';

describe('parseAuthors', () => {
    test('splits authors into last and first names', () => {
        expect(parseAuthors('Smith, Anna; Perez,  Tom J.;Xu, X.L.;')).toEqual([
            { lastName: 'Smith', firstName: 'Anna' },
            { lastName: 'Perez', firstName: 'Tom J.' },
            { lastName: 'Xu', firstName: 'X.L.' },
        ]);
    });

    test('returns an empty first name when it is missing', () => {
        expect(parseAuthors('Xu,; Anna Smith')).toEqual([
            { lastName: 'Xu', firstName: '' },
            { lastName: 'Anna Smith', firstName: '' },
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
