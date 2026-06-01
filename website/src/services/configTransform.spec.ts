import { describe, expect, it } from 'vitest';

import { toWebsiteConfig } from './configTransform.ts';
import { canonicalInstanceResponse, canonicalOrganismConfig } from '../types/loculusConfig.ts';

const organism = canonicalOrganismConfig.parse({
    schema: {
        organismName: 'Test organism',
        metadata: [{ name: 'coverage', type: 'number' }],
        tableColumns: [],
    },
    referenceGenome: {
        nucleotideSequences: [{ name: 'main', sequence: 'ACGT' }],
        genes: [],
    },
});

describe('toWebsiteConfig', () => {
    it('keeps backend number metadata fields and normalizes optional logo dimensions', () => {
        const instance = canonicalInstanceResponse.parse({
            version: 1,
            publishedAt: '2026-05-24T12:15:55Z',
            readOnlyMode: false,
            config: {
                name: 'Loculus',
                accessionPrefix: 'LOC_',
                dataUseTerms: { enabled: false, urls: null },
                fileSharing: { outputFileUrlType: 'website' },
                logo: { url: '/logo.svg' },
            },
        });

        const config = toWebsiteConfig(instance, { test: organism });

        expect(config.logo).toEqual({ url: '/logo.svg', width: 0, height: 0 });
        expect(config.organisms.test.schema.metadata.find((field) => field.name === 'coverage')?.type).toBe('number');
    });

    it('normalizes nullable submission data type fields from backend config', () => {
        const instance = canonicalInstanceResponse.parse({
            version: 1,
            publishedAt: '2026-05-24T12:15:55Z',
            readOnlyMode: false,
            config: {
                name: 'Loculus',
                accessionPrefix: 'LOC_',
                dataUseTerms: { enabled: false, urls: null },
                fileSharing: { outputFileUrlType: 'website' },
            },
        });
        const organismWithFiles = canonicalOrganismConfig.parse({
            schema: {
                organismName: 'Test organism',
                metadata: [{ name: 'coverage', type: 'number' }],
                tableColumns: [],
                submissionDataTypes: {
                    consensusSequences: false,
                    maxSequencesPerEntry: null,
                    files: {
                        enabled: true,
                        categories: [
                            { name: 'raw_reads', displayName: 'Raw reads' },
                            { name: 'assembly', displayName: null },
                        ],
                    },
                },
            },
            referenceGenome: {
                nucleotideSequences: [{ name: 'main', sequence: 'ACGT' }],
                genes: [],
            },
        });

        const config = toWebsiteConfig(instance, { test: organismWithFiles });

        expect(config.organisms.test.schema.submissionDataTypes).toEqual({
            consensusSequences: false,
            files: {
                enabled: true,
                categories: [{ name: 'raw_reads', displayName: 'Raw reads' }, { name: 'assembly' }],
            },
        });
    });

    it('adds output file categories as file list metadata like the Helm-rendered config did', () => {
        const instance = canonicalInstanceResponse.parse({
            version: 1,
            publishedAt: '2026-05-24T12:15:55Z',
            readOnlyMode: false,
            config: {
                name: 'Loculus',
                accessionPrefix: 'LOC_',
                dataUseTerms: { enabled: false, urls: null },
                fileSharing: { outputFileUrlType: 'website' },
            },
        });
        const organismWithOutputFiles = canonicalOrganismConfig.parse({
            schema: {
                organismName: 'Test organism',
                metadata: [{ name: 'coverage', type: 'number' }],
                tableColumns: [],
                files: [
                    { name: 'raw_reads', displayName: 'Raw reads' },
                    { name: 'assembly', displayName: null },
                ],
            },
            referenceGenome: {
                nucleotideSequences: [{ name: 'main', sequence: 'ACGT' }],
                genes: [],
            },
        });

        const config = toWebsiteConfig(instance, { test: organismWithOutputFiles });

        expect(config.organisms.test.schema.metadata).toContainEqual({
            name: 'raw_reads',
            displayName: 'Raw reads',
            type: 'string',
            header: 'Files',
            customDisplay: { type: 'fileList' },
        });
        expect(config.organisms.test.schema.metadata).toContainEqual({
            name: 'assembly',
            type: 'string',
            header: 'Files',
            customDisplay: { type: 'fileList' },
        });
    });

    it('rejects backend config that cannot be transformed to the website view model', () => {
        const instance = canonicalInstanceResponse.parse({
            version: 1,
            publishedAt: '2026-05-24T12:15:55Z',
            readOnlyMode: false,
            config: {
                name: 'Loculus',
                accessionPrefix: 'LOC_',
                dataUseTerms: { enabled: false, urls: null },
                fileSharing: { outputFileUrlType: 'website' },
            },
        });
        const organismWithInvalidDisplay = canonicalOrganismConfig.parse({
            schema: {
                organismName: 'Test organism',
                metadata: [{ name: 'badDisplay', type: 'string', customDisplay: { missingType: true } }],
                tableColumns: [],
            },
            referenceGenome: {
                nucleotideSequences: [{ name: 'main', sequence: 'ACGT' }],
                genes: [],
            },
        });

        expect(() => toWebsiteConfig(instance, { test: organismWithInvalidDisplay })).toThrow();
    });
});
