// TS port of `_siloDatabaseConfig.tpl` — renders `database_config.yaml` for SILO.
import { commonMetadata, type CommonMetadataField } from './commonMetadata.ts';
import { getNucleotideSegmentInfo } from './referenceGenomes.ts';
import type {
    CanonicalInstanceConfig,
    CanonicalOrganismConfig,
} from '../schema/canonicalConfig.ts';

export interface SiloDatabaseConfig {
    schema: {
        instanceName: string;
        opennessLevel: 'OPEN';
        metadata: SiloMetadataEntry[];
        primaryKey: 'accessionVersion';
        features: { name: string }[];
    };
}

export interface SiloMetadataEntry {
    type: string;
    name: string;
    generateIndex?: boolean;
    generateLineageIndex?: string;
}

// SILO only accepts string/int/float/date/boolean; translate the richer set.
function siloType(canonicalType: string): string {
    if (canonicalType === 'timestamp') return 'int';
    if (canonicalType === 'authors') return 'string';
    return canonicalType;
}

function shared(entry: SchemaLikeField): Omit<SiloMetadataEntry, 'name'> {
    const out: Omit<SiloMetadataEntry, 'name'> = { type: siloType(entry.type ?? 'string') };
    if (entry.generateIndex === true) out.generateIndex = true;
    if (entry.lineageSystem !== null && entry.lineageSystem !== undefined && entry.lineageSystem !== '') {
        out.generateIndex = true;
        out.generateLineageIndex = entry.lineageSystem;
    }
    return out;
}

interface SchemaLikeField {
    name: string;
    type?: string | null;
    perSegment?: boolean | null;
    generateIndex?: boolean | null;
    lineageSystem?: string | null;
}

export function toSiloDatabaseConfig(
    instance: CanonicalInstanceConfig,
    organism: CanonicalOrganismConfig,
): SiloDatabaseConfig {
    const { segments } = getNucleotideSegmentInfo(organism);
    const isSegmented = segments.length > 1;

    const common = commonMetadata(instance) as unknown as SchemaLikeField[];
    const commonNames = new Set(common.map((c) => c.name));
    const organismMetadata = (organism.schema.metadata as unknown as SchemaLikeField[]).filter(
        (m) => !commonNames.has(m.name),
    );
    const allMetadata: SchemaLikeField[] = [...common, ...organismMetadata];

    const out: SiloMetadataEntry[] = [];
    for (const entry of allMetadata) {
        const base = shared(entry);
        if (isSegmented && entry.perSegment === true) {
            for (const segment of segments) {
                out.push({ ...base, name: `${entry.name}_${segment}` });
            }
        } else {
            out.push({ ...base, name: entry.name });
        }
    }

    for (const file of organism.schema.files) {
        out.push({ type: 'string', name: file.name });
    }

    return {
        schema: {
            instanceName: organism.schema.organismName,
            opennessLevel: 'OPEN',
            metadata: out,
            primaryKey: 'accessionVersion',
            features: [{ name: 'generalizedAdvancedQuery' }],
        },
    };
}

export type { CommonMetadataField };
