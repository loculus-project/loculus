// Renders the cross-organism overview SILO/LAPIS config + importer inputs from
// the instance config's SQL-backed view sections. View rows are produced by an
// admin-provided SQL query and can optionally include unaligned nucleotide
// sequences.
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import type { CanonicalInstanceConfig } from '../schema/canonicalConfig.ts';
import type { CanonicalView } from '../schema/canonicalConfig.ts';

export type OverviewSequenceConfig = {
    unalignedNucleotideSequences: {
        enabled: boolean;
        segments: string[];
        sourceSegments: Record<string, Record<string, string>>;
    };
};

export function overviewReferenceGenomes(
    instance: CanonicalInstanceConfig,
    viewKey = 'overview',
): { nucleotideSequences: { name: string; sequence: string }[]; genes: [] } {
    return {
        nucleotideSequences: overviewSequenceSegments(instance, viewKey).map(
            (segment) => ({
                name: segment,
                // Synthetic placeholder: view sequence support only needs segment
                // names for unaligned LAPIS endpoints, not aligned reference bases.
                sequence: 'N',
            }),
        ),
        genes: [],
    };
}

export function overviewSequenceConfig(
    instance: CanonicalInstanceConfig,
    viewKey = 'overview',
): OverviewSequenceConfig {
    const sequenceConfig = getView(instance, viewKey).sequenceData
        ?.unalignedNucleotideSequences;
    const enabled =
        sequenceConfig?.enabled === true &&
        (sequenceConfig.segments ?? []).length > 0;
    return {
        unalignedNucleotideSequences: {
            enabled,
            segments: enabled ? [...sequenceConfig.segments] : [],
            sourceSegments: enabled
                ? (sequenceConfig.sourceSegments ?? {})
                : {},
        },
    };
}

/** SILO preprocessing config for a SQL-backed view instance. */
export function overviewSiloPreprocessingConfig(): {
    inputDirectory: string;
    outputDirectory: string;
    ndjsonInputFilename: string;
    referenceGenomeFilename: string;
} {
    return {
        inputDirectory: '/preprocessing/input',
        outputDirectory: '/preprocessing/output',
        ndjsonInputFilename: 'data.ndjson.zst',
        referenceGenomeFilename: 'reference_genomes.json',
    };
}

function overviewSequenceSegments(
    instance: CanonicalInstanceConfig,
    viewKey: string,
): string[] {
    const sequenceConfig = getView(instance, viewKey).sequenceData
        ?.unalignedNucleotideSequences;
    if (sequenceConfig?.enabled !== true) return [];
    return sequenceConfig.segments ?? [];
}

export function overviewQuery(
    instance: CanonicalInstanceConfig,
    viewKey = 'overview',
): string {
    const query = getView(instance, viewKey).query?.trim();
    if (!query) {
        throw new Error(`views.${viewKey}.query is required`);
    }
    return `${query}\n`;
}

export function overviewSiloDatabaseConfigYaml(
    instance: CanonicalInstanceConfig,
    viewKey = 'overview',
): string {
    const schema = getView(instance, viewKey).schema?.trim();
    if (!schema) {
        throw new Error(`views.${viewKey}.schema is required`);
    }
    return stringifyYaml(toOverviewSiloDatabaseConfig(schema));
}

function getView(
    instance: CanonicalInstanceConfig,
    viewKey: string,
): CanonicalView {
    const view =
        instance.views?.[viewKey] ??
        (viewKey === 'overview' ? instance.overview : undefined);
    if (view === null || view === undefined) {
        throw new Error(`View "${viewKey}" is not configured`);
    }
    return view;
}

function toOverviewSiloDatabaseConfig(schema: string): {
    schema: {
        instanceName: string;
        opennessLevel: 'OPEN';
        metadata: {
            name: string;
            type: string;
            generateIndex?: true;
            generateLineageIndex?: string;
        }[];
        primaryKey: 'accessionVersion';
        features: { name: string }[];
    };
} {
    const parsed = parseYaml(schema) as unknown;
    if (!isRecord(parsed)) {
        throw new Error('overview.schema must be a YAML object');
    }
    const schemaNode = parsed.schema;
    if (!isRecord(schemaNode)) {
        throw new Error('overview.schema must contain a schema object');
    }
    if (!Array.isArray(schemaNode.metadata)) {
        throw new Error('overview.schema.schema.metadata must be an array');
    }
    if (schemaNode.primaryKey !== 'accessionVersion') {
        throw new Error(
            'overview.schema.schema.primaryKey must be accessionVersion',
        );
    }
    return {
        schema: {
            instanceName:
                typeof schemaNode.instanceName === 'string'
                    ? schemaNode.instanceName
                    : 'Cross-organism overview',
            opennessLevel: 'OPEN',
            metadata: schemaNode.metadata.map(toSiloMetadataEntry),
            primaryKey: 'accessionVersion',
            features: Array.isArray(schemaNode.features)
                ? schemaNode.features.filter(isFeatureEntry)
                : [{ name: 'generalizedAdvancedQuery' }],
        },
    };
}

function toSiloMetadataEntry(field: unknown): {
    name: string;
    type: string;
    generateIndex?: true;
    generateLineageIndex?: string;
} {
    if (!isRecord(field) || typeof field.name !== 'string') {
        throw new Error(
            'overview.schema.schema.metadata entries must have a name',
        );
    }
    const entry: {
        name: string;
        type: string;
        generateIndex?: true;
        generateLineageIndex?: string;
    } = {
        name: field.name,
        type: toSiloType(field.type),
    };
    if (field.generateIndex === true) {
        entry.generateIndex = true;
    }
    if (typeof field.lineageSystem === 'string' && field.lineageSystem !== '') {
        entry.generateIndex = true;
        entry.generateLineageIndex = field.lineageSystem;
    }
    return entry;
}

function toSiloType(type: unknown): string {
    if (type === 'timestamp') return 'int';
    if (type === 'authors') return 'string';
    if (typeof type === 'string' && type !== '') return type;
    return 'string';
}

function isFeatureEntry(value: unknown): value is { name: string } {
    return isRecord(value) && typeof value.name === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
