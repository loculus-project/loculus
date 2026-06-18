import { describe, expect, it } from 'vitest';

import {
    overviewQuery,
    overviewReferenceGenomes,
    overviewSequenceConfig,
    overviewSiloDatabaseConfigYaml,
} from './overviewConfig.ts';
import {
    canonicalInstanceConfig,
    type CanonicalInstanceConfig,
} from '../schema/canonicalConfig.ts';

function instanceWithOverview(overview: unknown): CanonicalInstanceConfig {
    return canonicalInstanceConfig.parse({
        name: 'Test',
        accessionPrefix: 'LOC_',
        dataUseTerms: { enabled: false, urls: null },
        fileSharing: { outputFileUrlType: 'website' },
        overview,
    });
}

function instanceWithViews(views: unknown): CanonicalInstanceConfig {
    return canonicalInstanceConfig.parse({
        name: 'Test',
        accessionPrefix: 'LOC_',
        dataUseTerms: { enabled: false, urls: null },
        fileSharing: { outputFileUrlType: 'website' },
        views,
    });
}

const schema = `
schema:
  instanceName: Overview
  opennessLevel: OPEN
  metadata:
    - name: accessionVersion
      type: string
    - name: organism
      displayName: Organism
      type: string
      generateIndex: true
      autocomplete: true
      header: Sample details
    - name: country
      type: string
    - name: submittedAtTimestamp
      displayName: Date submitted
      type: timestamp
  primaryKey: accessionVersion
  features:
    - name: generalizedAdvancedQuery
`;

const overview = {
    displayName: 'Overview',
    query: 'select accessionVersion, organism, country from "enteroviruses"',
    schema,
    tableColumns: ['organism', 'country'],
};

describe('overview adapter config', () => {
    it('passes through the configured SQL query with a trailing newline', () => {
        expect(overviewQuery(instanceWithOverview(overview))).toBe(
            'select accessionVersion, organism, country from "enteroviruses"\n',
        );
    });

    it('renders a selected SQL-backed view', () => {
        const instance = instanceWithViews({
            'real-organisms': {
                ...overview,
                displayName: 'Real organisms',
                query: 'select accessionVersion from "west-nile"',
            },
        });

        expect(overviewQuery(instance, 'real-organisms')).toBe(
            'select accessionVersion from "west-nile"\n',
        );
        expect(
            overviewSiloDatabaseConfigYaml(instance, 'real-organisms'),
        ).toContain('instanceName: Overview');
    });

    it('renders empty sequence config for metadata-only views', () => {
        const instance = instanceWithOverview(overview);

        expect(overviewReferenceGenomes(instance)).toEqual({
            nucleotideSequences: [],
            genes: [],
        });
        expect(overviewSequenceConfig(instance)).toEqual({
            unalignedNucleotideSequences: {
                enabled: false,
                segments: [],
                sourceSegments: {},
            },
        });
    });

    it('renders unaligned nucleotide segment config for sequence-enabled views', () => {
        const instance = instanceWithViews({
            'real-organisms': {
                ...overview,
                sequenceData: {
                    unalignedNucleotideSequences: {
                        enabled: true,
                        segments: ['main', 'L'],
                        sourceSegments: {
                            main: {
                                'west-nile': 'genome',
                            },
                        },
                    },
                },
            },
        });

        expect(overviewReferenceGenomes(instance, 'real-organisms')).toEqual({
            nucleotideSequences: [
                { name: 'main', sequence: 'N' },
                { name: 'L', sequence: 'N' },
            ],
            genes: [],
        });
        expect(overviewSequenceConfig(instance, 'real-organisms')).toEqual({
            unalignedNucleotideSequences: {
                enabled: true,
                segments: ['main', 'L'],
                sourceSegments: {
                    main: {
                        'west-nile': 'genome',
                    },
                },
            },
        });
    });

    it('passes through a valid manual SILO database config YAML', () => {
        const rendered = overviewSiloDatabaseConfigYaml(
            instanceWithOverview(overview),
        );
        expect(rendered).toContain('instanceName: Overview');
        expect(rendered).toContain('primaryKey: accessionVersion');
        expect(rendered).toContain('name: submittedAtTimestamp');
        expect(rendered).toContain('type: int');
        expect(rendered).toContain('generateIndex: true');
        expect(rendered).not.toContain('displayName');
        expect(rendered).not.toContain('autocomplete');
        expect(rendered.endsWith('\n')).toBe(true);
    });

    it('rejects a manual schema without the expected primary key', () => {
        const invalid = {
            ...overview,
            schema: schema.replace(
                'primaryKey: accessionVersion',
                'primaryKey: accession',
            ),
        };
        expect(() =>
            overviewSiloDatabaseConfigYaml(instanceWithOverview(invalid)),
        ).toThrow('overview.schema.schema.primaryKey must be accessionVersion');
    });
});
