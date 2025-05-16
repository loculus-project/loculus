import { describe, it, expect, test } from 'vitest';

import { processTemplate, matchPlaceholders } from './templateProcessor';

describe('matchPlaceholders', () => {
    test('finds simple placeholders', () => {
        const template = 'http://example.com/tool?data=[unalignedNucleotideSequences]';
        const matches = matchPlaceholders(template);

        expect(matches).toHaveLength(1);
        expect(matches[0]).toEqual({
            fullMatch: '[unalignedNucleotideSequences]',
            dataType: 'unalignedNucleotideSequences',
            segment: undefined,
            richHeaders: false,
            dataFormat: undefined,
        });
    });

    test('finds placeholders with format', () => {
        const template = 'http://example.com/tool?data=[unalignedNucleotideSequences|json]';
        const matches = matchPlaceholders(template);

        expect(matches).toHaveLength(1);
        expect(matches[0]).toEqual({
            fullMatch: '[unalignedNucleotideSequences|json]',
            dataType: 'unalignedNucleotideSequences',
            segment: undefined,
            richHeaders: false,
            dataFormat: 'json',
        });
    });

    test('finds placeholders with segment', () => {
        const template = 'http://example.com/tool?data=[unalignedNucleotideSequences:S]';
        const matches = matchPlaceholders(template);

        expect(matches).toHaveLength(1);
        expect(matches[0]).toEqual({
            fullMatch: '[unalignedNucleotideSequences:S]',
            dataType: 'unalignedNucleotideSequences',
            segment: 'S',
            richHeaders: false,
            dataFormat: undefined,
        });
    });

    test('finds placeholders with segment and format', () => {
        const template = 'http://example.com/tool?data=[unalignedNucleotideSequences:S|json]';
        const matches = matchPlaceholders(template);

        expect(matches).toHaveLength(1);
        expect(matches[0]).toEqual({
            fullMatch: '[unalignedNucleotideSequences:S|json]',
            dataType: 'unalignedNucleotideSequences',
            segment: 'S',
            richHeaders: false,
            dataFormat: 'json',
        });
    });

    test('finds placeholders with rich headers', () => {
        const template = 'http://example.com/tool?data=[unalignedNucleotideSequences+rich]';
        const matches = matchPlaceholders(template);

        expect(matches).toHaveLength(1);
        expect(matches[0]).toEqual({
            fullMatch: '[unalignedNucleotideSequences+rich]',
            dataType: 'unalignedNucleotideSequences',
            segment: undefined,
            richHeaders: true,
            dataFormat: undefined,
        });
    });

    test('finds placeholders with rich headers and format', () => {
        const template = 'http://example.com/tool?data=[unalignedNucleotideSequences+rich|json]';
        const matches = matchPlaceholders(template);

        expect(matches).toHaveLength(1);
        expect(matches[0]).toEqual({
            fullMatch: '[unalignedNucleotideSequences+rich|json]',
            dataType: 'unalignedNucleotideSequences',
            segment: undefined,
            richHeaders: true,
            dataFormat: 'json',
        });
    });

    test('finds placeholders with segment and rich headers', () => {
        const template = 'http://example.com/tool?data=[unalignedNucleotideSequences:S+rich]';
        const matches = matchPlaceholders(template);

        expect(matches).toHaveLength(1);
        expect(matches[0]).toEqual({
            fullMatch: '[unalignedNucleotideSequences:S+rich]',
            dataType: 'unalignedNucleotideSequences',
            segment: 'S',
            richHeaders: true,
            dataFormat: undefined,
        });
    });

    test('finds placeholders with segment, rich headers, and format', () => {
        const template = 'http://example.com/tool?data=[unalignedNucleotideSequences:S+rich|json]';
        const matches = matchPlaceholders(template);

        expect(matches).toHaveLength(1);
        expect(matches[0]).toEqual({
            fullMatch: '[unalignedNucleotideSequences:S+rich|json]',
            dataType: 'unalignedNucleotideSequences',
            segment: 'S',
            richHeaders: true,
            dataFormat: 'json',
        });
    });

    test('finds multiple placeholders', () => {
        const template = 'http://example.com/tool?data1=[unalignedNucleotideSequences]&data2=[metadata|json]';
        const matches = matchPlaceholders(template);

        expect(matches).toHaveLength(2);
        expect(matches[0]).toEqual({
            fullMatch: '[unalignedNucleotideSequences]',
            dataType: 'unalignedNucleotideSequences',
            segment: undefined,
            richHeaders: false,
            dataFormat: undefined,
        });
        expect(matches[1]).toEqual({
            fullMatch: '[metadata|json]',
            dataType: 'metadata',
            segment: undefined,
            richHeaders: false,
            dataFormat: 'json',
        });
    });

    test('returns empty array for templates with no placeholders', () => {
        const template = 'http://example.com/tool?data=none';
        const matches = matchPlaceholders(template);

        expect(matches).toHaveLength(0);
    });
});

describe('processTemplate', () => {
    it('replaces placeholder values with parameters', () => {
        const template = 'https://example.com/[path]/[id]';
        const placeholdersAndValues = {
            path: 'users',
            id: '123',
        };

        const result = processTemplate(template, placeholdersAndValues);
        expect(result).toBe('https://example.com/users/123');
    });

    it('replaces empty values with empty strings', () => {
        const template = 'https://example.com/[path]/[id]';
        const placeholdersAndValues = {
            path: 'users',
            id: '',
        };

        const result = processTemplate(template, placeholdersAndValues);
        expect(result).toBe('https://example.com/users/');
    });

    it('leaves placeholders unchanged if parameter is not provided', () => {
        const template = 'https://example.com/[path]/[id]';
        const placeholdersAndValues = {
            path: 'users',
        };

        const result = processTemplate(template, placeholdersAndValues);
        expect(result).toBe('https://example.com/users/[id]');
    });

    it('URL encodes content in {{ }} expressions', () => {
        const template = 'https://example.com/search?q={{search term}}';
        const placeholdersAndValues = {};

        const result = processTemplate(template, placeholdersAndValues);
        expect(result).toBe('https://example.com/search?q=search%20term');
    });

    it('handles nested {{ }} expressions recursively', () => {
        const template = 'https://example.com/search?q={{ {{nested}} }}';
        const placeholdersAndValues = {};

        const result = processTemplate(template, placeholdersAndValues);
        expect(result).toBe('https://example.com/search?q=%20nested%20');
    });

    it('processes both placeholders and {{ }} expressions', () => {
        const template = 'https://[host]/[path]?q={{search term}}&id=[id]';
        const placeholdersAndValues = {
            host: 'example.com',
            path: 'search',
            id: '123',
        };

        const result = processTemplate(template, placeholdersAndValues);
        expect(result).toBe('https://example.com/search?q=search%20term&id=123');
    });

    it('handles multiple levels of nested {{ }} expressions', () => {
        const template = 'https://example.com/{{ {{ {{ deeply }} nested }} expression }}';
        const placeholdersAndValues = {};

        const result = processTemplate(template, placeholdersAndValues);
        // The implementation recursively URL encodes, so spaces become %20, which then becomes %2520, etc.
        expect(result).toBe('https://example.com/%20%2520%252520deeply%252520%2520nested%2520%20expression%20');
    });

    it('returns original string when no placeholders or expressions are present', () => {
        const template = 'https://example.com/simple/path';
        const placeholdersAndValues = {
            unused: 'value',
        };

        const result = processTemplate(template, placeholdersAndValues);
        expect(result).toBe('https://example.com/simple/path');
    });
});
