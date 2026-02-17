import {
  LoculusValues,
  EnabledOrganism,
  OrganismConfig,
  MetadataField,
  ReferenceGenomeSegment,
  PreprocessingConfig,
} from './values';

export function getEnabledOrganisms(values: LoculusValues): EnabledOrganism[] {
  const allOrganisms = values.organisms || values.defaultOrganisms || {};
  const enabled: EnabledOrganism[] = [];
  const sortedKeys = Object.keys(allOrganisms).sort();
  for (const key of sortedKeys) {
    const organism = allOrganisms[key];
    if (organism.enabled !== false) {
      enabled.push({ key, contents: organism });
    }
  }
  return enabled;
}

/**
 * Patch schema by merging metadataAdd into metadata (overwriting by name).
 */
export function patchMetadataSchema(schema: any): any {
  const metadata: MetadataField[] = schema.metadata || [];
  const toAdd: MetadataField[] = schema.metadataAdd || [];

  const metadataMap = new Map<string, MetadataField>();
  for (const field of metadata) {
    metadataMap.set(field.name, field);
  }
  for (const field of toAdd) {
    metadataMap.set(field.name, field);
  }

  return {
    ...schema,
    metadata: Array.from(metadataMap.values()),
  };
}

/**
 * Get nucleotide segment names from reference genomes, sorted alphabetically.
 */
export function getNucleotideSegmentNames(referenceGenomes: ReferenceGenomeSegment[]): string[] {
  return referenceGenomes.map((s) => s.name).sort();
}

/**
 * Check if organism has multiple segments.
 */
export function isSegmented(referenceGenomes: ReferenceGenomeSegment[]): boolean {
  return referenceGenomes.length > 1;
}

/**
 * Get the lineage system for an organism (from its patched schema).
 */
export function lineageSystemForOrganism(organism: OrganismConfig): string | undefined {
  const schema = patchMetadataSchema(organism.schema);
  const lineageSystems: string[] = [];
  for (const field of schema.metadata) {
    if (field.lineageSystem) {
      lineageSystems.push(field.lineageSystem);
    }
  }
  const unique = [...new Set(lineageSystems)];
  if (unique.length > 1) {
    throw new Error(`Multiple lineage systems found: ${unique.join(', ')}`);
  }
  return unique[0];
}

export interface FlattenedPreprocessingConfig extends PreprocessingConfig {
  version: number;
}

/**
 * Flatten preprocessing versions (a version field can be an array).
 */
export function flattenPreprocessingVersions(preprocessing: PreprocessingConfig[]): FlattenedPreprocessingConfig[] {
  const flattened: FlattenedPreprocessingConfig[] = [];
  const seen = new Set<number>();
  for (const pc of preprocessing) {
    const versions = Array.isArray(pc.version) ? pc.version : [pc.version];
    for (const v of versions) {
      if (seen.has(v)) {
        throw new Error(`Duplicate preprocessing pipeline version ${v} found in organism configuration`);
      }
      seen.add(v);
      flattened.push({ ...pc, version: v });
    }
  }
  return flattened;
}

/**
 * Merge reference genomes into LAPIS format.
 */
export function mergeReferenceGenomes(referenceGenomes: ReferenceGenomeSegment[]): {
  nucleotideSequences: Array<{ name: string; sequence: string }>;
  genes: Array<{ name: string; sequence: string }>;
} {
  const nucleotideSequences: Array<{ name: string; sequence: string }> = [];
  const genes: Array<{ name: string; sequence: string }> = [];
  const singleSegment = referenceGenomes.length === 1;

  for (const segment of referenceGenomes) {
    const segmentName = segment.name;
    const singleReference = segment.references.length === 1;

    for (const reference of segment.references) {
      if (singleReference) {
        nucleotideSequences.push({ name: segmentName, sequence: reference.sequence });
      } else {
        const name = singleSegment ? reference.name : `${segmentName}-${reference.name}`;
        nucleotideSequences.push({ name, sequence: reference.sequence });
      }

      if (reference.genes) {
        for (const gene of reference.genes) {
          if (singleReference) {
            genes.push({ name: gene.name, sequence: gene.sequence });
          } else {
            genes.push({ name: `${gene.name}-${reference.name}`, sequence: gene.sequence });
          }
        }
      }
    }
  }

  return { nucleotideSequences, genes };
}
