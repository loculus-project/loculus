import { err, ok } from 'neverthrow';

import { getConfiguredOrganisms } from '../../../config.ts';
import { LapisClient } from '../../../services/lapisClient.ts';

export const getVersionsData = async (accession: string) => {
    const organisms = getConfiguredOrganisms();
    const promises = organisms.map(async ({ key }) => {
        const lapisClient = LapisClient.createForOrganism(key);

        const versionListResult = (await lapisClient.getAllSequenceEntryHistoryForAccession(accession))
            .mapErr((error) => error.detail)
            .andThen((result) => (result.length > 0 ? ok(result) : err('Sequence not found')));
        return {
            organism: key,
            result: versionListResult,
        };
    });

    const queries = await Promise.all(promises);
    let versionListResult = queries[0].result;
    let organism: string | undefined;

    for (const query of queries) {
        if (query.result.isOk()) {
            versionListResult = query.result!;
            organism = query.organism!;
            break;
        }
    }

    return { versionListResult, organism };
};
