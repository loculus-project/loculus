import { getConfiguredOrganisms } from '../../config.ts';

export function cleanOrganism(organism: string | undefined) {
    const knownOrganisms = getConfiguredOrganisms();

    const maybeKnownOrganism = knownOrganisms.find((it) => it.key === organism);
    if (maybeKnownOrganism === undefined) {
        return { knownOrganisms, organism: undefined };
    }
    return { knownOrganisms, organism: maybeKnownOrganism };
}
