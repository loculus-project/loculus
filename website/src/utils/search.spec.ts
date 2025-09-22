import { describe, expect, it } from 'vitest';

import { MetadataFilterSchema, NULL_QUERY_VALUE } from './search.ts';

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
