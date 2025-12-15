import { describe, expect, it } from 'vitest';

import { MetadataFilterSchema, MetadataVisibility, NULL_QUERY_VALUE } from './search.ts';

describe('MetadataFilterSchema', () => {
    it('decodes _null_ values from query state for single values', () => {
        const schema = new MetadataFilterSchema([{ name: 'field1', type: 'string' }]);
        const result = schema.getFieldValuesFromQuery({ field1: NULL_QUERY_VALUE }, {});
        expect(result.field1).toBeNull();
    });

    it('decodes _null_ values from query state for array values', () => {
        const schema = new MetadataFilterSchema([{ name: 'field1', type: 'string' }]);
        const result = schema.getFieldValuesFromQuery({ field1: ['value1', NULL_QUERY_VALUE, 'value2'] }, {});
        expect(result.field1).toEqual(['value1', null, 'value2']);
    });

    it('handles empty arrays correctly', () => {
        const schema = new MetadataFilterSchema([{ name: 'field1', type: 'string' }]);
        const result = schema.getFieldValuesFromQuery({ field1: [] }, {});
        expect(result.field1).toEqual([]);
    });

    it('handles arrays with only _null_ values', () => {
        const schema = new MetadataFilterSchema([{ name: 'field1', type: 'string' }]);
        const result = schema.getFieldValuesFromQuery({ field1: [NULL_QUERY_VALUE, NULL_QUERY_VALUE] }, {});
        expect(result.field1).toEqual([null, null]);
    });
});

describe('MetadataVisibility', () => {
    it('should return false when isChecked is false', () => {
        const visibility = new MetadataVisibility(false, undefined);

        expect(visibility.isVisible(null)).toBe(false);
        expect(visibility.isVisible('suborganism1')).toBe(false);
    });

    it('should return true when isChecked is true and onlyForReferenceName is undefined', () => {
        const visibility = new MetadataVisibility(true, undefined);

        expect(visibility.isVisible(null)).toBe(true);
        expect(visibility.isVisible('suborganism1')).toBe(true);
        expect(visibility.isVisible('suborganism2')).toBe(true);
    });

    it('should return true when isChecked is true and selectedSuborganism matches or is not set', () => {
        const visibility = new MetadataVisibility(true, 'suborganism1');

        expect(visibility.isVisible(null)).toBe(true);
        expect(visibility.isVisible('suborganism1')).toBe(true);
        expect(visibility.isVisible('suborganism2')).toBe(false);
        expect(visibility.isVisible('suborganism3')).toBe(false);
    });
});
