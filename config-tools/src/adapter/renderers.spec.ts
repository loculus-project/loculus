import { describe, expect, it } from 'vitest';

import { commonMetadata } from './commonMetadata.ts';
import { lineageDefinitionsForOrganism, lineageSystemsForOrganism } from './lineageSystems.ts';
import { getNucleotideSegmentInfo, mergeReferenceGenomes } from './referenceGenomes.ts';
import { toSiloDatabaseConfig } from './siloDatabaseConfig.ts';
import {
    canonicalInstanceConfig,
    canonicalOrganismConfig,
    type CanonicalInstanceConfig,
    type CanonicalOrganismConfig,
} from '../schema/canonicalConfig.ts';

const baseInstance: CanonicalInstanceConfig = canonicalInstanceConfig.parse({
    name: 'Loculus',
    accessionPrefix: 'LOC_',
    dataUseTerms: { enabled: false, urls: null },
    fileSharing: { outputFileUrlType: 'website' },
});

const singleSegmentSingleRef: CanonicalOrganismConfig = canonicalOrganismConfig.parse({
    schema: {
        organismName: 'Test virus',
        metadata: [
            { name: 'date', type: 'date', required: true },
            { name: 'country', type: 'string', generateIndex: true, autocomplete: true },
            { name: 'pangoLineage', type: 'string', lineageSystem: 'pangoLineage' },
        ],
    },
    referenceGenome: {
        nucleotideSequences: [{ name: 'main', sequence: 'ATCG' }],
        genes: [{ name: 'spike', sequence: 'MM' }],
    },
});

const multiSegmentMultiRef: CanonicalOrganismConfig = canonicalOrganismConfig.parse({
    schema: {
        organismName: 'CCHF',
        metadata: [
            { name: 'date', type: 'date', required: true },
            { name: 'coverage', type: 'float', perSegment: true },
        ],
    },
    referenceGenome: { nucleotideSequences: [], genes: [] },
    referenceGenomes: [
        {
            name: 'L',
            references: [
                { name: 'YP_001', sequence: 'AAA', genes: [{ name: 'RdRp', sequence: 'MM' }] },
                { name: 'YP_002', sequence: 'CCC' },
            ],
        },
        {
            name: 'M',
            references: [{ name: 'YP_003', sequence: 'GGG' }],
        },
    ],
});

describe('commonMetadata', () => {
    it('renders the base 15 system fields when dataUseTerms is disabled', () => {
        const fields = commonMetadata(baseInstance);
        const names = fields.map((f) => f.name);
        expect(names).toEqual([
            'accessionVersion',
            'accession',
            'version',
            'submissionId',
            'isRevocation',
            'submitter',
            'groupName',
            'groupId',
            'submittedAtTimestamp',
            'submittedDate',
            'releasedAtTimestamp',
            'releasedDate',
            'versionStatus',
            'versionComment',
            'pipelineVersion',
        ]);
    });

    it('adds the three dataUseTerms fields when enabled but no urls set', () => {
        const fields = commonMetadata({ ...baseInstance, dataUseTerms: { enabled: true, urls: null } });
        const names = fields.map((f) => f.name);
        expect(names).toContain('dataUseTerms');
        expect(names).toContain('dataUseTermsRestrictedUntil');
        expect(names).toContain('dataBecameOpenAt');
        expect(names).not.toContain('dataUseTermsUrl');
    });

    it('adds the dataUseTermsUrl field when urls are set', () => {
        const fields = commonMetadata({
            ...baseInstance,
            dataUseTerms: { enabled: true, urls: { open: 'http://o', restricted: 'http://r' } },
        });
        expect(fields.map((f) => f.name)).toContain('dataUseTermsUrl');
    });

    it('uses the instance name + accessionPrefix in the accessionVersion definition', () => {
        const f = commonMetadata(baseInstance).find((m) => m.name === 'accessionVersion');
        expect(f?.definition).toContain('Loculus');
        expect(f?.definition).toContain('LOC_000001.1');
    });
});

describe('mergeReferenceGenomes', () => {
    it('keeps names unchanged for single-segment single-reference', () => {
        const m = mergeReferenceGenomes(singleSegmentSingleRef);
        expect(m.nucleotideSequences).toEqual([{ name: 'main', sequence: 'ATCG' }]);
        expect(m.genes).toEqual([{ name: 'spike', sequence: 'MM' }]);
    });

    it('applies the multi-segment + multi-reference disambiguation', () => {
        const m = mergeReferenceGenomes(multiSegmentMultiRef);
        // L has two refs, M has one. Multi-segment AND multi-reference (for L) → "segment-reference";
        // M is single-reference → just "M".
        expect(m.nucleotideSequences.map((s) => s.name)).toEqual(['L-YP_001', 'L-YP_002', 'M']);
        // Genes only come from references that declared them. L/YP_001 has RdRp; multi-reference suffix.
        expect(m.genes).toEqual([{ name: 'RdRp-YP_001', sequence: 'MM' }]);
    });

    it('falls back to the simple referenceGenome shape when referenceGenomes is empty', () => {
        const m = mergeReferenceGenomes(singleSegmentSingleRef);
        expect(m.nucleotideSequences[0].sequence).toBe('ATCG');
    });
});

describe('getNucleotideSegmentInfo', () => {
    it('sorts segments alphabetically and pulls displayNames', () => {
        const info = getNucleotideSegmentInfo({
            ...multiSegmentMultiRef,
            referenceGenomes: [
                { name: 'M', displayName: 'Medium', references: [{ name: 'r1', sequence: 'g' }] },
                { name: 'L', references: [{ name: 'r2', sequence: 'g' }] },
            ],
        });
        expect(info.segments).toEqual(['L', 'M']);
        expect(info.displayNames).toEqual({ M: 'Medium' });
    });
});

describe('toSiloDatabaseConfig', () => {
    it('emits all common + organism metadata with name + (translated) type', () => {
        const silo = toSiloDatabaseConfig(baseInstance, singleSegmentSingleRef);
        expect(silo.schema.instanceName).toBe('Test virus');
        expect(silo.schema.primaryKey).toBe('accessionVersion');
        expect(silo.schema.features).toEqual([{ name: 'generalizedAdvancedQuery' }]);

        const names = silo.schema.metadata.map((m) => m.name);
        // common fields + organism fields
        expect(names).toContain('accessionVersion');
        expect(names).toContain('submittedAtTimestamp');
        expect(names).toContain('country');
        expect(names).toContain('pangoLineage');

        // timestamp → int
        const ts = silo.schema.metadata.find((m) => m.name === 'submittedAtTimestamp');
        expect(ts?.type).toBe('int');

        // generateIndex passed through; lineageSystem → generateIndex + generateLineageIndex
        const country = silo.schema.metadata.find((m) => m.name === 'country');
        expect(country?.generateIndex).toBe(true);
        const lineage = silo.schema.metadata.find((m) => m.name === 'pangoLineage');
        expect(lineage?.generateIndex).toBe(true);
        expect(lineage?.generateLineageIndex).toBe('pangoLineage');
    });

    it('emits per-segment fields one entry per (sorted) segment name', () => {
        const silo = toSiloDatabaseConfig(baseInstance, multiSegmentMultiRef);
        const coverageNames = silo.schema.metadata.filter((m) => m.name.startsWith('coverage')).map((m) => m.name);
        expect(coverageNames).toEqual(['coverage_L', 'coverage_M']);
        // non-perSegment fields stay unsegmented
        expect(silo.schema.metadata.some((m) => m.name === 'date')).toBe(true);
        expect(silo.schema.metadata.some((m) => m.name === 'date_L')).toBe(false);
    });

    it('appends file categories as plain string fields', () => {
        const withFiles = canonicalOrganismConfig.parse({
            ...singleSegmentSingleRef,
            schema: { ...singleSegmentSingleRef.schema, files: [{ name: 'rawReads' }, { name: 'qcReport' }] },
        });
        const silo = toSiloDatabaseConfig(baseInstance, withFiles);
        const fileEntries = silo.schema.metadata.filter((m) => m.name === 'rawReads' || m.name === 'qcReport');
        expect(fileEntries).toHaveLength(2);
        expect(fileEntries.every((e) => e.type === 'string')).toBe(true);
    });
});

describe('lineageSystemsForOrganism', () => {
    it('returns the unique set of lineageSystem keys, sorted', () => {
        const organism = canonicalOrganismConfig.parse({
            ...singleSegmentSingleRef,
            schema: {
                ...singleSegmentSingleRef.schema,
                metadata: [
                    { name: 'a', type: 'string', lineageSystem: 'pangoLineage' },
                    { name: 'b', type: 'string', lineageSystem: 'nextclade' },
                    { name: 'c', type: 'string', lineageSystem: 'pangoLineage' },
                    { name: 'd', type: 'string' },
                ],
            },
        });
        expect(lineageSystemsForOrganism(organism)).toEqual(['nextclade', 'pangoLineage']);
    });

    it('picks up the lineageSystem from any metadata field on the organism', () => {
        // singleSegmentSingleRef has `pangoLineage` with `lineageSystem: pangoLineage`
        expect(lineageSystemsForOrganism(singleSegmentSingleRef)).toEqual(['pangoLineage']);
    });

    it('returns [] for an organism with no lineageSystem fields', () => {
        const organism = canonicalOrganismConfig.parse({
            ...singleSegmentSingleRef,
            schema: {
                ...singleSegmentSingleRef.schema,
                metadata: [{ name: 'date', type: 'date' }],
            },
        });
        expect(lineageSystemsForOrganism(organism)).toEqual([]);
    });
});

describe('lineageDefinitionsForOrganism', () => {
    const instanceWithDefs: CanonicalInstanceConfig = canonicalInstanceConfig.parse({
        ...baseInstance,
        lineageSystemDefinitions: {
            pangoLineage: { '1': 'https://example.org/v1.yaml', '2': 'https://example.org/v2.yaml' },
            unused: { '1': 'https://example.org/unused.yaml' },
        },
    });

    it('forwards the per-version URL map only for the systems the organism references', () => {
        // singleSegmentSingleRef references only `pangoLineage`.
        expect(lineageDefinitionsForOrganism(instanceWithDefs, singleSegmentSingleRef)).toEqual({
            pangoLineage: { '1': 'https://example.org/v1.yaml', '2': 'https://example.org/v2.yaml' },
        });
    });

    it('returns {} for an organism with no lineage systems', () => {
        const organism = canonicalOrganismConfig.parse({
            ...singleSegmentSingleRef,
            schema: { ...singleSegmentSingleRef.schema, metadata: [{ name: 'date', type: 'date' }] },
        });
        expect(lineageDefinitionsForOrganism(instanceWithDefs, organism)).toEqual({});
    });

    it('throws when the organism references a system the instance does not define', () => {
        expect(() => lineageDefinitionsForOrganism(baseInstance, singleSegmentSingleRef)).toThrow(
            /lineageSystemDefinitions entry/,
        );
    });
});
