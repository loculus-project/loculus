import { describe, it, expect } from 'vitest';

import { ColumnMapping } from './ColumnMapping';

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
            ['date', undefined, 'date'],
            ['location', undefined, 'location'],
            ['foo', 'Foo Bar', 'Foo Bar']
        ]);
    });

    it('should update a specific mapping', () => {
        const sourceColumns = ['date', 'loc'];
        const targetColumns = new Map([['location', 'Location']]);
        const mapping = ColumnMapping.fromColumns(sourceColumns, targetColumns);

        const updatedMapping = mapping.updateWith('location', 'loc');

        const entries = updatedMapping.entries();
        expect(entries).toEqual([['location', 'Location', 'loc']]);
    });
});
