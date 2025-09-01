import { describe, expect, it } from 'vitest';

import { MetadataFilterSchema, NULL_QUERY_VALUE } from './search.ts';

describe('MetadataFilterSchema', () => {
    it('decodes _null_ values from query state', () => {
        const schema = new MetadataFilterSchema([{ name: 'field1', type: 'string' }]);
        const result = schema.getFieldValuesFromQuery({ field1: NULL_QUERY_VALUE }, {});
        expect(result.field1).toBeNull();
    });
});
