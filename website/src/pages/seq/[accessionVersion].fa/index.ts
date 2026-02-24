import type { APIRoute } from 'astro';

import { getReferenceGenomes } from '../../../config.ts';
import { routes } from '../../../routes/routes.ts';
import { LapisClient } from '../../../services/lapisClient.ts';
import { ACCESSION_VERSION_FIELD } from '../../../settings.ts';
import { createDownloadAPIRoute } from '../../../utils/createDownloadAPIRoute.ts';
import { getReferenceNames } from '../../../utils/sequenceTypeHelpers.ts';

export const GET: APIRoute = createDownloadAPIRoute(
    'text/x-fasta',
    'fa',
    routes.sequenceEntryFastaPage,
    async (accessionVersion: string, organism: string) => {
        const lapisClient = LapisClient.createForOrganism(organism);

        const referenceGenomesInfo = getReferenceGenomes(organism);

        if (referenceGenomesInfo.useLapisMultiSegmentedEndpoint) {
            const referenceNames = getReferenceNames(referenceGenomesInfo);
            if (referenceNames.length > 1) {
                return lapisClient.getMultiSegmentSequenceFasta(accessionVersion, referenceNames);
            }

            return lapisClient.getSequenceFasta(accessionVersion, {
                fastaHeaderTemplate: `{${ACCESSION_VERSION_FIELD}}`,
            });
        }

        return lapisClient.getSequenceFasta(accessionVersion);
    },
);
