import type { CanonicalInstanceConfig, CanonicalOrganismConfig } from '../schema/canonicalConfig.ts';

export function lineageSystemsForOrganism(organism: CanonicalOrganismConfig): string[] {
    const seen = new Set<string>();
    for (const field of organism.schema.metadata) {
        const ls = field.lineageSystem;
        if (ls !== null && ls !== undefined && ls !== '') seen.add(ls);
    }
    return [...seen].sort();
}

// URLs are forwarded from the instance config; the silo-importer downloads the
// actual definition files at import time. Throws if a referenced system is undefined.
export function lineageDefinitionsForOrganism(
    instance: CanonicalInstanceConfig,
    organism: CanonicalOrganismConfig,
): Record<string, Record<string, string>> {
    const definitions = instance.lineageSystemDefinitions ?? {};
    const result: Record<string, Record<string, string>> = {};
    for (const system of lineageSystemsForOrganism(organism)) {
        const urlsByVersion = definitions[system];
        if (urlsByVersion === undefined || urlsByVersion === null) {
            throw new Error(
                `Organism references lineage system "${system}" but the instance config has no ` +
                    `lineageSystemDefinitions entry for it.`,
            );
        }
        result[system] = urlsByVersion;
    }
    return result;
}
