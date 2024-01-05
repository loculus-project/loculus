import { getConfiguredOrganisms } from '../../config.ts';

export function cleanOrganism(organism: string | undefined) {
    const knownOrganisms = getConfiguredOrganisms();

    return {
        knownOrganisms,
        organism: knownOrganisms.find((it) => it.key === organism),
    };
}
