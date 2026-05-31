// SILO's own preprocessing config (input locations + lineage definitions to
// load); distinct from the external Loculus preprocessing pipeline.
import { lineageSystemsForOrganism } from './lineageSystems.ts';
import type { CanonicalOrganismConfig } from '../schema/canonicalConfig.ts';

export interface SiloPreprocessingConfig {
    inputDirectory: string;
    outputDirectory: string;
    ndjsonInputFilename: string;
    referenceGenomeFilename: string;
    lineageDefinitionFilenames?: string[];
}

export function toSiloPreprocessingConfig(organism: CanonicalOrganismConfig): SiloPreprocessingConfig {
    const lineageSystems = lineageSystemsForOrganism(organism);
    const config: SiloPreprocessingConfig = {
        inputDirectory: '/preprocessing/input',
        outputDirectory: '/preprocessing/output',
        ndjsonInputFilename: 'data.ndjson.zst',
        referenceGenomeFilename: 'reference_genomes.json',
    };
    if (lineageSystems.length > 0) {
        config.lineageDefinitionFilenames = lineageSystems.map((s) => `${s}.yaml`);
    }
    return config;
}
