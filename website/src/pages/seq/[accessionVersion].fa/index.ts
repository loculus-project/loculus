import type { APIRoute } from 'astro';

import { getReferenceGenomeLightweightSchema } from '../../../config.ts';
import { routes } from '../../../routes/routes.ts';
import { LapisClient } from '../../../services/lapisClient.ts';
import { ACCESSION_VERSION_FIELD } from '../../../settings.ts';
import { SINGLE_REFERENCE } from '../../../types/referencesGenomes.ts';
import { createDownloadAPIRoute } from '../../../utils/createDownloadAPIRoute.ts';

export const GET: APIRoute = createDownloadAPIRoute(
    'text/x-fasta',
    'fa',
    routes.sequenceEntryFastaPage,
    async (accessionVersion: string, organism: string) => {
        const lapisClient = LapisClient.createForOrganism(organism);

        const referenceGenomeLightweightSchema = getReferenceGenomeLightweightSchema(organism);

        if (SINGLE_REFERENCE in referenceGenomeLightweightSchema) {
            const { nucleotideSegmentNames } = referenceGenomeLightweightSchema[SINGLE_REFERENCE];
            if (nucleotideSegmentNames.length > 1) {
                return lapisClient.getMultiSegmentSequenceFasta(accessionVersion, nucleotideSegmentNames);
            }

            return lapisClient.getSequenceFasta(accessionVersion);
        }

        return lapisClient.getSequenceFasta(accessionVersion, { fastaHeaderTemplate: `{${ACCESSION_VERSION_FIELD}}` });
    },
);
