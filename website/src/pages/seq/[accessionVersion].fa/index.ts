import type { APIRoute } from 'astro';

import { getReferenceGenomes } from '../../../config.ts';
import { routes } from '../../../routes/routes.ts';
import { LapisClient } from '../../../services/lapisClient.ts';
import { ACCESSION_VERSION_FIELD } from '../../../settings.ts';
import { createDownloadAPIRoute } from '../../../utils/createDownloadAPIRoute.ts';

export const GET: APIRoute = createDownloadAPIRoute(
    'text/x-fasta',
    'fa',
    routes.sequenceEntryFastaPage,
    async (accessionVersion: string, organism: string) => {
        const lapisClient = LapisClient.createForOrganism(organism);

        const referenceGenomesMap = getReferenceGenomes(organism);

        // Check if single reference mode (all segments have only one reference)
        const segments = Object.entries(referenceGenomesMap);
        const isSingleReference = segments.every(([_, segmentData]) => Object.keys(segmentData).length === 1);

        if (isSingleReference) {
            const segmentNames = Object.keys(referenceGenomesMap);
            if (segmentNames.length > 1) {
                return lapisClient.getMultiSegmentSequenceFasta(accessionVersion, segmentNames);
            }

            return lapisClient.getSequenceFasta(accessionVersion);
        }

        return lapisClient.getSequenceFasta(accessionVersion, { fastaHeaderTemplate: `{${ACCESSION_VERSION_FIELD}}` });
    },
);
