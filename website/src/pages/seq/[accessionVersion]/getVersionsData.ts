import { err, ok } from 'neverthrow';

import { createBackendClient } from '../../../services/backendClientFactory.ts';
import { LapisClient } from '../../../services/lapisClient.ts';

export const getVersionsData = async (accession: string) => {
    const backendClient = createBackendClient();
    const entries = await backendClient.getSequenceEntryVersions({ accessions: [accession] });

    if (entries.length === 0) {
        return { versionListResult: err('Sequence not found'), organism: undefined };
    }

    const organism = entries[0].organism;
    const lapisClient = LapisClient.createForOrganism(organism);

    const versionListResult = (await lapisClient.getAllSequenceEntryHistoryForAccession(accession))
        .mapErr((error) => error.detail)
        .andThen((result) => (result.length > 0 ? ok(result) : err('Sequence not found')));

    return { organism, versionListResult };
};
