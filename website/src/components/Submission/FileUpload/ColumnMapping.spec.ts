import { describe, it, expect } from 'vitest';

import { ColumnMapping } from './ColumnMapping';
import { RawFile } from './fileProcessing';

describe('ColumnMapping', () => {
    it('should create a mapping from columns', () => {
        const sourceColumns = ['date', 'location', 'Foo Bar'];
        const targetColumns = new Map([
            ['date', undefined],
            ['location', undefined],
            ['foo', 'Foo Bar'],
        ]);

        const mapping = ColumnMapping.fromColumns(sourceColumns, targetColumns);
        const entries = mapping.entries();

        expect(entries).toEqual([
            ['date', 'date'],
            ['location', 'location'],
            ['Foo Bar', 'foo'],
        ]);
    });

    it('should update a specific mapping', () => {
        const sourceColumns = ['loc'];
        const targetColumns = new Map([
            ['location', 'Location'],
            ['date', 'Date'],
        ]);
        const mapping = ColumnMapping.fromColumns(sourceColumns, targetColumns);

        const updatedMapping = mapping.updateWith('loc', 'date');

        const entries = updatedMapping.entries();
        expect(entries).toEqual([['loc', 'date']]);
    });

    it('should apply a mapping correctly', async () => {
        const sourceColumns = ['loc', 'date'];
        const targetColumns = new Map([
            ['date', undefined],
            ['location', 'Location'],
        ]);
        const mapping = ColumnMapping.fromColumns(sourceColumns, targetColumns);
        const updatedMapping = mapping.updateWith('loc', 'location');

        const tsvContent = 'date\tloc\n' + '2023-01-01\tUSA\n' + '2023-01-02\tCanada';

        const tsvFile = new File([tsvContent], 'input.tsv');

        const remappedFile = await updatedMapping.applyTo(new RawFile(tsvFile));
        const remappedContent = await remappedFile.text();

        expect(remappedContent).toBe('location\tdate\n' + 'USA\t2023-01-01\n' + 'Canada\t2023-01-02');
    });
});
