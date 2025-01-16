import { describe, it, expect } from 'vitest';

import { ColumnMapping } from './ColumnMapping';
import { RawFile } from './fileProcessing';

describe('ColumnMapping', () => {
    it('should create a mapping from columns', () => {
        const sourceColumns = ['date', 'location', 'Foo Bar'];
        const inputFields = [{ name: 'date' }, { name: 'location' }, { name: 'foo', displayName: 'Foo Bar' }];

        const mapping = ColumnMapping.fromColumns(sourceColumns, inputFields);
        const entries = mapping.entries();

        expect(entries).toEqual([
            ['date', 'date'],
            ['location', 'location'],
            ['Foo Bar', 'foo'],
        ]);
    });

    it('should create a mapping from columns with sensible column mapping', () => {
        const sourceColumns = ['state', 'geoLocAdmin2'];
        const inputFields = [
            { name: 'date' },
            { name: 'geoLocAdmin1', displayName: 'Collection subdivision level 1' },
            { name: 'geoLocAdmin2', displayName: 'Collection subdivision level 2' },
        ];

        const mapping = ColumnMapping.fromColumns(sourceColumns, inputFields);
        const entries = mapping.entries();

        expect(entries).toEqual([
            ['state', null],
            ['geoLocAdmin2', 'geoLocAdmin2'],
        ]);
    });

    it('should create a mapping from columns without duplicates', () => {
        const sourceColumns = ['date', 'Date'];
        const inputFields = [{ name: 'date', displayName: 'Date' }, { name: 'location' }, { name: 'foo' }];

        const mapping = ColumnMapping.fromColumns(sourceColumns, inputFields);
        const entries = mapping.entries();

        expect(entries).toEqual([
            ['date', 'date'],
            ['Date', null],
        ]);
    });

    it('should update a specific mapping', () => {
        const sourceColumns = ['loc'];
        const inputFields = [
            { name: 'location', displayName: 'Location' },
            { name: 'date', displayName: 'Date' },
        ];
        const mapping = ColumnMapping.fromColumns(sourceColumns, inputFields);

        const updatedMapping = mapping.updateWith('loc', 'date');

        const entries = updatedMapping.entries();
        expect(entries).toEqual([['loc', 'date']]);
    });

    it('should update a specific mapping and unset the previous mapping', () => {
        const sourceColumns = ['loc', 'date'];
        const inputFields = [
            { name: 'location', displayName: 'Location' },
            { name: 'date', displayName: 'Date' },
        ];
        const mapping = ColumnMapping.fromColumns(sourceColumns, inputFields);
        let entries = mapping.entries();
        expect(entries).toEqual([
            ['loc', null],
            ['date', 'date'],
        ]);

        const updatedMapping = mapping.updateWith('loc', 'date');

        entries = updatedMapping.entries();
        expect(entries).toEqual([
            ['loc', 'date'],
            ['date', null],
        ]);
    });

    it('should apply a mapping correctly', async () => {
        const sourceColumns = ['loc', 'date'];
        const inputFields = [{ name: 'date' }, { name: 'location', displayName: 'Location' }];
        const mapping = ColumnMapping.fromColumns(sourceColumns, inputFields);
        const updatedMapping = mapping.updateWith('loc', 'location');

        const tsvContent = 'date\tloc\n' + '2023-01-01\tUSA\n' + '2023-01-02\tCanada\n';

        const tsvFile = new File([tsvContent], 'input.tsv');

        const remappedFile = await updatedMapping.applyTo(new RawFile(tsvFile));
        const remappedContent = await remappedFile.text();

        expect(remappedContent).toBe('location\tdate\n' + 'USA\t2023-01-01\n' + 'Canada\t2023-01-02\n');
    });
});
