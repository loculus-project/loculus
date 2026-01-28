import { describe, expect, it } from 'vitest';

import { MetadataFilterSchema, MetadataVisibility, NULL_QUERY_VALUE } from './search.ts';
import {
    MULTI_SEG_MULTI_REF_REFERENCEGENOMES,
    SINGLE_SEG_MULTI_REF_REFERENCEGENOMES,
    SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
} from '../types/referenceGenomes.spec.ts';

const singleSegmentName = 'main';
const multiSegmentNames = ['L', 'S'];

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

        // Single segment single references
        expect(visibility.isVisible({ [singleSegmentName]: null }, SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES)).toBe(false);
        expect(
            visibility.isVisible({ [singleSegmentName]: 'singleReference' }, SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES),
        ).toBe(false);

        // Single segment multiple references
        expect(visibility.isVisible({ [singleSegmentName]: null }, SINGLE_SEG_MULTI_REF_REFERENCEGENOMES)).toBe(false);
        expect(visibility.isVisible({ [singleSegmentName]: 'ref1' }, SINGLE_SEG_MULTI_REF_REFERENCEGENOMES)).toBe(
            false,
        );

        // Multi segment multiple references
        expect(visibility.isVisible({ [multiSegmentNames[0]]: null }, MULTI_SEG_MULTI_REF_REFERENCEGENOMES)).toBe(
            false,
        );
        expect(visibility.isVisible({ [multiSegmentNames[1]]: null }, MULTI_SEG_MULTI_REF_REFERENCEGENOMES)).toBe(
            false,
        );
        expect(visibility.isVisible({ [multiSegmentNames[0]]: 'ref1' }, MULTI_SEG_MULTI_REF_REFERENCEGENOMES)).toBe(
            false,
        );
    });

    it('should return true when isChecked is true and onlyForReference is undefined', () => {
        const visibility = new MetadataVisibility(true, undefined);

        // Single segment single references
        expect(visibility.isVisible({ [singleSegmentName]: null }, SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES)).toBe(true);
        expect(
            visibility.isVisible({ [singleSegmentName]: 'singleReference' }, SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES),
        ).toBe(true);

        // Single segment multiple references
        expect(visibility.isVisible({ [singleSegmentName]: null }, SINGLE_SEG_MULTI_REF_REFERENCEGENOMES)).toBe(true);
        expect(visibility.isVisible({ [singleSegmentName]: 'ref1' }, SINGLE_SEG_MULTI_REF_REFERENCEGENOMES)).toBe(true);
        expect(visibility.isVisible({ [singleSegmentName]: 'ref2' }, SINGLE_SEG_MULTI_REF_REFERENCEGENOMES)).toBe(true);

        // Multi segment multiple references
        expect(visibility.isVisible({ [multiSegmentNames[0]]: null }, MULTI_SEG_MULTI_REF_REFERENCEGENOMES)).toBe(true);
        expect(visibility.isVisible({ [multiSegmentNames[1]]: null }, MULTI_SEG_MULTI_REF_REFERENCEGENOMES)).toBe(true);
        expect(visibility.isVisible({ [multiSegmentNames[0]]: 'ref1' }, MULTI_SEG_MULTI_REF_REFERENCEGENOMES)).toBe(
            true,
        );
        expect(visibility.isVisible({ [multiSegmentNames[1]]: 'ref2' }, MULTI_SEG_MULTI_REF_REFERENCEGENOMES)).toBe(
            true,
        );
    });

    it('should return true when isChecked is true and selectedReference matches or is not set', () => {
        let visibility = new MetadataVisibility(true, 'singleReference');

        // Single segment single references
        expect(visibility.isVisible({ [singleSegmentName]: null }, SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES)).toBe(false);
        expect(
            visibility.isVisible({ [singleSegmentName]: 'singleReference' }, SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES),
        ).toBe(true);

        visibility = new MetadataVisibility(true, 'ref1');

        // Single segment multiple references
        expect(visibility.isVisible({ [singleSegmentName]: null }, SINGLE_SEG_MULTI_REF_REFERENCEGENOMES)).toBe(false);
        expect(visibility.isVisible({ [singleSegmentName]: 'ref1' }, SINGLE_SEG_MULTI_REF_REFERENCEGENOMES)).toBe(true);
        expect(visibility.isVisible({ [singleSegmentName]: 'ref2' }, SINGLE_SEG_MULTI_REF_REFERENCEGENOMES)).toBe(
            false,
        );

        // Multi segment multiple references
        expect(visibility.isVisible({ [multiSegmentNames[0]]: null }, MULTI_SEG_MULTI_REF_REFERENCEGENOMES)).toBe(
            false,
        );
        expect(visibility.isVisible({ [multiSegmentNames[1]]: null }, MULTI_SEG_MULTI_REF_REFERENCEGENOMES)).toBe(
            false,
        );
        expect(visibility.isVisible({ [multiSegmentNames[0]]: 'ref1' }, MULTI_SEG_MULTI_REF_REFERENCEGENOMES)).toBe(
            true,
        );
        expect(visibility.isVisible({ [multiSegmentNames[1]]: 'ref2' }, MULTI_SEG_MULTI_REF_REFERENCEGENOMES)).toBe(
            false,
        );
    });
});
